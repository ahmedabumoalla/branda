<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Continuity and execution

- USER RELEASE AUTHORIZATION 2026-11-19 (Claude): Before a client meeting the user explicitly asked to publish the Aldeem account with its browser-only presentation data to GitHub and Vercel. This supersedes the same-day Aldeem local-only note for this release. Presentation mode is on by default with a sidebar switch, reads nothing from the database and writes nothing; see components/aldeem/demo and docs/task-state.md

- ALDEEM LOCAL ONLY2026-11-19: User explicitly clarified all Aldeem changes are local only. Do not publish Aldeem source/data changes until newly authorized. Canceled unfinished sidebar logo deployment and reverted its own GitHub commit; keep local logo and loyalty navigation work out of unrelated releases

- RELEASE AUTHORIZATION2026-11-17: User explicitly requested publication of completed Aldeem, Wahed and all eligible menu-brand branch updates to GitHub and Vercel, with handoff updated. Preserve newer production changes in the isolated release worktree. No real test messages or retained test financial records


- ALDEEM ENTERPRISE 2026-11-15 (Claude): owner mandate to rebuild the khayal-aldeem account only. Seven migrations and demo data are already applied to production; never reapply them. Read docs/BARNDAKSA_HANDOFF/ALDEEM_ENTERPRISE_20261115.md before touching families, points, tracking, food safety, the Aldeem sidebar or platform_plans.erp_modules

- USER RELEASE AUTHORIZATION 2026-11-15: After the requested platform performance/interface audit, publish the completed combined source to GitHub and Vercel. Preserve concurrent Claude work and fixes already in production through the isolated release worktree; this supersedes prior frontend-local-only restrictions for this release. Browser inspection is explicitly requested. Do not send real test messages or retain test financial records

- USER CATALOG RULE 2026-11-15: Menu products are sold prepared products; stock items are stored materials. Do not auto-create a stock item for an espresso or auto-copy the menu to stock. Owners may optionally link stock ingredients and consumption quantities to a menu product
- USER CANCELLED FAWASEL: Do not send, resend or retry the cancelled Fawasel announcement or change its trial/subscription as part of this release

- On a Codex account switch, read `docs/BARNDAKSA_HANDOFF/CODEX_ACCOUNT_TRANSFER_20261108.md` before acting. Account transfer does not authorize new implementation, data recovery or resuming cancelled work; preserve the workflow and verification limits recorded there.

- Start with `docs/task-state.md`, then `docs/BARNDAKSA_HANDOFF/00_MASTER_INDEX.md`. Read historical records only for a relevant unresolved detail.
- The user prefers fast implementation, premium Arabic design, short updates and concrete results. Complete authorized work and deployment without repeated confirmation or broad exploratory checklists.
- Check the actual source and `git status`; preserve unrelated local changes. Never publish unfinished local work just because it exists.
- Run only checks relevant to the changed behavior plus the mandatory checks below. Reuse valid unchanged evidence; documentation-only updates do not require rebuilding the application.
- Do not inspect the browser unless directly requested or a critical necessity cannot be resolved from source, tests or APIs; explain that necessity first.
- Deploy through the correct GitHub branch/project and verify the exact production commit. A successful push alone is not a successful deployment.
- Keep the current handoff short: published state, established product rules, actual pending work and next action. Never include secrets. Account changes do not authorize resetting data or rebuilding completed features.

## Text Integrity Rules

- Before any modification, read this file.
- Never write or save Arabic mojibake or corrupted text.
- Any Arabic text in JSX, TS, SQL, or MD must be clear, readable UTF-8.
- After any modification that contains Arabic text, run the text integrity check.
- Do not deliver work if any forbidden mojibake pattern from `scripts/check-text-integrity.mjs` appears, including Unicode escapes U+00D8, U+00D9, U+00D0, U+00C3, U+00C2, U+00E2, U+FFFD, U+0637 U+00A7, U+00D8 U+00A7, or U+00D9 U+2026.
- Do not use bulk encoding-conversion tools without reviewing the resulting diff.
- Do not consider the task complete until the text integrity check and TypeScript pass.

## Platform interface copy

- Write headings, descriptions, hints, buttons, validation messages and notifications without trailing periods or commas
- Remove decorative dots and unnecessary commas from short interface phrases across the platform
- Keep punctuation only when it carries meaning, such as list separators, questions, decimal values, currency abbreviations, email addresses and URLs
- Apply this rule to new and edited Arabic interface copy and shared system messages without rewriting customer-authored content

## Deployment size

- `public` is served by the CDN and stays out of server functions. `next.config.ts` excludes it from file tracing, and `scripts/verify-deployment-size.mjs` stops the production build when a function carries public files it never reads or passes its size limit
- Do not add videos or other large media to `public`. Host them in storage and link them
- Server code reads a public file only through a fixed path that is listed in `FIXED_PUBLIC_FILES` and in the `"/*"` includes of `next.config.ts`. The only variable path under `public` is the wallet logo reader in `lib/wallet/logo.ts`, served by the `/api/wallet/**` includes
- Do not add `turbopackIgnore` to that reader. Measured on 2026-11-21 it packed the whole project into every function
- The guard is wired twice on purpose: at the end of the `build` script in `package.json` and in `buildCommand` in `vercel.json`. Keep both
- Local development trees can hold older copies of `next.config.ts`, `package.json` and `vercel.json`. Never copy them over the versions on main. Merge only the lines you need
- After every deployment measure the build time with `gh api repos/{owner}/{repo}/commits/<sha>/statuses` (last pending to success) and write it in the deployment report. The normal time is about one minute. Over three minutes, stop releasing and find the cause first
- Do not raise a limit or remove the guard to get a release out. Read `docs/BARNDAKSA_HANDOFF/DEPLOYMENT_SIZE_GUARD_20261121.md` first

## Communication Rules

All assistant responses to the user must be in Arabic and rendered right-to-left using this wrapper:

```html
<div dir="rtl" align="right">
...
</div>
```

Code, file paths, terminal commands, function names, and other code-like text must be placed in separate fenced code blocks. Do not mix them inline with Arabic text.
