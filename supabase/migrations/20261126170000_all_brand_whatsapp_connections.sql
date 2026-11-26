-- Connecting a sender remains an explicit owner action on a single connection generation.
-- The existing active-brand, actor, phone, lock, and server-only RPC checks remain in force.
ALTER TABLE public.brand_marketing_connections DROP CONSTRAINT brand_marketing_transactional_supported_brand;
COMMENT ON COLUMN public.brand_marketing_connections.transactional_requested_at IS
 'Explicit owner opt-in for the current sender generation; never implied by campaign access';

CREATE OR REPLACE FUNCTION public.loco_whatsapp_actor_allowed(p_cafe uuid, p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $allowed$
 SELECT EXISTS (
   SELECT 1 FROM public.cafes c JOIN public.profiles actor ON actor.id=p_actor AND actor.status='active'
   WHERE c.id=p_cafe AND c.deleted_at IS NULL AND c.status IN ('active','published')
     AND (c.owner_user_id=p_actor OR actor.role='platform_admin' OR EXISTS (
       SELECT 1 FROM public.cafe_members m WHERE m.cafe_id=c.id AND m.user_id=p_actor AND m.role='owner'))
 );
$allowed$;

-- The previous worker can finish in-flight v2 jobs during deployment.
CREATE OR REPLACE FUNCTION public.claim_stamp_card_link_v3(p_primary_ready boolean, p_loco_ready boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE j loyalty_read_private.card_link_jobs; context jsonb;
BEGIN
 WITH changed AS (
  UPDATE loyalty_read_private.card_link_jobs SET status='unknown',finished_at=clock_timestamp()
  WHERE id IN(SELECT id FROM loyalty_read_private.card_link_jobs WHERE status='dispatching'
   AND attempted_at<clock_timestamp()-interval '5 minutes' LIMIT 100 FOR UPDATE SKIP LOCKED) RETURNING id,status
 ) UPDATE loyalty_read_private.operations q SET invitation_status=c.status FROM changed c WHERE q.invitation_job_id=c.id;
 WITH changed AS (
  UPDATE loyalty_read_private.card_link_jobs SET status='expired',finished_at=clock_timestamp()
  WHERE id IN(SELECT id FROM loyalty_read_private.card_link_jobs WHERE status='pending'
   AND created_at<clock_timestamp()-interval '24 hours' LIMIT 100 FOR UPDATE SKIP LOCKED) RETURNING id,status
 ) UPDATE loyalty_read_private.operations q SET invitation_status=c.status FROM changed c WHERE q.invitation_job_id=c.id;

 SELECT w.* INTO j FROM loyalty_read_private.card_link_jobs w
 JOIN public.loyalty_cards lc ON lc.id=w.card_id AND lc.cafe_id=w.cafe_id AND lc.customer_profile_id=w.profile_id
 JOIN public.customer_profiles cp ON cp.id=w.profile_id AND cp.cafe_id=w.cafe_id
 JOIN public.cafes c ON c.id=w.cafe_id
 JOIN public.cafe_loyalty_programs lp ON lp.cafe_id=w.cafe_id
 WHERE public.brand_account_not_cancelled(w.cafe_id) AND w.status='pending' AND w.attempts<3 AND w.available_at<=clock_timestamp()
  AND ((w.cafe_id='321fd305-1883-48df-ab69-829cf7d1bc48'::uuid AND coalesce(p_loco_ready,false))
    OR (w.cafe_id NOT IN ('321fd305-1883-48df-ab69-829cf7d1bc48'::uuid,'98fd33d5-522d-46e7-adeb-34b04a665f4f'::uuid)
        AND EXISTS(SELECT 1 FROM public.brand_marketing_connections b WHERE b.cafe_id=w.cafe_id
                   AND b.transactional_requested_at IS NOT NULL AND b.status='connected' AND b.verified_phone=b.requested_phone))
    OR (w.cafe_id<>'321fd305-1883-48df-ab69-829cf7d1bc48'::uuid AND coalesce(p_primary_ready,false)))
  AND lc.status='active' AND cp.status='active' AND cp.blocked_at IS NULL AND NOT cp.phone_auth_conflict
  AND brand_phone_private.canonical(cp.cafe_id,cp.phone_normalized) AND c.status IN('active','published') AND c.deleted_at IS NULL
  AND lp.enabled AND platform_access_private.service_enabled(c.id,'loyalty')

  AND NOT EXISTS(SELECT 1 FROM public.wallet_apple_registrations ar WHERE ar.cafe_id=w.cafe_id AND ar.card_id=w.card_id)
 ORDER BY w.available_at,w.created_at LIMIT 1 FOR UPDATE OF w SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE loyalty_read_private.card_link_jobs SET status='dispatching',attempts=attempts+1,attempted_at=clock_timestamp(),claim_token=gen_random_uuid()
 WHERE id=j.id RETURNING * INTO j;
 UPDATE loyalty_read_private.operations SET invitation_status='dispatching' WHERE invitation_job_id=j.id;
 SELECT jsonb_build_object('id',j.id,'claimToken',j.claim_token,'cafeId',j.cafe_id,'profileId',j.profile_id,'cardId',j.card_id,
  'privateSenderRequested',EXISTS(SELECT 1 FROM public.brand_marketing_connections b WHERE b.cafe_id=j.cafe_id
                                 AND b.transactional_requested_at IS NOT NULL AND b.status='connected' AND b.verified_phone=b.requested_phone),
  'brandSlug',c.slug,'brandName',c.name,'phone',cp.phone_normalized,'cardCreated',j.card_created,
  'googleIssued',EXISTS(SELECT 1 FROM public.wallet_passes wp WHERE wp.card_id=j.card_id AND wp.cafe_id=j.cafe_id AND wp.provider='google'),'stampsInCycle',lc.stamps_in_cycle,'purchasesRequired',lp.purchases_required,'rewardName',lp.reward_name)
 INTO context FROM public.cafes c JOIN public.customer_profiles cp ON cp.id=j.profile_id AND cp.cafe_id=c.id
 JOIN public.loyalty_cards lc ON lc.id=j.card_id AND lc.cafe_id=c.id
 JOIN public.cafe_loyalty_programs lp ON lp.cafe_id=c.id WHERE c.id=j.cafe_id;
 RETURN context;
END $function$;

REVOKE ALL ON FUNCTION public.claim_stamp_card_link_v3(boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stamp_card_link_v3(boolean,boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
