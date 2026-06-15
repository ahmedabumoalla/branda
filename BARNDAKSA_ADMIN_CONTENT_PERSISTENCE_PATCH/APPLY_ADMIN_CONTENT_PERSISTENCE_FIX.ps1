param(
  [string]$ProjectPath = "E:\branda-platform"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $ProjectPath)) {
  throw "ProjectPath not found: $ProjectPath"
}

$PatchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$FilesRoot = Join-Path $PatchRoot "files"

$targets = @(
  "components\admin\pages\admin-content-page.tsx",
  "components\marketing\platform-home-page.tsx",
  "lib\data\platform-content.ts",
  "lib\storage\platform-content-upload.ts",
  "app\actions\platform-content.ts",
  "supabase\migrations\041_barndaksa_admin_content_persistence_typography.sql"
)

foreach ($relative in $targets) {
  $source = Join-Path $FilesRoot $relative
  $destination = Join-Path $ProjectPath $relative
  $destinationDir = Split-Path -Parent $destination

  if (!(Test-Path $source)) {
    throw "Missing patch file: $source"
  }

  if (!(Test-Path $destinationDir)) {
    New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
  }

  Copy-Item $source $destination -Force
  Write-Host "Applied: $relative"
}

$nextDir = Join-Path $ProjectPath ".next"
if (Test-Path $nextDir) {
  Remove-Item $nextDir -Recurse -Force
  Write-Host "Removed .next cache"
}

Write-Host "Done. Run the SQL migration in Supabase SQL Editor, then run npm run build."
