param(
  [string]$ProjectPath = "E:\branda-platform"
)

$ErrorActionPreference = "Stop"
$configFiles = @(
  (Join-Path $ProjectPath "next.config.ts"),
  (Join-Path $ProjectPath "next.config.mjs"),
  (Join-Path $ProjectPath "next.config.js")
)
$configPath = $configFiles | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $configPath) { throw "لم يتم العثور على next.config داخل $ProjectPath" }

$nodeScript = @'
const fs = require("fs");
const configPath = process.argv[2];
let src = fs.readFileSync(configPath, "utf8");

function removeTopLevelServerActions(input) {
  const lines = input.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s{2}serverActions\s*:\s*\{/.test(line)) {
      let depth = 0;
      for (; i < lines.length; i++) {
        const l = lines[i];
        depth += (l.match(/\{/g) || []).length;
        depth -= (l.match(/\}/g) || []).length;
        if (depth <= 0) {
          // consume optional trailing comma on closing line already included
          break;
        }
      }
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

function insertServerActionsUnderExperimental(input) {
  if (/experimental\s*:\s*\{[\s\S]*?serverActions\s*:/.test(input)) {
    input = input.replace(/serverActions\s*:\s*\{[\s\S]*?bodySizeLimit\s*:\s*["'][^"']+["']\s*,?\s*\}/, 'serverActions: {\n      bodySizeLimit: "50mb",\n    }');
    return input;
  }

  const lines = input.split(/\n/);
  const expIndex = lines.findIndex((l) => /^\s{2}experimental\s*:\s*\{/.test(l));
  if (expIndex >= 0) {
    lines.splice(expIndex + 1, 0,
      '    serverActions: {',
      '      bodySizeLimit: "50mb",',
      '    },'
    );
    return lines.join("\n");
  }

  const cfgIndex = lines.findIndex((l) => /const\s+nextConfig(?:\s*:\s*NextConfig)?\s*=\s*\{/.test(l) || /module\.exports\s*=\s*\{/.test(l));
  if (cfgIndex < 0) throw new Error("لم أجد كائن nextConfig لإضافة experimental.serverActions");
  lines.splice(cfgIndex + 1, 0,
    '  experimental: {',
    '    serverActions: {',
    '      bodySizeLimit: "50mb",',
    '    },',
    '  },'
  );
  return lines.join("\n");
}

src = removeTopLevelServerActions(src);
src = insertServerActionsUnderExperimental(src);
fs.writeFileSync(configPath, src.replace(/\n/g, "\r\n"), "utf8");
console.log(`Fixed Server Actions bodySizeLimit in ${configPath}`);
'@

$tempNode = Join-Path $ProjectPath ".tmp-fix-server-actions-config.cjs"
Set-Content -Path $tempNode -Value $nodeScript -Encoding UTF8
node $tempNode $configPath
Remove-Item $tempNode -Force -ErrorAction SilentlyContinue

Write-Host "تم إصلاح next.config: نقل serverActions داخل experimental.serverActions"
