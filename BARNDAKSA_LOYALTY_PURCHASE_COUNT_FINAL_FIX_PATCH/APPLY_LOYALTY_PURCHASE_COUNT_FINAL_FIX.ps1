param(
  [string]$ProjectPath = "."
)

$ErrorActionPreference = "Stop"
$patchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $patchRoot "scripts\fix-loyalty-purchase-count.cjs"

if (-not (Test-Path $ProjectPath)) {
  throw "ProjectPath not found: $ProjectPath"
}

node $script $ProjectPath

Write-Host ""
Write-Host "تم تطبيق إصلاح ملفات QR/احتساب عملية الشراء." -ForegroundColor Green
Write-Host "مهم: شغّل ملف SQL الموجود داخل مجلد sql في Supabase SQL Editor." -ForegroundColor Yellow
Write-Host "ثم نفذ: npm run build" -ForegroundColor Cyan
