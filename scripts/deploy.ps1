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

function Wait-ForServer {
  param(
    [int]$Port = 8080,
    [int]$MaxAttempts = 15,
    [int]$DelaySeconds = 2
  )
  for ($i = 1; $i -le $MaxAttempts; $i++) {
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 5
      if ($health.ok -eq $true) {
        Write-DeployLog "Server ready on attempt $i"
        return $true
      }
      Write-DeployLog "Attempt $i: /health responded but ok=$($health.ok)"
    } catch {
      Write-DeployLog "Attempt $i: server not ready ($($_.Exception.Message))"
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

$excludeDirs = @('node_modules', '.git', 'cache')
robocopy $SourcePath $DeployPath /MIR /XD $excludeDirs /NFL /NDL /NJH /NJS /NC /NS | Out-Null
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
$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($connection in $connections) {
  Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue
  Write-DeployLog "Stopped process $($connection.OwningProcess) on port $Port"
}
Start-Sleep -Seconds 2

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  try {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Start-ScheduledTask -TaskName $TaskName
    Write-Step "Scheduled task '$TaskName' restarted"
    Write-DeployLog "Scheduled task restarted"
  } catch {
    Write-Warning "Could not restart scheduled task: $($_.Exception.Message)"
    Write-DeployLog "WARN scheduled task restart failed: $($_.Exception.Message)"
    Start-AppServer -Root $DeployPath -Port $Port
    Write-Step 'Started node server/index.js in background'
    Write-DeployLog 'Started node in background (task restart failed)'
  }
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
