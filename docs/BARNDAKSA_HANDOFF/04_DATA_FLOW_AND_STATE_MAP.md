# Barndaksa — Data Flow & State Map

| Feature | UI | Action/API | Data layer | DB/RPC/Storage | Files |
| ------- | -- | ---------- | ---------- | -------------- | ----- |
| Customer register | `c/[slug]/register` | `registerCustomerAction` | `registerCustomer` | Auth + `create_customer_profile` | `app/actions/auth.ts`, `lib/data/customers.ts` |
| Customer login | `c/[slug]/login` | `loginCustomerAction` | `loginCustomerByEmail` | Supabase Auth | same |
| Customer profile update | account page | `updateCustomerProfileAction` | `customer_profiles` UPDATE | RLS self | `app/actions/customer.ts` |
| Avatar upload | account/settings | `uploadCustomerAvatarAction` | Storage INSERT + `set_customer_avatar_storage_path` | `customer-avatars` | `app/actions/customer-media.ts` |
| Pickup order | cafe storefront | order action | `create_pickup_order` RPC | `orders`, `order_items` | `lib/data/orders.ts` |
| Order respond | dashboard orders | `respondToOrderAction` | `respond_to_pickup_order` | orders RPC | `app/actions/orders.ts` |
| Reservation create | reserve page | reservation action | `create_customer_reservation` | `reservations` | `app/actions/reservations.ts` |
| Loyalty adjust | dashboard loyalty | loyalty action | `adjust_loyalty_points` | loyalty RPC | `app/actions/loyalty.ts` |
| Experience submit | marketing/customer | experience action | `submit_experience_submission` | experience RPC | `lib/data/experience.ts` |
| Experience media | marketing | upload + attach | `attach_experience_submission_media` | `experience-submissions` | `lib/storage/experience-media-server.ts` |
| Experience metrics | dashboard marketing | UI form | `update_experience_submission_metrics` | DB calc points | `lib/data/experience.ts` |
| Experience approve | dashboard | approve action | `approve_experience_submission` | loyalty tx | same |
| Notifications read | dashboard/customer | fetch | `notifications` SELECT | tight RLS | `lib/data/notifications.ts` |
| Mark notification read | UI click | action | `mark_*_notification_read` | RPC | `app/actions/notifications.ts` |
| Menu CRUD | dashboard menu | menu actions | direct table + storage | menu-products bucket | `app/actions/menu.ts` |
| Cafe settings | settings page | settings action | `cafe_settings` | settings permission | `app/actions/settings.ts` |
| Public cafe load | `c/[slug]` | RSC | `getCafeBySlug`, public API | RLS public read | `lib/data/cafes.ts` |
| Public asset URL | images | `/api/public/storage` | `createPublishedAssetSignedUrl` | `can_access_public_storage_object` | `lib/storage/resolve-storage-url.ts` |
| Private asset URL | avatar/media | `/api/storage/signed` | `createPrivateAssetSignedUrl` | `assertPrivateStorageAccess` | same |
| Domain order cancel | settings | action | `cancel_domain_order` | domain_orders | `lib/platform/domain-purchase.ts` |
| Owner context | dashboard layout | RSC | `requireOwnerCafeContext` | cafes, members | `lib/data/cafes.ts` |
| Platform admin | admin layout | RSC | `requirePlatformAdmin` | profiles.role | `lib/data/cafes.ts` |

**Session state:** Supabase Auth cookie via `@/lib/supabase/server`. Customer session mapped in `lib/customer/session.ts`.

**No client-side authoritative state** for orders, points, roles, or totals.
