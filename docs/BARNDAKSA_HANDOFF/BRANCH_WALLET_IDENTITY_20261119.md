# Branch wallet identity correction - 2026-11-19

User reported a Fawasel Tariq Al-Miyah customer's Apple card missing visible branding and authorized auditing branch cards and refreshing installed wallets

## Findings and correction

- All seven current loyalty branches belong to Fawasel; Tariq Al-Miyah is Fawasel 3
- Every branch logo decoded and rendered successfully; all seven public logo endpoints returned HTTP 200
- Three older unbranched Fawasel cards had no brand logo because both brand settings and custom identity had no saved logo
- The transparent text fallback incorrectly used the pass background as its ink, making it invisible; it now selects contrasting black or white
- Apple passes now include native logo text independently of artwork; existing Mqas77 native identity is preserved
- Branches without their own logo inherit the parent brand logo; explicit branch logos and colors remain authoritative
- Restored Fawasel's missing parent identity using its existing reviewed Fawasel 3 artwork at 2026-11-18T21:21:33.357Z; no palette, rewards, card IDs, origin branches, balances or subscriptions changed
- The reported customer's exact card remains unidentified until the requested phone number is supplied; the generic-card defect reproduces the missing branding but is not proof of that customer's specific origin

## Verification

Source commit 0b37fa6f7c2f9d7b37cf7c188e5b83162d527d8b pushed to main

Full TypeScript, changed-source text integrity, native wallet integration, 32 performance checks, branch location checks and wallet sync suite passed on Node 20.20.2

Integration regression covers contrasting fallback pixels on dark/light cards, native Apple identity, unchanged serial number, parent logo fallback and explicit branch logo precedence. Initial exact pixel assertion encountered normal 254/255 antialiasing; tolerance of three levels then passed

Read-only generation of all 33 active Fawasel cards passed at 2026-11-18T21:22:47.103Z, including 30 branch cards. All had nonempty native logo assets, native name, stamp fields and QR. 23 existing wallet passes were observed. Pure generation did not register downloads or manufacture device-fetch evidence

Evidence in root output/branch-wallet-20261119: checks.json, asset-audit.json, package-audit.json, all-cards-verification.json. Temporary member snapshots were deleted after verification and were never committed or surfaced

Database evidence in root output/fawasel-branches-20261118/branch-wallet-{preflight,repair}.json. Repair is scoped account data, not a schema migration

## Publication and refresh

Vercel dpl_BG98FBv9oPBNV788P6Pg1vmHFV1V READY with both production aliases at 2026-11-18T21:42:10.701Z from exact source 0b37fa6f7c2f9d7b37cf7c188e5b83162d527d8b

Scoped watermark refresh applied 2026-11-18T21:42:23Z and card-scoped sync completed. At 2026-11-18T21:54:07.761Z: 23 passes, 19 Apple and 4 Google; 15 registered Apple cards accepted, 4 Google updates accepted, zero failures. Fourteen Apple devices fetched the latest version; one registered device still pending and four passes have no registered device. These are provider/download observations, not on-device rendering proof

Deployment, live-logo and sync evidence in output/branch-wallet-20261119/{deployment,live-logos,sync-dispatch,sync-outcome}.json

No promotional messages, WhatsApp tests or customer transactions authorized by this corrective operation. APNs acceptance and authenticated pass download are distinct from visible rendering on a customer's phone

Root working tree has different historical wallet sources and no branch-appearance module; preserved unchanged. Implementation and checks are in the isolated release worktree
