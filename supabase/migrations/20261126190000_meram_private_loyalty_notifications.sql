-- Meram has its own sender for eligible loyalty events. Prove a reward from
-- the completed cashier operation, not the balance when the worker runs.
DO $migration$
DECLARE
  worker regprocedure := 'public.claim_stamp_card_link_v3(boolean,boolean)'::regprocedure;
  definition text := pg_get_functiondef(worker);
  old_gate text := $old$w.cafe_id NOT IN ('321fd305-1883-48df-ab69-829cf7d1bc48'::uuid,'98fd33d5-522d-46e7-adeb-34b04a665f4f'::uuid)$old$;
  old_context text := $old$'meramCashierPhoneIssue',$old$;
  new_context text := $new$'meramRewardEarned',
    j.cafe_id='98fd33d5-522d-46e7-adeb-34b04a665f4f'::uuid AND EXISTS (
      SELECT 1 FROM loyalty_read_private.operations o
      WHERE o.cafe_id=j.cafe_id AND o.invitation_job_id=j.id AND o.status='succeeded'
        AND o.result->>'status'='reward_issued'
    ),
    'meramCashierPhoneIssue',$new$;
BEGIN
  IF array_length(string_to_array(definition,old_gate),1) IS DISTINCT FROM 2
     OR array_length(string_to_array(definition,old_context),1) IS DISTINCT FROM 2
     OR strpos(definition,'''meramRewardEarned''') > 0 THEN
    RAISE EXCEPTION 'Unexpected card link worker definition';
  END IF;
  EXECUTE replace(replace(definition,old_gate,
    'w.cafe_id<>''321fd305-1883-48df-ab69-829cf7d1bc48''::uuid'),old_context,new_context);
END
$migration$;
