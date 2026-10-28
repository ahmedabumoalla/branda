# Salon public design and booking dialog

Date: 2026-10-28

## Release scope

- Premium salon-only public page using the existing brand colors and Arabic loyalty font, editorial grooming imagery blended into the hero background, real services/categories/prices, retail products, offers and announcements
- All booking buttons open one native modal; selecting a service carries it into the form
- Compact responsive fields, visibly separated Arabic heading, keyboard focus trap, Escape/close, scroll restoration, retained inputs and clear network failure state
- Existing booking/owner/cashier workflows and coffee pages remain unchanged
- Loyalty section is shown only for an enabled saved loyalty program; this release does not promise automatic card enrollment on booking

## Verification

- Browser explicitly authorized by user: 1440, 390 and 320 pixel widths, loaded hero/font, no horizontal overflow or JavaScript errors
- Real modal open/close, keyboard focus, Escape, body scrolling and simulated failed submission checked; no real booking or WhatsApp test sent
- Local browser evidence: output/salon-design-browser.json and output/salon-design-booking-mobile.png
- Release checks and exact source hashes: output/salon-public-verification.json
- Exact GitHub/Vercel production verification: output/salon-public-publication.json

## Pending separate loyalty activation

Automatic enrollment and one WhatsApp card link after booking is implemented but NOT included in this design release, because current Supabase CLI account cannot access project kpguwjfkkylrdlvzeezz (403). User login challenge is pending; no login secrets belong in this handoff

Work is preserved in C:/Projects/branda-public-finance-20261026 on feat/salon-public-design-20261028:

- supabase/migrations/20261028112316_salon_booking_loyalty_welcome.sql
- lib/salon/loyalty-link.ts and app/salon/card/[token]/route.ts
- lib/data/salon.ts and lib/salon/worker.ts changes
- scripts/check-salon-bookings-db.mjs and scripts/check-salon-experience.mjs extensions
- Booking form welcome/consent wording in that worktree belongs only with the backend activation

Pending implementation has PGlite SQL80, salon47, direct enrollment34, cafe pager71 and approved loyalty renderer checks passing; types/text/scoped lint and Node24 build passed locally. These are not live migration or WhatsApp delivery evidence

Next: authenticate the correct Supabase account, initialize the development salon's missing program using current salon defaults only (preserve any existing row), execute output/salon-loyalty-live-preflight.sql in rollback after adding the fixture program setup, apply exact migration with history, verify live role grants/idempotency and source hash, merge with the design release, then publish and verify exact production commit

The new migration keeps old workers from claiming the new welcome kind. A separate short-lived capability delivered only in WhatsApp opens the existing brand-scoped loyalty session; booking portal tokens do not grant card access. Existing enrollment/name checks and stamp/reward rules are preserved

No program was enabled, migration applied, or test message sent during this pending work
