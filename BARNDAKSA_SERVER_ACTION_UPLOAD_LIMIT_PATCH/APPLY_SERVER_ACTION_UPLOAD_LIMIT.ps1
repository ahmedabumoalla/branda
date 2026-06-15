param(
  [string]$ProjectPath = (Get-Location).Path,
  [string]$BodySizeLimit = "50mb"
)

$ErrorActionPreference = "Stop"

$configCandidates = @(
  "next.config.ts",
  "next.config.mjs",
  "next.config.js",
  "next.config.cjs"
)

$configPath = $null
foreach ($candidate in $configCandidates) {
  $path = Join-Path $ProjectPath $candidate
  if (Test-Path $path) {
    $configPath = $path
    break
  }
}

if (-not $configPath) {
  throw "next.config file was not found in $ProjectPath"
}

$backupPath = "$configPath.bak-server-action-limit-$(Get-Date -Format 'yyyyMMddHHmmss')"
Copy-Item $configPath $backupPath -Force

$content = Get-Content $configPath -Raw

if ($content -match "serverActions\s*:") {
  if ($content -match "bodySizeLimit\s*:") {
    $content = $content -replace "bodySizeLimit\s*:\s*['\"`][^'\"`]+['\"`]", "bodySizeLimit: `"$BodySizeLimit`""
  } else {
    $content = $content -replace "serverActions\s*:\s*\{", "serverActions: {`r`n    bodySizeLimit: `"$BodySizeLimit`"," 
  }
} else {
  $patterns = @(
    "const\s+nextConfig\s*:\s*NextConfig\s*=\s*\{",
    "const\s+nextConfig\s*=\s*\{",
    "module\.exports\s*=\s*\{",
    "export\s+default\s*\{"
  )

  $patched = $false
  foreach ($pattern in $patterns) {
    if ($content -match $pattern) {
      $content = [regex]::Replace($content, $pattern, { param($m) $m.Value + "`r`n  serverActions: {`r`n    bodySizeLimit: `"$BodySizeLimit`",`r`n  }," }, 1)
      $patched = $true
      break
    }
  }

  if (-not $patched) {
    throw "Could not safely patch $configPath. Manual review is required. Backup created at $backupPath"
  }
}

Set-Content $configPath $content -Encoding UTF8

Write-Host "Patched Server Actions bodySizeLimit in:" $configPath
Write-Host "Backup created at:" $backupPath
Write-Host "Body size limit:" $BodySizeLimit
