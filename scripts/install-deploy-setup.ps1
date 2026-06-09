#Requires -RunAsAdministrator
<#
  One-time server setup for BeachdayEesti LAN deploys.

  Aligns the app scheduled task with the GitHub Actions runner job account
  so deploy can stop/start Node during git-push deploys.

  Run ONCE as Administrator:
    cd C:\BeachdayEesti
    git fetch origin
    git reset --hard origin/main
    .\scripts\install-deploy-setup.ps1
#>
param(
  [int]$Port = 8080,
  [string]$DeployPath = 'C:\BeachdayEesti',
  [switch]$ConfigureRunnerAsLocalSystem
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ps-task-utils.ps1')

$ProjectRoot = if (Test-Path $DeployPath) { $DeployPath } else { Split-Path -Parent $PSScriptRoot }
$NodePath = (Get-Command node).Source
$AppTaskName = 'BeachdayEesti'

function Get-RunnerServiceAccount {
  $runnerSvc = Get-Service -Name 'actions.runner.*' -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $runnerSvc) { return $null }
  $qc = sc.exe qc $runnerSvc.Name 2>$null
  $line = $qc | Where-Object { $_ -match 'SERVICE_START_NAME' }
  if ($line -match ':\s*(.+)$') { return $matches[1].Trim() }
  return $null
}

function Resolve-TaskAccount {
  $runnerSvcAccount = Get-RunnerServiceAccount
  if ($runnerSvcAccount -eq 'LocalSystem') {
    return 'SYSTEM'
  }
  if ($runnerSvcAccount -like '*NETWORK SERVICE*') {
    return 'NT AUTHORITY\NETWORK SERVICE'
  }
  # GitHub Actions jobs on this runner typically run as NETWORK SERVICE
  return 'NT AUTHORITY\NETWORK SERVICE'
}

$TaskAccount = Resolve-TaskAccount

function Stop-ExistingApp {
  foreach ($name in @($AppTaskName, 'BeachdayEesti-Restart')) {
    Stop-AppTask -Name $name | Out-Null
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
  }
  Stop-BeachdayNodeProcesses -DeployPath $ProjectRoot -Port $Port | Out-Null
  Stop-PortListeners -Port $Port -MaxRounds 10 | Out-Null
}

Write-Host "==> Runner service account: $(Get-RunnerServiceAccount)"
Write-Host "==> App task will run as: $TaskAccount"
Write-Host '==> GitHub Actions jobs typically run as: NT AUTHORITY\NETWORK SERVICE'

Write-Host '==> Firewall'
& "$ProjectRoot\scripts\configure-firewall.ps1" -Port $Port

Write-Host '==> Stop old tasks/processes (including old SYSTEM task)'
Stop-ExistingApp

Write-Host "==> Register boot task as $TaskAccount"
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

Write-Host '==> Grant runner read access to deploy folder'
$runnerSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-20')
$acl = Get-Acl $ProjectRoot
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule($runnerSid, 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl $ProjectRoot $acl

if ($ConfigureRunnerAsLocalSystem) {
  Write-Host '==> Configure GitHub runner service as LocalSystem'
  $runnerSvc = Get-Service -Name 'actions.runner.*' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($runnerSvc) {
    Stop-Service $runnerSvc.Name -Force
    sc.exe config $runnerSvc.Name obj= LocalSystem | Out-Null
    Start-Service $runnerSvc.Name
    Write-Host "Runner service $($runnerSvc.Name) now runs as LocalSystem"
    Write-Host 'Re-run this script without -ConfigureRunnerAsLocalSystem to register task as SYSTEM if needed.'
  }
}

Write-Host '==> Start app now'
Start-AppTask -Name $AppTaskName
Start-Sleep -Seconds 5

Write-Host '==> Health check'
$health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 15
if ($health.ok -ne $true) {
  Write-Error "Setup test failed: ok=$($health.ok)"
  exit 1
}
Write-Host "PASS /health ok=$($health.ok) version=$($health.version)"

Write-Host ''
Write-Host 'Setup complete.'
Write-Host "LAN URL: http://192.168.1.25:$Port"
Write-Host "App task account: $TaskAccount"
