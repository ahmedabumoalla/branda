# Standalone public menu

Route: `/menu/[slug]`. Initial brand: `double-b-bistro` (cafe ID `bb404c1a-a439-41ab-aed8-ea0c17875bd9`).

## Publication

Publication is explicitly opted in using the existing `brand_feature_overrides`
table, with `feature_id = 'standalone_menu'`. No row means unpublished. This is
an independent publication setting, deliberately not a subscription entitlement
or a package-assignable registry feature. It follows the existing auxiliary-key
pattern used by `battle_arena`. No schema or RLS changes are needed.

Platform administrators control publication in the brand details above the
service entitlement panel. The action verifies the platform admin role and uses
the authenticated client, so the existing SELECT/INSERT/UPDATE RLS policies also
apply. Generic feature override saves do not overwrite this auxiliary key.

The public loader checks publication before reading product data. It does not
check account status, `is_public`, subscription, storefront features or branches.
Suspension does not unpublish the menu. Soft-deleting the brand does remove it.
Stopping publication prevents new page reads; already delivered pages and signed
media URLs can remain usable until reloaded / the one-hour URL expiry.

## Data and media

- Read live products from the same account, with explicit pagination and stable ordering.
- No copied catalog or sample products. Preserve original names, descriptions,
  prices, calorie counts, ingredients, preparation times, promotions and media.
- Unavailable products remain visible and labelled. Deleted products and products
  in hidden/deleted categories are excluded. Unassigned products remain visible.
- Descriptions remain intact in the detail dialog, including options and additional
  prices embedded in prose. No invented structured options or allergen claims.
- Display formatting removes ornamental tatweel and sentence commas, periods and ellipses at the user's
  request. Stored source text and decimal/numeric separators remain unchanged.
- Public DTOs exclude owner details, authentication, customers, operational fields
  and database audit metadata.
- Server-only Storage signing is limited to `menu-products` and `cafe-logos` paths
  referenced by this menu, with the exact cafe UUID prefix and traversal checks.
  No client-supplied asset paths, private bucket exposure, or policy changes.
- Rendering is dynamic with request-local deduplication, not a cross-request cache.
- IBM Plex Sans Arabic (regular, medium and semibold) is self-hosted unmodified
  under its OFL license in `public/fonts/OFL-bistro-sans.txt`. Tajawal remains the
  fallback. The discarded experimental Naskh face is not shipped.
  Official Arabic/Latin WOFF2 subsets total approximately 194 KB rather than
  approximately 723 KB for the full TTF files. No runtime Google Fonts request.

## Design direction

The venue's actual Instagram grid and Google Maps photographs were visually
reviewed on 2026-09-06: green facade and tall arched windows, pale walls,
natural timber chairs, planting and cream/green packaging. These informed a
Double-B-scoped palette and arched product frames. The subsequent requested
evening treatment uses warm charcoal surfaces, ivory text and soft sage accents
with a subtle olive-stone footer blend rather than the initial cream surface. Source
photos were used as references only, not copied into the site. The page is
catalog-first: compact wordmark, one about-restaurant dialog, category navigation,
search and immediate product imagery with visible prices. The former marketing
hero, overlapping photos and duplicate catalog introduction were removed.
Category descriptions remain intact inside native disclosure elements; complete
product details remain in the product dialog. Original catalog order is unchanged.
First two product images are eager-loaded instead of the former hero images.
Georgia echoes the Latin wordmark while IBM Plex Sans Arabic uses deliberate
400/500/600 roles for descriptions, dish names and controls. No Arabic tracking,
ornamental elongation or faux calligraphic font. Prices use stable tabular numerals.
No commerce, login or storefront navigation is introduced.

Motion is scoped to `motion/react`: a spring-driven category indicator, one-time
photo reveals, modest mouse-only card tilt, tactile press feedback and native-dialog
enter/exit plus gallery crossfades. Content is present in SSR and never held behind
an intro animation. Native dialog focus trapping and scroll lock remain active
during exit. Previous/next dish navigation follows the displayed category order.
Reduced motion disables transforms; low-core devices skip tilt and photo reveals.
There are no idle infinite loops, global pointer listeners or cursor replacement.

