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

## Production

Commit `d7369f36` on main, on top of `c981a1d8` from Codex, Vercel build pending 23:54:48Z, success 23:56:45Z on 2026-11-21 UTC, 1 minute 57 seconds. The build on Vercel is the TypeScript run for the final commit. Deployment size guard: the wiring check passed before the push and the GitHub check passed on the commit. 100 recorded live answers identical before and after, and the three tutorial videos are served

Still to be seen in the provider's outgoing journal: the first real reward notice leaving from the notifications number. None had occurred at the time of this entry; at the measured rate there are about six in two weeks

## Bolingo exception, 2026-11-22 (Claude)

The user asked, in substance: turn the customer card messages back on for Bolingo and for no other brand, see which Bolingo customers were not sent their card and send it, and close the message with a rating or something that invites a reply. After Codex finished the cashier phone issuance (`f6240012`) the user said to publish the messages update

What was built

- `lib/loyalty/read-card-links.ts`: `PLATFORM_CARD_LINK_CAFE_IDS` holds Bolingo's cafe id (`dbe942ba-dfa4-422b-a9f6-9527c3b27cc9`). While `BRANDA_PLATFORM_CARD_LINKS` is `"off"`, a card link job of a named brand is sent from the notifications number instead of being closed as skipped. It is never sent from the primary or the first standby: when the notifications number is unavailable the job is closed as skipped like the others. The wallet check, the brand cancellation check and the send budget apply as before
- Text for a named brand, `stampCardLinkMessage(job, { rating: true })`, five short lines and one link: greeting with the brand name, "تم تحديث رصيدك في بطاقة الولاء" (or "بطاقة الولاء جاهزة باسمك" for a card created in the same operation), open the link to see and download the card, the customer's card link, and a rating from 1 to 5 answered by replying with a number. The wording suits stamps and points
- A named brand never gets the reward notice: a card on points always shows zero stamps, which the notice would read as a completed card
- Brands with their own sender keep the original text unchanged

What the database showed (read only, nothing changed, nothing sent)

- Bolingo's account was opened on 2026-11-21 and held four customers. Three keep the card in Apple Wallet; the fourth was sent the link on 2026-11-21 and has a Google Wallet card issued. No customer was missing a card, so nothing was sent again
- Bolingo is on points since 2026-11-22. A card link job is created only by the stamp path (`process_one_before_employee_policy`, phone method). The points path, including Codex's phone issuance of 2026-11-22 (`scan_loyalty_invoice_points_by_phone`, "No new WhatsApp flow"), creates no job

Known limit, told to the user before publishing: with Bolingo on points this exception alone sends nothing, because no job is created. The missing step is one database change: after a successful phone points invoice for a named brand, insert a job into `loyalty_read_private.card_link_jobs` under the stamp path's conditions (no Apple Wallet registration, no job for the card in the last 24 hours or still open, `card_created` for a card opened in the same operation, `ON CONFLICT(card_id, delivery_day) DO NOTHING`). The user has not yet said whether Codex or Claude adds it; Claude has no approval to change the database for it

Checks: `scripts/check-minimal-platform-messages.cjs` 19 (six new for the named brand), `scripts/check-whatsapp-access-only.cjs` 37, `scripts/check-notification-sender.cjs` 56, text integrity, TypeScript, deployment size guard. Not opened in a browser, no message sent
