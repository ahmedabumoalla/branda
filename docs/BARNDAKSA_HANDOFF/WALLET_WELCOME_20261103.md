# Wallet download welcomes

- User authorized a brand-named WhatsApp welcome after loyalty-card download and confirmed they will reconnect the primary sender
- Primary sender ONLY; standby401 remains reserved for access OTP and owner credentials
- Apple pass issuance and Google save-link issuance schedule background sending after the response; this is not confirmation of installation in the wallet
- Future live download/save-link audit events enqueue one welcome per brand/customer atomically; no historical backfill or bulk customer send
- Copy uses the current brand name, stamps and reward; active card/customer/brand/program and loyalty entitlement required
- Private RLS queue and service-only claim/finish RPCs with empty search paths, tenant joins, row locking and claim tokens
- Disconnected sender defers work to the existing five-minute wallet cron; pending expires after24h; ambiguous POST or crashed dispatch never auto-retries to avoid duplicate welcomes
- Provider acknowledgement recorded as queued, never described as delivered

## Verification 2026-11-03

- Root TypeScript/text, sender/worker/Apple+Google route mocked regression and scoped ESLint passed
- Release worktree same affected source: regression/text/TypeScript/scoped ESLint/diff and Node24 Next16.3.8 production build passed
- Live production rollback-only SQL exercised dedupe, suspended-card guard, claim/finish tokens, stale/expired jobs and anon/service privileges; passed without sending messages or retaining fixtures
- Migration20261103090344 applied with exact version-controlled SQL and history; readback confirms trigger and service-only RPC access
- Publication evidence: output/wallet-welcome/publication.json; SQL validation scripts: scripts/prepare-wallet-welcome-sql.cjs and output/wallet-welcome/verify.sql
- No browser inspection, actual customer send or wallet issuance during validation
- Primary was notAuthorized at09:07:40Z; verify reconnection independently before claiming delivery
