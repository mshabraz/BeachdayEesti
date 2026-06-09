$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "Installing BeachdayEesti in $ProjectRoot"
Set-Location $ProjectRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 18+ is required. Install from https://nodejs.org/"
}

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example"
}

npm install
Write-Host "Dependencies installed."

Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Edit .env if you have an Envir API key (ENVIR_API_KEY)"
Write-Host "  2. Run: npm start"
Write-Host "  3. Open: http://192.168.1.25:8080"
Write-Host "  4. Run scripts\configure-firewall.ps1 as Administrator for LAN access"
