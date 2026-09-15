# Hidden platform scrollbars — 2026-09-07

Production: `dpl_dTgAR3EZYoumXnoLqzFNhoFDbeEz`, https://barndaksa.com.
Rollback: `dpl_HQNGW3mxaTQVVv82foP4GBd3Pxih`.

Changed only `app/globals.css` from the previous isolated production source. Applied scrollbar-width and WebKit scrollbar hiding globally, including nested panels and dialogs. Overflow behavior and mouse cursors are unchanged.

Validation: text integrity, release TypeScript, and Vercel production build passed. Staged admin returned HTTP 200 before promotion. Live computed scrollbar-width is none; a mouse scroll moved the root scroll position from 0 to 901. Local scrollable root, main, aside, section, and div elements retained overflow auto with hidden scrollbars.
