# One-shot recovery for C:\BeachdayEesti (run as Administrator)
# Fixes git drift, restores all files from origin/main, restarts app, verifies /health.
#Requires -RunAsAdministrator
param(
  [string]$DeployPath = 'C:\BeachdayEesti',
  [int]$Port = 8080,
  [string]$TaskName = 'BeachdayEesti'
)

$ErrorActionPreference = 'Stop'
Set-Location $DeployPath

Write-Host '==> Fetch and reset to origin/main'
git fetch origin
git reset --hard origin/main
git clean -fd

Write-Host '==> npm install'
npm ci --omit=dev

Write-Host '==> Stop task and free port'
schtasks /End /TN $TaskName 2>$null | Out-Null
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
Start-Sleep -Seconds 3

for ($round = 1; $round -le 8; $round++) {
  $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  if ($connections.Count -eq 0) { break }
  foreach ($c in $connections) {
    taskkill /F /PID $c.OwningProcess 2>$null | Out-Null
  }
  Start-Sleep -Seconds 2
}

Write-Host '==> Start scheduled task'
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 5

Write-Host '==> Health check'
for ($i = 1; $i -le 15; $i++) {
  try {
    $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 5
    if ($h.ok -eq $true) {
      Write-Host "PASS ok=$($h.ok) version=$($h.version) beaches=$($h.cache.beachCount) commit=$($h.deployment.commit)"
      exit 0
    }
    Write-Host "Attempt ${i}: got response but ok=$($h.ok)"
  } catch {
    Write-Host "Attempt ${i}: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 2
}

Write-Host 'FAIL: /health did not return JSON with ok=true'
Write-Host 'Check logs\node-stderr.log and logs\startup.log'
exit 1
