-- 066_brand_feature_overrides.sql
-- Per-brand feature overrides without mutating the subscribed platform plan.

begin;

create table if not exists public.brand_feature_overrides (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  feature_id text not null,
  enabled boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint brand_feature_overrides_unique unique (cafe_id, feature_id),
  constraint brand_feature_overrides_feature_id_not_blank check (btrim(feature_id) <> '')
);

create index if not exists idx_brand_feature_overrides_cafe_id
  on public.brand_feature_overrides(cafe_id);

create index if not exists idx_brand_feature_overrides_feature_id
  on public.brand_feature_overrides(feature_id);

create index if not exists idx_brand_feature_overrides_enabled
  on public.brand_feature_overrides(enabled);

drop trigger if exists set_brand_feature_overrides_updated_at on public.brand_feature_overrides;
create trigger set_brand_feature_overrides_updated_at
  before update on public.brand_feature_overrides
  for each row execute function public.set_updated_at();

alter table public.brand_feature_overrides enable row level security;

drop policy if exists brand_feature_overrides_platform_admin_select on public.brand_feature_overrides;
create policy brand_feature_overrides_platform_admin_select
  on public.brand_feature_overrides
  for select to authenticated
  using (public.is_platform_admin());

drop policy if exists brand_feature_overrides_platform_admin_insert on public.brand_feature_overrides;
create policy brand_feature_overrides_platform_admin_insert
  on public.brand_feature_overrides
  for insert to authenticated
  with check (public.is_platform_admin());

drop policy if exists brand_feature_overrides_platform_admin_update on public.brand_feature_overrides;
create policy brand_feature_overrides_platform_admin_update
  on public.brand_feature_overrides
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists brand_feature_overrides_platform_admin_delete on public.brand_feature_overrides;
create policy brand_feature_overrides_platform_admin_delete
  on public.brand_feature_overrides
  for delete to authenticated
  using (public.is_platform_admin());

grant select, insert, update, delete on public.brand_feature_overrides to authenticated;
grant select, insert, update, delete on public.brand_feature_overrides to service_role;

notify pgrst, 'reload schema';

commit;

select 'brand_feature_overrides_ready' as status;
