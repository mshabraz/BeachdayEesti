param(
  [string]$SourcePath = (Split-Path -Parent $PSScriptRoot),
  [string]$DeployPath = 'C:\BeachdayEesti',
  [int]$Port = 8080,
  [string]$TaskName = 'BeachdayEesti'
)

$ErrorActionPreference = 'Stop'

function Write-Step($message) {
  Write-Host "==> $message"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js 18+ is required on the runner machine.'
}

Write-Step "Deploying from $SourcePath to $DeployPath"

New-Item -ItemType Directory -Force -Path $DeployPath | Out-Null

$excludeDirs = @('node_modules', '.git', 'cache')
robocopy $SourcePath $DeployPath /MIR /XD $excludeDirs /NFL /NDL /NJH /NJS /NC /NS | Out-Null
if ($LASTEXITCODE -ge 8) {
  throw "robocopy failed with exit code $LASTEXITCODE"
}

Set-Location $DeployPath

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Step 'Created .env from .env.example'
}

Write-Step 'Installing dependencies'
npm ci --omit=dev

Write-Step 'Refreshing weather cache'
node server/sync-cli.js

Write-Step "Restarting service on port $Port"
$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($connection in $connections) {
  Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  try {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Start-ScheduledTask -TaskName $TaskName
    Write-Step "Scheduled task '$TaskName' restarted"
  } catch {
    Write-Warning "Could not restart scheduled task: $($_.Exception.Message)"
    Start-Process -FilePath (Get-Command node).Source -ArgumentList 'server/index.js' -WorkingDirectory $DeployPath -WindowStyle Hidden
    Write-Step 'Started node server/index.js in background'
  }
} else {
  Start-Process -FilePath (Get-Command node).Source -ArgumentList 'server/index.js' -WorkingDirectory $DeployPath -WindowStyle Hidden
  Write-Step "No scheduled task found; started node server/index.js in background"
  Write-Host "Run scripts\install-startup.ps1 once as Administrator to enable reboot persistence."
}

Write-Step "Deploy complete — http://192.168.1.25:$Port"
