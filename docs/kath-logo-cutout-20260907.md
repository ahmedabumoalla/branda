# Kath logo cutout

User approved deterministic processing of the original logo after deferring the earlier generated variants

- Removed only the brown background with a soft alpha threshold using sharp
- Preserved source dimensions and foreground RGB values
- Original account upload unchanged
- Menu-only substitution is limited to Kath's cafe ID and the reviewed source identifier hash
- A future replacement upload falls back to its own original image
- Other brands remain unchanged
- Verified header and footer on mobile locally
- Text integrity, TypeScript, scoped ESLint, standalone-menu and feedback checks passed
- Vercel production build passed
- Deployment dpl_HVvnxS3rrC3w8Z1UQnR4NRdWDG2b promoted to barndaksa.com
- Anonymous production menu returned 200 and referenced the new asset
- Downloaded production WebP verified to contain actual transparency

Reproducible extraction script: scripts/extract-kath-logo.cjs

Existing Node 20 deprecation warnings remain outside this asset-only change
