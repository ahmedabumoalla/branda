# Loyalty guide — 2026-11-18

Published4e4cf1101ed58e11c4c149a6573154981f7f88b8 Verceldpl_2DvYtPuxL376LaZmAfqxqYDd6N4G READY both aliases exact HTTP verified2026-11-18T01:26Z

- User correction: only accounts with effective loyalty entitlement; existing and new accounts use the same service check, with no creation-date condition
- Sidebar entry under loyalty settings; disabled guide is absent. Aldeem custom shell also shows the gated entry, renders the guide/settings children and returns to the selected existing workspace section
- /dashboard/loyalty/guide opens the original16-page document immediately; preview button stays in-page, download uses attachment disposition, explicit new-tab fallback for browsers without inline PDF support
- /api/loyalty-guide verifies the existing owner/account context and effective loyalty before any file read; private/no-store, nosniff/noindex; fixed server file path, no caller-selected file or tenant
- Original supplied PDF retained byte-for-byte:3524983bytes; SHA256330ea8d39e618d342cabb6b88fa9d2d1a12679cf9dd0483030741cdb96ab5b91. Assets bundled only in the guide route, no public static copy and no PDF generation dependency
- Focused guide tests, full TypeScript,18staff-workspace cases and original scoped text integrity pass; source responsive/contrast/focus review, no authenticated browser/device rendering verification
- Initial Aldeem navigation test caught a missing overview button during draft editing; restored and full affected test rerun before publication
- No plan, database, existing loyalty balance, customer record or outgoing message changes
- Evidence output/loyalty-guide-20261118

## Mobile standalone reader

- MOBILE GUIDE2026-11-18: Native protected PDF opens in a separate tab, navpanes=0 and view=FitH. Mobile/SSR create no iframe or background PDF request; desktop retains same-page preview, responsive listener cleans up. Original16-page PDF, download and loyalty-only authorization unchanged. Focused authorization/navigation/mobile/desktop tests and full TypeScript passed; scoped original text check recorded in output/loyalty-guide-mobile-20261118. Source review plus Chromium parser reference; no device/browser rendering test. Publishedfc47d6c42fcc66e9267d3686e4cef113e149d9b2, Verceldpl_6S4UzbNrRb8nqKtFGkzVPQt61akX READY both aliases/exact HTTP verified2026-11-18T02:34:21.582Z; authenticated guide SSR/native links/exact PDF/download and anonymous403 passed

- Chromium source reference: https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/browser/resources/pdf/open_pdf_params_parser.ts
- PDF viewer controls differ by device; native opening and the download fallback are retained without a new library or changed PDF bytes
