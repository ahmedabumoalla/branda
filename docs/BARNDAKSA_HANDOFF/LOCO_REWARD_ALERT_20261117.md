# Loco reward redemption WhatsApp notice (Claude) - LOCAL, NOT PUBLISHED - 2026-11-17

## Request

Loco only: when a customer redeems a reward, the brand gets a WhatsApp message from the Branda number naming the customer, the customer phone and the employee who redeemed it

## Built (branch feat/loco-reward-alert in C:/Projects/branda-loco-staff, not pushed)

- lib/loyalty/loco-redemption-alert.ts: notifyLocoRewardRedeemed runs after the redemption commits through next/server after, so the cashier is never delayed. It returns immediately for any brand other than LOCO_CAFE_ID
- It re-reads customer_reward_instances and sends only when the status is redeemed. Recipient: cafe_settings.whatsapp, otherwise the owner's profile phone (Loco has no settings number today, so the owner phone is used)
- Sent through the platform Green API sender (sendGreenApiLoyaltyWelcome). One message per reward: a deterministic cafe_operation_events row (loyalty_reward_redeemed_alert) is claimed before sending and records queued, rejected, unknown or not_configured. Uncertain sends are never retried
- Hooked paths:
  - cashier loyalty reader redeem (scanLoyaltyExperienceAction)
  - cashier reward redemption (redeemCashierCustomerReward, loyalty and non-loyalty instances)
  - finance POS sale with redeemRewardId; the employee name comes from the auth user metadata
- Legacy experience-review submissions that are not reward instances are not covered
- No database change. TypeScript and text integrity pass. No message sent and no browser test

## To publish

Push the branch, verify the Vercel preview, fast-forward main, then verify production. No migration needed
