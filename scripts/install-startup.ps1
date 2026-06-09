#Requires -RunAsAdministrator
param(
  [int]$Port = 8080,
  [string]$DeployPath = 'C:\BeachdayEesti'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = if (Test-Path $DeployPath) { $DeployPath } else { Split-Path -Parent $PSScriptRoot }
$NodePath = (Get-Command node).Source
$TaskName = 'BeachdayEesti'

$Action = New-ScheduledTaskAction -Execute $NodePath -Argument 'server/index.js' -WorkingDirectory $ProjectRoot
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)
$Principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force | Out-Null

& "$ProjectRoot\scripts\configure-firewall.ps1" -Port $Port

Write-Host "Scheduled task '$TaskName' registered at $ProjectRoot"
Write-Host '- Starts at boot (SYSTEM account, no login required)'
Write-Host '- Auto-restarts on crash (1 min interval)'
Write-Host "Start now: Start-ScheduledTask -TaskName $TaskName"
