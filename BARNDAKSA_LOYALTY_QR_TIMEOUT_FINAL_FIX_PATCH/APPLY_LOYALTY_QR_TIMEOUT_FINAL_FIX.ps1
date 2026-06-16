param(
  [string]$ProjectPath = "."
)

$ErrorActionPreference = "Stop"
$project = (Resolve-Path $ProjectPath).Path
$file = Join-Path $project "components\loyalty\barcode-camera-scanner.tsx"

if (!(Test-Path $file)) {
  throw "Target file not found: $file"
}

$backup = "$file.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
Copy-Item $file $backup -Force

$script = @'
const fs = require("fs");
const path = process.argv[2];
let s = fs.readFileSync(path, "utf8");
let original = s;

// Force browser timer type. window.setTimeout returns number in browser builds.
s = s.replace(/let\s+timer\s*:\s*(?:NodeJS\.)?Timeout\s*\|\s*null\s*=\s*null\s*;/g, "let timer: number | null = null;");
s = s.replace(/let\s+timer\s*:\s*ReturnType<typeof\s+setTimeout>\s*\|\s*null\s*=\s*null\s*;/g, "let timer: number | null = null;");
s = s.replace(/let\s+timer\s*:\s*ReturnType<typeof\s+window\.setTimeout>\s*\|\s*null\s*=\s*null\s*;/g, "let timer: number | null = null;");

// If timer exists without an explicit type directly before detectFrame, normalize it.
s = s.replace(/let\s+timer\s*=\s*null\s*;/g, "let timer: number | null = null;");

// Make clearTimeout use window.clearTimeout and null guard.
s = s.replace(/(?<!window\.)clearTimeout\((timer)\)/g, "window.clearTimeout($1)");

// Defensive: if the file still assigns window.setTimeout to a non-number timer type, annotate the assignment.
s = s.replace(/timer\s*=\s*window\.setTimeout\(([^;]+)\);/g, "timer = window.setTimeout($1);");

if (!s.includes("let timer: number | null = null") && s.includes("window.setTimeout")) {
  // Insert timer declaration after stopped flag if missing.
  s = s.replace(/(let\s+stopped\s*=\s*false\s*;)/, "$1\n    let timer: number | null = null;");
}

if (s === original) {
  console.log("No changes were needed; scanner file already looks patched.");
} else {
  fs.writeFileSync(path, s, "utf8");
  console.log("Patched timer type in " + path);
}
'@

$tmp = Join-Path $env:TEMP "barndaksa_fix_qr_timer_type.js"
Set-Content -Path $tmp -Value $script -Encoding UTF8
node $tmp $file
Remove-Item $tmp -Force -ErrorAction SilentlyContinue

# Print proof lines
Write-Host "\n=== Proof from barcode-camera-scanner.tsx ==="
Select-String -Path $file -Pattern "let timer|window.setTimeout|clearTimeout" -Context 1,1

# Clear local Next cache
$next = Join-Path $project ".next"
if (Test-Path $next) {
  Remove-Item $next -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "Removed .next cache"
}

Write-Host "\nDone. Backup created: $backup"
