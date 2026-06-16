param(
  [string]$ProjectPath = "."
)

$ErrorActionPreference = "Stop"

$Root = (Resolve-Path $ProjectPath).Path
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Tool = Join-Path $ScriptDir "tools\fix-loyalty-qr-timeout-type.cjs"

Write-Host "Applying Barndaksa loyalty QR timeout type fix..." -ForegroundColor Cyan
Write-Host "Project: $Root"

node $Tool $Root

Write-Host "Done. Now run: npm run build" -ForegroundColor Green
