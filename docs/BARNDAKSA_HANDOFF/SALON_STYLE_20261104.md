# Shared salon presentation and transparent Fine Cut loader

## Product rules

- User requested the approved Fine Cut page style for salon pages such as Care Salon
- Generic/current and future salon pages share the dark/champagne portrait composition, service catalog, booking controls and mobile layout
- Every salon retains its own current owner logo/name; Care has a prominent hero logo, header and footer without an added white tile
- Fine Cut retains its commissioned wordmark and portrait; Barber55 retains its separately approved identity
- New generic portrait is decorative fictional artwork; it does not identify a real customer or represent another tenant
- Fine Cut loading screen uses the existing approved transparent processed logo, copied without image edits into a versioned public asset
- Care loading screen carries its own original badge and the same dark/champagne page palette
- No database, subscription, loyalty-rule, service-price, booking, customer or messaging changes

## Files and evidence

- `components/salon/public-salon.tsx` and `.module.css`: shared layout and owner identity
- `lib/menu/loading-brands.ts`: Care loading identity and Fine Cut transparent logo path
- `public/salon/editorial-portrait-v1.webp`: independent generic portrait
- `public/salon/fine-cut/logo-transparent-v2.webp`: approved transparent logo reused from the existing processing pipeline
- `scripts/check-salon-experience.mjs`: existing booking/server checks plus generic/Care/no-logo/tenant isolation regressions
- `output/salon-layout/portrait-provenance.json`: original generated portrait, prompt and asset hash
- `output/salon-style/`: logo evidence, exact check input hashes/times, build, HTTP runtime and production publication

## Verification

- Implementation checks:63 salon regressions, text integrity, TypeScript and scoped lint passed; responsive, contrast, missing-logo, empty-catalog and booking/loyalty behavior reviewed in source/SSR
- No browser inspection or customer bookings/messages
- Final release text integrity, TypeScript,63 salon regressions, scoped lint and Node24 production build passed; exact input hashes and command execution times recorded in `output/salon-style/{release,build}-checks.json`
- Local HTTP verified Care own logo in header/hero/footer, independent portrait and loyalty link, preserved Fine Cut/Barber55 identities, published CSS and exact asset bytes
- Fine Cut logo SHA256 `cb9dbd1221f582f5650e200b881b765741f74510a93dccbc7d7c5a64e22042f9` matches the existing live processed logo byte-for-byte; alpha and all four transparent corners verified
- Initial runtime probe expected a literal CSS `transparent` token; Next's equivalent `none` output was confirmed and the probe corrected without changing application code
- Exact production commit and deployment verification are recorded after publication