At a 375 x 812 CSS-pixel viewport, first-product top moved from approximately
1333 px to 335 px and its price from 1543 px to 522 px. This is a layout
measurement, not a claim of conversion uplift or a controlled user study.
Principles: prioritize the visitor's primary task and disclose secondary content
on demand, as discussed in NN/g's mobile content guidance and Baymard's
product-list/navigation research. No invented popularity labels, ratings,
scarcity claims or sales metrics are used.

References reviewed on 2026-09-06:
- https://www.nngroup.com/articles/defer-secondary-content-for-mobile/
- https://baymard.com/blog/ecommerce-navigation-best-practice
- https://www.instagram.com/doubleb.saudi/
- https://maps.app.goo.gl/yFDxC5GhmvgZdX9v9

## Verification

Run `node scripts/check-standalone-menu.cjs`, `npm run check:text`,
`npx tsc --noEmit`, and the production build. The script tests publication gates,
suspension independence, hidden/deleted data isolation, pagination, field mapping
and storage path isolation using synthetic data; it never suspends a real account.

## Brand contact services

- Instagram uses the validated handle in `cafe_settings.instagram`. Only Instagram
  profile handles are accepted, never arbitrary URLs or script schemes.
- Double B's original menu was checked on 2026-09-06. Its Instagram is
  `https://www.instagram.com/doubleb.saudi/` and its location is
  `https://maps.app.goo.gl/yFDxC5GhmvgZdX9v9` (18.2791535, 42.6921294).
  This verified location is explicitly scoped to the cafe UUID in `lib/menu/contacts.ts`.
  Existing branch coordinates disagree and were deliberately not overwritten.
  Google and Apple deep links plus copy-location require no location permission,
  map SDK, tracking pixels or third-party embedded maps.
- The user supplied the receiving WhatsApp number. It is saved normalized in the
  existing `cafe_settings.whatsapp` field, not hardcoded in the browser bundle.
  Only these two previously empty settings were updated; no catalog data changed.
- Public feedback POST `/api/menu/[slug]/feedback` independently checks the exact
  publication flag and non-deleted cafe, not account status or storefront access.
  Recipient is always selected server-side from the cafe settings.
- Rating 1-5, optional notes up to 1500 characters, strict field allowlist,
  honeypot, same-origin JSON request validation, 8 KiB streamed-body limit.
  No customer login or phone number is collected. Feedback is private, not a
  public review or Google review. Notes are stored in an admin-only event log
  and sent through the existing server-side GREEN API instance.
- Existing `cafe_operation_events` schema (migration 065) is reused, without
  granting any new database or Storage access. Feedback events use `menu_feedback`;
  throttle events use `menu_feedback_rate_limit`. RLS permits only platform-admin
  SELECT and service-role mutations. Anonymous SELECT was verified denied.
- Deterministic HMAC UUID primary keys provide durable atomic duplicate guards
  across workers. One request UUID is sent at most once. A supplemental address
  throttle allows one attempt per fixed five-minute window; a brand-wide lock
  allows one attempt per fixed 15-second window even with spoofed client headers.
  Fixed-window boundaries can allow adjacent attempts. Shared networks share the
  address quota. No raw IP is stored. Throttle denials return 429 with Retry-After.
  These guards bound WhatsApp traffic, not all database traffic; use hosting-level
  rate limiting/WAF for large-scale abuse. No automatic deletion job is added;
  rate-limit rows can be pruned after their windows by an
  administrator-approved retention job. Feedback notes may include personal data.
- Records are persisted before provider calls. `queued` means GREEN API accepted
  the message, not proof of delivery. Timeouts/ambiguous failures are stored as
  `uncertain`; automatic resending is prohibited. Retries with the same UUID return
  the saved acknowledgement or an ambiguity notice, without another provider call.
- New tests: `node scripts/check-menu-feedback.cjs` validates input, tenant-selected
  recipients, suspension independence, durable throttles, concurrent idempotency,
  error privacy, route guards and the mocked GREEN API request contract. No real
  WhatsApp message was sent during implementation verification.
