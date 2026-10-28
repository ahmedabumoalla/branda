# Cashier receipt delivery recovery

2026-10-28

Invoice 37 in test-cafe was committed with its customer phone and loyalty linkage, but the message job ended as unknown with no provider ID. The old worker collapsed rendering and transport failures into the same code, so the precise historical exception cannot be recovered from that row

Read-only investigation verified the exact production sale/sync request, healthy local and production PDF rendering, successful rendering of the saved invoice, an authorized WhatsApp instance and no matching invoice PDF in the recipient's recent history or provider queue. A synthetic receipt sent to the previously authorized test number was independently confirmed delivered

Changes: give PDF uploads a bounded 45-second timeout independent of the 10-second text-message timeout; retain safe HTTP/timeout/missing-ack error codes; distinguish pre-send renderer failures from uncertain sends; retry only one quick pre-send rendering failure. Provider sends and uncertain outcomes are never automatically repeated. Logs contain only job IDs and safe codes, not phones, documents, secrets or raw provider responses

Transport and worker regression tests, root/release TypeScript/text, application source lint, diff review and final Node24 Turbopack build pass. Applying the TypeScript import lint rule to the existing CommonJS test harnesses reports their pre-existing require imports; these harnesses execute successfully and were not converted or lint-suppressed

No schema, invoice, sale, stamp or reward changes. Recovery is scoped to the single failed invoice37 outbox job after provider history/queue review; older unknown jobs remain untouched. Exact recovery/delivery and production evidence is recorded in output/invoice37-recovery.json and output/finance-receipt-reliability-publication.json. Verification: output/finance-receipt-reliability-verification.json
