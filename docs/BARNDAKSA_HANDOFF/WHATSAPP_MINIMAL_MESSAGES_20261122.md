# Minimal messages from Branda's numbers, 2026-11-22 (Claude)

State: PUBLISHED to main on 2026-11-22 after the user read the message texts and wrote the publish word, pushed in the commit that carries this line, on top of `9eb4cecd` from Codex

## The user's plan

After cancelling the move to Meta the user stays on Green API and wants as little as possible sent from Branda's own numbers, so that WhatsApp does not restrict them. Brands that send from their own number are not to be changed or stopped. In the user's words, in substance:

1. Stop the card link message, including on the notifications number. Published first, on its own, as `26880562`
2. Only for stamp programmes: when a customer earns a reward, send a message in the brand's name saying which reward, and have them download the card then
3. The "your card is ready" message is retired. A stamp may be registered without the customer holding a card; the card download is asked for when there is a reward
4. No welcome message when a cashier is added. The employee only receives the sign-in code
5. On self-registration, no tutorial clips over WhatsApp. Instead a page opens with three icons: how to set up the account, how the employee registers a stamp, how the customer downloads the card. The user left the placement to Claude
6. For an account the administrator prepares and hands over, the login message and the clips stay
7. Each message ends with something that invites a reply; the user then preferred a rating to a question

## What was built

- Reward notice, `lib/loyalty/read-card-links.ts`: with `BRANDA_PLATFORM_CARD_LINKS` `"off"` and `BRANDA_REWARD_NOTICES` `"on"`, the job of a stamp that completed the card is sent from the notifications number with `rewardNoticeMessage`; every other job of Branda's numbers is still closed as skipped. A completed card is recognised by `stampsInCycle` being zero right after the stamp, because `apply_rast_loyalty_stamp` sets the count back to zero when it issues the reward
- Text of the notice, five short lines: congratulations with the brand name, the reward name, download the card and show it at the counter, the customer's card link, and a rating from 1 to 5 answered by replying with a number. One link only
- Cashier added, `lib/data/loyalty-cards.ts` and `components/dashboard/pages/operational-cashier-page.tsx`: while the access-only switch is on no welcome is attempted, the result is `code_only`, and the owner is told to share the cashier link
- Self-registration, `lib/auth/owner-onboarding.ts`: while the access-only switch is on no welcome is sent and no clips are queued, and the new owner is sent to `/dashboard/loyalty/guide?start=1`
- Tutorials inside the dashboard, `components/dashboard/tutorial-videos.tsx` on `app/dashboard/loyalty/guide/page.tsx`: three cards that open the three existing videos in a dialog, above the PDF guide. The page stays in the navigation as "دليل نظام الولاء", so the owner can return to it. An account registered without loyalty is sent on to `/dashboard`
- Administrator's handoff, `lib/whatsapp/green-api.ts`: the login message ends with a line asking the owner to reply, and the two follow-up clips are allowed with it (kind `owner_handoff`)
- Verification codes are unchanged, with no closing line: they are requested by the person who receives them, and extra text would get in the way of reading the code
- `next.config.ts`: `BRANDA_REWARD_NOTICES` `"on"`

## Limits known before publishing

- The database creates a message job only when the stamp is registered by phone number, the customer has no Apple Wallet registration, and no job exists for that card in the previous 24 hours. So a reward earned within 24 hours of an earlier phone stamp gets no notice. The user gave database access for this fix; Claude read only and changed nothing. Measured on 2026-11-22 over 14 days: 473 phone stamps, 15 rewards earned by phone stamp, 9 of them with the card in Apple Wallet, 5 with their own job, and 1 that reused an older job, the only case this rule affects. Claude advised leaving the function alone for that gain; the fix, if ever wanted, is to reopen a skipped job in `loyalty_read_private.process_one_before_employee_policy` when the stamp result is `reward_issued`, except for the two brands with their own sender
- A customer who keeps the card in Google Wallet gets no notice either; the wallet pass already shows the reward
- Brands with their own sender keep their existing card link message on every phone stamp and get no reward notice. The user asked that nothing be changed for them
- Replies are not read by the platform. They reach the phone that holds the notifications number
- Pager, receipts, staff messages of the finance package, reminders, campaigns and hospital messages remain refused on Branda's numbers by the access-only switch, as before

## Checks

- `scripts/check-minimal-platform-messages.cjs`: 13 checks, new
- `scripts/check-whatsapp-access-only.cjs`: 37, the follow-up clips moved from refused to allowed
- `scripts/check-notification-sender.cjs`: 56
- The 37 related checks are unchanged against the baseline (22 pass, 15 were already failing)
- Text integrity, full production build with TypeScript, deployment size guard: pass
- Not opened in a browser, no message sent

## To publish

Commit the branch, push to main, measure the build, then confirm from the provider's outgoing journal that the first reward notice leaves from the notifications number and that no card link does
