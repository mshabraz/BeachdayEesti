#Requires -RunAsAdministrator
param(
  [int]$Port = 8080,
  [string]$DeployPath = 'C:\BeachdayEesti',
  [string]$TaskName = 'BeachdayEesti'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ps-task-utils.ps1')

Write-Host "Stopping $TaskName and freeing port $Port..."
if (Stop-AppTask -Name $TaskName) {
  Write-Host "Stopped scheduled task $TaskName"
} else {
  Write-Host "Scheduled task $TaskName not found"
}

$logBlock = { param($Message) Write-Host $Message }
if (-not (Stop-PortListeners -Port $Port -Log $logBlock)) {
  throw "Port $Port is still in use"
}

if (Test-AppTaskExists $TaskName) {
  Start-AppTask -Name $TaskName
  Write-Host "Started scheduled task $TaskName"
} else {
  Set-Location $DeployPath
  Start-Process -FilePath (Get-Command node).Source -ArgumentList 'server/index.js' -WorkingDirectory $DeployPath -WindowStyle Hidden
  Write-Host "Started node server/index.js (no scheduled task)"
}

if (Wait-ForServer -Port $Port -Log $logBlock) {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 5
  Write-Host "Healthy: version=$($health.version) commit=$($health.deployment.commit) beaches=$($health.cache.beachCount)"
  exit 0
}

Write-Host "Server did not return healthy JSON on /health. Check logs\node-stderr.log and logs\startup.log"
exit 1
