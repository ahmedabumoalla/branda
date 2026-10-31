# Homepage catalog, contact inbox and quarterly subscriptions

Implementation ready; production database migrations applied and independently verified on 2026-10-31. Application publication pending exact commit verification

- Actual subscriptions allow one or three months; the configured legacy annual discount now applies to three months. Finance retains its established fixed 20% quarterly discount. Monthly prices, trial days, historical subscriptions/payment requests and expiry dates are preserved
- Products are unlimited in every plan. Admin retains optional trial-day configuration. Legacy `annual_*` field names remain for API/history compatibility
- Homepage reads the seven active purchasable Branda plans from the existing public DTO, preserving catalog order and prices. Compact desktop row, responsive mobile cards and comparison by included services. Reference 99/299 offers are no longer displayed
- Contact form saves directly to the existing private inbox. New `/admin/contact-requests` navigation includes pagination, status updates, contact actions and previous email requests. Server validation, honeypot, phone throttling and idempotent retries; only platform admins can read/manage
- Homepage telephone/WhatsApp now use 0508333556. No messaging-provider credentials were changed
- Deli Cake replaces the reference loyalty logo/name/reward; customer count is 650. Saudi riyal uses SVG. Authenticated header shows the account image from auth metadata, or an initial when no image is available, linking to the authorized account destination

## Verification

Windows, Node 20.20.2 for TypeScript/UI tests and Node 24 for production build/PGlite

- `node scripts/check-home-contact.cjs`, `node scripts/check-home-page-ui.mjs`: actual SSR and form handlers, save/failure/retry/duplicate prevention, validation, admin authorization, account routing/avatar safety
- `node scripts/check-public-home-catalog.mjs`: 18 catalog groups; configured prices and quarterly totals
- Admin plans, subscription UI, finance pricing/UI, marketing coupons and default trial scripts passed
- `node scripts/check-concurrent-subscriptions-db.mjs`: 105 isolated SQL checks including new quarterly policy, historical preservation, quote/payment/manual collection consistency and authorization
- `node scripts/check-contact-inbox-db.mjs`: contact storage, idempotency, throttle, validation, role grants/RLS and historical requests
- Both migration sets passed live rollback checks before application. Exact three migration source MD5s verified; all 14 plans normalized and RLS retained. No permanent test requests or outgoing test messages
- Scoped ESLint has no errors; legacy unused compatibility parameters in subscription helpers yield two warnings. Root and release TypeScript/text integrity passed. Final Node24 production build passed
- Scoped local browser 1440/768/390/320 passed for pricing, currency, plan selection, invalid phone, Deli logo and count. Initial comparison accessibility text escaped its scrolling container on mobile; `position:relative` fixed the measured viewport expansion and the check passed again
- Supabase security advisors: 159 existing findings before and after, zero introduced findings. Existing unrelated findings were not modified

Evidence: `output/home-catalog/browser-results.json`, screenshots in `output/home-catalog`, `output/quarterly-contact-verification.json`, migration version/source matches

Operations: Supabase CLI authentication was renewed. Run CLI from outside these workspaces (for example the user home) with explicit linked project and absolute SQL paths; project `.env.local` still contains an obsolete management token that overrides stored CLI authentication. Never print tokens

No browser authenticated account session or physical mobile device was used; avatar/account authorization was covered through SSR/service tests. Public responsive check used isolated Chromium emulation
