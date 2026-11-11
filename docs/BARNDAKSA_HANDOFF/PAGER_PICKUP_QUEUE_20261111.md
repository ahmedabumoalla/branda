# Pager single pickup queue - 2026-11-11

The latest user direction supersedes the initial request for a preparation dialog: remove the preparation stage from the operator interface and put every active invoice directly under Ready for pickup. The user explicitly chose manual Call; invoice creation must not send a ready message

One pickup button counts uncalled and called active orders. Staff, owner and retained-workspace preload all request the existing server-paginated active filter, including older uncalled invoices. A large viewport-bounded native dialog gives invoices their own scroll area, 42px invoice references and 56px call targets. Search/history, explicit Call and collection-after-call remain. Closing returns focus to the opener and preserves drafts; polling/session cache/brand palettes and nested PiP behavior remain

Backend waiting/ready values continue to distinguish uncalled/called orders; they are not separate operator queues. No status migration, automatic dispatch, financial changes or business-data writes were performed. Existing authorized call and collection actions continue to control the durable reminder lifecycle

Validation on Node24.19.0: 62 pager behavior/UI checks,18 staff workspace checks, TypeScript noEmit, text integrity, scoped ESLint and production webpack build PASS. Two pre-existing sequence-ref cleanup lint warnings remain. Earlier test expecting a separate waiting queue failed after scope changed; it was corrected to assert the unified queue and then passed. Input hashes, commands and actual run times are in PAGER_PICKUP_QUEUE_20261111_CHECKS.json

Responsive/RTL/keyboard/modal/overflow review used source, CSS compilation and handler tests; no browser, physical companion test or outbound customer message. Production target remains main / branda-2 / barndaksa.com, on top of aa83bed6dc525c3e8c1646d55a1e9d7cbce70fdc. Exact deployment verification is recorded in the local current task record after publication
