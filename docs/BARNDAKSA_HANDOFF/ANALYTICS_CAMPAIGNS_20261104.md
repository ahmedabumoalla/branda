# Campaigns from brand analytics

## Delivered behavior

- Select a brand at `/admin/brand-analytics`, then إنشاء رسالة أو عرض
- Audiences: more than10days inactive, regular loyal customers, or a custom absence threshold1..365days
- Preview all eligible recipients with server pagination, deduplicated phones, matched/excluded counts and current primary sender readiness
- Compose a message or promotional offer with its terms, preview the exact body, optionally schedule in Riyadh time, then review and explicitly launch
- Offers are editable promotional messages; individual redeemable coupons were not requested with confirmed terms and are not created
- Campaigns use the existing platform queue, main Branda WhatsApp sender, scheduling and campaign history
- Recipient eligibility is checked again before dispatch; returned or no-longer-eligible customers are suppressed
- PDF export and existing analytics remain available

## Authorization and delivery rules

- Active platform-admin session required before privileged client creation; backend-only RPCs independently validate the actor
- Brand/segment/threshold and full eligible phone set bind the reviewed digest; empty or changed audiences cannot fall back to all customers
- Existing global suppression, blocked/conflicted profiles and phone normalization remain in force; recipient names come from the selected brand
- Same request key reconciles an uncertain creation even if the audience changed, schedule passed or sender disconnected; uncertain UI retains the frozen request on subsequent errors
- Existing queue locking, five-second pacing, lease recovery, cancellation and ambiguous-attempt safeguards preserved
- Actual provider acceptance is not treated as proof of delivery

## Database and checks

- Applied `20261104124234_analytics_targeted_campaigns.sql`, exact history MD5 `1134cee86bf2e445444ed6402fd8694c`
- Three existing worker bodies match their original versions except recipient eligibility predicates; guarded source hashes prevent overwriting concurrent changes
- Local56 new SQL checks plus original campaign rollback suite passed
- Live186 read-only preview queries across31active brands, all three segments and two pages passed; service-role/admin authorization and no business-data changes verified
- Root/release text integrity, TypeScript, server72/UI64/previous analytics UI62, existing platform campaign regression, scoped ESLint and Node24 production build passed
- Current primary sender was connected at2026-11-04T12:47:23Z; readiness check only
- No real campaign, recipient, message, pass or customer fixture created during validation
- No application browser used under repository policy

## Publication and evidence

- Published 2026-11-04T13:00:07.057Z: GitHub main 26c6044cc6ac2b555ecc6ae55ef31536820950e0, Vercel dpl_BwbXrtgQP8bYsPNkFxDVPbJw4GWu READY with exact SHA and both production aliases verified; anonymous analytics, service-only audience/create RPCs and worker routes remain protected in live HTTP checks; no real campaign or message sent
- `output/analytics-campaigns/{local,release,build}-checks.json`: commands, runtimes and input hashes
- `output/analytics-campaigns/live-application.json`: exact live SQL and authorization evidence
- `output/analytics-campaign/{server-checks,sender-readiness,worker-source-review}.json`: independent checks
- `output/analytics-campaigns/publication.json`: exact GitHub/Vercel/production-alias verification
- Next: admin writes the actual offer/message and confirms the intended campaign in the page
