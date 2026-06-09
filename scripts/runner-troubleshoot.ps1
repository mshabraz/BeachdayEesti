#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Troubleshoot GitHub Actions self-hosted runner on the LAN server.

.EXAMPLE
  .\scripts\runner-troubleshoot.ps1
#>

$ErrorActionPreference = 'Continue'
$Repo = 'mshabraz/BeachdayEesti'
$RunnerName = 'BeachdayEestiLAN'

Write-Host "=== BeachdayEesti runner troubleshoot ===" -ForegroundColor Cyan

Write-Host "`n1. Runner Windows services"
Get-Service actions.runner.* -ErrorAction SilentlyContinue | Format-Table Name, Status, StartType -AutoSize

Write-Host "`n2. Look for runner install folder (common paths)"
$paths = @(
  'C:\actions-runner',
  'C:\BeachdayEesti\actions-runner',
  'C:\Users\*\actions-runner',
  'D:\actions-runner'
)
foreach ($pattern in $paths) {
  Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue | Select-Object FullName
}

Write-Host "`n3. Required GitHub job labels (after workflow fix)"
Write-Host "   - self-hosted"
Write-Host "   - Windows"
Write-Host "   (Runner NAME '$RunnerName' is NOT a label unless you added it manually.)"

Write-Host "`n4. On GitHub: https://github.com/$Repo/settings/actions/runners"
Write-Host "   - Runner must show Idle (green), not Offline"
Write-Host "   - Labels must include: self-hosted, Windows"

Write-Host "`n5. If Offline, on the server in the runner folder run:"
Write-Host "   .\run.cmd   # test interactively - should say 'Listening for Jobs'"
Write-Host "   # or re-register:"
Write-Host "   .\config.cmd remove"
Write-Host "   .\config.cmd --url https://github.com/$Repo --token <TOKEN> --name $RunnerName --labels self-hosted,Windows"

Write-Host "`n6. Firewall / proxy"
Write-Host "   Runner needs outbound HTTPS to github.com and api.github.com"

Write-Host "`n7. After runner is Idle, cancel queued jobs and re-run workflow:"
Write-Host "   https://github.com/$Repo/actions/workflows/deploy-lan.yml"
