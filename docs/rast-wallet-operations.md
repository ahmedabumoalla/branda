# Rast Wallet operations

Scope: Rast loyalty only. Production credentials are configured; the scheduler activates with deployment. Passing local signing tests is not evidence of Apple/Google approval, live issuance, or delivery to a real device.

## Required server environment

Common:

- `WALLET_PUBLIC_BASE_URL`: canonical public HTTPS origin.
- `WALLET_AUTH_SECRET`: independently generated secret, at least 32 characters. Preserve it across releases; rotating it invalidates installed Apple passes and protected Google artwork URLs.
- `CRON_SECRET`: independently generated secret, at least 32 characters, for the job endpoint. Never expose these values using `NEXT_PUBLIC_`.

Apple:

- `APPLE_WALLET_PASS_TYPE_ID`: registered `pass.*` identifier.
- `APPLE_WALLET_TEAM_ID`: its Apple Developer team.
- `APPLE_WALLET_SIGNER_CERT_PEM` and `APPLE_WALLET_SIGNER_KEY_PEM`: matching valid Pass Type ID certificate/private key.
- `APPLE_WALLET_SIGNER_KEY_PASSPHRASE`: optional encrypted-key passphrase.
- `APPLE_WALLET_WWDR_CERT_PEM`: matching Apple Worldwide Developer Relations intermediate certificate. The runtime checks signature chain, validity, key matching, and configured pass/team identity before reporting ready.

Google:

- `GOOGLE_WALLET_ISSUER_ID`: Google Wallet issuer account identifier.
- `GOOGLE_WALLET_RAST_CLASS_ID`: optional existing Rast class ID, including its issuer prefix; this preserves a class prepared in the Wallet console. The runtime requires the configured issuer prefix and limits this override to Rast. Individual object IDs remain stable.
- `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_WALLET_PRIVATE_KEY_PEM`: RSA service account credentials with Developer access to that issuer. Enable Google Wallet API in the account's Cloud project.
- `GOOGLE_WALLET_PUBLISHING_APPROVED=true`: set only after Google grants publishing access. A paid Google Play developer account and a valid service key do not establish this approval.

Escaped PEM newlines are supported. Keep certificates and private keys in the deployment secret store; never commit their values.

## Deployment and synchronization

1. Apply the version-controlled loyalty migration and its authorization checks before enabling the entry points.
2. Configure the provider credentials and canonical origin. Enable the corresponding program flags only when provider setup is ready.
3. Configure `CRON_SECRET` in production before deploying. The checked-in `vercel.json` schedules recovery every five minutes, after the production team's Pro plan was checked through the Vercel API on 2026-10-03. The correct project is `branda-2`; the local `.vercel` link points to the older `branda` project and must not determine the production credential destination. Vercel supplies `Authorization: Bearer <CRON_SECRET>` automatically. A deployment activates this schedule; no live scheduler is implied by local configuration. Normal scan/message requests attempt immediate delivery. The worker claims ten jobs per run, preserves unfinished work, and applies provider backoff. If moving to Hobby, replace the schedule with a daily expression or use an authenticated external scheduler; Hobby rejects subdaily cron schedules.
4. Customer issuance requires the verified Rast membership session. Knowing the card code alone does not grant download access.
5. Apple registers installed passes through `/api/wallet/apple/v1/devices/...`; pass updates require the per-pass `ApplePass` credential. Apply the separate `20261003003340_rast_wallet_device_limit.sql` migration before exposing registration: it serializes registration per card and caps each card at twenty devices. Existing device re-registration remains idempotent; excess new registrations receive HTTP 429. Update-list requests follow Apple's device-identifier protocol and expose only the passes previously registered by that device.
6. Check `wallet_notification_jobs` for pending/failed jobs. Credentials missing at delivery time are not reported as accepted. Provider acceptance is not proof of a visible notification or delivery to a specific device.

The local check `node scripts/check-rast-wallet-security.mjs` uses temporary in-memory test certificates and stubbed provider HTTP requests. It checks signed PKCS7 bundles/manifests, RS256 save links, balances, denied anonymous issuance, no customer personal payload, Apple authorization, and right-positioned Rast artwork. Real issuer approval, APNs connectivity, installation, refresh, and notification permissions must be validated with real devices and provider accounts.

On 2026-10-03, the actual issued Apple Pass Type ID certificate was matched to its private key and verified through Apple's official WWDR G4 and root certificates using native X509 and OpenSSL. A synthetic pass containing no customer data was signed with that certificate; all manifest digests and the detached CMS signature passed verification. Private artifacts remain outside the repository. Google service credentials were validated locally and publishing approval remains false. These checks do not establish device delivery or production configuration.

## Dependency audit

The targeted security update pins Next.js and its ESLint configuration to 16.3.8 and updates the vulnerable transitive baseline-browser-mapping package to 2.11.27. The production audit on 2026-10-03 reports zero critical, two high, and zero moderate findings. Both remaining entries are the same node-forge RSA signature-verification advisory through passkit-generator; no patched version is currently available. The selected passkit code only parses configured certificates and signs passes, while certificate/key/chain verification uses Node's native X509 APIs. The affected forge verification function is not called on this path. This is a reachability assessment, not a clean audit or a suppressed advisory.

