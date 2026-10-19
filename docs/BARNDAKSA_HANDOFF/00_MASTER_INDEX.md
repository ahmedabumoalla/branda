# Branda — current handoff

Updated 2026-10-19 13:54 +03:00 - Asia/Riyadh

Read [current task state](../task-state.md), then repository `AGENTS.md` and actual `git status`. Use historical records only for a relevant unresolved detail

## Published state

- Latest application: admin logo opens the public homepage and the homepage account icon returns the active user to `/admin` or `/dashboard`. Icon stays visible on mobile; guests retain sign-in links. Server checks the real session and active profile; no auth credentials or access-policy changes
- Release identity: `git log -1 --format=%H -- lib/data/home-account.ts` on `main` / Vercel `branda-2`. Exact production evidence: `.git/home-account-production.json`; missing evidence means publication is not verified. Six task files plus documentation only; unrelated drafts preserved
- 16 grouped homepage/account/sidebar tests, text integrity, TypeScript, scoped ESLint and isolated production build passed on 2026-10-19. One existing CMS-image lint warning remains. Detailed provenance and source-only responsive/accessibility review are in current task state
- Previous wallet-history release `0a875fbf0a9b9733fca7d24ce93872a88d63b064` was verified on production at 2026-10-19 13:40 +03:00; `.git/message-history-production.json`
- History appears below the owner's announcement form and in a per-brand dialog from admin operations. It shows full saved title/body, Saudi timestamps, provider/queue statuses, actual message count and pagination, with refresh after send attempts
- All saved messages are shown regardless of report period. Promotional report metrics still count customers and sends; history counts messages. No per-message recipient estimate or delivery/read claim. DeliCake had four saved messages at the read-only check on 2026-10-19
- Active owner/manager or platform-admin authorization, tenant filters, private/no-store responses and display-field allowlisting protect history. No database change or real message sending
- 36 targeted checks, report regression, text integrity, TypeScript, scoped lint and isolated production build passed. Detailed provenance and verification limits are in the current task state
- Prior catalog/product media/operations changes remain complete with no pending migration. Previous release `7854ed177552d1f12d0b5083cdb4b825b76264d3` is historical, not the latest application

## Product decisions to preserve

- Primary product image/video is selectable; description optional. Availability hides the product from the menu. Product actions update immediately and retain the user's position; failed saves keep the draft
- Owner dashboard media uses authenticated tenant-scoped fresh URLs at load time. Keep private credentials and Storage policies protected
- Operations and PDF now show menu/loyalty metrics, pager uses and loyalty promotional recipients/sends. Electronic-branch visitors/accounts/last visit are removed
- Pager use means a recorded order, including cancelled orders, not each repeated call. Promotion counts start2026-10-17 00:11:35+03, deduplicate customers across wallets and indicate provider acceptance rather than confirmed delivery/reading. Historical recipient counts cannot be reconstructed
- Deli catalog and approved brand-specific designs are complete. Never replay catalog writes or overwrite later owner edits. Shared services use each brand's data and package permissions
- Legacy electronic storefronts remain archived. Direct loyalty name/phone enrollment is intentional; staff login uses its separate existing OTP flow. No invented data, subscriptions, payments, bank details or customer messages
- Subscription prices/durations/annual discounts/coupon scope and Saudi end-date handling retain the existing server rules. Historical manual subscription grants in the archive must never be replayed or assumed current

## Workspace and deployment

```text
Workspace: C:/Projects/branda-platform
GitHub: https://github.com/ahmedabumoalla/branda
Production branch: main
Site: https://barndaksa.com
Vercel project: branda-2
Vercel project ID: prj_kHe6mtiyO05loZn6PgMOSpjlv4Ow
Supabase project: kpguwjfkkylrdlvzeezz
Node: 24.21.0; Next: 16.3.8
Node executable: C:/Users/pc/AppData/Local/npm-cache/_npx/538786c08bcb9442/node_modules/node/bin/node.exe
Latest isolated application build: C:/Projects/branda-home-account-release-20261019
```

- Local `.vercel/project.json` points at the old project. Deploy through the correct GitHub branch and verify exact production SHA and live alias; a push alone is not deployment proof
- Unrelated drafts remain local: generated AGENTS block, Rast CSS, Taza draft, generic loyalty/scanner alternatives, remaining image assets, output and local tests. Preserve them; never publish all dirty files
- Management token expiry/Vercel direct API403 remain credential limitations, not permission to change accounts or credentials. The last SQL migration used the authenticated Supabase editor; release verification uses GitHub plus live alias
- Local `.git` evidence, browser sessions, credentials and generated output do not automatically synchronize to another device

## Next action and historical limits

- No unfinished implementation from the latest user requests. Continue with the user's next task using short Arabic updates, relevant checks and scoped changes
- Physical-device/real-message verification remains outside the completed checks. Phone-only password recovery and historical bank-detail follow-ups were not resolved by this release; consult history only if requested
- GREEN-API investigation remains stopped by the user's instruction; do not restart or send follow-ups without a new request
- [Detailed task history](history/task-state-through-20261017.md) and [previous handoff](history/handoff-through-20261017.md) preserve earlier findings verbatim. This current handoff supersedes their stale “latest” headings and counts
