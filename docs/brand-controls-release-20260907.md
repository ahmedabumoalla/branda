# Brand controls production correction — 2026-09-07

Production: `dpl_HQNGW3mxaTQVVv82foP4GBd3Pxih`, https://barndaksa.com.
Previous deployment / rollback: `dpl_9WwzDg8unAzAxmJUkXyHbhpi1U9B`.

The previous release introduced the brand details dialog but retained the expanded services/menu panel and inline subscription selectors. Local follow-up changes had not been published. This release removes those duplicate controls. The directory now exposes one management icon per brand; menu, services, subscription, status, activity, and customer information are reached through the brand file. Search/filter controls use a separate dialog. The directory uses the same local Arabic/Latin typography as the brand file.

Release source: `.codex-tmp/brand-controls-release-20260907`. Verified all 879 source files in the previous release against the active deployment SHA-1 manifest before overlaying exactly three files: the admin cafes page, brand details dialog, and its CSS module. No other workspace modifications were deployed. Existing server actions, authentication, database schema, and Storage permissions were unchanged.

Validation: text integrity and release TypeScript passed; Vercel production build reached READY. Staged admin and Double B menu routes returned HTTP 200 before promotion. After promotion, authenticated live UI returned 22 brand management icons, zero selects on the directory, one directory table, and no old expanded services panel. The Double B brand file and its menu section opened successfully. Earlier local desktop/mobile review covered dialog navigation, Escape/focus restoration, service drafts without saving, and filter dialog interactions. No production business data was mutated during verification.
