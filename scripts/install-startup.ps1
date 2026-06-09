#Requires -RunAsAdministrator
param(
  [int]$Port = 8080
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$NodePath = (Get-Command node).Source
$TaskName = "BeachdayEesti"

$Action = New-ScheduledTaskAction -Execute $NodePath -Argument "server/index.js" -WorkingDirectory $ProjectRoot
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force | Out-Null

& "$ProjectRoot\scripts\configure-firewall.ps1" -Port $Port

Write-Host "Scheduled task '$TaskName' registered. BeachdayEesti will start after reboot."
Write-Host "Start now: Start-ScheduledTask -TaskName $TaskName"
