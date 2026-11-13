# Pager operating board

User approved publication on 2026-11-13 after the local preview. Release is isolated from concurrent ERP changes and based on production ae5203024c8129a9682b6a3d33561798076ec8bd.

The console now keeps entry and two queues visible: awaiting call and awaiting collection. Each lane uses its own existing authorized server filter and pagination, so called orders are not hidden behind the first page of uncalled orders. Search applies to both lanes; history remains a separate view. Invoice Enter focuses the phone field. Calling exposes collection as the next primary action, and message status and call time remain visible. Native companion, PiP, staff/owner access, branding, English/Arabic and uncertain-network create idempotency remain intact. Existing server newest-first order is unchanged.

No database or provider configuration changes. Backup-only sender policy still controls permitted messages; no promotional or test WhatsApp messages were sent. The development-only /pager/preview route uses an isolated in-memory adapter and returns not-found in production.

RUN in the isolated release on 2026-11-13: Node v24.19.0, 58 pager UI/permission/preview cases, full TypeScript, scoped ESLint and text integrity PASS. Scoped git diff check PASS. No browser inspection; local preview HTTP200 was previously verified. Production build and exact deployment/alias checks follow publication. Evidence is in the primary workspace .codex-tmp/pager-board-20261113/deployment.json; final SHA and verified deployment state are recorded in task-state. No unrelated local source or ERP work is part of this release.
