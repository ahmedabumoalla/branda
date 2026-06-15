-- Barndaksa — Admin content persistence, homepage typography and loyalty card image control
-- Run after 040_barndaksa_domain_branding_rebrand.sql

begin;

create extension if not exists citext with schema public;

create table if not exists public.platform_home_settings (
  id text primary key default 'home' check (id = 'home'),
  hero_badge text not null default 'شريكك التقني في تطوير علامتك التجارية',
  hero_title text not null default 'منيو تفاعلي - بطاقات ولاء - تسويق في مكان واحد',
  hero_description text not null default '',
  hero_side_text text not null default '',
  features_title text not null default 'كل ما تحتاجه لإدارة علامتك التجارية',
  loyalty_description text not null default '',
  cta_title text not null default 'جاهز تطور علامتك التجارية ؟',
  cta_description text not null default '',
  about_us text not null default '',
  vision text not null default '',
  mission text not null default '',
  carousel_interval_seconds int not null default 5,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_home_settings
  add column if not exists font_family text not null default 'system',
  add column if not exists hero_badge_font_size int not null default 14,
  add column if not exists hero_title_font_size int not null default 48,
  add column if not exists hero_description_font_size int not null default 18,
  add column if not exists hero_side_text_font_size int not null default 30,
  add column if not exists features_title_font_size int not null default 36,
  add column if not exists loyalty_title_font_size int not null default 36,
  add column if not exists loyalty_description_font_size int not null default 18,
  add column if not exists cta_title_font_size int not null default 36,
  add column if not exists cta_description_font_size int not null default 18,
  add column if not exists about_cards_font_size int not null default 15;

insert into public.platform_home_settings (id)
values ('home')
on conflict (id) do nothing;

create table if not exists public.platform_contact_settings (
  id text primary key default 'main' check (id = 'main'),
  email citext,
  whatsapp text,
  instagram text,
  facebook text,
  tiktok text,
  x text,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.platform_contact_settings (id)
values ('main')
on conflict (id) do nothing;

create table if not exists public.platform_media_assets (
  id uuid primary key default gen_random_uuid(),
  placement text not null check (placement in ('hero', 'intro_video', 'loyalty_cards', 'social_post')),
  media_type text not null check (media_type in ('image', 'video')),
  storage_path text not null unique,
  mime_type text not null,
  alt_text text not null default '',
  sort_order int not null default 0,
  active boolean not null default true,
  is_default boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_platform_media_active_placement
  on public.platform_media_assets(placement, sort_order, created_at desc)
  where active = true;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'platform-media',
  'platform-media',
  false,
  125829120,
  array['image/jpeg','image/png','image/webp','image/avif','image/gif','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.platform_home_settings enable row level security;
alter table public.platform_contact_settings enable row level security;
alter table public.platform_media_assets enable row level security;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on table
  public.platform_home_settings,
  public.platform_contact_settings,
  public.platform_media_assets
  to authenticated, service_role;
grant usage, select, update on all sequences in schema public to authenticated, service_role;

drop policy if exists platform_home_admin_manage on public.platform_home_settings;
create policy platform_home_admin_manage on public.platform_home_settings
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists platform_contact_settings_admin_manage on public.platform_contact_settings;
create policy platform_contact_settings_admin_manage on public.platform_contact_settings
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists platform_media_admin_manage on public.platform_media_assets;
create policy platform_media_admin_manage on public.platform_media_assets
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

commit;
