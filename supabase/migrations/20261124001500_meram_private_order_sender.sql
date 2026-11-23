BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.brand_marketing_connections DROP CONSTRAINT brand_marketing_transactional_supported_brand;
ALTER TABLE public.brand_marketing_connections ADD CONSTRAINT brand_marketing_transactional_supported_brand CHECK (
 transactional_requested_at IS NULL OR cafe_id IN ('321fd305-1883-48df-ab69-829cf7d1bc48'::uuid,'8dbf85ba-df8f-4218-bc6f-9d2b39e937ef'::uuid,'98fd33d5-522d-46e7-adeb-34b04a665f4f'::uuid)
);

CREATE OR REPLACE FUNCTION public.loco_whatsapp_actor_allowed(p_cafe uuid, p_actor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS (
  SELECT 1 FROM public.cafes c JOIN public.profiles actor ON actor.id=p_actor AND actor.status='active'
  WHERE c.id=p_cafe AND c.id IN ('321fd305-1883-48df-ab69-829cf7d1bc48'::uuid,'8dbf85ba-df8f-4218-bc6f-9d2b39e937ef'::uuid,'98fd33d5-522d-46e7-adeb-34b04a665f4f'::uuid)
   AND c.deleted_at IS NULL AND c.status IN ('active','published')
   AND (c.owner_user_id=p_actor OR actor.role='platform_admin'
    OR EXISTS(SELECT 1 FROM public.cafe_members m WHERE m.cafe_id=c.id AND m.user_id=p_actor AND m.role='owner'))
 );
$function$;

COMMIT;
