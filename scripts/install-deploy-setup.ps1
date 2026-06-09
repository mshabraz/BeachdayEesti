#Requires -RunAsAdministrator
<#
  One-time server setup for BeachdayEesti LAN deploys.

  - Firewall rule for port 8080
  - BeachdayEesti scheduled task (SYSTEM, starts Node at boot)
  - GitHub Actions deploy uses inline restart (no elevated task needed)

  Run ONCE as Administrator:
    cd C:\BeachdayEesti
    git fetch origin
    git reset --hard origin/main
    .\scripts\install-deploy-setup.ps1
#>
param(
  [int]$Port = 8080,
  [string]$DeployPath = 'C:\BeachdayEesti'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ps-task-utils.ps1')

$ProjectRoot = if (Test-Path $DeployPath) { $DeployPath } else { Split-Path -Parent $PSScriptRoot }
$NodePath = (Get-Command node).Source
$AppTaskName = 'BeachdayEesti'
$TaskAccount = 'SYSTEM'

function Stop-ExistingApp {
  foreach ($name in @($AppTaskName, 'BeachdayEesti-Restart')) {
    Stop-AppTask -Name $name | Out-Null
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
  }
  Stop-BeachdayNodeProcesses -DeployPath $ProjectRoot -Port $Port | Out-Null
  Stop-PortListeners -Port $Port -MaxRounds 10 | Out-Null
}

Write-Host '==> Firewall'
& "$ProjectRoot\scripts\configure-firewall.ps1" -Port $Port

Write-Host '==> Stop old tasks/processes'
Stop-ExistingApp

Write-Host "==> App task (boot) as $TaskAccount"
$appAction = New-ScheduledTaskAction -Execute $NodePath -Argument 'server/index.js' -WorkingDirectory $ProjectRoot
$appTrigger = New-ScheduledTaskTrigger -AtStartup
$appSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew
$appPrincipal = New-ScheduledTaskPrincipal -UserId $TaskAccount -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $AppTaskName -Action $appAction -Trigger $appTrigger -Settings $appSettings -Principal $appPrincipal -Force | Out-Null
Write-Host "Registered $AppTaskName ($TaskAccount, AtStartup)"

Write-Host '==> Start app now'
Start-AppTask -Name $AppTaskName
Start-Sleep -Seconds 5

Write-Host '==> Health check'
try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 15
  if ($health.ok -ne $true) { throw "Health ok=$($health.ok)" }
  Write-Host "PASS /health ok=$($health.ok) version=$($health.version)"
} catch {
  Write-Error "Setup test failed: $($_.Exception.Message)"
  exit 1
}

Write-Host ''
Write-Host 'Setup complete.'
Write-Host "LAN URL: http://192.168.1.25:$Port"
Write-Host 'Boot task: BeachdayEesti (SYSTEM)'
Write-Host 'Git push to main deploys via GitHub Actions inline restart.'
