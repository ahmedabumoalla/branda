-- 026_branda_branch_mapbox_geofence.sql
-- Adds branch geofence metadata for Mapbox branch picker and customer welcome messages.

alter table public.branches
  add column if not exists geofence_radius_m integer not null default 50,
  add column if not exists welcome_message text;

update public.branches
set
  geofence_radius_m = coalesce(geofence_radius_m, 50),
  welcome_message = coalesce(welcome_message, 'أهلًا بك في ' || name)
where deleted_at is null;

alter table public.branches
  drop constraint if exists branches_geofence_radius_m_check;

alter table public.branches
  add constraint branches_geofence_radius_m_check
  check (geofence_radius_m between 10 and 500);

comment on column public.branches.geofence_radius_m is 'Customer welcome geofence radius in meters around the Mapbox branch location.';
comment on column public.branches.welcome_message is 'Message shown to the customer when entering the branch geofence.';
