#Requires -RunAsAdministrator
param(
  [int]$Port = 8080,
  [string]$DeployPath = 'C:\BeachdayEesti',
  [string]$TaskAccount = 'NT AUTHORITY\NETWORK SERVICE'
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
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew
$Principal = New-ScheduledTaskPrincipal -UserId $TaskAccount -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force | Out-Null

& "$ProjectRoot\scripts\configure-firewall.ps1" -Port $Port

Write-Host "Scheduled task '$TaskName' registered at $ProjectRoot"
Write-Host "Run as: $TaskAccount"
Write-Host '- Starts at boot (no interactive login required)'
Write-Host '- Auto-restarts on crash (1 min interval)'
Write-Host '- MultipleInstances: IgnoreNew (deploy can restart safely)'
Write-Host "Start now: Start-ScheduledTask -TaskName $TaskName"
Write-Host 'If you previously used SYSTEM, re-run this script once to replace that task.'
Write-Host 'After install: .\scripts\restart-app.ps1'
Write-Host 'Do not git pull in C:\BeachdayEesti; use GitHub Actions deploy or .\scripts\align-with-origin.ps1'
