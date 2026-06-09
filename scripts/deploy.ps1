param(
  [string]$SourcePath = (Split-Path -Parent $PSScriptRoot),
  [string]$DeployPath = 'C:\BeachdayEesti',
  [int]$Port = 8080,
  [string]$CommitSha = $env:GITHUB_SHA,
  [string]$RunnerName = 'BeachdayEestiLAN'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ps-task-utils.ps1')

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

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js 18+ is required on the runner machine.'
}

if (-not $CommitSha) {
  Push-Location $SourcePath
  try { $CommitSha = (git rev-parse HEAD 2>$null) } catch { $CommitSha = 'unknown' } finally { Pop-Location }
}

$deployTime = (Get-Date).ToUniversalTime().ToString('o')
Write-Step "Deploying from $SourcePath to $DeployPath (commit $CommitSha)"
Write-DeployLog "Deploy started commit=$CommitSha runner=$RunnerName user=$env:USERNAME"

New-Item -ItemType Directory -Force -Path $DeployPath | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DeployPath 'logs') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DeployPath 'cache') | Out-Null

$excludeDirs = @('node_modules', '.git', 'cache', 'logs')
robocopy $SourcePath $DeployPath /MIR /XD $excludeDirs /XF .env /NFL /NDL /NJH /NJS /NC /NS | Out-Null
if ($LASTEXITCODE -ge 8) {
  Write-DeployLog "ERROR robocopy failed exit=$LASTEXITCODE"
  throw "robocopy failed with exit code $LASTEXITCODE"
}
Write-DeployLog 'robocopy complete'

Set-Location $DeployPath

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Step 'Created .env from .env.example'
}

$envLines = @()
if (Test-Path '.env') { $envLines = Get-Content '.env' }
$envLines = $envLines | Where-Object { $_ -notmatch '^DEPLOY_COMMIT=' -and $_ -notmatch '^DEPLOY_TIME=' }
$envLines += "DEPLOY_COMMIT=$CommitSha"
$envLines += "DEPLOY_TIME=$deployTime"
$envLines | Set-Content '.env'

$deploymentJson = @{
  commit      = $CommitSha
  deployedAt  = $deployTime
  deployPath  = $DeployPath
  runner      = $RunnerName
  workflowRun = $env:GITHUB_RUN_ID
  updatedAt   = $deployTime
} | ConvertTo-Json -Depth 4 -Compress
$deploymentPath = Join-Path $DeployPath 'cache\deployment.json'
[System.IO.File]::WriteAllText($deploymentPath, $deploymentJson, (New-Object System.Text.UTF8Encoding $false))
Write-DeployLog 'deployment.json written'

Write-Step 'Installing dependencies'
npm ci --omit=dev
if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }
Write-DeployLog 'npm ci complete'

Write-Step 'Refreshing weather cache'
node server/sync-cli.js
if ($LASTEXITCODE -ne 0) { throw "sync-cli failed with exit code $LASTEXITCODE" }
Write-DeployLog 'sync-cli complete'

Write-Step "Restarting app on port $Port"
$logBlock = { param($Message) Write-DeployLog $Message }
try {
  if (-not (Invoke-AppRestart -DeployPath $DeployPath -Port $Port -Log $logBlock)) {
    throw 'App restart did not pass health check.'
  }
} catch {
  Write-DeployLog "ERROR $($_.Exception.Message)"
  if (Test-Path (Join-Path $DeployPath 'logs\restart-service.log')) {
    Write-DeployLog "restart-service tail: $((Get-Content (Join-Path $DeployPath 'logs\restart-service.log') -Tail 8) -join ' | ')"
  }
  throw
}

Write-DeployLog "Deploy complete - http://192.168.1.25:$Port"
Write-Step "Deploy complete - http://192.168.1.25:$Port"
exit 0
