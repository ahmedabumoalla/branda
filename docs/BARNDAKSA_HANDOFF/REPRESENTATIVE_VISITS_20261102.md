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

Published 2026-11-02T13:07:28.411Z: GitHub main 1e28178c0ee513643996ce1193a591c75c94d004, Vercel dpl_5Dd4yHpjHNgMFJW4ztZoaybiNFAP READY, both production aliases verified; public form200 and invalid/cross-origin submission400/403 PASS

## Admin layout refinement — 2026-11-02 16:54 +03:00
- Full-width visit table with brand, representative, interest, requested services, Riyadh date/time, location and detail action
- Registration form opens in a compact native dialog with internal scrolling; closing preserves unfinished fields, saving blocks dismissal, focus and scroll restore on close
- Visit photos and contact numbers open in a separate detail dialog; public open/copy form controls remain visible
- Dedicated scoped CSS preserves the public form; cream dialog overrides the admin shell dark input rules for legible fields
- Run on updated root and release source: TypeScript, text integrity, scoped ESLint, visit regression suite including new table SSR and dialog save/focus/scroll checks
- Release Node24 Next production build passed; evidence representative-visits-layout-build.log
- No browser inspection or physical-device interaction check performed; source/SSR/handler tests used under repository browser policy
- No database, public form or intake API changes
