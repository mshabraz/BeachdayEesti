#Requires -RunAsAdministrator
param(
  [int]$Port = 8080,
  [string]$DeployPath = 'C:\BeachdayEesti'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ps-task-utils.ps1')

Write-Host "Restarting BeachdayEesti on port $Port..."
$logBlock = { param($Message) Write-Host $Message }

if (Test-AppTaskExists 'BeachdayEesti-Restart') {
  Invoke-External -FilePath 'schtasks.exe' -ArgumentList @('/Run', '/TN', 'BeachdayEesti-Restart') | Out-Null
  if (Wait-ForServer -Port $Port -Log $logBlock) {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 5
    Write-Host "Healthy: version=$($health.version) commit=$($health.deployment.commit)"
    exit 0
  }
  exit 1
}

Invoke-AppRestart -DeployPath $DeployPath -Port $Port -Log $logBlock | Out-Null
$health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 5
Write-Host "Healthy: version=$($health.version) commit=$($health.deployment.commit)"
