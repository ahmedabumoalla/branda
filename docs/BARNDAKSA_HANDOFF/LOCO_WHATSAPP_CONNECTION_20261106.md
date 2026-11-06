# LOCO customer WhatsApp connection

- Published application: GitHub main `41273a0801babb5c0b965f7ec13dedfe2ff45bda`
- Production verified 2026-11-06 08:18 UTC: Vercel `dpl_FLHfwE5mE1bqV5FAoGNmLqfSo11C`, READY on both production aliases
- LOCO-only owner navigation and `/dashboard/brand-phone`; backend also checks the immutable cafe ID, active profile and owner or signed maintenance administrator scope
- The page supports number entry, QR pairing, status refresh and explicit disconnect only; it cannot create campaigns or send a test message
- Explicit connection opts LOCO into customer OTP and wallet-download welcomes: verified brand number, then healthy Branda primary, then healthy backup
- Account phone is checked before choosing the brand sender; only one message POST is attempted, with uncertain results never automatically retried
- Other brands, finance cashier/owner/staff OTP, campaign entitlement and existing deduplication remain unchanged
- OTP queue stores the atomically consumed admission's cafe/purpose; historical jobs and ambiguous concurrent admissions use the existing platform sender
- Wallet jobs are filtered for a healthy sender before claim, preserving pending jobs for other brands while their primary is offline
- Old campaign connections are not automatically opted in; disconnect/generation changes clear opt-in

## Database and verification

- Applied migrations `20261106075708` (MD5 `297a669aab89f8a3aed97d8219fe3947`) and `20261106075709` (MD5 `a445fb1c7c6e58eaa36589f1f34c1ecc`)
- Live rollback covered the real owner's claim and opt-in reset, then restored every change; final application preserved all existing connection, request, delivery and welcome rows
- Five new RPCs are service-only, private admission helper is not exposed, RLS preserved; advisors reported no new scoped findings
- Node 24.19.0 release: text integrity, TypeScript, backend13, connection SQL66, UI20, routing29, OTP15, queue SQL101, wallet welcomes, existing fallback69, campaign backend25/SQL and finance OTP SQL, lint and webpack build PASS
- Local and production HTTP checks: anonymous reads/actions denied, foreign origin denied, campaign action unavailable, dashboard requires login, LOCO menu remains available
- Evidence: `output/loco-whatsapp`, `output/loco-brand-phone`; release input/dependency hashes recorded
- No browser, real pairing, provisioning, test message or customer message was performed

## Owner's next step

Open the LOCO connection page, enter its WhatsApp number, then scan the QR from WhatsApp > Linked devices > Link a device
At initial verification LOCO had no connection and no opt-in; the user subsequently initiated pairing as documented below

## Integration note

The release retains the existing finance sidebar slug prop; an unrelated local finance rewrite was excluded from publication

## QR waiting follow-up

- Published 2026-11-06T09:03:55.845Z: main 1c07aeb1ded301370ea48717001181b18d3f0b54, Vercel dpl_EEKwjWgqo2Mxqw4J3u814NvejMoU READY on both production aliases
- The user initiated pairing after the initial deployment; live provider and exact shared DAL return a valid PNG QR accepted by the client parser in about4seconds
- A waiting UI disabled its manual retry for the entire intent window and claimed scan readiness before any QR existed; the retry remains available after each foreground request, cancels old polling, and the label reflects actual image availability
- Expired or superseded QR responses cannot revive an old attempt; explicit intent, authorization checks and bounded polling remain
- Node24 release text/types/UI23/backend13/lint/build and live HTTP8 passed; independent async/auth review passed
- Actual user-tab response was not inspected because the required browser runtime was unavailable; initial delay was not reproduced in live server checks
- No provisioning, scan, disconnect or customer message performed; normal tenant/generation-scoped refresh changed only updated_at
- User confirmed QR appeared after publication; scanning remains owner action
- Evidence: output/loco-qr; output/loco-whatsapp/qr-live-diagnostic.json, qr-live-metadata.json and qr-live-dal.json
