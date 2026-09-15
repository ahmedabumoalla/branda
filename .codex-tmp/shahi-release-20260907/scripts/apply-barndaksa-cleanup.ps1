# Barndaksa cleanup script
# Run from the project root after extracting the patch ZIP.

$oldPaths = @(
  "supabase/migrations/039_branda_thermal_printing_reservation_attendance_notifications.sql",
  "supabase/migrations/034_branda_finance_tables_platform_coupons_plan_limits_exports.sql",
  "supabase/migrations/032_branda_finance_inclusive_vat_coupons_profit_distribution.sql",
  "supabase/migrations/028_branda_fix_subscriptions_service_role_privileges.sql",
  "supabase/migrations/029_branda_reservation_cards_representatives_monitor.sql",
  "supabase/migrations/010_branda_representative_dashboard_primary_branch.sql",
  "docs/BRANDA_HANDOFF/SOURCE_BUNDLES/06_SUPABASE_MIGRATIONS_TESTS_SOURCE.md",
  "supabase/migrations/021_branda_build_stabilizer_after_final_patches.sql",
  "docs/BRANDA_HANDOFF/SOURCE_BUNDLES/03_LIB_DATA_AUTH_SUPABASE_SOURCE.md",
  "supabase/migrations/012_branda_business_categories_rewards_mobile.sql",
  "docs/BRANDA_HANDOFF/SOURCE_BUNDLES/05_TYPES_CONFIG_PACKAGE_SOURCE.md",
  "docs/BRANDA_HANDOFF/SOURCE_BUNDLES/04_LIB_STORAGE_CAFE_UI_SOURCE.md",
  "docs/BRANDA_HANDOFF/SOURCE_BUNDLES/01_APP_ROUTES_AND_API_SOURCE.md",
  "supabase/migrations/011_branda_electronic_branch_public_access.sql",
  "supabase/migrations/038_branda_platform_performance_foundation.sql",
  "supabase/migrations/007_branda_platform_plans_description_fix.sql",
  "supabase/migrations/009_branda_careers_representatives_repair.sql",
  "supabase/migrations/006_branda_subscription_checkout_upgrade.sql",
  "supabase/migrations/013_branda_loyapro_wallet_loyalty_system.sql",
  "supabase/migrations/027_branda_paypal_subscription_payments.sql",
  "supabase/migrations/016_branda_platform_upgrade_foundation.sql",
  "supabase/migrations/015_branda_cashier_loyalty_stable_fix.sql",
  "supabase/migrations/017_branda_all_in_one_upgrade_closure.sql",
  "supabase/migrations/020_branda_real_final_release_closure.sql",
  "supabase/migrations/023_branda_only_custom_identity_theme.sql",
  "components/dashboard/payments/branda-card-payment-button.tsx",
  "docs/BRANDA_HANDOFF/03_DATABASE_AND_SECURITY_ARCHITECTURE.md",
  "supabase/migrations/024_branda_public_brand_page_rebuild.sql",
  "supabase/migrations/014_branda_full_cashier_pwa_loyalty.sql",
  "supabase/migrations/025_branda_experience_reward_system.sql",
  "docs/BRANDA_HANDOFF/SOURCE_BUNDLES/02_COMPONENTS_SOURCE.md",
  "supabase/migrations/004_branda_critical_security_fixes.sql",
  "supabase/migrations/022_branda_payment_method_cleanup.sql",
  "supabase/migrations/026_branda_branch_mapbox_geofence.sql",
  "docs/BRANDA_HANDOFF/SOURCE_BUNDLES/00_BUNDLE_MANIFEST.md",
  "supabase/migrations/005_branda_admin_dashboard_audit.sql",
  "supabase/migrations/008_branda_platform_growth_suite.sql",
  "supabase/migrations/019_branda_final_product_release.sql",
  "supabase/migrations/003_branda_security_hardening.sql",
  "supabase/migrations/001_branda_production_schema.sql",
  "docs/BRANDA_PRODUCTION_DATABASE_MIGRATION_REPORT.md",
  "supabase/migrations/002_branda_storage_policies.sql",
  "components/payments/branda-card-payment-button.tsx",
  "docs/BRANDA_HANDOFF/05_CHANGE_GUIDE_FOR_CHATGPT.md",
  "docs/BRANDA_PRODUCTION_DATABASE_MIGRATION_AUDIT.md",
  "supabase/manual/BRANDA_STAGING_INITIAL_INSTALL.sql",
  "docs/BRANDA_HANDOFF/02_ROUTES_AND_FEATURES_MAP.md",
  "docs/BRANDA_HANDOFF/04_DATA_FLOW_AND_STATE_MAP.md",
  "docs/BRANDA_PRODUCTION_SECURITY_TEST_CHECKLIST.md",
  "docs/BRANDA_STAGING_SECURITY_VALIDATION_REPORT.md",
  "public/brand/references/branda-home-reference.jpg",
  "docs/BRANDA_HANDOFF/07_DOCS_AND_REPORTS_INDEX.md",
  "docs/BRANDA_HANDOFF/06_SECURITY_FINAL_STATUS.md",
  "docs/BRANDA_HANDOFF/01_COMPLETE_FILE_TREE.md",
  "docs/BRANDA_FINAL_SOURCE_SECURITY_AUDIT.md",
  "docs/BRANDA_STAGING_DEPLOYMENT_GUIDE.md",
  "docs/BRANDA_HANDOFF/00_MASTER_INDEX.md",
  "docs/BRANDA_SECURITY_DEFINER_REVIEW.md",
  "docs/BRANDA_SERVER_SECURITY_REVIEW.md",
  "public/brand/branda-logo-brown-bg.png",
  "docs/BRANDA_DESIGN_UPGRADE_REPORT.md",
  "docs/BRANDA_HANDOFF/SOURCE_BUNDLES",
  "docs/BRANDA_RLS_SECURITY_REVIEW.md",
  "public/brand/branda-logo-brown.png",
  "docs/BRANDA_DATABASE_BLUEPRINT.md",
  "public/brand/branda-logo-dark.png",
  "components/ui/branda-logo.tsx",
  "lib/finance/branda-finance.ts",
  "docs/BRANDA_HANDOFF",
  "lib/branda/env.ts",
  "lib/branda",
)

foreach ($path in $oldPaths) {
  if (Test-Path $path) {
    Remove-Item $path -Recurse -Force
    Write-Host "Removed old Branda path: $path"
  }
}

$envFile = ".env.local"
if (Test-Path $envFile) {
  $content = Get-Content $envFile -Raw
  $content = $content -replace "NEXT_PUBLIC_BRANDA_PUBLIC_DOMAIN", "NEXT_PUBLIC_BARNDAKSA_PUBLIC_DOMAIN"
  $content = $content -replace "branda\.local", "barndaksa.com"
  $content = $content -replace "branda\.com", "barndaksa.com"
  $content = $content -replace "Branda <onboarding@resend\.dev>", "Barndaksa <noreply@barndaksa.com>"
  $content = $content -replace "Barndaksa <onboarding@resend\.dev>", "Barndaksa <noreply@barndaksa.com>"
  $content = $content -replace "cto\.branda@gmail\.com", "cto@barndaksa.com"
  Set-Content -Path $envFile -Value $content -Encoding UTF8
  Write-Host "Updated .env.local variable names/domains. Review secrets manually."
}

Write-Host "Barndaksa cleanup completed."
