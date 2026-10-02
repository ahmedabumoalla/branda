# Barndaksa - Current Codex Handoff

Updated 2026-10-03, Asia/Riyadh
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

## What the user and agent were doing

Project: C:/Projects/branda-platform
Focus: only the Rast standalone menu at https://barndaksa.com/menu/rast
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
No browser inspection was requested; project policy prohibits routine browser use

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

Runtime: Node 24.x, Next 16.2.6, React, TypeScript 5.9.3
Root package.json and lockfile engine were upgraded to Node 24 because Vercel discontinued Node 20
The local default node executable still reports Node 20
Verified local Node 24.21.0 executable:
C:/Users/pc/AppData/Local/npm-cache/_npx/387698761821791d/node_modules/node/bin/node.exe
That cache path is machine-local; discover a Node 24 installation if it no longer exists
Accounts on another device need their own repository, environment and GitHub/Vercel/Supabase authentication

Recent application commits:
- 014108d: dashboard-managed Rast featured section
- e7ee060: current marketing heading
- d9bd6ac: structured menu importer fix and its regression script
Latest application release and final sync evidence are recorded in ../task-state.md
The handoff commit itself may be newer without changing application behavior

## Verification and known boundaries

PASS on Node 24:
- TypeScript: node node_modules/typescript/bin/tsc --noEmit
- Scoped ESLint for changed TS/TSX files: node node_modules/eslint/bin/eslint.js <files>
- Arabic integrity: node scripts/check-text-integrity.mjs
- Spotlight checks: node scripts/check-rast-highlights.cjs
- Importer checks: node scripts/check-menu-url-extractor.cjs
- Git diff --check

The npm lint script still uses obsolete next lint; use the direct ESLint CLI for scoped checks
Do not claim browser testing: none was performed
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

- Wait for Snapchat/TikTok/Instagram destinations, then activate only those supplied
- Owner can now add campaigns from the Offers dashboard; no campaign was invented or seeded
- Preserve the current design unless the user requests another change
- The unused v1 artwork is deliberately local, not unfinished production code
- Consult task-state.md for exact deployment/check evidence and subsequent work
- Read source selectively; older bundle files are not current implementation
