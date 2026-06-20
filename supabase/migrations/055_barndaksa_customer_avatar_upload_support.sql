-- Align customer avatar storage with the customer account upload flow.
alter table if exists public.customer_profiles
  add column if not exists avatar_storage_path text;

update storage.buckets
set
  file_size_limit = 5242880,
  allowed_mime_types = array[
    'image/webp',
    'image/jpeg',
    'image/png',
    'image/avif'
  ]
where id = 'customer-avatars';
