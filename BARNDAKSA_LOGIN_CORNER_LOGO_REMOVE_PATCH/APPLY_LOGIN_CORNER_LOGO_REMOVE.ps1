param(
  [string]$ProjectPath = "E:\branda-platform"
)

$ErrorActionPreference = "Stop"

$loginPage = Join-Path $ProjectPath "app\login\page.tsx"

if (-not (Test-Path -LiteralPath $loginPage)) {
  throw "لم أجد ملف صفحة تسجيل الدخول: $loginPage"
}

$backup = "$loginPage.bak-before-remove-corner-logo"
Copy-Item -LiteralPath $loginPage -Destination $backup -Force

$content = Get-Content -LiteralPath $loginPage -Raw
$original = $content

# Remove the unused brand LOGO import if present.
$content = $content -replace '\r?\nimport\s+\{\s*LOGO\s*\}\s+from\s+["'']@/lib/ui/brand["''];', ''

# Remove next/image import only if this login page no longer uses <Image /> after removing the decorative image.
# First remove the decorative absolute corner image that uses LOGO.brownBg.
$content = [regex]::Replace(
  $content,
  '(?s)\s*<Image\s+src=\{LOGO\.brownBg\}\s+alt=""\s+width=\{200\}\s+height=\{200\}\s+className="pointer-events-none absolute -left-8 -top-8 opacity-25 object-contain"\s*/>',
  ''
)

# Support a slightly different formatting order if the component was formatted by another tool.
$content = [regex]::Replace(
  $content,
  '(?s)\s*<Image\s+[^>]*src=\{LOGO\.brownBg\}[^>]*/>',
  ''
)

if ($content -notmatch '<Image\b') {
  $content = $content -replace '\r?\nimport\s+Image\s+from\s+["'']next/image["''];', ''
}

if ($content -eq $original) {
  Write-Host "لم أجد الشعار الزاوي في صفحة تسجيل الدخول، لم يتم تعديل الملف."
} else {
  Set-Content -LiteralPath $loginPage -Value $content -Encoding UTF8
  Write-Host "تم حذف الشعار الزاوي من صفحة تسجيل الدخول فقط."
  Write-Host "Backup: $backup"
}
