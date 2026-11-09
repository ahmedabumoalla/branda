# Finance pilot — 2026-11-09

User authorized resuming real finance activation, verification and gap closure, retaining the current UI. Selected production cafe: test-cafe (2e08901c-5aac-4bec-8c97-a135058e508b). This supersedes the historical STOPPED status only for the new authorized work.

## Delivered pilot slice
Existing financial core was already enabled:30documents,82journal lines, no inventoryitems. Balanced initial journals andinventory/GLzero. New ledger link inside existing reports; draft/submit/independentapproval/post/reverse, audit history, hierarchical manualaccounts, period controls and ledger/trialbalance CSV. Other brands retain current UI and behavior. No changes to French daily cap.

Manual ledger lines/accounts are limited toexpense/revenue/equity; treasury andcontrolaccount postings remain in their established specialized workflows. NewpilotRPC andtriggers gatedserver-side usingprivategl_rollout. Lasteditor andcreator cannotapprove whenmakerchecker enabled. Periodclosure blocks today/future, openshifts/unreceivedcustody andpending submitted/approvedjournals. Legacydateclosure cannotbereopened via newUI. Olddirectjournal forpilot redirects toapprovedworkflow via explicitdenial. Successfulreadretry clears readerror but keeps unresolvedsaveerror anditsrequestID.

## Verification and limitations
Evidence: output/finance-activation. Node24.22.1, PostgreSQLlocal55439 isolatedrandomdatabases destroyed. Existingcore suites: inventory352,roles349,offline29+POS112,basic88,treasury98; counts overlap andmustnotbesummed. Newledger87 checks includesindependentsession races. UI61 actualcomponent/action-boundary testswithcontrolledRPC; type/text/lint/webpack PASS. Previousbuild precedes retryfix andisstale; currentchecks-build.json is authoritative afteritsinputhashes match.

Productionfullchain16checks inROLLBACK: purchase/sale/dedup/partial+fullrefund/stockGLbalance/no customerphone plusGLdraft/independentapproval/selfdeny/post/replay/reversal/balance/currentdaydeny. All testfinancialtransactions rolledback. ActualSupabaseAuth existingowner context/snapshot/protectedHTTPpages tested; noemailsent, generatedtestsession locallyrevoked. These arenotbrowserinteractionorphysicalprinterchecks.

Migration20261109185151_finance_ledger_pilot.sql applied separatelywithidentity/functionhashguards, preserving44business tables and6existingprotectedfunctions includingFrenchpolicy. Newcolumns onbf_accounts do notchangeexistingamounts. Finaldeployment/API/DB/advisordelta proofs recordedseparately; push aloneisnotdeployment.

## Still pending outside this completed slice
Historical isolatedfinancialpackage remains IN_PROGRESS. Recipes/version approvals, manufacturing/WIP, landedfreight reversal afterconsumption/revaluationprovenance, foreignprocurement/FXlinkage, warehouse/report integration andfinal145rowcoverage still need selectiveintegrationandfullverification. Do notcopythe48migrationpackage wholesale orapplyempty20261110113500_stock_value_ledger. Production test-cafe isNOTlocalcoffee demo3032; preserveexistingpreviewdatabasesanduserwork. Physicalthermalprinter andexternalpayment/einvoicingproviders areunverified. No blanketproductionrollout yet.

## Rollback
Revert onlythisapplicationcommit andsetbrand_finance_private.gl_rollout.enabled=false forpilot ifneeded. Keepnewtables/historicaldrafts andneverdropfinancialrecords. Otherbrands remain disabled. Do notrestoreoldfunction wholesale orundoFrenchpolicy.
