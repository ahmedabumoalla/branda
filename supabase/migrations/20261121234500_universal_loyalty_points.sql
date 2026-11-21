BEGIN;
SET LOCAL lock_timeout = '5s';

-- Programs keep their saved mode, rates and balances. Only an explicit owner
-- save opts a brand into points. The existing constraints validate its rates.
ALTER TABLE public.cafe_loyalty_programs DROP CONSTRAINT points_mode_demo_only;

-- Narrow edits to the deployed functions keep existing grants, approvals,
-- brand entitlement checks, card scope, receipt snapshots and idempotency.
DO $rollout$
DECLARE edit record; definition text;
BEGIN
  FOR edit IN SELECT * FROM (VALUES
    ('public.save_loyalty_points_program(uuid,text,numeric,integer,jsonb,jsonb)',
      $old$p_cafe_id IS DISTINCT FROM '2e08901c-5aac-4bec-8c97-a135058e508b'::uuid$old$, 'p_cafe_id IS NULL'),
    ('public.save_loyalty_points_program(uuid,text,numeric,integer,jsonb,jsonb)',
      $old$id=p_cafe_id AND slug='test-cafe' AND deleted_at IS NULL$old$, 'id=p_cafe_id AND deleted_at IS NULL'),
    ('loyalty_read_private.run_card_points(text,text,text,uuid,numeric,numeric,integer,integer,text,integer)',
      $old$b.id=s.cafe_id AND b.slug='test-cafe' AND b.deleted_at IS NULL$old$, 'b.id=s.cafe_id AND b.deleted_at IS NULL'),
    ('loyalty_read_private.run_card_points(text,text,text,uuid,numeric,numeric,integer,integer,text,integer)',
      $old$s.token=p_session_token AND s.cafe_id='2e08901c-5aac-4bec-8c97-a135058e508b' AND s.expires_at>now()$old$,
      's.token=p_session_token AND s.expires_at>now()'),
    ('public.snapshot_rast_loyalty_reward()',
      $old$IF NEW.cafe_id='2e08901c-5aac-4bec-8c97-a135058e508b' AND NEW.metadata->>'source'='invoice_points' THEN$old$,
      $new$IF NEW.source_type='loyalty' AND NEW.metadata->>'source'='invoice_points' THEN$new$),
    ('public.get_loyalty_brand_read_snapshot(text)',
      $old$CASE WHEN c.id='2e08901c-5aac-4bec-8c97-a135058e508b' THEN jsonb_build_object('points_mode'$old$,
      $new$CASE WHEN p.cafe_id=c.id THEN jsonb_build_object('points_mode'$new$)
  ) AS edits(signature,needle,replacement) LOOP
    definition := pg_get_functiondef(edit.signature::regprocedure);
    IF array_length(string_to_array(definition,edit.needle),1) IS DISTINCT FROM 2 THEN
      RAISE EXCEPTION 'Unexpected loyalty function definition: %',edit.signature;
    END IF;
    EXECUTE replace(definition,edit.needle,edit.replacement);
  END LOOP;
END $rollout$;

DROP TRIGGER prevent_points_mode_stamp ON public.loyalty_card_events;
CREATE TRIGGER prevent_points_mode_stamp BEFORE INSERT ON public.loyalty_card_events
  FOR EACH ROW WHEN (NEW.stamps_added>0)
  EXECUTE FUNCTION loyalty_read_private.prevent_points_mode_stamp();

NOTIFY pgrst,'reload schema';
COMMIT;
