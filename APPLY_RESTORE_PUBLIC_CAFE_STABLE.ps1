param(
  [string]$ProjectPath = "E:\branda-platform"
)
$ErrorActionPreference = "Stop"
$patchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$files = @(
  @{ Source = "lib\data\settings.ts"; Target = "lib\data\settings.ts" },
  @{ Source = "lib\data\theme.ts"; Target = "lib\data\theme.ts" },
  @{ Source = "app\api\public\cafe\[slug]\route.ts"; Target = "app\api\public\cafe\[slug]\route.ts" },
  @{ Source = "app\api\public\cafe\[slug]\menu\route.ts"; Target = "app\api\public\cafe\[slug]\menu\route.ts" }
)

foreach ($file in $files) {
  $source = Join-Path $patchRoot $file.Source
  $target = Join-Path $ProjectPath $file.Target
  if (!(Test-Path -LiteralPath $source)) { throw "Missing patch file: $source" }
  $targetDir = Split-Path -Parent $target
  if (!(Test-Path -LiteralPath $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
  Copy-Item -LiteralPath $source -Destination $target -Force
  Write-Host "Restored:" $file.Target
}

Remove-Item (Join-Path $ProjectPath ".next") -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Done. Now run: npm run build"
