#Requires -RunAsAdministrator
<#
  One-time server setup for reliable git-push deploys.

  Installs:
  - Firewall rule for port 8080
  - BeachdayEesti scheduled task (SYSTEM, starts at boot)
  - BeachdayEesti-Restart helper task (SYSTEM, triggered by GitHub Actions deploy)
  - Permissions so the GitHub runner can trigger the restart helper
  - Optional: configure GitHub Actions runner service to LocalSystem

  Run on the LAN server as Administrator:
    cd C:\BeachdayEesti
    .\scripts\install-deploy-setup.ps1
#>
param(
  [int]$Port = 8080,
  [string]$DeployPath = 'C:\BeachdayEesti',
  [switch]$ConfigureRunnerAsLocalSystem
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = if (Test-Path $DeployPath) { $DeployPath } else { Split-Path -Parent $PSScriptRoot }
$NodePath = (Get-Command node).Source
$AppTaskName = 'BeachdayEesti'
$RestartTaskName = 'BeachdayEesti-Restart'

function Grant-ScheduledTaskTriggerAccess {
  param([string]$TaskName)
  $taskFile = Join-Path $env:SystemRoot "System32\Tasks\$TaskName"
  if (-not (Test-Path $taskFile)) {
    Write-Warning "Task file not found: $taskFile"
    return
  }
  $acl = Get-Acl $taskFile
  $sids = @(
    'S-1-5-11', # Authenticated Users
    'S-1-5-20', # NETWORK SERVICE
    'S-1-5-18'  # SYSTEM
  )
  foreach ($sid in $sids) {
    $id = New-Object System.Security.Principal.SecurityIdentifier($sid)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
      $id, 'FullControl', 'Allow'
    )
    $acl.AddAccessRule($rule)
  }
  Set-Acl $taskFile $acl
  Write-Host "Granted trigger access on task $TaskName"
}

Write-Host '==> Firewall'
& "$ProjectRoot\scripts\configure-firewall.ps1" -Port $Port

Write-Host '==> App task (boot)'
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
$appPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $AppTaskName -Action $appAction -Trigger $appTrigger -Settings $appSettings -Principal $appPrincipal -Force | Out-Null
Write-Host "Registered $AppTaskName (SYSTEM, AtStartup)"

Write-Host '==> Restart helper task (deploy trigger)'
$restartScript = Join-Path $ProjectRoot 'scripts\restart-service.ps1'
$restartAction = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$restartScript`" -DeployPath `"$ProjectRoot`" -Port $Port" `
  -WorkingDirectory $ProjectRoot
$restartSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
  -MultipleInstances IgnoreNew
$restartPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $RestartTaskName -Action $restartAction -Settings $restartSettings -Principal $restartPrincipal -Force | Out-Null
Grant-ScheduledTaskTriggerAccess -TaskName $RestartTaskName
Write-Host "Registered $RestartTaskName (SYSTEM, on-demand for deploy)"

if ($ConfigureRunnerAsLocalSystem) {
  Write-Host '==> Configure GitHub runner service as LocalSystem'
  $runnerSvc = Get-Service -Name 'actions.runner.*' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($runnerSvc) {
    Stop-Service $runnerSvc.Name -Force
    sc.exe config $runnerSvc.Name obj= LocalSystem | Out-Null
    Start-Service $runnerSvc.Name
    Write-Host "Runner service $($runnerSvc.Name) now runs as LocalSystem"
  } else {
    Write-Warning 'GitHub runner service not found. Install the runner first, then re-run with -ConfigureRunnerAsLocalSystem'
  }
}

Write-Host '==> Test restart helper'
$testExit = schtasks.exe /Run /TN $RestartTaskName
Write-Host "schtasks /Run exit=$LASTEXITCODE"
Start-Sleep -Seconds 8
try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 10
  if ($health.ok -eq $true) {
    Write-Host "PASS /health ok=$($health.ok) version=$($health.version)"
  } else {
    Write-Warning "Health returned but ok=$($health.ok). Check logs\restart-service.log"
  }
} catch {
  Write-Warning "Health check failed: $($_.Exception.Message). Check logs\restart-service.log"
}

Write-Host ''
Write-Host 'Setup complete.'
Write-Host "LAN URL: http://192.168.1.25:$Port"
Write-Host 'Git push to main will deploy via GitHub Actions.'
Write-Host 'If deploy still fails, re-run with: .\scripts\install-deploy-setup.ps1 -ConfigureRunnerAsLocalSystem'
