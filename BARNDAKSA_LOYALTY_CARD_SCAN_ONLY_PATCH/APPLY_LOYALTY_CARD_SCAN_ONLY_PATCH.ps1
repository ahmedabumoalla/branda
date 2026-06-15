param(
  [string]$ProjectPath = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ProjectPath)) {
  throw "ProjectPath does not exist: $ProjectPath"
}

$PatchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodeScript = Join-Path $PatchRoot "tools\apply-loyalty-card-scan-only.cjs"

if (-not (Test-Path $NodeScript)) {
  throw "Patch tool not found: $NodeScript"
}

Write-Host "Applying loyalty card scan-only patch to: $ProjectPath"
node $NodeScript $ProjectPath
Write-Host "Done. Run: npm run build"
