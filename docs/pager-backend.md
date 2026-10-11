# Pager backend operational notes

The initial ready notification becomes due immediately and a minute scheduler drains the queue
Without an immediate server worker kick it starts at the next scheduler tick plus processing time
This is a nominal minute service rather than an exact real-time timer

Successful reminders keep the previous scheduled phase in 60-second increments
The next due slot is the first future slot so provider latency does not accumulate into a two-minute cadence
Missed slots are skipped rather than replayed
Claim and final dispatch enforce a minimum 55 seconds after the last attempt to prevent unrelated worker kicks from producing near-back-to-back reminders
Scheduler delay or a provider request exceeding the usual latency can still stretch the interval
Failures use exponential backoff from 60 seconds up to 15 minutes

The cron worker processes at most 100 jobs per invocation in leased batches of 20
It starts another batch only within the first 15 seconds and completes the already claimed batch
Each batch uses five concurrent sends with a 10-second provider deadline and a 90-second lease
The route allows 90 seconds for the last batch plus database overhead
Immediate action kicks retain a maximum of five jobs
Large backlogs or slow providers may stretch the nominal reminder interval

Receiving or cancelling an order fences all future reminder jobs
An HTTP request already sent to the provider cannot be recalled
Provider acceptance is recorded as `provider_queued` and never presented as proof of delivery

Feedback tokens are HMAC-SHA256 values derived from a domain-separated order UUID and the existing server-only Supabase service-role secret
Only a SHA256 hash of each token is stored in the order
Operator lists never expose either value and the public feedback response never exposes phone numbers
Rotating the service-role secret changes the token generated for existing orders
Previously sent links remain valid because their stored hashes are unchanged
Before rotating that secret either drain pending rating invitations or implement an explicit old-key/rekey migration for unsent invitations
Do not blindly overwrite feedback hashes since that would invalidate links customers already received
