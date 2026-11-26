BEGIN;

-- A queued device receipt belongs to the drawer period in which it was saved.
-- The actual journal date stays at posting time. Normal command authorization,
-- original receipt idempotency, stock, tax and price validation still run.
CREATE FUNCTION brand_finance_private.mind_receipt_in_shift(sh public.bf_shifts, payload jsonb)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
 SELECT sh.cafe_id = 'ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' AND auth.uid() IS NOT NULL
   AND payload ?& ARRAY['localReceiptReference','localCreatedAt','offlineExpectedVatRate','offlineExpectedTaxInclusive']
   AND (payload->>'localCreatedAt')::timestamptz >= sh.opened_at
   AND (payload->>'localCreatedAt')::timestamptz <= coalesce(sh.closed_at,statement_timestamp())
   AND NOT EXISTS (
     SELECT FROM public.bf_shifts successor WHERE successor.cafe_id=sh.cafe_id AND successor.account_id=sh.account_id
       AND (successor.opened_at,successor.shift_number,successor.id)>(sh.opened_at,sh.shift_number,sh.id)
       AND successor.opened_at <= (payload->>'localCreatedAt')::timestamptz
   )
$$;
REVOKE ALL ON FUNCTION brand_finance_private.mind_receipt_in_shift(public.bf_shifts,jsonb) FROM PUBLIC,anon,authenticated,service_role;

DO $patch$
DECLARE src text; needle text;
BEGIN
 src:=pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure);
 needle:=$old$bf_shifts.id=sid AND status='open' AND
     CASE WHEN p_cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef'
          THEN bf_shifts.id=brand_finance_private.mind_drawer_shift(bf_shifts.account_id)
          ELSE user_id=auth.uid() END FOR UPDATE;$old$;
 src:=replace(src,chr(13),''); needle:=replace(needle,chr(13),'');
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Unexpected POS shift selector'; END IF;
 EXECUTE replace(src,needle,$new$bf_shifts.id=sid AND
     CASE WHEN p_cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' THEN
       (status='open' AND bf_shifts.id=brand_finance_private.mind_drawer_shift(bf_shifts.account_id))
       OR brand_finance_private.mind_receipt_in_shift(bf_shifts,p_payload)
     ELSE status='open' AND user_id=auth.uid() END FOR UPDATE;$new$);

 src:=pg_get_functiondef('public.mind_pos_shift_report(uuid,uuid)'::regprocedure);
 needle:=$old$d.created_at <= (report#>>'{shift,closed_at}')::timestamptz
      AND (next_start IS NULL OR d.created_at < next_start)$old$;
 src:=replace(src,chr(13),''); needle:=replace(needle,chr(13),'');
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Unexpected report cutoff'; END IF;
 EXECUTE replace(src,needle,$new$((d.created_at <= (report#>>'{shift,closed_at}')::timestamptz AND (next_start IS NULL OR d.created_at < next_start))
        OR (d.local_reference IS NOT NULL AND d.local_created_at >= (report#>>'{shift,opened_at}')::timestamptz
          AND d.local_created_at <= (report#>>'{shift,closed_at}')::timestamptz AND (next_start IS NULL OR d.local_created_at < next_start)))$new$);

 src:=pg_get_functiondef('brand_finance_private.mind_operational_shift(uuid,text,jsonb,uuid)'::regprocedure);
 needle:='RETURN result;';
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Unexpected close commit'; END IF;
 -- The close audit row is visible before reading, including when another cashier opened the drawer.
 EXECUTE replace(src,needle,$new$IF p_operation='shift_close' THEN
   BEGIN
     result:=result||jsonb_build_object('closingReport',public.mind_pos_shift_report(p_cafe,sh.id));
   EXCEPTION WHEN OTHERS THEN
     RAISE LOG 'MIND close receipt read failed, SQLSTATE %',SQLSTATE;
   END;
 END IF;
 RETURN result;$new$);
END $patch$;

NOTIFY pgrst,'reload schema';
COMMIT;
