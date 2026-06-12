# Barndaksa domain deployment checklist

## 1) Environment variables
Set these in Vercel Project Settings → Environment Variables:

```env
NEXT_PUBLIC_APP_URL=https://barndaksa.com
NEXT_PUBLIC_BARNDAKSA_PUBLIC_DOMAIN=barndaksa.com
RESEND_FROM_EMAIL=Barndaksa <noreply@barndaksa.com>
RESEND_REPLY_TO=cto@barndaksa.com
PAYPAL_ENV=live
```

Keep the existing Supabase and PayPal secrets, but make sure they are Live credentials when `PAYPAL_ENV=live`.

## 2) Supabase
In Supabase Auth settings:

- Site URL: `https://barndaksa.com`
- Additional Redirect URLs:
  - `https://barndaksa.com/**`
  - `https://*.barndaksa.com/**`
  - `http://localhost:3000/**`

Run the migration:

```sql
040_barndaksa_domain_branding_rebrand.sql
```

This migration renames the previous finance owners table if it exists, updates platform support email, and refreshes the finance distribution function to use `barndaksa_owners`.

## 3) Vercel domain
Add these domains to the Vercel project:

- `barndaksa.com`
- `www.barndaksa.com`
- optional wildcard: `*.barndaksa.com`

Use the DNS records Vercel gives you. If you want every cafe to work as `{slug}.barndaksa.com`, wildcard domain configuration is required.

## 4) Resend
Add and verify `barndaksa.com` inside Resend Domains. Add the DNS records Resend gives you, usually SPF/DKIM and tracking/return-path records depending on the setup.

After verification, change:

```env
RESEND_FROM_EMAIL=Barndaksa <noreply@barndaksa.com>
RESEND_REPLY_TO=cto@barndaksa.com
```

Do not keep `onboarding@resend.dev` in production.

## 5) PayPal
In PayPal Developer Dashboard, confirm the Live app uses the same Live Client ID and Secret in Vercel.

Set webhook URL:

```text
https://barndaksa.com/api/paypal/webhook
```

Make sure webhook events include payment/order completed events used by the platform.

If you use a return/cancel URL inside PayPal app settings, use:

```text
https://barndaksa.com/dashboard/subscription?payment=success
https://barndaksa.com/dashboard/subscription?payment=cancelled
```

## 6) Local cleanup
After extracting the ZIP, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\apply-barndaksa-cleanup.ps1
```

Then run:

```powershell
npm install
npm run build
```
