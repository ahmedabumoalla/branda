param(
  [string]$ProjectPath = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ProjectPath)) {
  throw "ProjectPath not found: $ProjectPath"
}

$configCandidates = @(
  (Join-Path $ProjectPath "next.config.ts"),
  (Join-Path $ProjectPath "next.config.mjs"),
  (Join-Path $ProjectPath "next.config.js")
)

$configPath = $configCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not $configPath) {
  throw "next.config.ts/mjs/js was not found in: $ProjectPath"
}

$nodeScript = Join-Path $ProjectPath ".tmp-apply-server-action-upload-limit-v2.cjs"

@'
const fs = require("fs");

const configPath = process.argv[2];
const limit = "50mb";
let content = fs.readFileSync(configPath, "utf8");
const original = content;

function backupOnce() {
  const backup = `${configPath}.bak-server-action-upload-limit-v2`;
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, "utf8");
}

function replaceExistingBodySizeLimit(source) {
  return source.replace(/bodySizeLimit\s*:\s*(["'`])[^"'`]+\1/g, `bodySizeLimit: "${limit}"`);
}

function addBodySizeLimitToExistingServerActions(source) {
  return source.replace(/serverActions\s*:\s*\{/m, `serverActions: {\n    bodySizeLimit: "${limit}",`);
}

function insertTopLevelServerActions(source) {
  const block = `serverActions: {\n    bodySizeLimit: "${limit}",\n  },`;

  const nextConfigMatch = source.match(/const\s+nextConfig(?:\s*:\s*[^=]+)?\s*=\s*\{/m);
  if (nextConfigMatch && typeof nextConfigMatch.index === "number") {
    const insertAt = nextConfigMatch.index + nextConfigMatch[0].length;
    return source.slice(0, insertAt) + `\n  ${block}` + source.slice(insertAt);
  }

  const moduleExportsMatch = source.match(/module\.exports\s*=\s*\{/m);
  if (moduleExportsMatch && typeof moduleExportsMatch.index === "number") {
    const insertAt = moduleExportsMatch.index + moduleExportsMatch[0].length;
    return source.slice(0, insertAt) + `\n  ${block}` + source.slice(insertAt);
  }

  const exportDefaultMatch = source.match(/export\s+default\s*\{/m);
  if (exportDefaultMatch && typeof exportDefaultMatch.index === "number") {
    const insertAt = exportDefaultMatch.index + exportDefaultMatch[0].length;
    return source.slice(0, insertAt) + `\n  ${block}` + source.slice(insertAt);
  }

  throw new Error("Could not find a supported Next config object to patch.");
}

backupOnce();

if (/bodySizeLimit\s*:/.test(content)) {
  content = replaceExistingBodySizeLimit(content);
} else if (/serverActions\s*:\s*\{/.test(content)) {
  content = addBodySizeLimitToExistingServerActions(content);
} else {
  content = insertTopLevelServerActions(content);
}

fs.writeFileSync(configPath, content, "utf8");
console.log(`Patched ${configPath}`);
'@ | Set-Content -LiteralPath $nodeScript -Encoding UTF8

node $nodeScript $configPath
Remove-Item -LiteralPath $nodeScript -Force -ErrorAction SilentlyContinue

Write-Host "Done. Server Actions bodySizeLimit is now 50mb in:" $configPath
Write-Host "Backup created if it did not already exist:" "$configPath.bak-server-action-upload-limit-v2"
