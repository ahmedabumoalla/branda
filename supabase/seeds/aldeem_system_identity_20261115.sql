BEGIN;
-- Aldeem identity for the system screens (same colours as its storefront). A settings row for this account only.
INSERT INTO public.erp_system_settings(cafe_id,kind,payload)
SELECT id,'brand',jsonb_build_object('primary','#6b347e','ink','#442b4e','background','#fff9fc','logo','') FROM public.cafes WHERE slug='khayal-aldeem'
ON CONFLICT DO NOTHING;
SELECT kind,payload::text,revision FROM public.erp_system_settings WHERE cafe_id='d027657c-c109-4b4f-9c89-53f8f652c28c';
COMMIT;
