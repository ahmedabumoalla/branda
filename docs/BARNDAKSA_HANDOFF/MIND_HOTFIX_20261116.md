# MIND operational hotfix - 2026-11-16

- User requested urgent production repair while at the customer
- Hospital menu submission accepted RFC-only UUIDs, rejecting imported PostgreSQL-compatible menu IDs. Product IDs now use GUID shape validation; database tenant, availability and pricing checks remain authoritative. All 111 current MIND catalog IDs accepted by the corrected schema; malformed IDs remain rejected
- MIND POS sales history may post refunds directly with existing employee permissions, original invoice ownership, authoritative quote, cash/shift checks and idempotency. Other brands and dashboard approval behavior unchanged. Migration 20261116194500 applied through reviewed SQL runner after transaction rollback rehearsal, no business refunds created
- Preserve all unrelated local Aldeem work and current production changes. Release prepared from origin/main in isolated worktree
- MIND loyalty saved and read back: enabled, 5 stamps, 10 percent discount reward. No messages or historic invoice backfill triggered
- POS message queue honors MIND invoice preference independently from loyalty configuration; card link suppressed for recorded downloads. Deploy updated worker before applying message migration 20261116185000
- Verification: full release TypeScript and scoped text integrity; 111 live catalog IDs schema-validated. No browser, retained test financial writes or test WhatsApp sends
- Production deployment and message migration final readback tracked in current task record
