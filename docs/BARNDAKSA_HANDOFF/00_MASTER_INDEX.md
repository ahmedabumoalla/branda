# Branda — current handoff

Updated 2026-10-19 15:38 +03:00 - Asia/Riyadh

Read [current task state](../task-state.md), then repository `AGENTS.md` and actual `git status`. Use historical records only for a relevant unresolved detail

## Current work ready for deployment

- User now authorizes full marketing package launch and per-brand WhatsApp pairing; earlier admin-only scope is superseded. Implementation and focused checks are complete locally, not published. Existing marketing plan/price retained, no automatic subscriptions or customer messages
- Vercel production configuration succeeded on explicit `branda-2` project15:28. Supabase scoped access works; migration20261019122042 applied/registered15:49 with exact source SQL,5 private RLS tables/11 service-only functions verified and zero initial work. Five INFO advisor entries are expected for server-only tables without client policies
- Next: deploy explicit `.git/marketing-files.json` and verify exact production commit. Tests/build hashes revalidated before deployment; evidence is in [task state](../task-state.md). Preserve unrelated dirty files and all existing customer data. Each brand must scan its own QR; no real messages sent

## Previous published state

- VERIFIED2026-10-19 15:07 +03: application `91527ebec742fd96df45963cf22c5ed883ecef72`, production `dpl_G7kTy6qJGcuEZ83VacMyrWMhtzDj`, exact domain and runtime checks passed. `.git/showcase-partner-production.json`; no browser test and production partner-key environment still unverified403
- Latest requested release: faster genuine menu previews, success partners below the hero with the internal demo hidden, plus admin-only campaign package preparation. Identify commit via `git log -1 --format=%H -- lib/whatsapp/green-api-partner.ts`; exact production proof `.git/showcase-partner-production.json`. Missing proof means publication is not verified
- Preview query/media work is parallel and signatures reusable;3 selected frames start eagerly, no full-screen loading mask or background refresh. Full genuine menu design/data and current gates retained. Normal menu refresh unchanged. Partner placement moved without duplicating the section; demo account/menu intact
- Campaign service is selectable/saveable in admin plans, excluded from customer navigation/runtime/public service descriptions even with overrides. Server-only partner reader prepared; local account authentication confirmed15:01. No campaigns, paired/provisioned instances or customer messages. Production environment verification returns403; local key does not establish production readiness
- Homepage21/catalog17/preview7/partner8 and admin-plan UI tests, text integrity, TypeScript and isolated build passed15:04. Scoped lint has an existing CMS-image warning;2 unchanged admin.ts any errors independently matched baseline. Exact commands/hashes and direct-loader timing limitations in task-state. No browser test
- Annual pricing releasebb90d81 verified14:54 at `dpl_9H65uh4uWABHtxfVpwo7sCyVoa76`; actual annual savings/monthly-equivalent/full-payment presentation preserved. No billing/price changes
- Previous homepage release867cd2a verified14:42 via `.git/home-redesign-production.json`. Gallery shows3 genuine active public menus per page with logos and normal open links; preview mode is inert and does not record visitor/customer activity
- Public plans use the same active paid-plan visibility and pricing helper as brand subscriptions. Administrative/trial/historical free grants stay excluded. New purchasable packages and edited prices/services update automatically; refresh every30 seconds plus focus/reconnect. Source data had3 paid plans and14 partners/eligible menus; no Plus-named plan existed and no names were changed
- All existing non-deleted non-demo brands appear as partners; menu previews additionally require publication and current menu entitlement. Allowlisted public DTO, no-store responses, independent failure/retry states and retained successful data. No migration or production-data writes
- 16 catalog/preview and20 homepage interaction/SSR checks, text integrity, TypeScript, scoped ESLint and isolated production build passed2026-10-19. Three pre-existing lint warnings remain; no browser/device test. Exact runtime/input evidence is in current task state
- Existing admin logo/account navigation remains: logo opens `/`, visible active-session account icon returns to `/admin` or `/dashboard`, guests retain sign-in. Previous verified release `e81a0a9`, evidence `.git/home-account-production.json`
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
Latest isolated application build: C:/Projects/branda-showcase-partner-release-20261019
```

- Local `.vercel/project.json` points at the old project. Deploy through the correct GitHub branch and verify exact production SHA and live alias; a push alone is not deployment proof
- Unrelated drafts remain local: generated AGENTS block, Rast CSS, Taza draft, generic loyalty/scanner alternatives, remaining image assets, output and local tests. Preserve them; never publish all dirty files
- Management token expiry/Vercel direct API403 remain credential limitations, not permission to change accounts or credentials. The last SQL migration used the authenticated Supabase editor; release verification uses GitHub plus live alias
- Local `.git` evidence, browser sessions, credentials and generated output do not automatically synchronize to another device

## Next action and historical limits

- Latest GREEN-API scope: partner key configured locally and verified read-only; admin can prepare campaign packages. Customer launch explicitly deferred. No sender pairing/queue/send implementation activated, no existing instances migrated/deleted. Production key environment remains unverified403; detailed provider report is in task-state and chat only
- Physical-device/real-message verification remains outside the completed checks. Phone-only password recovery and historical bank-detail follow-ups were not resolved by this release; consult history only if requested
- User explicitly reopened GREEN-API research/integration preparation2026-10-19. No support messages, repeat applications, instance deletion or real test campaign dispatch
- [Detailed task history](history/task-state-through-20261017.md) and [previous handoff](history/handoff-through-20261017.md) preserve earlier findings verbatim. This current handoff supersedes their stale “latest” headings and counts
