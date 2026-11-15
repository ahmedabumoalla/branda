BEGIN;

-- The server-rendered homepage reads contact settings with the private service client.
-- Restore only that read: retain existing RLS, policies and every other role grant.
GRANT SELECT ON TABLE public.platform_contact_settings TO service_role;

COMMIT;
