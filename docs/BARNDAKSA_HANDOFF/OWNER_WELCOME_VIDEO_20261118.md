# Owner welcome video — 2026-11-18

Requested: attach supplied loyalty-account setup video to successful brand self-registration and the super-admin owner-login handoff.

- The supplied MP4 is copied unchanged to public/guides/owner-loyalty-setup-20261118.mp4: 17,122,204 bytes, H264/AAC stereo, 69.3 seconds, SHA256 945c02ddfa93742090c0a6947c172e6b2d2fc3d039a1f1dcd89d3f7d14c4e574. Audio measured mean -18.0/max -1.7 dB on the source.
- Verified self-registration schedules one welcome video with Next after only after createUser succeeds. Account creation/login does not wait for media delivery. The chosen password is never included. Provider failure logs a generic warning and does not turn account creation into failure; this is best-effort submission, not a durable retry queue.
- Super-admin handoff uses the existing authorized claim/finish flow and includes video, login details and existing subscription/trial terms in one caption. Captions have a 1024-character guard; unusually long mixed-plan names fall back to referring to dashboard terms. No database/subscription changes.
- Existing explicit-refusal failover retained; uncertain POST outcomes never auto-retry. Provider acknowledgement means queued, not delivered/read.
- Provider contract checked: https://green-api.com/en/docs/api/sending/SendFileByUrl/ (100 MB, caption 1024, MP4 native media). No recipient credentials are added to the public asset. No customer messages/test accounts created; no browser inspection needed.

Verification and deployment results are recorded below after completion.

29owner-welcome,80signup,41cashier regression cases and full TypeScript/scoped text passed 2026-11-18T20:37:07.363Z; exact commands/runtime/input hashes in output/owner-guide-20261118/checks.json. Publication pending

Published source a59cb54261d2df3be788fca9bb65cabf90e132df; Vercel dpl_9cjoB1tt7QDWRaJDg8dcwzrsPQoJ READY both production aliases 2026-11-18T20:58:44.547Z. Public MP4 full hash matches original audio/video,200/17122204bytes and range206; register200 verified 2026-11-18T20:58:58.314Z. No actual WhatsApp send/device delivery test. Evidence output/owner-guide-20261118/{checks,live,deployment}.json
