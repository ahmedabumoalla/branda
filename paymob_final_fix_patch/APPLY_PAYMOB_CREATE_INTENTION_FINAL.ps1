param(
  [string]$ProjectPath = "."
)

$ErrorActionPreference = "Stop"

$ProjectPath = (Resolve-Path $ProjectPath).Path
$PatchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PayloadZip = Join-Path $PatchRoot "PAYMOB_CREATE_INTENTION_FINAL_PAYLOAD.zip"
$TempDir = Join-Path $ProjectPath ".barndaksa-paymob-create-intention-final-temp"
$TargetFile = Join-Path $ProjectPath "app\api\payments\subscription\paymob\create-intention\route.ts"
$BackupRoot = Join-Path $ProjectPath ".barndaksa-patch-backups\paymob-create-intention-final"

Write-Host "Applying Paymob create-intention final fix..." -ForegroundColor Cyan

if (-not (Test-Path $PayloadZip)) {
  throw "Payload zip not found: $PayloadZip"
}

Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
Expand-Archive -Path $PayloadZip -DestinationPath $TempDir -Force

$SourceFile = Join-Path $TempDir "app\api\payments\subscription\paymob\create-intention\route.ts"
if (-not (Test-Path $SourceFile)) {
  throw "Source route not found inside payload."
}

if (Test-Path $TargetFile) {
  New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  Copy-Item $TargetFile (Join-Path $BackupRoot "route.ts.$stamp.bak") -Force
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $TargetFile) | Out-Null
Copy-Item $SourceFile $TargetFile -Force

$content = Get-Content $TargetFile -Raw
if ($content -match 'cafe_settings\(') {
  throw "Verification failed: old embedded cafe_settings relationship still exists."
}
if ($content -notmatch '\.from\("cafe_settings"\)') {
  throw "Verification failed: separate cafe_settings query was not found."
}
if ($content -notmatch '\.from\("subscriptions"\)') {
  throw "Verification failed: subscriptions query was not found."
}

Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $ProjectPath ".next") -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "VERIFIED: create-intention route no longer uses embedded cafe_settings relationship." -ForegroundColor Green
Write-Host "Changed file: app/api/payments/subscription/paymob/create-intention/route.ts" -ForegroundColor Green
Write-Host "Next: run npm run build then npm run dev" -ForegroundColor Cyan
