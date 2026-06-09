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

function Test-AppTaskExists {
  param([string]$Name)
  $task = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
  if ($task) { return $true }
  return (Invoke-External -FilePath 'schtasks.exe' -ArgumentList @('/Query', '/TN', $Name)) -eq 0
}

function Stop-AppTask {
  param([string]$Name)
  if (-not (Test-AppTaskExists $Name)) { return $false }
  $endExit = Invoke-External -FilePath 'schtasks.exe' -ArgumentList @('/End', '/TN', $Name)
  Write-Verbose "schtasks /End exit=$endExit"
  Stop-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue | Out-Null
  return $true
}

function Start-AppTask {
  param([string]$Name)
  try {
    Start-ScheduledTask -TaskName $Name -ErrorAction Stop | Out-Null
    return
  } catch {
    $runExit = Invoke-External -FilePath 'schtasks.exe' -ArgumentList @('/Run', '/TN', $Name)
    if ($runExit -ne 0) { throw "Could not start scheduled task $Name (exit $runExit)" }
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
      $killExit = Invoke-External -FilePath 'taskkill.exe' -ArgumentList @('/F', '/PID', "$processId")
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
      if ($health.ok -eq $true -or $health.service -eq 'BeachdayEesti') {
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
