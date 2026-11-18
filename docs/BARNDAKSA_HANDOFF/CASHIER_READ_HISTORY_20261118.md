# Cashier scan history and copied phone normalization

User reported two red device counters for LA GIOIA and requested a dedicated loyalty-sidebar scan log. The brand's server queue had no received operations at 10:18:56Z. The supplied phone contained Unicode direction isolates around the number; the previous detector treated it as a card code and rejected it before enqueueing. No customer phone value is retained here.

Normalize invisible bidi/format characters before method detection and validation on both client and server. Copied Saudi phone formats retain spaces/country prefix support and normalize to the same idempotent device request as their local format. Other code/phone validation, tenant authorization, finance approval, retry and duplicate guards remain.

New owner route `/dashboard/loyalty/reads` opens the existing authenticated, tenant-scoped read history directly, with loyalty entitlement and owner/manager checks. Sidebar label: cashier scan history. The existing cashier activity page remains. Device-only failures appear immediately in the cashier with their actual error and masked identifier; counters are labeled filters. Pending device saves no longer look like confirmed green success. Only server `succeeded` status confirms a stamp.

No original failed reads were replayed, no stamps or real test messages were issued. Existing rejected device entries remain; refresh and re-enter the phone once after deployment. The connected inspection browser had no cashier outbox, so actual user-device error rows could not be read. Root cause was reproduced using the exact formatting pattern in isolated client/server tests.

Validation: 16 outbox groups including Unicode normalization and idempotency, 16 server groups including tenant/role guards and formatted-phone parsing, read-history UI states/filter/retry tests, scanner SSR/accessibility and authorization suite. Scanner expectations updated for the explicitly requested visible history and already existing finance session guard. Full TypeScript and scoped text integrity are recorded in task state. No new database migration in this follow-up.
