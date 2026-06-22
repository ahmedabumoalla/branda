-- Extend offers and experience campaigns for richer promo cards and AI-generated assets.
-- This migration is intentionally additive and does not alter existing order, reservation,
-- loyalty, login, or customer-account behavior.

alter table if exists public.offers
  add column if not exists target_type text not null default 'products',
  add column if not exists reservation_service_id uuid references public.reservation_services(id) on delete set null,
  add column if not exists offer_rules jsonb not null default '{}'::jsonb,
  add column if not exists card_generation_status text not null default 'idle',
  add column if not exists card_storage_path text,
  add column if not exists card_generated_at timestamptz,
  add column if not exists card_generation_error text;

create index if not exists idx_offers_reservation_service
  on public.offers(reservation_service_id)
  where deleted_at is null;

alter table if exists public.experience_campaigns
  add column if not exists requirements jsonb not null default '{}'::jsonb,
  add column if not exists excluded_content_rules jsonb not null default '{}'::jsonb,
  add column if not exists reward_type text not null default 'product',
  add column if not exists reward_product_id uuid references public.menu_products(id) on delete set null,
  add column if not exists reward_reservation_service_id uuid references public.reservation_services(id) on delete set null,
  add column if not exists reward_discount_percent numeric(5,2),
  add column if not exists card_generation_status text not null default 'idle',
  add column if not exists card_storage_path text,
  add column if not exists card_generated_at timestamptz,
  add column if not exists card_generation_error text;

create index if not exists idx_experience_campaigns_reward_product
  on public.experience_campaigns(reward_product_id);

create index if not exists idx_experience_campaigns_reward_reservation
  on public.experience_campaigns(reward_reservation_service_id);

alter table if exists public.offers
  drop constraint if exists offers_target_type_allowed;

alter table if exists public.offers
  add constraint offers_target_type_allowed
  check (target_type in ('products', 'reservation', 'experience_campaign'));

alter table if exists public.offers
  drop constraint if exists offers_card_generation_status_allowed;

alter table if exists public.offers
  add constraint offers_card_generation_status_allowed
  check (card_generation_status in ('idle', 'generating', 'ready', 'failed'));

alter table if exists public.experience_campaigns
  drop constraint if exists experience_campaigns_reward_type_allowed;

alter table if exists public.experience_campaigns
  add constraint experience_campaigns_reward_type_allowed
  check (reward_type in ('free_order', 'product', 'reservation', 'discount'));

alter table if exists public.experience_campaigns
  drop constraint if exists experience_campaigns_card_generation_status_allowed;

alter table if exists public.experience_campaigns
  add constraint experience_campaigns_card_generation_status_allowed
  check (card_generation_status in ('idle', 'generating', 'ready', 'failed'));
