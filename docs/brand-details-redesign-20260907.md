# Brand details redesign — 2026-09-07

Production: dpl_9WwzDg8unAzAxmJUkXyHbhpi1U9B (barndaksa.com).
Rollback: dpl_2N1X7DXSGdapJ5ujLkr1ePjw5wJZ.

Replaced the long brand details overlay with a summary and six native dialog sections: account, subscription, services, standalone menu, analytics, and support. Scoped IBM Plex Arabic/Latin fonts reuse existing licensed font assets. Services retain existing validated admin actions, searchable controls, draft persistence, and explicit saving. Subscription changes require the Apply button.

Released from `.codex-tmp/brand-details-release-20260907`, reconstructed from 876 production source files verified by SHA-1. Only the admin page, new dialog component, and its CSS were overlaid. Unrelated workspace edits and the temporary development fixture were excluded.

Validation: text integrity, TypeScript, and Vercel production build passed. Scoped ESLint has no errors; the existing admin table image retains its pre-existing Next image warning. Browser review covered desktop and mobile, all six sections, service search and empty results, unsaved draft retention, Escape returning to the overview and restoring focus, and subscription controls without executing mutations. Local backend data was unavailable, so local UI review used a temporary synthetic fixture which was removed. The live admin page subsequently loaded 22 brands and the new Double B Bistro dialog was verified. Staged admin and Shahi menu alias returned HTTP 200; the menu rewrite remained intact. Existing server-side admin authorization remains unchanged. No schema or Storage policy changes.
