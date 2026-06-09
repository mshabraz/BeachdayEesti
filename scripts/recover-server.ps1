# One-shot recovery for C:\BeachdayEesti (run as Administrator)
#Requires -RunAsAdministrator
param(
  [string]$DeployPath = 'C:\BeachdayEesti',
  [int]$Port = 8080,
  [string]$TaskName = 'BeachdayEesti'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ps-task-utils.ps1')
Set-Location $DeployPath

Write-Host '==> Fetch and reset to origin/main'
git fetch origin
git reset --hard origin/main
git clean -fd

Write-Host '==> npm install'
npm ci --omit=dev

Write-Host '==> Restart app'
$logBlock = { param($Message) Write-Host $Message }
Stop-AppTask -Name $TaskName | Out-Null
Start-Sleep -Seconds 2
Stop-PortListeners -Port $Port -Log $logBlock | Out-Null

if (Test-AppTaskExists $TaskName) {
  Start-AppTask -Name $TaskName
} else {
  Start-Process -FilePath (Get-Command node).Source -ArgumentList 'server/index.js' -WorkingDirectory $DeployPath -WindowStyle Hidden
}

if (Wait-ForServer -Port $Port -Log $logBlock) {
  $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 5
  Write-Host "PASS ok=$($h.ok) version=$($h.version) beaches=$($h.cache.beachCount) commit=$($h.deployment.commit)"
  exit 0
}

Write-Host 'FAIL: /health did not return JSON with ok=true'
exit 1
