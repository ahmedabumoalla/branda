# Brand name persistence

- Published 2026-11-06T08:38:26.245Z: GitHub main `69af5c660899efb35c865f4f3ce466e60b4d9b51`, Vercel `dpl_CTCHC9hFC51QbVYAXiKC6Cjdgeg2` READY on both production aliases
- Root cause: the save action omitted cafeName and the DAL only wrote cafe_settings, while reads use cafes.name
- The narrow authenticated save_owner_cafe_settings RPC now saves the name and allowlisted settings atomically and returns the confirmed rows; errors or zero-row updates do not report success
- Active profile and existing settings permission required; administrator writes additionally require a valid signed maintenance session for the same actor and brand in the server layer
- Cafe identity, slug, ownership, category, programs and subscriptions cannot be changed through this RPC
- Settings UI uses the server response, invalidates the shell cache and ignores stale requests; pending logo previews survive a failed save for retry
- User-requested name corrected to «بار ضباب» for brand-8ad185ee82e3 through the name-only RPC; independent SQL and public HTTP reads verified persistence, all other settings preserved
- Migration 20261106082023 applied with exact MD5 172a70ab834173152755b978fe67aaf3; real-owner SQL rollback and grants checked before application
- Release Node24 text integrity, TypeScript, backend9, database44, UI8, owner-service31, LOCO regression20+13 and webpack build passed
- Changed backend/cache lint passed; the two existing React-effect errors and two existing warnings in settings/layout remain identical to HEAD, with zero new diagnostics (output/settings-name/lint-baseline.json)
- Local/live HTTP8 passed; no browser, customer message, wallet issue or WhatsApp provisioning was performed
- Evidence: output/settings-name; source/dependency hashes and actual runtime recorded
- LOCO connection feature remains published; owner still needs to scan its QR as described in LOCO_WHATSAPP_CONNECTION_20261106.md
- Name persistence is complete; subsequent LOCO QR recovery and owner scan step are documented in LOCO_WHATSAPP_CONNECTION_20261106.md
