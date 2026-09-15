# Brand-scoped operations center — 2026-09-07

Production: `dpl_DAeMvsAk8siSxZrf4LvxMscWAWXu`, https://barndaksa.com.
Rollback: `dpl_dTgAR3EZYoumXnoLqzFNhoFDbeEz`.

Moved the operations center into a seventh icon in the existing brand file dialog, reusing its typography, tile styles, dialog focus handling, and mobile layout. The new panel loads only on opening. It includes date filters, seven metrics, existing detailed event tables, and the existing brand-scoped PDF export. Removed the standalone sidebar entry; the old URL redirects to the brand directory.

A validated server action delegates to the existing platform-admin-only data service and returns only the requested brand. Unknown brand IDs no longer fall back to an all-brand operations query. No schema, RLS, Storage, or business-data mutations were introduced.

Release source: `.codex-tmp/brand-operations-release-20260907`, copied from the immediately preceding production source with exactly eight relevant files overlaid. Unrelated workspace edits excluded.

Validation: release TypeScript, text integrity, and Vercel production build passed; scoped ESLint had no errors (three existing unused sidebar imports remain). The previous URL returned HTTP 307 before promotion and redirected to the directory in the live authenticated browser. Live Double B Bistro operations loaded all seven metrics; app-download details displayed nine rows. A future date filter produced zero metrics and empty-period messages; reset restored all-period results. At a 390px viewport, both open dialogs had equal client/scroll widths of 352px with no horizontal overflow. Desktop and mobile screenshots reviewed. PDF export implementation was retained and reviewed, but no physical print or PDF save was executed during validation.
