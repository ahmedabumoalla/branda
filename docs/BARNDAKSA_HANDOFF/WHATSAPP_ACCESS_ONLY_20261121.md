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

## Not verified

- No message was sent as a test, and the live queues were not read. That the standby number stopped sending card links is to be confirmed by the user from the phone
- The decision to hold pager and renewal messages too follows the user's words "keep only verification codes and the login data"; they can be allowed again separately on request
