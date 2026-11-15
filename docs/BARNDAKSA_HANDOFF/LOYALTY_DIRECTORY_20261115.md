# Loyalty customer directory restored without a design rollback

- User: keep the new compact sidebar and loyalty submenu, restore wallet-card customers for every entitled brand, publish the fix
- Confirmed source of failure: both wallet-customer RPCs used the finance role resolver, which rejects brands without the finance package
- Applied migration `20261115171618_loyalty_directory_package_access` at 2026-11-15T17:18:47Z; exact source MD5 `988f9a53cc1eb94dca70eb0fc713e327`
- Authorization now follows the existing customer profile read policy with active user, active brand and loyalty entitlement checks. No finance package required. No broad role grants, customer edits, replacement records or reset
- Download eligibility, pagination/search, selected-customer phone detail and tenant filtering retained. Current design/sidebar/submenu preserved. Application source is unchanged from production `95c6e2d35a196ee22b3322396af538e3ab25a6c7`, including Claude updates
- RUN database rollback probe then the same checks atomically with migration: actual loyalty-only T12 owner, active platform admin, selected detail, page clamping, escaped search, cross-brand denial, anonymous denial and public/private ACLs passed. Only aggregate/pass-fail evidence retained; no test messages or customer writes
- RUN Node24.19 TypeScript on the latest release tree exit0 at 2026-11-15T17:19Z. Scoped migration/document text integrity and diff review passed17:21Z. Security advisors list the same two existing authenticated security-definer RPCs; their ACLs are unchanged and explicit tenant/role tests passed. No browser or handset test
- Private evidence in root `.codex-tmp/loyalty-directory-{preview,apply,context,auth}.json`; publication status in `.codex-tmp/loyalty-production.json`. Publish only this migration and task documentation from the release worktree

## Location reminder follow-up

Native location reminders are configured in `lib/wallet/apple.ts` and `lib/wallet/payload.ts`. Apple/Google control the display and do not expose a proximity-display callback or per-card daily frequency limit. No fake daily cooldown was added and no wallet settings or notifications changed

Apple supports reducing the maximum relevance distance with `maxDistance`; it uses the smaller of that limit and its default. Google chooses the radius and dwell time. A once-per-day issuer message can be deduplicated by the platform, but it is not a once-per-day native proximity reminder. Exact proximity throttling requires an independently consented location event source

- https://developer.apple.com/documentation/WalletPasses/Pass
- https://developer.apple.com/documentation/walletpasses/showing-a-pass-on-the-lock-screen
- https://developers.google.com/wallet/retail/loyalty-cards/use-cases/trigger-push-notifications#nearby_notifications
- https://developers.google.com/wallet/retail/loyalty-cards/use-cases/use-callbacks-for-saves-and-deletions

User asked about reducing radius or a one-time platform message; implementation choice remains open
