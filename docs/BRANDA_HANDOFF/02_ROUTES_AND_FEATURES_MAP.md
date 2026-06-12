# Barndaksa — Routes & Features Map

| Path | Feature | Key files | Data source | Permission | Notes |
| ---- | ------- | --------- | ----------- | ---------- | ----- |
| `/` | Landing | `app/page.tsx` | static | public | Marketing |
| `/login` | Platform login | `app/login/page.tsx`, `app/actions/auth.ts` | Supabase Auth | public | |
| `/register` | Platform register | `app/register/page.tsx`, `app/actions/auth.ts` | Supabase Auth | public | Cafe owner signup |
| `/auth/callback` | OAuth callback | `app/auth/callback/route.ts` | Supabase | public | |
| `/admin` | Admin home | `app/admin/page.tsx`, `components/admin/*` | `lib/data/admin.ts` | platform_admin | |
| `/admin/cafes` | Cafe management | `app/admin/cafes/page.tsx` | admin data | platform_admin | |
| `/admin/customers` | Cross-cafe customers | `app/admin/customers/page.tsx` | admin | platform_admin | |
| `/admin/operations` | Operations | `app/admin/operations/page.tsx` | admin | platform_admin | |
| `/admin/options` | Platform options | `app/admin/options/page.tsx` | `platform_settings` | platform_admin | |
| `/admin/plans` | Plans | `app/admin/plans/page.tsx` | `platform_plans` | platform_admin | |
| `/admin/revenue` | Revenue | `app/admin/revenue/page.tsx` | admin | platform_admin | |
| `/dashboard` | Owner dashboard home | `app/dashboard/page.tsx` | cafes context | owner/staff | |
| `/dashboard/menu` | Menu CRUD | `components/dashboard/menu/*`, `app/actions/menu.ts` | `menu_*` tables | menu permission | |
| `/dashboard/offers` | Offers | `components/dashboard/pages/offers-page.tsx` | `offers` | offers permission | |
| `/dashboard/orders` | Orders | `components/dashboard/pages/orders-page.tsx`, `lib/data/orders.ts` | RPC orders | orders permission | |
| `/dashboard/reservations` | Reservations | `app/actions/reservations.ts` | RPC | reservations | |
| `/dashboard/customers` | CRM | `lib/data/customers.ts` | `customer_profiles` | customers | |
| `/dashboard/loyalty` | Loyalty | `app/actions/loyalty.ts` | RPC | loyalty | |
| `/dashboard/marketing` | Marketing + experience | `components/dashboard/pages/marketing-page.tsx` | campaigns, RPC | marketing | |
| `/dashboard/reviews` | Reviews | `app/actions/reviews.ts` | `reviews` | owner/staff read | |
| `/dashboard/settings` | Cafe settings | `components/dashboard/pages/settings-page.tsx` | `cafe_settings` | settings | |
| `/dashboard/theme` | Theme | `components/dashboard/pages/theme-page.tsx` | themes, storage | settings | |
| `/dashboard/branches` | Branches | `app/actions/branches.ts` | `branches` | branches | |
| `/dashboard/pages` | Info pages | `lib/data/pages.ts` | `cafe_pages` | owner | |
| `/dashboard/subscription` | Subscription | `app/actions/subscription.ts` | `subscriptions` | owner only read | |
| `/dashboard/reports` | Reports | `app/dashboard/reports/page.tsx` | aggregated | owner/staff | |
| `/c/[slug]` | Public cafe | `app/c/[slug]/page.tsx`, `components/cafe/*` | public API + RLS | public | |
| `/c/[slug]/login` | Customer login | `app/c/[slug]/login/page.tsx` | Supabase Auth | public | |
| `/c/[slug]/register` | Customer register | `app/c/[slug]/register/page.tsx`, `registerCustomer` | RPC profile | public | Cafe must be open |
| `/c/[slug]/account` | Customer account | `app/c/[slug]/account/page.tsx` | customer data | customer session | |
| `/c/[slug]/product/[id]` | Product detail | `app/c/[slug]/product/[id]/page.tsx` | menu | public | |
| `/c/[slug]/products/[view]` | Product list | `app/c/[slug]/products/[view]/page.tsx` | menu | public | |
| `/c/[slug]/reserve` | Reservation | `app/c/[slug]/reserve/page.tsx` | RPC | customer | |
| `/api/public/cafe/[slug]` | Public cafe JSON | `app/api/public/cafe/[slug]/route.ts` | RPC settings | anon | |
| `/api/public/cafe/[slug]/menu` | Public menu | `app/api/public/cafe/[slug]/menu/route.ts` | menu tables | anon | |
| `/api/public/storage` | Public signed URL | `app/api/public/storage/route.ts` | storage RPC | anon/auth | 10 min TTL |
| `/api/storage/signed` | Private signed URL | `app/api/storage/signed/route.ts` | assertPrivate | authenticated | |
| `/api/domains/*` | Domain purchase stubs | `app/api/domains/**` | integration | owner | Review before prod |

**Middleware:** `proxy.ts` — session/route protection patterns.
