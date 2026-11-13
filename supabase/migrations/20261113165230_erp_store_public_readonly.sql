BEGIN;
DO $patch$
DECLARE definition text;previous text:=$old$ PERFORM pg_advisory_xact_lock(63130,hashtext(p_cafe::text));
 SELECT * INTO pub FROM public.erp_store_publications WHERE cafe_id=p_cafe FOR UPDATE;$old$;
replacement text:=$new$ IF p_action IN('publish','unpublish') THEN
  PERFORM pg_advisory_xact_lock(63130,hashtext(p_cafe::text));
  SELECT * INTO pub FROM public.erp_store_publications WHERE cafe_id=p_cafe FOR UPDATE;
 ELSE
  SELECT * INTO pub FROM public.erp_store_publications WHERE cafe_id=p_cafe;
 END IF;$new$;
BEGIN
 definition:=pg_get_functiondef('public.erp_store_publish(uuid,text,jsonb)'::regprocedure);
 IF position(previous IN definition)=0 OR position('IF p_action IS NULL' IN definition)=0 OR position('IS DISTINCT FROM ''owner''' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected publication function predecessor';END IF;
 EXECUTE replace(definition,previous,replacement);
END $patch$;
COMMIT;
