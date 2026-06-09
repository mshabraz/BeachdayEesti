#Requires -RunAsAdministrator
param(
  [int]$Port = 8080,
  [string]$DeployPath = 'C:\BeachdayEesti',
  [string]$TaskName = 'BeachdayEesti'
)

$ErrorActionPreference = 'Stop'

function Test-AppTaskExists {
  param([string]$Name)
  schtasks /Query /TN $Name 2>$null | Out-Null
  return $LASTEXITCODE -eq 0
}

Write-Host "Stopping $TaskName and freeing port $Port..."
if (Test-AppTaskExists $TaskName) {
  schtasks /End /TN $TaskName 2>$null | Out-Null
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
}

for ($round = 1; $round -le 8; $round++) {
  $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  if ($connections.Count -eq 0) { break }
  foreach ($connection in $connections) {
    $processId = $connection.OwningProcess
    taskkill /F /PID $processId 2>$null | Out-Null
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped PID $processId (round $round)"
  }
  Start-Sleep -Seconds 2
}

if (Test-AppTaskExists $TaskName) {
  Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
  if ($LASTEXITCODE -ne 0) { schtasks /Run /TN $TaskName | Out-Null }
  Write-Host "Started scheduled task $TaskName"
} else {
  Set-Location $DeployPath
  Start-Process -FilePath (Get-Command node).Source -ArgumentList 'server/index.js' -WorkingDirectory $DeployPath -WindowStyle Hidden
  Write-Host "Started node server/index.js (no scheduled task)"
}

for ($i = 1; $i -le 15; $i++) {
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 5
    if ($health.ok -eq $true) {
      Write-Host "Healthy: version=$($health.version) commit=$($health.deployment.commit) beaches=$($health.cache.beachCount)"
      exit 0
    }
    Write-Host "Attempt ${i}: /health ok=$($health.ok)"
  } catch {
    Write-Host "Attempt ${i}: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 2
}

Write-Host "Server did not return healthy JSON on /health. Check logs\startup.log and logs\node-stderr.log"
exit 1
