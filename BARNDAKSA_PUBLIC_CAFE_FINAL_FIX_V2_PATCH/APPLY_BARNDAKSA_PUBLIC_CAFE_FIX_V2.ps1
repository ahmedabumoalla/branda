param(
  [string]$ProjectPath = "E:\branda-platform"
)

$ErrorActionPreference = "Stop"
$patchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Copy-PatchFile($relativePath) {
  $source = Join-Path $patchRoot $relativePath
  $target = Join-Path $ProjectPath $relativePath
  $targetDir = Split-Path -Parent $target
  if (!(Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
  Copy-Item -LiteralPath $source -Destination $target -Force
  Write-Host "Patched $relativePath"
}

Copy-PatchFile "lib\data\settings.ts"

Write-Host "BARNDAKSA public cafe final fix V2 applied."
