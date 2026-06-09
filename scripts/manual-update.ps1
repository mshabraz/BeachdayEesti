#Requires -RunAsAdministrator
<#
  Manual update from GitHub — no GitHub Actions required.

  Copy-paste every time (Admin PowerShell):
    cd C:\BeachdayEesti
    .\scripts\manual-update.ps1
#>
param(
  [string]$DeployPath = 'C:\BeachdayEesti',
  [int]$Port = 8080,
  [string]$Branch = 'main',
  [switch]$SkipSync
)

$ErrorActionPreference = 'Stop'
Set-Location $DeployPath

function Write-Step($msg) {
  Write-Host "==> $msg"
}

function Stop-AppOnPort {
  param([int]$Port)
  schtasks /End /TN BeachdayEesti 2>$null | Out-Null
  Stop-ScheduledTask -TaskName BeachdayEesti -ErrorAction SilentlyContinue | Out-Null
  Start-Sleep -Seconds 2
  for ($i = 1; $i -le 6; $i++) {
    $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($listeners.Count -eq 0) { return }
    foreach ($l in $listeners) {
      taskkill /F /T /PID $l.OwningProcess 2>$null | Out-Null
    }
    Start-Sleep -Seconds 2
  }
}

Write-Step "Updating BeachdayEesti from origin/$Branch"

# Keep local runtime data
$preserve = @('.env', 'cache', 'logs')
$backup = Join-Path $env:TEMP "beachdayeesti-manual-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Force -Path $backup | Out-Null
foreach ($name in $preserve) {
  $src = Join-Path $DeployPath $name
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $backup $name) -Recurse -Force
  }
}

Write-Step 'Pull latest from GitHub'
git fetch origin
git reset --hard "origin/$Branch"
git clean -fd

foreach ($name in $preserve) {
  $saved = Join-Path $backup $name
  $dest = Join-Path $DeployPath $name
  if (Test-Path $saved) {
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue }
    Copy-Item $saved $dest -Recurse -Force
  }
}

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Step 'Created .env from .env.example'
}

Write-Step 'Install dependencies'
npm ci --omit=dev
if ($LASTEXITCODE -ne 0) { throw "npm ci failed (exit $LASTEXITCODE)" }

if (-not $SkipSync) {
  Write-Step 'Refresh beach cache'
  node server/sync-cli.js
  if ($LASTEXITCODE -ne 0) { throw "sync failed (exit $LASTEXITCODE)" }
}

Write-Step 'Restart app'
Stop-AppOnPort -Port $Port

$task = Get-ScheduledTask -TaskName BeachdayEesti -ErrorAction SilentlyContinue
if ($task) {
  Start-ScheduledTask -TaskName BeachdayEesti
} else {
  Start-Process -FilePath (Get-Command node).Source `
    -ArgumentList 'server/index.js' `
    -WorkingDirectory $DeployPath `
    -WindowStyle Hidden
}

Start-Sleep -Seconds 5

Write-Step 'Health check'
$ok = $false
for ($i = 1; $i -le 15; $i++) {
  try {
    $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 5
    if ($h.ok -eq $true) {
      Write-Host "PASS version=$($h.version) beaches=$($h.cache.beachCount) commit=$(git rev-parse --short HEAD)"
      $ok = $true
      break
    }
  } catch {
    Write-Host "Attempt ${i}: waiting..."
  }
  Start-Sleep -Seconds 2
}

if (-not $ok) {
  Write-Error 'Update finished but /health did not return ok=true'
  exit 1
}

Write-Host ''
Write-Host "Update complete: http://192.168.1.25:$Port"
Write-Host "Commit: $(git rev-parse HEAD)"
