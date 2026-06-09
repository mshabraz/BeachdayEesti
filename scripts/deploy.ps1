param(
  [string]$SourcePath = (Split-Path -Parent $PSScriptRoot),
  [string]$DeployPath = 'C:\BeachdayEesti',
  [int]$Port = 8080,
  [string]$TaskName = 'BeachdayEesti',
  [string]$CommitSha = $env:GITHUB_SHA,
  [string]$RunnerName = 'BeachdayEestiLAN'
)

$ErrorActionPreference = 'Stop'

function Write-Step($message) {
  Write-Host "==> $message"
}

function Write-DeployLog($message) {
  $logsDir = Join-Path $DeployPath 'logs'
  New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
  $line = "[$(Get-Date -Format 'o')] $message"
  Add-Content -Path (Join-Path $logsDir 'deploy.log') -Value $line
  Write-Host $line
}

function Test-AppTaskExists {
  param([string]$Name)
  schtasks /Query /TN $Name 2>$null | Out-Null
  return $LASTEXITCODE -eq 0
}

function Stop-AppTask {
  param([string]$Name)
  if (-not (Test-AppTaskExists $Name)) { return $false }
  schtasks /End /TN $Name 2>$null | Out-Null
  Write-DeployLog "schtasks /End exit=$LASTEXITCODE"
  try {
    Stop-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue | Out-Null
  } catch { }
  return $true
}

function Start-AppTask {
  param([string]$Name)
  try {
    Start-ScheduledTask -TaskName $Name -ErrorAction Stop | Out-Null
  } catch {
    schtasks /Run /TN $Name 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not start scheduled task $Name" }
  }
}

function Stop-PortListeners {
  param([int]$Port, [int]$MaxRounds = 8)
  for ($round = 1; $round -le $MaxRounds; $round++) {
    $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($connections.Count -eq 0) {
      Write-DeployLog "Port $Port is free (round $round)"
      return $true
    }
    foreach ($connection in $connections) {
      $processId = $connection.OwningProcess
      taskkill /F /PID $processId 2>$null | Out-Null
      $killExit = $LASTEXITCODE
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
      Write-DeployLog "Stopped PID $processId on port $Port (round $round, taskkill exit=$killExit)"
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
    [int]$DelaySeconds = 2
  )
  for ($i = 1; $i -le $MaxAttempts; $i++) {
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 5
      if ($health.ok -eq $true -or $health.service -eq 'BeachdayEesti') {
        Write-DeployLog "Server ready on attempt $i (ok=$($health.ok) version=$($health.version))"
        return $true
      }
      Write-DeployLog "Attempt ${i}: /health responded but ok=$($health.ok) service=$($health.service)"
    } catch {
      Write-DeployLog "Attempt ${i}: server not ready ($($_.Exception.Message))"
    }
    Start-Sleep -Seconds $DelaySeconds
  }
  return $false
}

function Start-AppServer {
  param([string]$Root, [int]$Port)
  $logsDir = Join-Path $Root 'logs'
  New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
  $stdout = Join-Path $logsDir 'node-stdout.log'
  $stderr = Join-Path $logsDir 'node-stderr.log'
  Start-Process `
    -FilePath (Get-Command node).Source `
    -ArgumentList 'server/index.js' `
    -WorkingDirectory $Root `
    -NoNewWindow `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js 18+ is required on the runner machine.'
}

if (-not $CommitSha) {
  Push-Location $SourcePath
  try {
    $CommitSha = (git rev-parse HEAD 2>$null)
  } catch {
    $CommitSha = 'unknown'
  } finally {
    Pop-Location
  }
}

$deployTime = (Get-Date).ToUniversalTime().ToString('o')
Write-Step "Deploying from $SourcePath to $DeployPath (commit $CommitSha)"

New-Item -ItemType Directory -Force -Path $DeployPath | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DeployPath 'logs') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DeployPath 'cache') | Out-Null

Write-DeployLog "Deploy started commit=$CommitSha runner=$RunnerName user=$env:USERNAME"

$excludeDirs = @('node_modules', '.git', 'cache', 'logs')
robocopy $SourcePath $DeployPath /MIR /XD $excludeDirs /XF .env /NFL /NDL /NJH /NJS /NC /NS | Out-Null
if ($LASTEXITCODE -ge 8) {
  Write-DeployLog "ERROR robocopy failed exit=$LASTEXITCODE"
  throw "robocopy failed with exit code $LASTEXITCODE"
}
Write-DeployLog "robocopy complete"

Set-Location $DeployPath

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Step 'Created .env from .env.example'
}

$envContent = Get-Content '.env' -Raw -ErrorAction SilentlyContinue
if ($envContent -notmatch 'DEPLOY_COMMIT=') {
  Add-Content '.env' "DEPLOY_COMMIT=$CommitSha"
} else {
  (Get-Content '.env') -replace '^DEPLOY_COMMIT=.*', "DEPLOY_COMMIT=$CommitSha" | Set-Content '.env'
}
if ($envContent -notmatch 'DEPLOY_TIME=') {
  Add-Content '.env' "DEPLOY_TIME=$deployTime"
} else {
  (Get-Content '.env') -replace '^DEPLOY_TIME=.*', "DEPLOY_TIME=$deployTime" | Set-Content '.env'
}

$deploymentJson = @{
  commit       = $CommitSha
  deployedAt   = $deployTime
  deployPath   = $DeployPath
  runner       = $RunnerName
  workflowRun  = $env:GITHUB_RUN_ID
  updatedAt    = $deployTime
} | ConvertTo-Json -Depth 4 -Compress
$deploymentPath = Join-Path $DeployPath 'cache\deployment.json'
[System.IO.File]::WriteAllText($deploymentPath, $deploymentJson, (New-Object System.Text.UTF8Encoding $false))
Write-DeployLog "deployment.json written"

Write-Step 'Installing dependencies'
npm ci --omit=dev
Write-DeployLog 'npm ci complete'

Write-Step 'Refreshing weather cache'
node server/sync-cli.js
Write-DeployLog 'sync-cli complete'

Write-Step "Restarting service on port $Port"
$hasTask = Stop-AppTask -Name $TaskName
if ($hasTask) {
  Write-DeployLog "Stopped scheduled task $TaskName before port cleanup"
} else {
  Write-DeployLog "Scheduled task $TaskName not found (schtasks /Query)"
}

if (-not (Stop-PortListeners -Port $Port)) {
  throw "Port $Port is still in use after cleanup. Re-run scripts\install-startup.ps1 as Administrator, then redeploy."
}

if (Test-AppTaskExists $TaskName) {
  Start-AppTask -Name $TaskName
  Write-Step "Scheduled task '$TaskName' restarted"
  Write-DeployLog "Scheduled task restarted via schtasks/Start-ScheduledTask"
} else {
  Start-AppServer -Root $DeployPath -Port $Port
  Write-Step "No scheduled task found; started node server/index.js in background"
  Write-Host "Run scripts\install-startup.ps1 once as Administrator to enable reboot persistence."
  Write-DeployLog 'Started node in background (no scheduled task)'
}

if (-not (Wait-ForServer -Port $Port)) {
  $stderrPath = Join-Path $DeployPath 'logs\node-stderr.log'
  if (Test-Path $stderrPath) {
    Write-DeployLog "node-stderr tail: $((Get-Content $stderrPath -Tail 5) -join ' | ')"
  }
  throw "Server did not become healthy on port $Port within timeout"
}

Write-DeployLog "Deploy complete - http://192.168.1.25:$Port"
Write-Step "Deploy complete - http://192.168.1.25:$Port"
