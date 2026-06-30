-- Barndaksa: platform homepage client brand promotions.

begin;

create table if not exists public.platform_home_promotions (
  id uuid primary key default gen_random_uuid(),
  item_type text not null,
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  item_id uuid null,
  title text null,
  subtitle text null,
  badge text null,
  location_label text null,
  image_url text null,
  href text null,
  active boolean not null default true,
  featured boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint platform_home_promotions_item_type_check
    check (item_type in ('brand', 'product', 'offer', 'reservation'))
);

drop trigger if exists set_platform_home_promotions_updated_at on public.platform_home_promotions;
create trigger set_platform_home_promotions_updated_at
  before update on public.platform_home_promotions
  for each row execute function public.set_updated_at();

create index if not exists idx_platform_home_promotions_item_type
  on public.platform_home_promotions(item_type);

create index if not exists idx_platform_home_promotions_cafe_id
  on public.platform_home_promotions(cafe_id);

create index if not exists idx_platform_home_promotions_active
  on public.platform_home_promotions(active);

create index if not exists idx_platform_home_promotions_featured
  on public.platform_home_promotions(featured);

create index if not exists idx_platform_home_promotions_sort_order
  on public.platform_home_promotions(sort_order);

alter table public.platform_home_promotions enable row level security;

grant select on public.platform_home_promotions to anon, authenticated;
grant select, insert, update, delete on public.platform_home_promotions to authenticated, service_role;

drop policy if exists platform_home_promotions_public_active_read on public.platform_home_promotions;
create policy platform_home_promotions_public_active_read
  on public.platform_home_promotions
  for select
  to anon, authenticated
  using (active = true);

drop policy if exists platform_home_promotions_platform_admin_all on public.platform_home_promotions;
create policy platform_home_promotions_platform_admin_all
  on public.platform_home_promotions
  for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

commit;
