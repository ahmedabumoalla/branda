-- Barndaksa — contact form production fix
-- Fixes submit_platform_contact_request when SECURITY DEFINER uses an empty search_path
-- and keeps the public contact RPC safe for future use.

begin;

create extension if not exists citext with schema public;

create or replace function public.submit_platform_contact_request(
  p_full_name text,
  p_email text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_full_name text := btrim(coalesce(p_full_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_message text := btrim(coalesce(p_message, ''));
begin
  if char_length(v_full_name) < 2 or char_length(v_full_name) > 120 then
    raise exception 'Invalid full name';
  end if;

  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email';
  end if;

  if char_length(v_message) < 5 or char_length(v_message) > 2000 then
    raise exception 'Invalid message';
  end if;

  insert into public.platform_contact_requests(full_name, email, message, status)
  values (v_full_name, v_email, v_message, 'new')
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_platform_contact_request(text, text, text) from public;
grant execute on function public.submit_platform_contact_request(text, text, text) to anon, authenticated;

commit;
