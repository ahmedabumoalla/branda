# MIND hospital backend — prepared, not deployed

2026-11-14 isolated worktree `branda-mind-hospital-20261114`, production base `2f12d11ad1b25e4725d0803832ef48621f86718d`

- Public server-only submit resolves active enabled tenant and catalog, validates Saudi phone/floor/clinic/items, uses numeric price options or descriptive range estimates, HMAC IP rate limit, idempotency and no anonymous order reads
- Cashier lifecycle and confirmed prices post through the existing finance engine, stock/VAT/journal triggers; original quoted ranges retained alongside actual invoiced line prices
- Doctor/clinic receivables and FIFO cash/card collection use canonical document balances and original settlement engine; terminal fees and shift receipts preserved
- Private staged context is bound to exact transaction, actor, tenant, request and payload; ordinary sale prices and settlement permissions remain unchanged
- Posting requires an owned open unpaused shift and open financial/GL period; accountant hospital access is read-only
- Orders use authenticated tenant RLS and guarded Realtime publication, with oldest active orders before recent closed orders, bounded to500 rows
- No owner/customer messages, no retained test rows or live schema changes

## Evidence

- RUN 2026-11-14T04:57:37.847Z, Supabase CLI2.122.0, project kpguwjfkkylrdlvzeezz: full migration +52 SQL assertion sites in one transaction ending ROLLBACK passed
- Root evidence `output/erp-database/hospital-integration-rollback.result.json`; combined SQL SHA256 `f9445399167aec29d8f5b8dab3c8b7ba67a026236fac5467732a477f5cacfb6b`
- Migration SHA256 `9ad0ff0a760990889ff1434a74448d74fb2c039a50919dd631a0db0af45f82fa`
- Fixture SHA256 `837719760d8498122b9e948bd1636fe79b27972fe06894e8e6bc1c5461a82813`
- RUN 2026-11-14T04:54:38.543Z Node24.22.1: `node scripts/check-hospital-orders.cjs`,35 strict schema/phone/money checks passed
- Schema source SHA256 `4baa2af0bee3a7dbf30e6e075777ff3a11a9f046c51fd8cbe984b6a34b2f899d`; test SHA256 `d675a5e760edead40277556a262ce6db3ef8041f6b1761c02e4a0fc41bc6d173`; package-lock SHA256 `69e543387f9ae9142976f7c06d7d8d98cb2b49d29bf1674f871f02c741084f07`
- RUN 2026-11-14 about04:55UTC: scoped ESLint on actions/DAL/domain + repository text-integrity passed; TypeScript belongs to root combined final checks, not claimed here
- SQL covers numeric option bounds, actual prices, doctor/clinic debts, cash/card settlement, fee/VAT accrual, stock once, journal balance, idempotency, overpayment, financial/GL period and paused-shift denial, ordinary direct sale/settlement behavior, private-context write denial, tenant RLS/RPC isolation, public rate limit and no customer-message jobs
- Concurrent simultaneous requests were not driven from separate sessions; tenant advisory locks plus row locks serialize postings, sequential retry/overpayment assertions passed
- RUN 2026-11-14T04:59:06.786Z: migration up/down in a rolled-back transaction passed, both original finance function definitions restored byte-for-byte; root evidence `output/erp-database/hospital-up-down-rollback.result.json`

## Activation and rollback

Root owns tax clarification, account/catalog migration, combined rollback, version history and publication. After both migrations and merchant tax configuration, enable only intended tenant with `INSERT INTO public.hospital_store_settings(cafe_id,enabled) VALUES('ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef',true)`

Disable ordering by setting that row enabled=false while preserving all finance/history. Full zero-history rollback prepared in `scripts/rollback-hospital-orders.sql`; it refuses retained orders/events and restores only the exact guarded hooks. Up/down rollback test passed; no persistent application
