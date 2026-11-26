-- Each wallet can be downloaded in a different language for the same card.
alter table public.wallet_passes
  add column if not exists display_language text not null default 'ar'
  check (display_language in ('ar', 'en'));
