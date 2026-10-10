# Customer intelligence

The platform admin customer directory aggregates the existing normalized phone/account/profile identity rule across brand memberships

## Measurements and provenance

- Existing loyalty audit and wallet events remain the sources for card scans, stamps, redemptions and wallet activity
- Registration, card issuance and reward issuance are distinct timeline events and do not imply an active browser session
- Browser visits use the authenticated server session only and never match an anonymous visitor cookie to a phone number
- The latest non-conflicted profile identifies the account when old profiles disagree so a browser session is not counted against multiple identities
- Browser sessions cover the published standalone menu and loyalty views plus menu-to-loyalty clicks
- Device family, operating system and browser are derived from the request user agent without storing the raw header or claiming an exact handset model
- Active duration requires a visible focused page and interaction within 60 seconds
- Heartbeats are cumulative and idempotent with a 45-second server elapsed-time cap per report and a per-account clock to avoid double counting overlapping tabs
- The first authenticated report starts at zero credited time even if the page was open before login
- Historical device and duration values remain unavailable and the UI states the recording start date
- A loyalty URL carrying the QR source is a QR-link visit and is not proof of a camera scan
- Membership counts describe actual saved relationships and visiting another brand does not create a membership

## Boundaries

Private telemetry tables have RLS enabled and no direct API grants
Only the server recorder can write after validating the authenticated account and public service entitlement
Directory and detail RPCs require an active platform admin
No credentials, private card codes, wallet device identifiers or raw user agents are returned
Search, filters and timeline pagination execute on the server

Migration: `20261010010926_customer_intelligence`
Focused checks: `check-customer-intelligence-db.mjs`, `check-customer-usage.mjs`, `check-customer-intelligence-ui.mjs`, `check-brand-analytics.mjs`
