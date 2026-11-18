# Admin brand directory logos

The directory previously used only cafe_settings.logo_url and showed a building icon for Storage-backed logos. Platform-admin-authorized loading now batch-signs cafe-logos paths with the authenticated client, preferring the saved settings logo and falling back to custom identity. Existing external logo URLs remain supported. Signing is bounded to 100 paths per call and individual missing objects do not break the directory. Brand paths must belong to the matching cafe. No plan or logo settings were changed.

Desktop rows, mobile cards and the brand-details dialog show the brand logo with contain sizing and its original colors. Missing or failed images use the existing Branda brown logo on white. A newly replaced logo is retried instead of retaining the failed-image state.

Verified 2026-11-18T10:38Z: live read-only source audit found 49 brands, 35 Storage-backed logos and 10 with no logo. All 35 paths signed; LA GIOIA asset and Branda fallback returned HTTP200. Live identity and Storage policies explicitly allow platform administrators. Service-client asset verification does not substitute for an interactive administrator UI test; none was performed. Source tests cover batch bounds, identity/external fallback, signing failure isolation and invalid cross-brand paths. Directory SSR/state tests cover missing, failed and replaced logos. No migration, customer messages or brand mutations.

Evidence: output/admin-brand-logos-20261118/live-assets.json, output/fawasel-branches-20261118/admin-logo-audit.json. Mandatory TypeScript/text checks and deployment identity are recorded in task state.

Published 442e6d18c9bd80472a17067117631cb064ed08ca; Vercel dpl_F7DbMfTpxFd4HT289R4KVdnPKYeL READY, both production aliases verified 2026-11-18T10:45:02.432Z. Full TypeScript, text integrity, 18 directory groups and logo batch/source/failure checks passed; checks.json records command times and input hashes. No browser UI inspection, no brand data mutations
