# Standalone menu release — 2026-09-06

## Scope and target

- Existing production project: `ahmedabumoallas-projects/branda-2`
- Domain: `https://barndaksa.com`
- Base commit verified against the active production deployment: `55e016cb47d4b4f017a1db51a92bde2580fb1540`
- Previous deployment for rollback: `dpl_9AqFc6DKSMopmatgx3K6dQUTtZPz`
- Previous URL: `https://branda-2-c1arcrv5o-ahmedabumoallas-projects.vercel.app`
- Release staged from that commit in `.codex-tmp/menu-release-20260906`
- The workspace's old `.vercel/project.json` points to a different project and was deliberately not used or modified

Only standalone-menu routes/components/helpers/fonts, publication admin control,
the additive GREEN API feedback function and the Motion dependency were overlaid
on the verified production base
Unrelated dirty working-tree changes were not included
No database schema, RLS, Storage bucket or account-status changes are required

## Public links

- Menu: `https://barndaksa.com/menu/double-b-bistro`
- QR PNG: `https://barndaksa.com/menu-qr/double-b-bistro.png`
- QR SVG: `https://barndaksa.com/menu-qr/double-b-bistro.svg`

The QR directly encodes the menu URL with H error correction and a four-module
quiet zone without any redirect service or tracking parameters
Generated using `scripts/generate-standalone-menu-qr.mjs`
PNG decoding was independently verified using OpenCV

## Administrator operation

Open platform administration and the brand list then the Double B Bistro details
The independent menu panel is immediately above the brand services panel
Use `نشر المنيو` to publish and `إيقاف المنيو` to unpublish
The state text confirms `المنيو منشور` or `المنيو غير منشور`
The menu URL and QR do not change when toggling publication
Suspending the brand account does not disable the independently published menu
Existing open pages or already issued signed media can remain usable until refresh
or expiry of the one-hour media URL lifetime

## Release procedure

Deploy production settings with `--skip-domain` then verify the unique deployment
before using `vercel promote` to assign the existing production domains
Keep the previous deployment available for rollback
Do not deploy the entire dirty workspace or push unrelated changes to Git

## Verification notes

Staged deployment: `dpl_8wDB8FJef3kS6L4ZKFqQ1bDGoMtJ`
URL: `https://branda-2-qse79w8sf-ahmedabumoallas-projects.vercel.app`
Cloud build and TypeScript passed with all standalone routes present
Authenticated hosting smoke check returned 51 product cards and the final signature
Local read-only data comparison passed for 51 products and all 54 source images
Publication, isolation and mocked feedback tests passed

The platform-wide security source gate reports pre-existing issues in
`20260617_104500_contact_request_final_fix.sql`, `lib/data/customers.ts` and
`app/actions/customer-media.ts` which were not changed in this release
These need a separate security remediation task
Vercel also warns that the existing Node 20 runtime is deprecated and will block
new builds from 2026-10-01 so a separately tested runtime upgrade is needed
Existing dashboard loyalty static-render diagnostics did not fail the build

Vercel CLI created a deployment-protection automation bypass token for its
authenticated staging smoke checks and stored it through its normal local mechanism
No token was printed or included in the deployed source

## Production outcome

Promoted successfully to the existing domain on 2026-09-06
Anonymous public GET returned 200 with exactly 51 product cards and the final
signature and no login redirect
The published QR PNG returned 200 and exactly matched the independently decoded file
Homepage and login smoke checks returned 200
Unknown menu contained the Next.js 404 fallback and zero product cards
The streamed response status was 200 despite the embedded 404 fallback
Invalid feedback POST was rejected with 403 without sending WhatsApp traffic
Browser review found 51 cards with no broken loaded images or horizontal overflow

WhatsApp group delivery is pending user account linking in WhatsApp Web
Desktop WhatsApp was running but the Computer Use native pipe remained unavailable
after the documented retry and session-recovery attempts
No group message has been sent

## Evening palette follow-up

User requested a darker refined treatment after the initial publication
Only the menu CSS and route theme-color metadata are changed in this follow-up
Warm charcoal `#191c19`, ivory `#ece9df` and sage `#bdc8a4` replace the light theme
Typography, animation, product data, publication and QR destination are unchanged
Text contrast across all four dark surfaces measured at least 6.29:1
Mobile 375px and desktop 1440px reviewed with no horizontal overflow
Product detail and closing signature reviewed on mobile
Previous working menu deployment for rollback is `dpl_8wDB8FJef3kS6L4ZKFqQ1bDGoMtJ`
Follow-up deployed and promoted as `dpl_BqmnX52nDSEPeuZUdwR42B9SXeYG`
Anonymous production smoke check passed with HTTP 200, 51 products and dark
theme-color metadata on the unchanged direct menu URL

The subsequent small lightening uses base `#272c26`, panel `#30362e`, ambient
`#343c2f` and footer `#34392e` with slightly lighter secondary text
Minimum measured text contrast is 5.84:1
Staged release: `dpl_7pnNcG3kynvpasb1fNZ2eFcSucR5`
Previous deployment for rollback: `dpl_BqmnX52nDSEPeuZUdwR42B9SXeYG`
