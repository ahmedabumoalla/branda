# Representative visit intake

- Public form: https://barndaksa.com/visits without login
- Admin: /admin/representatives now shows visit intake and private visit history with prominent open/copy public form controls
- Required: brand name/photo, interest, selected services when interested, GPS or Google Maps URL, representative name
- Optional: menu photo, manager/owner phones, other service text required only when selected
- Native rear-camera capture and gallery upload with client compression and server WebP validation; server records visit timestamp displayed in Riyadh timezone
- Existing representative accounts/coupons and the separate legacy representative portal were preserved
- Private Storage and admin-only history; public writes use bounded server validation, persistent rate windows and idempotent claim/finalize RPCs
- Migration 20261102123500 applied after live transaction rollback test; exact stored source MD5 878055b7d6c7b20273cd43dc902b5f10; private bucket verified
- Verification 2026-11-02T13:01:31Z: anonymous local form200, real image submission201, duplicate retry200/one record, anonymous record/photo denial and signed photo200; scoped fixture removed
- Commands run: node scripts/check-representative-visits.cjs; node scripts/check-representative-visits-db.mjs; npx tsc --noEmit; npm run check:text; scoped ESLint; Node24 next build in release worktree
- Final Node24 production build PASS after local host/origin normalization fix; SSR and source responsive/state checks passed
- No browser inspection or physical iPhone/Android camera test; camera UI is provided by the device browser/OS
- Evidence: root output/representative-visits/live-verification.json and release representative-visits-build.log; publication proof saved separately after deployment
