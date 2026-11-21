# WhatsApp access-only switch, 2026-11-21 (Claude)

State: PUBLISHED 2026-11-21 on the user's explicit instruction to stop the messages now, pushed to main in the commit that carries this line. The switch is ON

## Why

Branda's primary WhatsApp number was restricted for 24 hours, the fifth restriction. With the primary unavailable, customer messages, mainly the loyalty card link sent to new customers, were leaving through the standby number. The user asked to stop them at once so the standby number is not restricted too, to keep only verification codes and the login message an administrator sends to a brand owner, to send nothing on self-registration, and to clear what is waiting so nothing goes out when sending resumes

## The switch

`next.config.ts` sets `env: { BRANDA_ACCESS_MESSAGES_ONLY: "true" }`. Next.js bakes the value into the server code at build time, so no Vercel setting is needed. `isPlatformAccessOnly()` in `lib/whatsapp/green-api.ts` reads it

To resume: set it to `"false"`, run `node scripts/check-whatsapp-access-only.cjs`, and deploy. Read "Before resuming" first

## While the switch is on

Still sent from Branda's numbers, primary first and standby when the primary is restricted:

- Verification codes, every entry point
- The login message an administrator sends to a brand owner from the administration (`sendGreenApiOwnerWelcome`)

Refused before any request reaches either number:

- Loyalty card links and welcome messages to customers
- The welcome message after self-registration, and the follow-up tutorial clips for owners
- Cashier and sales cashier welcome messages. Staff still sign in with a verification code
- Invoices and receipts to customers, shift alerts, menu feedback notices
- Pager and salon messages
- Subscription renewal reminders
- Platform marketing campaigns
- Hospital order messages
- Birthday greetings and the Loco redemption notice

Not affected: senders that a brand connected itself (Loco, Wahed Masoub and brands with a private connection). Their messages leave from their own numbers

## What happens to waiting messages

- Card link jobs of Branda's numbers are claimed and closed as `skipped` by the worker, up to 40 per run, so the queue empties and nothing is sent late. `lib/loyalty/read-card-links.ts`
- Pager jobs are closed as failed, salon jobs as uncertain, receipts and shift alerts as unknown, tutorial clips as rejected. These are final states in the existing code and are not retried
- Birthday greetings and renewal reminders are not claimed while the switch is on. They are bound to their date or deadline

## Notifications number, 2026-11-22

The user named 0558891694 the notifications number, also the second standby number (رقم رسائل الإشعارات أو الرقم الاحتياطي الثاني), and asked that the loyalty card link message leave from it

- Checked with the partner key, read only: the number is on a partner instance that is paid and authorised, and it is neither the primary nor the first standby. The record showed an expiry date of 2026-11-22 23:57, which may be the daily partner billing rolling forward; it was not expired at the check
- `lib/whatsapp/notification-sender.ts` finds the instance by the phone WhatsApp reports, on the partner account, at run time. No instance key is in the code and no deployment setting is needed. The result is cached for three minutes, a miss for one
- `lib/loyalty/read-card-links.ts` sends the card link of every brand without its own sender from this number. While the access-only switch is on and the number is unavailable, the jobs are closed as skipped. With the switch off, Branda's primary is only the fallback
- The access-only switch is unchanged: the primary and first standby still send only verification codes and the administrator's owner login
- The real selection code was run against the provider with the local settings: 4 read-only requests, the right instance found, nothing sent
- `scripts/check-notification-sender.cjs`: 17 checks. No test message was sent, and the production settings were not read, so that production holds the partner key is inferred from the brand connection feature using it there

Risk stated to the user: this is the same kind of message from another ordinary number through the same unofficial gateway, so this number can be restricted too. The lasting fix is Meta's official platform

## Manual card message

The user asked for the customer's card message to be available for copying and sending by hand. In the brand dashboard, the customer file in the loyalty customers directory (`components/loyalty/customer-directory.tsx`) now has a block "رسالة البطاقة": the button builds the same message the platform sends after a stamp, with the customer's personal card link valid for 30 days, and offers copying it or opening WhatsApp on the customer's number with the text filled in. It is built only on request, after the directory's own authorisation for that brand and customer, and nothing is sent by the platform. New files: `lib/data/loyalty-customer-card-message.ts`, `app/actions/loyalty-customer-card-message.ts`, `components/loyalty/customer-card-message.tsx` and its CSS, `scripts/check-loyalty-customer-card-message.cjs` (16 checks). `scripts/check-loyalty-directory-ui.mjs` gained one stub line for the new component and still passes 26 checks

Not verified in a browser or against the live database. The wording is the new card wording when the card holds its first stamp and the stamp wording otherwise

## Before resuming

- Card link jobs created in the last minutes before the switch is turned off may still be waiting. Leave the switch on until the worker has had a few minutes with no new stamps, or accept those few
- Jobs older than 24 hours expire by themselves in `claim_stamp_card_link_v2`
- No database change was made and no queue was counted: this work had no database access

## Files

- `lib/whatsapp/green-api.ts`: `isPlatformAccessOnly`, `isGreenApiPlatformSender`, the refusal in `requireDeliveryConfig` and `sendGreenApiCustomerMessage`, and the separate kind `owner_handoff` for the administrator's login message
- `lib/whatsapp/company-document.ts`: tax invoices never use Branda's numbers while the switch is on
- `lib/loyalty/read-card-links.ts`: waiting card links are closed unsent
- `next.config.ts`: the switch
- `scripts/check-whatsapp-access-only.cjs`: 36 checks, no live request

## Checks

- New check: 36 pass
- The 16 related checks that passed before still pass. Ten related checks were already failing before this work and were left alone
- Text integrity, full production build with TypeScript, deployment size guard: pass
- The compiled server code contains the value baked in (`"true".trim()==="true"`) for both the sender module and the card link worker

## Deployment

Switch: commit `beffa199` on main, Vercel build pending 20:28:03Z, success 20:29:55Z, 1 minute 52 seconds. The GitHub guard check passed, the live site moved to deployment `dpl_EgXvfiz1iMCs2PZs5qqUtrey8rGT`, and 100 recorded live answers were identical before and after. Deployment size guard check passed on the commit before the push

## Not verified

- No message was sent as a test, and the live queues were not read. That the standby number stopped sending card links is to be confirmed by the user from the phone
- The decision to hold pager and renewal messages too follows the user's words "keep only verification codes and the login data"; they can be allowed again separately on request
