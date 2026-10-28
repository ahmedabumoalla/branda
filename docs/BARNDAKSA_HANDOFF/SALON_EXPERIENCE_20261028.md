# Salon experience implementation

Status: implementation complete, final publication verification pending
Release: C:/Projects/branda-public-finance-20261026, feat/salon-booking-experience-20261028
Base production: 49794acedd4c67e9cd97c3d0f5035c12d63682f2

Established rules:
- hair_salons only; cafe/restaurant interfaces and pager semantics preserved
- Salon-wide booking, owner organizes times; no individual barber selection
- Services/products with salon examples, suggested hair/beard/skin/packages/retail sections, no coffee fallback selector
- Public /salon/[slug] uses the existing loyalty brand palette/font; /menu salon aliases redirect before cafe loading
- Owner can confirm, reject or propose a different time; customer must accept or decline via private portal
- Owner /dashboard/bookings: requests, confirmed schedule, proposals, rejected archive and all history
- Owner /dashboard/pager: active service, completed history and reviews, using DashboardPageShell
- IMPORTANT user correction: cashier /pager has confirmed/in-service names, ONE call and service completion ONLY; no review/history/date tabs; server rejects staff history reads and removes phone/review data
- Latest design correction: compact cashier header with accessible icon controls, dense appointment rows and small empty state; two columns on desktop, existing loyalty theme
- Separate direct salon announcements and current offer mechanics; coffee experience preview hidden for salons
- Loyalty earning/redeeming/download rules unchanged; scissors/comb glyphs shared with native wallets; completion links to existing loyalty entry, no invented auto-stamp

Implemented: private booking/event/outbox/announcement tables and service-only RPCs, optimistic lifecycle transitions, rate limits, hashed expiring capability portals, atomic single call/completion job, lease/dispatch deduplication, no uncertain replay; owner in-app deep links and WhatsApp replies via existing provider and existing pager cron

Live database applied and checked using newly authenticated Supabase CLI from RELEASE worktree (root CLI picks an expired token):
- 20261028091214 MD5 e03e42595ee90324cf9b928a23b0b889
- 20261028095440 MD5 20f094af6fd25f41aa7ba5b0bf16a75b
- Follow-up preserves production catalog read-only service grants; private definer notifier verifies a persisted booking before inserting the notification, no public execute grants
- Actual service-role lifecycle, token, owner authorization, single dispatch, reviews, proposal acceptance/rejection and grants passed inside rolled-back transaction; zero persisted fixtures and no outgoing test messages

Checks: SQL59, salon service/worker/UI35, cafe pager worker71/UI35, menu editor including salon examples/presets, standalone menu, approved loyalty design/wallet, universal loyalty server19 PASS. Root/release TypeScript and text integrity PASS. Changed source lint zero errors with five inherited warnings; existing CJS tests retain inherited require-style lint errors, runtime tests pass. Final Node24 Turbopack build PASS after compact cashier correction
Evidence: root output/salon-experience-verification.json, output/salon-live-probe.sql and output/probe-salon-experience.cjs. Final local authenticated HTTP probe passed at 2026-10-28T10:23:18.105Z for own-brand routes/read, anonymous/admin denial, public category/token not-found rendering and legacy redirect; production probe pending. Next streaming not-found responses can be HTTP200 but contain the 404 boundary and no protected page

Root: only owned source mirrored; root-only finance sidebar prop difference preserved. No application commit or production app deployment yet. Next: scoped commit/push, verify branda-2 exact commit/aliases, production authenticated/public probes, update evidence/record
