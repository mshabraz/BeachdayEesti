# Runs with SYSTEM privileges via scheduled task "BeachdayEesti-Restart".
param(
  [string]$DeployPath = 'C:\BeachdayEesti',
  [int]$Port = 8080,
  [string]$AppTaskName = 'BeachdayEesti'
)

$ErrorActionPreference = 'Stop'
Set-Location $DeployPath
. (Join-Path $DeployPath 'scripts\ps-task-utils.ps1')

function Write-RestartLog($message) {
  $logsDir = Join-Path $DeployPath 'logs'
  New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
  Add-Content -Path (Join-Path $logsDir 'restart-service.log') -Value "[$(Get-Date -Format 'o')] $message"
}

$logBlock = { param($Message) Write-RestartLog $Message }
Write-RestartLog "restart-service started user=$env:USERNAME"

Stop-AppTask -Name $AppTaskName | Out-Null
Start-Sleep -Seconds 2
Stop-BeachdayNodeProcesses -DeployPath $DeployPath -Port $Port -Log $logBlock | Out-Null

if (-not (Stop-PortListeners -Port $Port -MaxRounds 10 -Log $logBlock)) {
  Write-RestartLog "ERROR port $Port still in use"
  exit 1
}

if (Test-AppTaskExists $AppTaskName) {
  Start-AppTask -Name $AppTaskName
  Write-RestartLog "Started app task $AppTaskName"
} else {
  Start-AppServer -Root $DeployPath
  Write-RestartLog 'Started node directly (no app task)'
}

if (Wait-ForServer -Port $Port -MaxAttempts 25 -Log $logBlock) {
  Write-RestartLog 'restart-service complete'
  exit 0
}

Write-RestartLog 'restart-service failed health check'
exit 1
