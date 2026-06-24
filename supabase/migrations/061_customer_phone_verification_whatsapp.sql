-- Customer phone verification over WhatsApp.
-- Do not run automatically; apply through the project's normal migration flow.

alter table if exists public.customer_profiles
  add column if not exists phone_verified_at timestamptz,
  add column if not exists phone_normalized text,
  add column if not exists phone_verification_required boolean not null default true;

-- Keep existing customer sessions/orders from being disrupted by the new gate.
update public.customer_profiles
set phone_verification_required = false
where phone_verified_at is null
  and phone_verification_required is true;

create table if not exists public.customer_phone_verifications (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  customer_profile_id uuid not null references public.customer_profiles(id) on delete cascade,
  phone text not null,
  phone_normalized text not null,
  code_hash text not null,
  code_salt text not null,
  expires_at timestamptz not null,
  attempts_count integer not null default 0,
  max_attempts integer not null default 5,
  sent_at timestamptz,
  verified_at timestamptz,
  status text not null default 'pending',
  purpose text not null default 'signup',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_phone_verifications_status_check
    check (status in ('pending', 'verified', 'expired', 'failed')),
  constraint customer_phone_verifications_purpose_check
    check (purpose in ('signup', 'login', 'resend')),
  constraint customer_phone_verifications_attempts_check
    check (attempts_count >= 0 and max_attempts > 0)
);

create index if not exists idx_customer_profiles_cafe_phone_normalized
  on public.customer_profiles(cafe_id, phone_normalized)
  where phone_normalized is not null;

create index if not exists idx_customer_phone_verifications_customer_pending
  on public.customer_phone_verifications(customer_profile_id, status, created_at desc)
  where status = 'pending';

create index if not exists idx_customer_phone_verifications_cafe_phone
  on public.customer_phone_verifications(cafe_id, phone_normalized, created_at desc);

drop trigger if exists customer_phone_verifications_updated_at on public.customer_phone_verifications;
create trigger customer_phone_verifications_updated_at
  before update on public.customer_phone_verifications
  for each row execute function public.set_updated_at();

alter table public.customer_phone_verifications enable row level security;

revoke all on public.customer_phone_verifications from public;
revoke all on public.customer_phone_verifications from anon;
revoke all on public.customer_phone_verifications from authenticated;
grant all on public.customer_phone_verifications to service_role;

drop policy if exists customer_phone_verifications_service_role_all
  on public.customer_phone_verifications;
create policy customer_phone_verifications_service_role_all
  on public.customer_phone_verifications
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.customer_phone_verifications is
  'Stores hashed one-time WhatsApp phone verification codes for cafe-scoped customer profiles.';
comment on column public.customer_phone_verifications.code_hash is
  'Hash only; the plaintext OTP must never be stored.';
comment on column public.customer_phone_verifications.code_salt is
  'Random salt used to hash the OTP.';
