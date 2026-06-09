#Requires -RunAsAdministrator
param(
  [int]$Port = 8080,
  [string]$DeployPath = 'C:\BeachdayEesti'
)

Write-Host 'install-startup.ps1 is deprecated. Running install-deploy-setup.ps1 instead...'
& (Join-Path $PSScriptRoot 'install-deploy-setup.ps1') -Port $Port -DeployPath $DeployPath
