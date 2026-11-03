# Approved menu as the default for new brands

- Fixed the missing rollout: the approved SignatureMenu layout previously applied only to a fixed list of slugs
- All cafe and restaurant accounts created from 2026-11-03 00:00 Asia/Riyadh now select this presentation automatically from their existing database creation time; every future onboarding path is covered without registering slugs
- Current reported account: Qalat Damascus, brand-067febfb04db, created 2026-11-03T22:29:23Z; now uses the approved presentation
- Older menus and all explicit brand designs keep their presentation; salons and gift shops keep their dedicated experiences
- Actual owner logo, safe saved brand colors and owned background are read after the current status/package authorization gates
- Account name replaces the platform logo when no logo is uploaded; shared decorative hospitality photograph provides an empty-account hero until the owner supplies a background
- Original logo colors remain intact, color tokens correct unreadable combinations, and reduced-motion, keyboard focus, mobile layouts, search, product dialogs, offers and actual enabled loyalty are retained
- Tenant ownership is enforced separately before signing background/logo files; invalid colors and foreign paths never enter rendered identity; subscriptions, products and loyalty settings are not modified
- New account loading uses a neutral matching presentation while identity is authorized and loaded; existing named loading screens remain intact
- The new layout applies to branch menus too, and share links retain the selected branch
- No database migration or customer actions required; no application browser inspection
- Evidence and actual check input identities: output/default-menu/{local,release,build}-checks.json and {local,production}-runtime.json
- Publication evidence: output/default-menu/publication.json; production tag default-signature-menu-20261104

Implementation: lib/menu/default-signature.ts, lib/data/standalone-menu.ts, app/menu/[slug] and shared signature menu components
