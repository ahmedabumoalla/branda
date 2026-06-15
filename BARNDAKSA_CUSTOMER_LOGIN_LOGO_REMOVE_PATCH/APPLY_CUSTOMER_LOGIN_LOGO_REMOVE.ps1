param(
  [Parameter(Mandatory=$true)]
  [string]$ProjectPath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ProjectPath)) {
  throw "Project path not found: $ProjectPath"
}

$excluded = @("\node_modules\", "\.next\", "\.git\", "\.vercel\")

$targets = Get-ChildItem -Path $ProjectPath -Recurse -File -Filter "themed-auth-panel.tsx" | Where-Object {
  $full = $_.FullName
  -not ($excluded | Where-Object { $full.Contains($_) })
} | Where-Object {
  $content = Get-Content $_.FullName -Raw
  $content -match "ThemedAuthPanel" -and ($content -match "CafeLogo" -or $content -match "useResolvedCafeLogoUrl")
}

if (-not $targets -or $targets.Count -eq 0) {
  throw "No ThemedAuthPanel file with CafeLogo was found. Nothing was changed."
}

foreach ($target in $targets) {
  $file = $target.FullName
  $backup = "$file.bak-before-remove-customer-login-logo"
  Copy-Item $file $backup -Force

  $content = Get-Content $file -Raw
  $original = $content

  # Remove unused logo imports from the customer auth panel.
  $content = $content -replace 'import\s*\{\s*CafeLogo\s*\}\s*from\s*["'']@/components/cafe/cafe-logo["''];\s*\r?\n', ''
  $content = $content -replace 'import\s*\{\s*useResolvedCafeLogoUrl\s*\}\s*from\s*["'']@/lib/cafe/use-resolved-cafe-logo["''];\s*\r?\n', ''

  # Remove resolved logo variable.
  $content = $content -replace '\r?\n\s*const\s+logoUrl\s*=\s*useResolvedCafeLogoUrl\(settings\);\s*', "`r`n"

  # Remove the CafeLogo JSX block only.
  $content = [regex]::Replace(
    $content,
    '\r?\n\s*<CafeLogo\s+name=\{settings\.cafeName\}\s+logoUrl=\{logoUrl\}\s+size=\{auth\s*===\s*["'']kiosk["'']\s*\?\s*["'']md["'']\s*:\s*["'']lg["'']\}\s*/>\s*',
    "`r`n",
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )

  # If the first title had top margin only because the logo existed, remove that extra margin.
  $content = $content -replace 'className=\{`mt-6 font-black', 'className={`mt-0 font-black'

  if ($content -eq $original) {
    throw "Target found but no changes were applied: $file"
  }

  Set-Content -Path $file -Value $content -Encoding UTF8
  Write-Host "Removed customer login/register corner logo from:" $file
  Write-Host "Backup:" $backup
}

Write-Host "Done. Run: npm run build"
