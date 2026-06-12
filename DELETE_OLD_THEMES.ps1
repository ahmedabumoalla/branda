cd E:\barndaksa-platform

$delete = @(
  "components\cafe\themes\marketplace-amazon-theme.tsx",
  "components\cafe\themes\premium-apple-theme.tsx",
  "components\cafe\themes\noon-commerce-theme.tsx",
  "components\cafe\themes\luxury-boutique-theme.tsx",
  "components\cafe\themes\mobile-first-cafe-theme.tsx",
  "components\cafe\themes\cyber-eco-dark-theme.tsx",
  "components\cafe\themes\soft-cream-3d-theme.tsx",
  "components\cafe\themes\magazine-editorial-theme.tsx",
  "components\cafe\themes\fast-order-kiosk-theme.tsx",
  "components\cafe\themes\reservation-lounge-theme.tsx"
)

foreach ($file in $delete) {
  Remove-Item $file -Force -ErrorAction SilentlyContinue
}
