# Salon booking loyalty welcome

2026-10-28

- A successful salon booking enrolls an eligible customer through the existing direct enrollment rules and queues one WhatsApp welcome with their private loyalty card link
- Booking retries reuse the existing result and cannot duplicate the welcome; existing profiles and cards are reused without adding stamps or rewards
- Booking confirmation remains a separate owner decision; the welcome explicitly says the appointment awaits salon confirmation
- Blocked, conflicting or mismatched existing identities are not overwritten; an unavailable loyalty program does not prevent booking
- Card links use a separate capability from the booking portal, expire after 30 days and create the existing brand-scoped HttpOnly loyalty session; disabled programs/blocked profiles cannot use the link
- Existing coffee, cashier, card download and loyalty reward behavior is preserved
- Active salon direct loyalty links now resolve the same brand metadata as the standalone salon page, including unlisted development salons; inactive/deleted salons and private non-salon brands remain unavailable and directory listing flags are unchanged
- On mobile, the grooming photograph covers the whole opening screen behind the logo, heading and booking button, with a dark readability gradient and responsive high-resolution image selection; desktop layout is preserved
- The development salon's previously missing program was initialized with current salon defaults, seven stamps and the salon reward wording; existing program rows were not overwritten
- User-requested demo catalog: four available services with matching visible salon categories, shared by the owner catalog and public salon page: haircut SAR40/30min, beard trim SAR25/20min, haircut and beard SAR60/45min, facial care SAR50/30min. Seed restricted to mens-barbershop-dev and idempotent by active service name; no other brand changed

## Database and verification

Migration 20261028112316 applied to baranda / kpguwjfkkylrdlvzeezz with exact source MD5 caca8e2a416f90f589772bdb6981cc97. New functions are service-role-only; old workers exclude the new welcome kind during rollout

Live preflight and post-apply rolled-back checks verified profile/card creation, same-booking retry, one welcome, separate link capability, one-time dispatch and restricted grants. Fixture booking/profile counts verified zero afterward. No real customer message was sent by these tests

SQL80 and salon52 checks, root/release TypeScript and text integrity, scoped lint/diff and Node24 Next 16.3.8 Turbopack build pass. Browser checks at 390/320/1440 verified loaded full-screen image, no horizontal overflow, four real services, visible loyalty, service preselection and modal dismissal. Evidence: output/salon-fullscreen-browser.json and exact source hashes in output/salon-loyalty-welcome-verification.json. Production publication: output/salon-loyalty-publication.json. Release marker: salon-booking-loyalty-20261028

The earlier Supabase account issue is resolved. This release follows public salon design commit f30bfa1dacf05d79265c6c7df76da75120a18b41 and completes its pending booking-to-loyalty integration. Provider delivery to a physical phone has not been verified for this new welcome message

Demo catalog live evidence: output/salon-demo-services-verification.json
