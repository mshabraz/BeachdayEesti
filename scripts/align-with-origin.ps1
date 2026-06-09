# Sync C:\BeachdayEesti with origin/main without losing .env, cache, or logs.
# Use when `git pull` fails due to local drift. Deploy normally updates via GitHub Actions robocopy.
param(
  [string]$DeployPath = 'C:\BeachdayEesti'
)

$ErrorActionPreference = 'Stop'
Set-Location $DeployPath

if (-not (Test-Path '.git')) {
  Write-Host "No .git in $DeployPath. Trigger a GitHub Actions deploy instead of git pull."
  exit 1
}

$preserve = @('.env', 'cache', 'logs')
$backup = Join-Path $env:TEMP "beachdayeesti-preserve-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Force -Path $backup | Out-Null
foreach ($name in $preserve) {
  $src = Join-Path $DeployPath $name
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $backup $name) -Recurse -Force
    Write-Host "Backed up $name"
  }
}

git fetch origin
git reset --hard origin/main
git clean -fd

foreach ($name in $preserve) {
  $saved = Join-Path $backup $name
  $dest = Join-Path $DeployPath $name
  if (Test-Path $saved) {
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    Copy-Item $saved $dest -Recurse -Force
    Write-Host "Restored $name"
  }
}

Write-Host "Aligned with origin/main. Run: .\scripts\restart-app.ps1"
Write-Host "Or push to main and let GitHub Actions deploy."
