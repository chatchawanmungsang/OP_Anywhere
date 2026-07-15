# Sync local changes to GitHub.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/sync-github.ps1 "commit message"

param(
    [Parameter(Mandatory = $true)]
    [string]$Message
)

$ErrorActionPreference = "Stop"
$git = "C:\Users\kkpho\AppData\Local\GitHubDesktop\app-3.6.2\resources\app\git\cmd\git.exe"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$status = & $git status --porcelain
if (-not $status) {
    Write-Host "No local changes to sync."
    exit 0
}

& $git add .
& $git commit -m $Message
& $git push origin main
Write-Host "Pushed to GitHub."
