# Barndaksa Admin Content Persistence Patch

This patch changes only the requested admin content/homepage files:

- `components/admin/pages/admin-content-page.tsx`
- `components/marketing/platform-home-page.tsx`
- `lib/data/platform-content.ts`
- `lib/storage/platform-content-upload.ts`
- `app/actions/platform-content.ts`
- `supabase/migrations/041_barndaksa_admin_content_persistence_typography.sql`

What it does:

- Fixes admin homepage text saving by writing through server-side service role after platform-admin verification.
- Fixes social/contact settings saving by writing through server-side service role after platform-admin verification.
- Fixes platform media upload record insertion by writing through server-side service role after platform-admin verification.
- Removes the social content scheduling card from the admin content page UI.
- Adds Arabic font selection and per-section text size controls.
- Adds a dedicated homepage loyalty card image upload field.
- Keeps existing public homepage structure and only applies admin-controlled font/size values.

Required DB step:

Run `supabase/migrations/041_barndaksa_admin_content_persistence_typography.sql` in Supabase SQL Editor before testing saves.
