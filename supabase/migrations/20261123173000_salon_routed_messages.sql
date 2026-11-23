BEGIN;
CREATE FUNCTION public.salon_claim_routed_messages(p_limit integer, p_notification_cafe uuid, p_notifications_ready boolean, p_pager_ready boolean)
RETURNS SETOF public.salon_message_jobs LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  -- A provider request is made only after dispatch_authorized has been committed.
  UPDATE public.salon_message_jobs
  SET state = CASE WHEN dispatch_authorized THEN 'uncertain' ELSE 'pending' END,
      last_error = CASE WHEN dispatch_authorized THEN 'dispatch_interrupted' ELSE NULL END,
      claimed_at = NULL, lease_token = NULL, updated_at = now()
  WHERE state = 'dispatching' AND claimed_at < now() - interval '2 minutes';

  RETURN QUERY WITH candidates AS (
    SELECT id FROM public.salon_message_jobs
    WHERE state = 'pending'
      AND CASE WHEN cafe_id = p_notification_cafe THEN p_notifications_ready ELSE p_pager_ready END
    ORDER BY created_at, id LIMIT greatest(1, least(p_limit, 20)) FOR UPDATE SKIP LOCKED
  )
  UPDATE public.salon_message_jobs AS job
  SET state = 'dispatching', claimed_at = clock_timestamp(), lease_token = gen_random_uuid(), updated_at = now()
  FROM candidates WHERE job.id = candidates.id RETURNING job.*;
END $$;

REVOKE ALL ON FUNCTION public.salon_claim_routed_messages(integer,uuid,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.salon_claim_routed_messages(integer,uuid,boolean,boolean) TO service_role;
COMMIT;
