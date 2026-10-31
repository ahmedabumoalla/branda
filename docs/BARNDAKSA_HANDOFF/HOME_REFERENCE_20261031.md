# Branda marketing homepage

Status: published and verified on apex and www

Code: 3455f010a04e5f80e9c459278a13c9c0a1706c3a
Deployment: dpl_6P16k1wnGWfKtAgKb6ySmfeZdYvq (branda-2 READY)
Verified: 2026-10-31T20:13:51.406Z

- Recreated the requested twlm.solutions homepage composition using Branda brown/gold branding, local assets and the IBM Plex Sans Arabic font
- Preserved 16 features, bundle comparison, 20 industries, eight outcomes, branded-app presentation, two pricing cards, 27 comparison rows, seven customer logos, ten FAQs, contact form and footer
- User confirmed the accreditation, 6000-business claim and customer relationships also apply to Branda
- Prices 99/299 SAR per month per branch, billed annually, are marketing display only. Subscription catalog, billing, entitlements and data remain unchanged. Plan buttons prepare a contact request
- User approved WhatsApp requests for download links and terms until the actual Branda URLs are supplied. No competitor login, downloads or contact endpoints
- User subsequently requested all reference animations and removal of Tamara. The Tamara strip and asset are removed
- Motion includes pointer-driven dashboard tilt/reset, 1500ms counters, staggered chart entrance, live indicator, 2400ms rotating words, 6/7-second floating cards, 750ms/28px scroll reveals, cursor glow, hover effects, button shimmer, menu sequencing, section highlighting, smooth scrolling, moving industry/customer/trust strips and live reduced-motion handling
- Feature financial chart restored. Moving strips cover their containers across the entire loop in both layouts

Verification (2026-10-31 UTC):

- Node 24.21.0 / Next 16.3.8 production build passed
- Release and original workspace TypeScript/text integrity passed; scoped ESLint and diff review passed
- Production-runtime browser checks passed at widths 320, 390, 768, 1440, including Arabic/English, navigation/Escape, FAQ, plan selection, phone validation, image loading, marquee coverage, tilt/reset, reveal, hover and reduced motion
- WhatsApp window intercepted in tests; no outgoing test messages or production data mutations
- Browser artifact: output/branda-home/browser-qa.json; desktop/mobile screenshots alongside it; final provenance: output/branda-home-verification.json
- Initial Next development browser failed to hydrate because its HMR host was blocked. Replaced with production-runtime verification; not an application failure. The first browser connector later stalled waiting for lazy image decoding, so final QA used an isolated local headless Chrome instance
- Root text scan initially caught malformed third-party text in a downloaded reference bundle under output; removed that inspection-only bundle and reran successfully

Relevant commands:

```powershell
node scripts/check-text-integrity.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js app/page.tsx components/marketing/branda-home.tsx components/marketing/branda-home-content.ts components/marketing/use-branda-home-motion.ts scripts/check-branda-home.mjs
# Node 24 runtime
node node_modules/next/dist/bin/next build
node scripts/check-branda-home.mjs
```

Live production browser verification also passed. The first live test raced a viewport-triggered reload; the test now waits for document completion and a visible menu. No pending product work. Actual app download/terms URLs may be supplied later; current approved WhatsApp flow is active.
