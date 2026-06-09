# Shared helpers for calling native Windows tools under ErrorActionPreference Stop.
function Invoke-External {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$ArgumentList = @()
  )
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & $FilePath @ArgumentList 2>&1 | Out-Null
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $prev
  return $exitCode
}

function Get-TaskNameArg {
  param([string]$Name)
  if ($Name.StartsWith('\')) { return $Name }
  return $Name
}

function Test-AppTaskExists {
  param([string]$Name)
  $task = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
  if ($task) { return $true }
  return (Invoke-External -FilePath 'schtasks.exe' -ArgumentList @('/Query', '/TN', (Get-TaskNameArg $Name))) -eq 0
}

function Stop-AppTask {
  param([string]$Name)
  if (-not (Test-AppTaskExists $Name)) { return $false }
  Invoke-External -FilePath 'schtasks.exe' -ArgumentList @('/End', '/TN', (Get-TaskNameArg $Name)) | Out-Null
  Stop-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue | Out-Null
  return $true
}

function Start-AppTask {
  param([string]$Name)
  try {
    Start-ScheduledTask -TaskName $Name -ErrorAction Stop | Out-Null
    return
  } catch {
    $runExit = Invoke-External -FilePath 'schtasks.exe' -ArgumentList @('/Run', '/TN', (Get-TaskNameArg $Name))
    if ($runExit -ne 0) { throw "Could not start scheduled task $Name (exit $runExit)" }
  }
}

function Stop-BeachdayNodeProcesses {
  param(
    [string]$DeployPath = 'C:\BeachdayEesti',
    [int]$Port = 8080,
    [scriptblock]$Log = { param($Message) Write-Verbose $Message }
  )
  $processes = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue
  foreach ($proc in $processes) {
    $cmd = $proc.CommandLine
    if (-not $cmd) { continue }
    if ($cmd -notlike "*$DeployPath*" -and $cmd -notlike '*server/index.js*' -and $cmd -notlike '*server\\index.js*') {
      continue
    }
    $killExit = Invoke-External -FilePath 'taskkill.exe' -ArgumentList @('/F', '/T', '/PID', "$($proc.ProcessId)")
    & $Log "taskkill node PID $($proc.ProcessId) exit=$killExit"
  }

  $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  foreach ($connection in $connections) {
    $processId = $connection.OwningProcess
    $killExit = Invoke-External -FilePath 'taskkill.exe' -ArgumentList @('/F', '/T', '/PID', "$processId")
    & $Log "taskkill port listener PID $processId exit=$killExit"
  }
}

function Stop-PortListeners {
  param(
    [int]$Port,
    [int]$MaxRounds = 8,
    [scriptblock]$Log = { param($Message) Write-Verbose $Message }
  )
  for ($round = 1; $round -le $MaxRounds; $round++) {
    $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($connections.Count -eq 0) {
      & $Log "Port $Port is free (round $round)"
      return $true
    }
    foreach ($connection in $connections) {
      $processId = $connection.OwningProcess
      $killExit = Invoke-External -FilePath 'taskkill.exe' -ArgumentList @('/F', '/T', '/PID', "$processId")
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
      & $Log "Stopped PID $processId on port $Port (round $round, taskkill exit=$killExit)"
    }
    Start-Sleep -Seconds 2
  }
  $still = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  return ($still.Count -eq 0)
}

function Wait-ForServer {
  param(
    [int]$Port = 8080,
    [int]$MaxAttempts = 20,
    [int]$DelaySeconds = 2,
    [scriptblock]$Log = { param($Message) Write-Verbose $Message }
  )
  for ($i = 1; $i -le $MaxAttempts; $i++) {
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 5
      if ($health.ok -eq $true) {
        & $Log "Server ready on attempt $i (ok=$($health.ok) version=$($health.version))"
        return $true
      }
      & $Log "Attempt ${i}: /health responded but ok=$($health.ok) service=$($health.service)"
    } catch {
      & $Log "Attempt ${i}: server not ready ($($_.Exception.Message))"
    }
    Start-Sleep -Seconds $DelaySeconds
  }
  return $false
}

function Start-AppServer {
  param([string]$Root)
  $logsDir = Join-Path $Root 'logs'
  New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
  $stdout = Join-Path $logsDir 'node-stdout.log'
  $stderr = Join-Path $logsDir 'node-stderr.log'
  Start-Process `
    -FilePath (Get-Command node).Source `
    -ArgumentList 'server/index.js' `
    -WorkingDirectory $Root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr
}

function Test-IsPrivilegedDeployContext {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { return $true }
  $user = $identity.Name
  return ($user -like '*SYSTEM*' -or $user -like '*LOCAL SERVICE*' -or $user -like '*NETWORK SERVICE*')
}

function Invoke-AppRestart {
  param(
    [string]$DeployPath = 'C:\BeachdayEesti',
    [int]$Port = 8080,
    [string]$RestartTaskName = 'BeachdayEesti-Restart',
    [string]$AppTaskName = 'BeachdayEesti',
    [scriptblock]$Log = { param($Message) Write-Verbose $Message }
  )

  if (Test-AppTaskExists $RestartTaskName) {
    & $Log "Triggering elevated restart task $RestartTaskName"
    $runExit = Invoke-External -FilePath 'schtasks.exe' -ArgumentList @('/Run', '/TN', (Get-TaskNameArg $RestartTaskName))
    & $Log "schtasks /Run $RestartTaskName exit=$runExit"
    if ($runExit -ne 0) {
      throw "Could not trigger $RestartTaskName (exit $runExit). Run scripts\install-deploy-setup.ps1 as Administrator."
    }
    Start-Sleep -Seconds 3
    if (Wait-ForServer -Port $Port -MaxAttempts 30 -Log $Log) { return $true }
    throw "Restart task ran but /health did not become ready."
  }

  if (Test-IsPrivilegedDeployContext) {
    & $Log 'Running inline restart (privileged context)'
    Stop-AppTask -Name $AppTaskName | Out-Null
    Start-Sleep -Seconds 2
    Stop-BeachdayNodeProcesses -DeployPath $DeployPath -Port $Port -Log $Log | Out-Null
    if (-not (Stop-PortListeners -Port $Port -MaxRounds 10 -Log $Log)) {
      throw "Port $Port still in use."
    }
    if (Test-AppTaskExists $AppTaskName) {
      Start-AppTask -Name $AppTaskName
    } else {
      Start-AppServer -Root $DeployPath
    }
    return (Wait-ForServer -Port $Port -MaxAttempts 25 -Log $Log)
  }

  throw @"
Deploy cannot restart the app from account '$([Security.Principal.WindowsIdentity]::GetCurrent().Name)'.
Run this ONCE as Administrator on the server:
  cd C:\BeachdayEesti
  git fetch origin
  git reset --hard origin/main
  .\scripts\install-deploy-setup.ps1
"@
}
