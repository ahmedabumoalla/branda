# Platform finance

Superadmin route: `/admin/finance`

- A collection voucher records a paid subscription and activates it in one database transaction through the existing approval function
- An open owner request is reused with its immutable annual/coupon price snapshot
- A new manual request uses the current monthly price for 1/3/6/12 months with the annual discount for 12 months
- New coupon claims continue through owner checkout before collection
- Expenses record provider, category, actual date, currency, manually supplied exchange rate, reference and private receipt
- Posted vouchers and evidence cannot be edited or deleted through client grants
- Stable UUID and receipt SHA-256 make retries idempotent
- Normal approval also creates exactly one collection voucher using its unique request ID
- Historical approved positive payments are mirrored without changing subscription state
- PDF/JPEG/PNG uploads are limited to 4 MiB for the production request limit
- Interrupted pre-post uploads can leave unreferenced private files retained for safe retry and never counted as vouchers

## Existing group integration

Exclusive Address: `C:/Projects/pixis-group`, local frontend `http://127.0.0.1:5173`
Destination `fkxilqxamssojkkpuxtm` calls the existing signed source bridge in Branda `kpguwjfkkylrdlvzeezz`
No secret rotation, access-grant changes or replacement bridge

`public.pixis_baranda_summary(date,date)` remains service-only and SECURITY INVOKER
Adds `paidHalalas`, `financeEntries`, `financeTruncated`, `paymentCategories`
`collectedHalalas` includes finance collections plus verified legacy gateway payments without a matching subscription/request voucher
Voucher dates own the reporting period even when approval occurs later
The newest 100 ledger entries are returned while totals/categories cover the full period
Private receipt paths, submitted payloads and signed evidence links are excluded

Group finance and Branda details now show source collections/payments/net/categories and a paginated ledger
Group-created receipt totals remain separate to prevent double counting
No automatic import into group receipts or guessed owner/profit distribution
The source bridge is live; the group frontend is local with no configured public deployment
