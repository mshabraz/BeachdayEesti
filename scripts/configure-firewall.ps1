#Requires -RunAsAdministrator
param(
  [int]$Port = 8080
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RuleName = "BeachdayEesti HTTP $Port"

Write-Host "Configuring Windows Firewall for BeachdayEesti on port $Port..."
$existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Firewall rule already exists."
} else {
  New-NetFirewallRule `
    -DisplayName $RuleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $Port `
    -Profile Private,Domain | Out-Null
  Write-Host "Firewall rule created."
}

Write-Host "Done. LAN URL: http://192.168.1.25:$Port"
