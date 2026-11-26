-- Attach proof of the issuing cashier operation to the existing leased job.
-- Self-registration, pager enrollment and later stamps cannot authorize this invitation.
DO $migration$
DECLARE
  worker regprocedure := 'public.claim_stamp_card_link_v3(boolean,boolean)'::regprocedure;
  definition text := pg_get_functiondef(worker);
  anchor text := $old$'privateSenderRequested',EXISTS$old$;
  replacement text := $new$'meramCashierPhoneIssue',
    j.cafe_id='98fd33d5-522d-46e7-adeb-34b04a665f4f'::uuid AND j.card_created AND EXISTS (
      SELECT 1 FROM loyalty_read_private.operations o
      WHERE o.cafe_id=j.cafe_id AND o.invitation_job_id=j.id AND o.method='phone'
        AND o.status='succeeded' AND o.result->>'cardCreated'='true'
    ),
    'privateSenderRequested',EXISTS$new$;
BEGIN
  IF array_length(string_to_array(definition,anchor),1) IS DISTINCT FROM 2
     OR strpos(definition,'''meramCashierPhoneIssue''') > 0 THEN
    RAISE EXCEPTION 'Unexpected card link worker definition';
  END IF;
  EXECUTE replace(definition,anchor,replacement);
END
$migration$;
