param(
  [string]$ProjectPath = "."
)

$ErrorActionPreference = "Stop"
$PatchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Script = Join-Path $PatchRoot "tools\apply-loyalty-qr-reader-stable.cjs"

if (!(Test-Path $Script)) {
  throw "Patch tool not found: $Script"
}

node $Script $ProjectPath
