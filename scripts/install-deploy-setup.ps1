#Requires -RunAsAdministrator
<#
  One-time server setup for reliable git-push deploys.

  Registers scheduled tasks under the same account that runs GitHub Actions jobs
  on this machine (typically COMPUTERNAME$), so deploy can schtasks /Run /End freely.

  Run ONCE as Administrator on the LAN server:
    cd C:\BeachdayEesti
    git fetch origin
    git reset --hard origin/main
    .\scripts\install-deploy-setup.ps1
#>
param(
  [int]$Port = 8080,
  [string]$DeployPath = 'C:\BeachdayEesti',
  [string]$TaskAccount = '',
  [switch]$ConfigureRunnerAsLocalSystem
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ps-task-utils.ps1')

$ProjectRoot = if (Test-Path $DeployPath) { $DeployPath } else { Split-Path -Parent $PSScriptRoot }
$NodePath = (Get-Command node).Source
$AppTaskName = 'BeachdayEesti'
$RestartTaskName = 'BeachdayEesti-Restart'

if (-not $TaskAccount) {
  $TaskAccount = "$env:COMPUTERNAME`$"
}

function Get-RunnerServiceAccount {
  $runnerSvc = Get-Service -Name 'actions.runner.*' -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $runnerSvc) { return $null }
  $qc = sc.exe qc $runnerSvc.Name 2>$null
  $line = $qc | Where-Object { $_ -match 'SERVICE_START_NAME' }
  if ($line -match ':\s*(.+)$') { return $matches[1].Trim() }
  return $null
}

function Stop-ExistingApp {
  foreach ($name in @($AppTaskName, $RestartTaskName)) {
    Stop-AppTask -Name $name | Out-Null
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
  }
  Stop-BeachdayNodeProcesses -DeployPath $ProjectRoot -Port $Port | Out-Null
  Stop-PortListeners -Port $Port -MaxRounds 10 | Out-Null
}

Write-Host "==> Task account: $TaskAccount"
$runnerSvcAccount = Get-RunnerServiceAccount
if ($runnerSvcAccount) {
  Write-Host "==> Runner service account: $runnerSvcAccount"
}
Write-Host '==> GitHub Actions jobs on this runner typically run as:' "$env:COMPUTERNAME`$"

Write-Host '==> Firewall'
& "$ProjectRoot\scripts\configure-firewall.ps1" -Port $Port

Write-Host '==> Stop old app/tasks (SYSTEM or previous accounts)'
Stop-ExistingApp

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
$appPrincipal = New-ScheduledTaskPrincipal -UserId $TaskAccount -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $AppTaskName -Action $appAction -Trigger $appTrigger -Settings $appSettings -Principal $appPrincipal -Force | Out-Null
Write-Host "Registered $AppTaskName ($TaskAccount, AtStartup)"

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
$restartPrincipal = New-ScheduledTaskPrincipal -UserId $TaskAccount -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $RestartTaskName -Action $restartAction -Settings $restartSettings -Principal $restartPrincipal -Force | Out-Null
Write-Host "Registered $RestartTaskName ($TaskAccount, on-demand for deploy)"

if ($ConfigureRunnerAsLocalSystem) {
  Write-Host '==> Configure GitHub runner service as LocalSystem'
  $runnerSvc = Get-Service -Name 'actions.runner.*' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($runnerSvc) {
    Stop-Service $runnerSvc.Name -Force
    sc.exe config $runnerSvc.Name obj= LocalSystem | Out-Null
    Start-Service $runnerSvc.Name
    Write-Host "Runner service $($runnerSvc.Name) now runs as LocalSystem"
    Write-Host 'Re-register tasks as SYSTEM after switching runner to LocalSystem:'
    Write-Host "  .\scripts\install-deploy-setup.ps1 -TaskAccount SYSTEM"
  } else {
    Write-Warning 'GitHub runner service not found.'
  }
}

Write-Host '==> Test restart helper (same as GitHub deploy will do)'
$runExit = Invoke-External -FilePath 'schtasks.exe' -ArgumentList @('/Run', '/TN', $RestartTaskName)
Write-Host "schtasks /Run exit=$runExit"
Start-Sleep -Seconds 8
try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 10
  if ($health.ok -eq $true) {
    Write-Host "PASS /health ok=$($health.ok) version=$($health.version)"
  } else {
    throw "Health ok=$($health.ok)"
  }
} catch {
  Write-Error "Setup test failed: $($_.Exception.Message). Check logs\restart-service.log"
  exit 1
}

Write-Host ''
Write-Host 'Setup complete.'
Write-Host "LAN URL: http://192.168.1.25:$Port"
Write-Host "Tasks run as: $TaskAccount"
Write-Host 'Git push to main will deploy via GitHub Actions.'
