# Loco staff dashboard permissions (Claude) - PUBLISHED - 2026-11-17

## Request

Loco only (slug brand-9a8c97305195): a dashboard section named إدارة صلاحيات الموظفين. The owner adds non-cashier employees and grants the cashiers created in إدارة الكاشير new dashboard permissions. Cashier login and cashier permissions stay as they are on the cashier login page

Permissions
1. Dashboard login through the main /login page with phone and an owner-set password. The other three appear only when this is on
2. Edit menu products: add, delete and edit products and categories in /dashboard/menu
3. Loyalty messages: open /dashboard/loyalty/messages, send wallet messages and read the history
4. Rewards: open /dashboard/loyalty and change only the stamps count, the reward and the branch location (nearby message and Google Maps link)

## Published state

- GitHub main db7394625709a840eb5650f679896b279c077a02 (feature 277e6443 plus migration rename). GitHub deployment record Production success at https://branda-2-bw296eqws-ahmedabumoallas-projects.vercel.app. Vercel preview build for the same commit succeeded first
- Migration 20261117051000_brand_staff_dashboard_permissions applied to production and recorded in supabase_migrations.schema_migrations. First run atomically inside a rolled-back transaction with a temporary auth user: membership grant, staff rewards save under the authenticated role, menu read, revoke on disable. Production afterwards verified unchanged before the real apply
- The file was first named 20261117010000, which collided with Codex's aldeem_return_lookups version. It was renamed before recording. Do not reapply

## Design

- Table public.brand_staff_accounts (server-only, RLS on with no browser grants): employee or cashier link, phone, auth user and the four flags
- Enforcement lives in cafe_members role staff with permissions keys menu, staff_loyalty_messages and staff_loyalty_rewards. The existing menu write policies use the menu key unchanged. public.set_brand_staff_access (service role) updates the record and the membership atomically. Deleting a record removes its membership through a trigger
- public.save_brand_staff_loyalty_rewards (authenticated) checks has_cafe_permission staff_loyalty_rewards plus the loyalty package, then updates only purchases_required, reward_name and reward_product_id, plus reward kind, discount, nearby message and branch coordinates. Card design, activation, wallets, terms and validity stay owner-only
- lib/data/cafes.ts: getOwnerCafeContext returns null for Loco employees, so every existing page and action stays closed to them. requireOwnerCafeContext(permission) admits an employee only where a permission is named: menu loaders and uploads ("menu"), rewards ("rewards"), messages ("messages") and package codes ("any"). getDashboardCafeContext is used only by the dashboard layout, shell, staff-home and the loyalty page
- Dashboard layout redirects an employee away from any path outside /dashboard/menu, /dashboard/loyalty, /dashboard/loyalty/messages and /dashboard/staff-home, using an x-branda-pathname header that proxy.ts sets on the server
- Sidebar: employees see only their granted sections and logout. The owner sees إدارة صلاحيات الموظفين next to the brand phone link
- Login: a Loco employee keeps profile role customer. loginOwnerAction falls back to the Loco staff membership and redirects to the first granted section. Accounts are created as new phone users. A phone that already exists on the platform is refused, so no customer identity or password is ever taken over. In production, cashier عادل عبد الفتاح uses the owner's phone and will be refused for that reason
- Employee mode on the rewards page hides activation, validity, stamp style, terms and wallet controls, as well as the link to the cashier page

## Not done

- No browser test, no real employee account created and no real loyalty message sent. The user will test behaviour
- The password reset does not revoke existing sessions. Disabling login removes the membership immediately, which blocks the dashboard

## Next

- User test: owner opens /dashboard/staff-permissions, adds an employee with a new phone, then signs in from /login with that phone and password