## Provider limits

- The Apple pass uses the store-card template. Rast's original logo is on the right of the strip artwork; Wallet controls native header/logo placement. Fields include the stamp balance and available rewards. Updates use a pass certificate and an empty APNs payload; notification copy comes from changed pass fields.
- Google receives a protected, versioned image URL for actual stamp artwork and separate live balance fields. Customer phone/email/name are not included in the provider payload. The image endpoint requires a dedicated HMAC and returns only image bytes.
- The Rast dashboard accepts a Google Maps place/pin URL, including supported short share links, and resolves coordinates after owner authorization. Existing saved coordinates display as a canonical Maps link. Clearing the link clears proximity coordinates; invalid or unresolved links leave all saved settings unchanged. Only HTTPS Google Maps hosts and validated redirects are allowed, with bounded response size and an eight-second total timeout. Viewport centers and directions are not inferred as the branch location.
- Branch coordinates produce proximity relevance; a website does not track customers in the background. Google controls nearby notification wording, distance, and dwell time. It requires notifications plus precise, always-on Wallet location access. Apple similarly controls when relevance appears.
- Google limits message/update notifications to three per pass per 24 hours. When an update-notification request is throttled, the adapter retries the balance update without a notification. Merchant-message delivery is provider-controlled and may be delayed or rejected.
- Merchant announcements are persisted with a per-cafe transaction lock, deduplicated for ten minutes, and limited to three new announcements per day. Provider successes are retained across retries; Google message retries inspect existing message IDs because the provider permits duplicate IDs. Worker leases recover after interruption, so delivery remains at least once, not guaranteed exactly once. Monitor failed jobs and provider quotas.

Official references:

- [Apple pass updates and device protocol](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Updating.html)
- [Apple pass layout and signing](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Creating.html)
- [Apple WWDR certificates](https://developer.apple.com/support/expiration/)
- [Apple certificate authority downloads](https://www.apple.com/certificateauthority/)
- [Google issuer onboarding](https://developers.google.com/wallet/retail/loyalty-cards/getting-started/issuer-onboarding)
- [Google service credentials](https://developers.google.com/wallet/retail/loyalty-cards/getting-started/auth/rest)
- [Google notification and nearby rules](https://developers.google.com/wallet/retail/loyalty-cards/use-cases/trigger-push-notifications)
- [Google Maps place and pin URLs](https://developers.google.com/maps/documentation/urls/get-started)
- [Vercel cron frequency limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Vercel cron authentication and duplicate delivery](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [Next.js 16.3.8 security release](https://github.com/vercel/next.js/releases/tag/v16.3.8)
- [Remaining node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv)

## Account linking status - 2026-10-03

The production Supabase migrations and read-only permission postflight passed. Thirteen server-only wallet settings were saved as sensitive production variables on the verified branda-2 Vercel project. The user chose to leave the Rast program disabled until setting reward terms in the dashboard.

The applied follow-up migration `20261003005624_rast_cashier_only_stamps.sql` closes the legacy owner-stamp RPC, including direct authenticated calls. Rast stamps and reward redemption require the authenticated cashier workflow. Legacy cashier entry points and previews also enforce the current loyalty entitlement; lookup failures deny access. The updated database regression passes 83 cases, including owner RPC denial and successful cashier operations.

Apple signing is configured with the real Rast pass certificate, valid until 2027-11-02. On 2026-10-04 (Saudi time), Google Wallet API was enabled on branda-rast-wallet using the requested Google account, without adding billing or entering a CNTXT contract. The real service account independently returned OAuth200 and loyaltyClass GET200; the earlier accessNotConfigured/billing blocker is superseded. The existing Rast class was submitted with its verified branding and returned approved; the refreshed issuer console showed that class active. At that time issuer3388000000023197791 remained in demo mode awaiting publishing approval, so GOOGLE_WALLET_PUBLISHING_APPROVED was kept false. Class approval is separate from issuer publishing access.

On 2026-10-08, the same issuer console showed the Rast class active with no demo or pending-publishing banner and the dashboard offered pass analytics. The production GOOGLE_WALLET_PUBLISHING_APPROVED setting was updated to true and the existing commit388867f redeployed as dpl_2oX26HZyvXLLX6mukkK8FnfJjFAF, READY on barndaksa.com at11:27:57+03:00. An authenticated dashboard check confirmed that the Google option is now selectable and the provider is ready. The owner must still select the Google checkbox and save to enable it for customers. No customer Google pass or phone installation was tested.

Follow-up at11:42+03:00: the owner enabled Google, but issuance failed because class PATCH omitted the required reviewStatus after approval. Published467de8b preserves UNDER_REVIEW on class writes as required by Google, including already approved classes. Real-provider issuance for the affected card then succeeded (class PATCH200, object POST200, valid signed save URL). No database download event was manufactured by this diagnostic and no stamp/reward balance changed. Actual saving/display in the customer's phone remains unverified. Regression, isolated production build and live anonymous authorization checks passed; see docs/task-state.md.
