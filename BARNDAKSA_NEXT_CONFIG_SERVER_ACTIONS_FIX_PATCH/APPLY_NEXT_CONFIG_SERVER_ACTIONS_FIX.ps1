param(
  [string]$ProjectPath = "E:\branda-platform"
)

$ErrorActionPreference = "Stop"

$configCandidates = @(
  Join-Path $ProjectPath "next.config.ts",
  Join-Path $ProjectPath "next.config.js",
  Join-Path $ProjectPath "next.config.mjs"
)

$configPath = $configCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $configPath) {
  throw "next.config file was not found in $ProjectPath"
}

$backupPath = "$configPath.bak.$(Get-Date -Format 'yyyyMMddHHmmss')"
Copy-Item $configPath $backupPath -Force

$nodeScript = Join-Path $env:TEMP "barndaksa_fix_next_config_server_actions.cjs"
@'
const fs = require("fs");

const configPath = process.argv[2];
let source = fs.readFileSync(configPath, "utf8");

function skipString(src, i) {
  const quote = src[i];
  i++;
  while (i < src.length) {
    if (src[i] === "\\") {
      i += 2;
      continue;
    }
    if (src[i] === quote) return i + 1;
    i++;
  }
  return i;
}

function findMatchingBrace(src, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(src, i) - 1;
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i + 2);
      i = nl === -1 ? src.length : nl;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 1;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function removeTopLevelObjectProperty(body, propName) {
  const propRegex = new RegExp(`(^|\\n)([ \\t]*)${propName}\\s*:\\s*`, "g");
  let match;
  while ((match = propRegex.exec(body))) {
    const before = match[1] || "";
    const startLine = match.index + before.length;
    const valueStart = propRegex.lastIndex;
    let end = valueStart;

    while (end < body.length && /\s/.test(body[end])) end++;

    if (body[end] === "{") {
      const close = findMatchingBrace(body, end);
      if (close === -1) break;
      end = close + 1;
    } else {
      while (end < body.length && body[end] !== "," && body[end] !== "\n") end++;
    }

    while (end < body.length && /[ \t]/.test(body[end])) end++;
    if (body[end] === ",") end++;
    while (end < body.length && /[ \t]/.test(body[end])) end++;
    if (body[end] === "\r") end++;
    if (body[end] === "\n") end++;

    body = body.slice(0, startLine) + body.slice(end);
    propRegex.lastIndex = 0;
  }
  return body;
}

function replaceOrInsertExperimentalServerActions(body) {
  const desired = `serverActions: {\n      bodySizeLimit: "50mb",\n    },`;
  const experimentalMatch = body.match(/(^|\n)([ \t]*)experimental\s*:\s*\{/);

  if (!experimentalMatch || experimentalMatch.index === undefined) {
    return `\n  experimental: {\n    ${desired}\n  },` + body;
  }

  const expOpen = experimentalMatch.index + experimentalMatch[0].lastIndexOf("{");
  const expClose = findMatchingBrace(body, expOpen);
  if (expClose === -1) return body;

  let expBody = body.slice(expOpen + 1, expClose);
  expBody = removeTopLevelObjectProperty(expBody, "serverActions");

  if (expBody.trim().length) {
    expBody = `\n    ${desired}\n` + expBody;
  } else {
    expBody = `\n    ${desired}\n  `;
  }

  return body.slice(0, expOpen + 1) + expBody + body.slice(expClose);
}

const nextConfigMatch = source.match(/const\s+nextConfig(?:\s*:\s*[^=]+)?\s*=\s*\{/);
if (!nextConfigMatch || nextConfigMatch.index === undefined) {
  throw new Error("Could not find const nextConfig object.");
}

const objectOpen = nextConfigMatch.index + nextConfigMatch[0].lastIndexOf("{");
const objectClose = findMatchingBrace(source, objectOpen);
if (objectClose === -1) throw new Error("Could not find nextConfig closing brace.");

let body = source.slice(objectOpen + 1, objectClose);
body = removeTopLevelObjectProperty(body, "serverActions");
body = replaceOrInsertExperimentalServerActions(body);

source = source.slice(0, objectOpen + 1) + body + source.slice(objectClose);
fs.writeFileSync(configPath, source, "utf8");
console.log(`Fixed ${configPath}`);
'@ | Set-Content $nodeScript -Encoding UTF8

node $nodeScript $configPath
Remove-Item $nodeScript -Force -ErrorAction SilentlyContinue

Write-Host "Done. Backup created at: $backupPath"
Write-Host "Now run: npm run build"
