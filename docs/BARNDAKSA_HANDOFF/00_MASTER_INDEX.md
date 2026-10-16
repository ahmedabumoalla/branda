# Branda — current handoff

Updated 2026-10-17 01:06 +03:00 - Asia/Riyadh

Read [current task state](../task-state.md), then repository `AGENTS.md` and actual `git status`. Use historical records only for a relevant unresolved detail

## Published state

- Latest application: `7854ed177552d1f12d0b5083cdb4b825b76264d3`; production verified2026-10-17 00:17+03 on `branda-2`, deployment `dpl_GZgp8kM42sgozvWQVXJJZUKnMyWU`
- Current handoff publication is documentation only; application code is identical to that verified release. The later documentation commit is available from Git history; its fresh deployment/alias verification is recorded locally in `.git/handoff-production.json`
- All current requested product/image/editor/menu and operations-report changes are implemented. Required checks and exact application build passed. Migration `20261017001500_operations_pager_promotions` is applied and recorded; no pending catalog operation or migration

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
Last exact application build: C:/Projects/branda-operations-release-20261017
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
