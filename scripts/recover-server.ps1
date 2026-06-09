#Requires -RunAsAdministrator
param([string]$DeployPath = 'C:\BeachdayEesti')

$ErrorActionPreference = 'Stop'
Set-Location $DeployPath

Write-Host '==> Fetch and reset to origin/main'
git fetch origin
git reset --hard origin/main
git clean -fd

Write-Host '==> npm install'
npm ci --omit=dev

Write-Host '==> Restart via deploy helper'
& (Join-Path $PSScriptRoot 'restart-app.ps1')
