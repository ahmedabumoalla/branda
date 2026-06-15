param(
  [string]$ProjectPath = "E:\branda-platform"
)

$ErrorActionPreference = "Stop"

$PatchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceFile = Join-Path $PatchRoot "files\components\cafe\themes\themed-auth-panel.tsx"
$TargetFile = Join-Path $ProjectPath "components\cafe\themes\themed-auth-panel.tsx"

if (!(Test-Path $ProjectPath)) {
  throw "Project path not found: $ProjectPath"
}

if (!(Test-Path $SourceFile)) {
  throw "Patch source file not found: $SourceFile"
}

if (!(Test-Path $TargetFile)) {
  throw "Target file not found: $TargetFile"
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backup = "$TargetFile.bak.$timestamp"
Copy-Item $TargetFile $backup -Force
Copy-Item $SourceFile $TargetFile -Force

Write-Host "Patched customer login/register Arabic text successfully." -ForegroundColor Green
Write-Host "Target: $TargetFile"
Write-Host "Backup: $backup"
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue"
Write-Host "  npm run build"
Write-Host "  npm run dev"
