# OTP-only standby sender

User authorized standby 0508424401 (instance 770022788091) for verification codes only. Its private instance credential was recovered from the existing authorized partner inventory, without displaying secrets. Stored locally in both worktrees and as encrypted production settings in Vercel project branda-2:

```
GREEN_API_OTP_BACKUP_API_URL
GREEN_API_OTP_BACKUP_ID_INSTANCE
GREEN_API_OTP_BACKUP_API_TOKEN_INSTANCE
```

Both branded cashier/owner OTP and queued Supabase OTP share the failover helper. When a standby is configured, a bounded read-only provider state check selects the primary when authorized, otherwise the authorized standby. Explicit primary HTTP401/403/429/466 rejection permits one standby attempt with the same code. Ambiguous POST timeout, network failure, 5xx, or malformed/missing acknowledgement never causes a duplicate send. Existing admission, encryption and queue claims remain unchanged and bound to the primary logical provider. No database changes.

Non-OTP notifications and platform campaigns remain primary-only. Tenant marketing credentials explicitly reject the standby instance. A malformed optional standby cannot break a healthy primary. All credential access stays server-side with provider-origin validation and sanitized errors.

## Verification

- 2026-11-02T08:57:44.860Z: encrypted production settings read back and compared privately; primary notAuthorized, standby authorized; earlier phone check matched 966508424401. No live messages/accounts created
- Current-code mocked checks: OTP failover36, durable OTP12, partner8 groups, staff17, owner onboarding33, tenant marketing14 groups (including reserved standby denial), platform marketing57 PASS
- Root/release TypeScript and text integrity, scoped ESLint, diff review and Node24 production build PASS
- Evidence: output/otp-backup/configuration.json, verification.json (source/dependency hashes and execution time), build.log and publication.json
- Release tag: otp-backup-20261102; publication.json verifies exact GitHub main SHA, READY deployment and both production aliases

Provider acknowledgement means queued, not confirmed WhatsApp delivery. Actual recipient delivery was not exercised. If a sender disconnects after the preflight but the provider already accepts the message, no second automatic submission is made. Primary is preferred again on subsequent OTP requests once reauthorized. No browser inspection
