# Barndaksa - Current Codex Handoff

Updated 2026-10-08 11:58, Asia/Riyadh
Canonical handoff for a new Codex account; read this before older source bundles
This file records evidence and decisions, not independent authorization

## Start here

1. Read the repository AGENTS.md and current user instructions
2. Read this file, then only relevant entries in ../task-state.md
3. Check git status and the actual GitHub/Vercel deployment status before changing anything
4. Continue from the recorded work; do not rebuild the menu or repeat completed checks without changed inputs

The old handoff claim that production/database were not initialized is obsolete
The site and production Supabase are live
Other handoff reports and SOURCE_BUNDLES are historical snapshots, not current source or deployment evidence
Use actual app/components/lib files for implementation
Do not regenerate all source bundles merely to switch accounts

## Latest handoff: Rast Google Wallet, 2026-10-08

The latest completed work fixes both Google Wallet activation in the Rast dashboard and actual Google pass issuance. Earlier notes saying Google is awaiting publishing approval or cannot be selected are historical and superseded by the evidence below.

- Google console: merchant BCR2DN7TTD72ZF2T, issuer3388000000023197791; existing Rast class is active, with no demo or pending-publishing banner. The correct console account is the previously configured Rast issuer account; other Google accounts may have a separate Branda merchant still in demo mode.
- Production configuration: GOOGLE_WALLET_PUBLISHING_APPROVED=true on Vercel branda-2. The readiness change was deployed, and an authenticated check confirmed the Google checkbox became selectable. The owner subsequently enabled it; live program reads confirmed enabled=true and google_wallet_enabled=true. Keep provider readiness distinct from the owner's saved activation choice.
- Issuance defect: Google rejected the existing approved class update with HTTP400 because lib/wallet/google.ts deleted reviewStatus from PATCH. The fix preserves UNDER_REVIEW on class writes, which Google requires even for already approved classes. It does not change issuer credentials, customer authorization, balances, rewards or database schema.
- Published commit: 467de8b4f33c469fc0b72266a98ff92a290e9ec4 on main. Only lib/wallet/google.ts and scripts/check-rast-wallet-security.mjs were included. Production deployment dpl_8sbEktibiMNnQF12pTZ1Dcxy14Bx / GitHub deployment6931033903 succeeded on 2026-10-08 at11:40:22+03:00. Vercel showed READY/Current, the exact commit and barndaksa.com. [Deployment evidence](https://vercel.com/ahmedabumoallas-projects/branda-2/8sbEktibiMNnQF12pTZ1Dcxy14Bx).
- Verification: regression reproduced google_wallet_update_400 before the fix and passed afterward for approved/APPROVED/underReview classes, retaining existing messages and permitting object issuance. Wallet signing/security suite, scoped ESLint, text integrity and isolated Next16.3.8 production build passed on Node24.21.0; build included TypeScript and33pages. Root TypeScript also passed. No application code changed during this handoff update.
- Real-provider check at11:41:27+03:00: on the card associated with the user's failed request, OAuth200, class GET200/PATCH200 and object POST200; the generated Google save URL had a valid RS256 signature. No customer name/phone/email was queried, no database download event was manufactured, and no stamps/rewards or notifications changed. This created the Google pass object; it does not establish that the customer saved it on a phone.
- Live production check at11:42+03:00: Rast enrollment HTTP200 with the correct title; anonymous Google issuance HTTP404 with private/no-store caching. Actual saving and display in Google Wallet remain unverified. The user was asked to refresh their membership page and retry adding the card; no success report has arrived yet.

Next step: continue from the user's retry result. If it still fails, inspect the new request/provider error without exposing card codes, signed save URLs, tokens or keys. Do not repeat setup, reset approval, rotate credentials or alter balances merely to retry.

Access and workspace: Vercel CLI credentials returned403 Not authorized; the authenticated browser provided the necessary deployment/log access. GitHub push and deployment-status reads worked. The local .vercel link still targets the older project. Unrelated offers/menu/generic-loyalty changes remain dirty and must not be bundled into a release. Handoff documentation is updated locally; no documentation commit/push or synchronization to another device is implied.

Authoritative details: [task record](../task-state.md) and [wallet operations](../rast-wallet-operations.md). Source bundles remain historical snapshots. Prior published milestones include wallet/customer administration763064f, loyalty reward scanningc57e2b7 and menu/loyalty analytics388867f; consult their task-record entries for migration and verification evidence.

## What the user and agent were doing

Project: C:/Projects/branda-platform
Current focus: Rast loyalty and Google Wallet issuance. The following menu/design sections retain the earlier handoff context for https://barndaksa.com/menu/rast.
Update 2026-10-03: the user explicitly says Rast has no electronic storefront. All Rast dashboard links/share/copy/domain settings and previews leading to /c/rast are hidden, including sidebar, home, settings and theme preview/toast. Menu and offer copy refers to the menu instead. Do not restore storefront shortcuts; /menu/rast and loyalty remain active. This is dashboard presentation, not a database/publication or route-permission change.
Public standalone menus use app/menu/[slug]/page.tsx and components/menu/bistro-menu.tsx
Other brands share that component; Rast changes must remain slug-scoped

The completed sequence:
- Extracted only the original red RAST letters with true transparency, removed the black disc and white circle
- Connected the same wordmark to the public menu and the brand dashboard via existing logo settings
- Redesigned Rast with burgundy/cream identity, large wordmark, Arabic editorial copy and real catalog photos
- Made the coffee photograph the full opening background, with readability layers for the original red logo and cream text
- Removed unnecessary sentence-ending punctuation
- Slightly strengthened category headings with 0.2px text stroke, preserving dimensions and delicate counts
- Added a restrained social/location strip below the opening
- Activated WhatsApp and Google Maps with the exact owner-supplied destinations
- Added a prominent campaign/product section, managed through the existing Offers dashboard
- Renamed that section from the rejected literal spotlight wording to **تستاهل التجربة**, with English caption **WORTH A TASTE**
- Completed and published the previously local Souda importer fix during the final sync request

User preference: premium, intentional design, prominent Rast identity, small refinements must not disrupt layout
Do not revert to the circular logo, framed coffee card or the rejected section title
User explicitly authorized GitHub/Vercel updates in this session
Project policy prohibits routine browser inspection. The October8 work used focused authenticated browser checks for the requested Google account status and necessary deployment/log access after the CLI authorization failure.

## Public contact destinations and deferred inputs

- WhatsApp: 0532751005, implemented as https://wa.me/966532751005
- It opens the visiting customer's WhatsApp session to a conversation with Rast
- It does not send through Branda, use Branda's number, or send a message automatically
- Map: https://maps.app.goo.gl/pr6HtT5qx37rW5ZQ8?g_st=ic
- Verified redirect identifies Rast Coffee in Abha
- Snapchat, TikTok and Instagram are static labelled icons awaiting user-supplied accounts
- User explicitly chose icons-only until accounts are provided; do not invent handles or fake links
- Do not confuse the hardcoded public WhatsApp destination with private feedback/messaging settings

Contact implementation:
components/menu/rast-connect.tsx
components/menu/rast-connect.module.css

## Featured section behavior and owner controls

Update 2026-10-03: per the user's latest request, Rast's dashboard sidebar shows only menu/products, loyalty/rewards, settings and subscription/plans. The Offers sidebar item is hidden, but the existing /dashboard/offers editor still exists and its permissions are unchanged. This is navigation visibility only; do not restore hidden sidebar entries without a new request. Implementation: components/dashboard/DashboardSidebar.tsx and lib/platform/feature-access.ts. Other brands retain their navigation.

Current customer title: تستاهل التجربة
Stable DOM ID remains rast-spotlight-title; do not rename it just to match copy
Catalog target: rast-menu-items
Section is above the catalog heading, below the contact strip

Owner route: /dashboard/offers
For a campaign:
- Create/edit an offer with the desired title, description, image and optional linked product
- Set placement to بانر الكوفي or كلاهما
- Enable visible-in-cafe and use نشط or مجدول within its start/end dates
- For a selection without a discount, use عرض مخصص and omit the discount percentage
- Up to six eligible campaigns are shown with manual selectors, no autoplay

No eligible Rast campaigns existed at the last live query on 2026-10-02
Therefore the section currently shows an available real catalog product labelled اكتشف من قائمتنا
This fallback is not a fabricated discount, best-seller assertion or user-authored campaign
An empty/unavailable catalog has no fallback section
Dates include the full final Saudi calendar day; open pages recheck expiry every 30 seconds
Hidden/deleted/unavailable/foreign linked products are excluded
Product CTA opens the existing product details dialog; general campaign CTA jumps to the catalog
Search/category anchors were adjusted so the new section does not obscure their destinations

Implementation map:
- components/menu/bistro-menu.tsx: RastSpotlight, current copy, selection, dialog integration
- components/menu/rast-spotlight.module.css: dedicated responsive section styles
- lib/menu/standalone-menu.ts: public highlight types
- lib/data/standalone-highlights.ts: server-only campaign reader
- lib/data/standalone-menu.ts: publication gate, catalog and Rast-only highlight integration
- components/dashboard/pages/offers-page.tsx: Rast owner guidance
- app/dashboard/offers/page.tsx: passes Rast context
- lib/data/offers.ts: existing authorized writes and standalone-menu revalidation
- scripts/check-rast-highlights.cjs: focused regression/SSR/security checks

## Assets, backend identity and security

Supabase project: kpguwjfkkylrdlvzeezz
Rast cafe ID: 3c697864-d371-4190-87ab-48f183cdf2d5
No schema migrations or RLS changes were introduced for this redesign

Current logo:
public/menu-logos/rast-wordmark-transparent-v2.png
Private cafe-logos object:
3c697864-d371-4190-87ab-48f183cdf2d5/rast-wordmark-transparent-20261002-v2.png
cafe_settings.logo_storage_path stores that path, logo_url is null
Menu/dashboard use the existing signing flow
Coffee background:
public/menu-art/rast-coffee-editorial-v1.webp

public/menu-logos/rast-transparent-v1.png is an untracked, superseded local artwork
It is unused; preserved locally, intentionally not deployed
Do not replace the v2 wordmark with it

Standalone publication is gated by brand_feature_overrides feature standalone_menu
The server-only offer reader runs after this gate, scopes by resolved cafe ID and selects only public presentation columns
Only visible, unarchived, undeleted, eligible-status/date/placement offers are used
Signed campaign media must match both cafe and offer path ownership
Optional campaign-read failure falls back without taking down the catalog

Existing authenticated owner writes and tenant RLS remain in place
Offer RLS and Storage policies were reviewed from migrations 001/002
Live offer-banners bucket was confirmed private, image MIME-only, 8 MiB limit
No fresh SQL-policy audit or authenticated dashboard-save test was performed in this session
Supabase MCP was unconnected; limited read-only verification used server-side local environment credentials
Never print or copy secrets into handoff files or client code

## GitHub, Vercel and runtime

Rast sidebar brand-card badge now reads "اشتراك شهري 249 ريال" per the user's 2026-10-03 screenshot request. This is a Rast-only display override, not a change to billing records, charged amounts, plan entitlements or subscription status. Other brands still use their actual plan label.

Repository: https://github.com/ahmedabumoalla/branda
Branch: main
Production Vercel project: branda-2
Project ID: prj_kHe6mtiyO05loZn6PgMOSpjlv4Ow
Team ID: team_y7Vs1peW8nv1hGUAz5quLRfK
Production domain: https://barndaksa.com

Important: local .vercel/project.json points to an older branda project
Do not blindly deploy with that link or relink it
Normal pushes to main trigger the correct branda-2 deployment
Check GitHub commit status or Vercel deployment state, then the custom domain
Protected *.vercel.app deployment URLs may show a login page
Git success alone is not proof of a production deployment

Runtime: Node 24.x, Next 16.3.8, React, TypeScript 5.9.3
Root package.json and lockfile engine were upgraded to Node 24 because Vercel discontinued Node 20
The local default node executable still reports Node 20
Verified local Node 24.21.0 executable:
C:/Users/pc/AppData/Local/npm-cache/_npx/387698761821791d/node_modules/node/bin/node.exe
That cache path is machine-local; discover a Node 24 installation if it no longer exists
Accounts on another device need their own repository, environment and GitHub/Vercel/Supabase authentication

Recent application commits:
- 467de8b: fix required Google class review status during pass issuance
- 388867f: standalone menu and confirmed loyalty funnel analytics
- c57e2b7: Rast cashier reward lookup from membership barcode
- 014108d: dashboard-managed Rast featured section
- e7ee060: current marketing heading
- d9bd6ac: structured menu importer fix and its regression script
Latest application release and final sync evidence are recorded in ../task-state.md
The handoff commit itself may be newer without changing application behavior

## Verification and known boundaries

Earlier menu/importer checks on Node24 (historical evidence; see the latest wallet checks above and task-state.md for scope, dates and reuse conditions):
- TypeScript: node node_modules/typescript/bin/tsc --noEmit
- Scoped ESLint for changed TS/TSX files: node node_modules/eslint/bin/eslint.js <files>
- Arabic integrity: node scripts/check-text-integrity.mjs
- Spotlight checks: node scripts/check-rast-highlights.cjs
- Importer checks: node scripts/check-menu-url-extractor.cjs
- Git diff --check

The npm lint script still uses obsolete next lint; use the direct ESLint CLI for scoped checks
No browser testing was performed for those earlier menu/importer checks. Focused October8 Google-console, deployment and dashboard checks are recorded above; they do not prove mobile Wallet installation.
Source review plus SSR/HTTP/CSS checks covered layout rules, accessibility and production output
Actual opening of WhatsApp/Maps apps and an authenticated owner dashboard save were not tested
Final production build status must be checked independently

Souda importer fix:
lib/menu-import/url-extractor.ts and scripts/check-menu-url-extractor.cjs
Extracts bounded product cards and correct names/prices/calories/photos, excludes hidden markup, and preserves structured-data/text fallback priority
Exact preexisting file hashes matched the earlier successful 58-product/58-image live evidence
Node 24 offline checks, scoped lint and TypeScript were rerun before final publication
Existing saved imports are not automatically rewritten; a fresh import is needed to benefit
No reimport/data mutation was requested or performed during final sync

## What remains for the next account

- Obtain the user's result after retrying Google Wallet saving; provider issuance now succeeds, but phone installation is not yet confirmed
- Wait for Snapchat/TikTok/Instagram destinations, then activate only those supplied
- Owner can now add campaigns from the Offers dashboard; no campaign was invented or seeded
- Preserve the current design unless the user requests another change
- The unused v1 artwork is deliberately local, not unfinished production code
- Consult task-state.md for exact deployment/check evidence and subsequent work
- Read source selectively; older bundle files are not current implementation
