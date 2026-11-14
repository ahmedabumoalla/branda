-- Reviewed rollback, not applied. Refuse to remove any retained order/accounting history.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.hospital_orders) OR EXISTS(SELECT 1 FROM public.hospital_order_events) THEN RAISE EXCEPTION 'Hospital history exists: disable hospital_store_settings.enabled and prepare a data-preserving rollback';END IF;
END $$;
DO $$ DECLARE src text;needle text;BEGIN
 SELECT pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure) INTO src;
 needle:='price:=coalesce(hospital_private.confirmed_price(p_cafe_id,p_request_id,entry),prod.price); iid:=prod.item_id;';
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Hospital price rollback source drift';END IF;
 src:=replace(src,needle,'price:=prod.price; iid:=prod.item_id;');
 needle:='IF r=''cashier'' AND p_operation NOT IN(''sale'',''refund'',''shift_open'',''shift_close'',''shift_handover'',''shift_accept'') AND NOT(p_operation=''settlement'' AND hospital_private.collection_authorized(p_cafe_id,p_request_id,p_payload)) THEN';
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Hospital authorization rollback source drift';END IF;
 src:=replace(src,needle,'IF r=''cashier'' AND p_operation NOT IN(''sale'',''refund'',''shift_open'',''shift_close'',''shift_handover'',''shift_accept'') THEN');
 needle:='INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,account_id,shift_id,total,paid,reference_id,note,created_by) VALUES(id,p_cafe_id,''settlement'',original.party_id,aid,hospital_private.collection_shift(p_cafe_id,p_request_id),amount,amount,original.id,note,auth.uid())';
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Hospital receipt rollback source drift';END IF;
 src:=replace(src,needle,'INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,account_id,total,paid,reference_id,note,created_by) VALUES(id,p_cafe_id,''settlement'',original.party_id,aid,amount,amount,original.id,note,auth.uid())');
 EXECUTE src;
 SELECT pg_get_functiondef('brand_finance_private.execute_before_inventory_catalog(uuid,text,jsonb,uuid)'::regprocedure) INTO src;
 needle:='IF NOT(p_operation=''settlement'' AND hospital_private.collection_authorized(p_cafe_id,p_request_id,p_payload)) THEN PERFORM brand_finance_private.assert_job_access(p_cafe_id,''brand_finance_execute'',p_operation); END IF;';
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Hospital job rollback source drift';END IF;
 EXECUTE replace(src,needle,'PERFORM brand_finance_private.assert_job_access(p_cafe_id,''brand_finance_execute'',p_operation);');
END $$;
DROP FUNCTION public.hospital_access_enabled(uuid),public.hospital_order_submit(text,uuid,jsonb,text),public.hospital_counter_order(uuid,uuid,jsonb),public.hospital_orders_read(uuid),public.hospital_order_manage(uuid,uuid,uuid,text,jsonb),public.hospital_debts_read(uuid),public.hospital_debt_collect(uuid,uuid,jsonb);
DROP SCHEMA hospital_private CASCADE;
DROP TABLE public.hospital_order_events,public.hospital_orders,public.hospital_store_settings;
NOTIFY pgrst,'reload schema';
COMMIT;
