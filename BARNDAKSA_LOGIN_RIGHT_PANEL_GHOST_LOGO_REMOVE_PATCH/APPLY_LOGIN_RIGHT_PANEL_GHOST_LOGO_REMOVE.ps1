param(
  [string]$ProjectPath = "."
)

$ErrorActionPreference = "Stop"

$target = Join-Path $ProjectPath "app\login\page.tsx"
if (!(Test-Path -LiteralPath $target)) {
  throw "Target file not found: $target"
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backup = "$target.bak.$timestamp"
Copy-Item -LiteralPath $target -Destination $backup -Force

$nodeScript = @'
const fs = require("fs");
const file = process.argv[2];
let content = fs.readFileSync(file, "utf8");
const before = content;

// Remove the ghost brown background logo in the right login panel only.
// It is the decorative Image using LOGO.brownBg with absolute -left-8 -top-8 placement.
const patterns = [
  /\n\s*<Image\s+src=\{LOGO\.brownBg\}[\s\S]*?className="[^"]*absolute\s+-left-8\s+-top-8[^"]*"[\s\S]*?\/>(?=\s*\n)/m,
  /\n\s*<Image[\s\S]*?src=\{LOGO\.brownBg\}[\s\S]*?className="[^"]*absolute\s+-left-8\s+-top-8[^"]*"[\s\S]*?\/>(?=\s*\n)/m,
  /\n\s*<Image\s+src=\{LOGO\.brownBg\}[\s\S]*?\/>(?=\s*\n)/m,
];

let removed = false;
for (const pattern of patterns) {
  if (pattern.test(content)) {
    content = content.replace(pattern, "");
    removed = true;
    break;
  }
}

if (!removed) {
  console.error("Could not find the right-panel ghost logo block in app/login/page.tsx");
  process.exit(2);
}

// Clean unused imports if they became unused after removing the decorative image.
if (!content.includes("<Image")) {
  content = content.replace(/\n?import\s+Image\s+from\s+["']next\/image["'];\s*/g, "\n");
}
if (!content.includes("LOGO.")) {
  content = content.replace(/\n?import\s+\{\s*LOGO\s*\}\s+from\s+["']@\/lib\/ui\/brand["'];\s*/g, "\n");
}

// Normalize excessive blank lines around imports.
content = content.replace(/\n{3,}/g, "\n\n");

if (content === before) {
  console.error("No changes were written to app/login/page.tsx");
  process.exit(3);
}

fs.writeFileSync(file, content, "utf8");
console.log("Removed the ghost brown logo from the right login panel:", file);
'@

$tempScript = Join-Path $env:TEMP "remove-login-right-panel-ghost-logo.cjs"
Set-Content -LiteralPath $tempScript -Value $nodeScript -Encoding UTF8
node $tempScript $target
Remove-Item -LiteralPath $tempScript -Force -ErrorAction SilentlyContinue

$nextDir = Join-Path $ProjectPath ".next"
if (Test-Path -LiteralPath $nextDir) {
  Remove-Item -LiteralPath $nextDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Done. Backup created at: $backup"
