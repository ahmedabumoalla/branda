param(
  [string]$ProjectPath = "E:\branda-platform"
)
$ErrorActionPreference = "Stop"
$PatchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$files = @(
  "lib\data\cafes.ts",
  "lib\data\settings.ts",
  "lib\data\theme.ts",
  "lib\data\menu.ts",
  "lib\data\offers.ts",
  "lib\data\branches.ts",
  "lib\data\platform-upgrade.ts",
  "lib\cafe\use-cafe-theme-page.ts",
  "lib\cafe\use-public-cafe-menu.ts",
  "lib\cafe\use-custom-identity-visuals.ts"
)
foreach ($file in $files) {
  $src = Join-Path $PatchRoot $file
  $dst = Join-Path $ProjectPath $file
  if (!(Test-Path $src)) { throw "Missing patch file: $src" }
  if (Test-Path $dst) { Copy-Item $dst "$dst.bak" -Force }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
  Copy-Item $src $dst -Force
  Write-Host "Patched $file"
}
$envFile = Join-Path $ProjectPath ".env.local"
if (Test-Path $envFile) {
  $envContent = Get-Content $envFile -Raw
  if ($envContent -notmatch "NEXT_PUBLIC_SITE_URL=") { Add-Content $envFile "`nNEXT_PUBLIC_SITE_URL=http://localhost:3000" }
  if ($envContent -notmatch "NEXT_PUBLIC_BARNDAKSA_PUBLIC_DOMAIN=") { Add-Content $envFile "NEXT_PUBLIC_BARNDAKSA_PUBLIC_DOMAIN=barndaksa.com" }
}
Remove-Item (Join-Path $ProjectPath ".next") -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Done. Now run: npm run build"
