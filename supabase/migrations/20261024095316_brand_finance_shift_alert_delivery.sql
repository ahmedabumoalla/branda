BEGIN;
ALTER TABLE public.bf_shift_alerts
 ADD COLUMN delivery_status text NOT NULL DEFAULT 'pending' CHECK(delivery_status IN('pending','processing','queued','rejected','unknown','missing_owner')),
 ADD COLUMN lease_token uuid,
 ADD COLUMN leased_at timestamptz,
 ADD COLUMN completed_at timestamptz,
 ADD COLUMN provider_message_id text,
 ADD COLUMN error_code text;
CREATE INDEX bf_shift_alert_delivery_pending ON public.bf_shift_alerts(created_at) WHERE delivery_status='pending';

-- Only the trusted worker can claim an alert. Recipient is derived from the
-- actual brand owner identity, never a request payload or public contact field
CREATE FUNCTION public.brand_finance_claim_shift_alerts(p_cafe_id uuid DEFAULT NULL,p_shift_id uuid DEFAULT NULL,p_limit integer DEFAULT 5)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.bf_shift_alerts; result jsonb:='[]'::jsonb; recipient text; brand text; employee text;
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>10 THEN RAISE EXCEPTION 'Invalid alert batch'; END IF;
 -- A dead worker could have sent before crashing: never blindly send twice
 UPDATE public.bf_shift_alerts SET delivery_status='unknown',completed_at=now(),error_code='lease_expired'
 WHERE delivery_status='processing' AND leased_at<now()-interval '5 minutes';
 FOR a IN SELECT * FROM public.bf_shift_alerts
 WHERE delivery_status='pending' AND (p_cafe_id IS NULL OR cafe_id=p_cafe_id) AND (p_shift_id IS NULL OR shift_id=p_shift_id)
 ORDER BY created_at,id LIMIT p_limit FOR UPDATE SKIP LOCKED LOOP
   recipient:=NULL; brand:=NULL; employee:=NULL;
   SELECT p.phone,c.name INTO recipient,brand FROM public.cafes c JOIN public.profiles p ON p.id=c.owner_user_id
   WHERE c.id=a.cafe_id AND c.deleted_at IS NULL AND c.status IN('active','published') AND p.status='active';
   SELECT coalesce(st.name,p.full_name) INTO employee FROM public.bf_shifts s
   LEFT JOIN public.bf_staff st ON st.cafe_id=s.cafe_id AND st.user_id=s.user_id
   LEFT JOIN public.profiles p ON p.id=s.user_id WHERE s.cafe_id=a.cafe_id AND s.id=a.shift_id;
   UPDATE public.bf_shift_alerts SET delivery_status='processing',lease_token=gen_random_uuid(),leased_at=now()
   WHERE id=a.id RETURNING * INTO a;
   result:=result||jsonb_build_array(jsonb_build_object('id',a.id,'leaseToken',a.lease_token,'phase',a.phase,
     'expectedCash',a.expected_cash,'countedCash',a.counted_cash,'difference',a.difference,
     'ownerPhone',recipient,'brandName',brand,'employeeName',employee,'createdAt',a.created_at));
 END LOOP;
 RETURN result;
END $$;

CREATE FUNCTION public.brand_finance_complete_shift_alert(p_alert_id uuid,p_lease_token uuid,p_status text,p_provider_message_id text DEFAULT NULL,p_error_code text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_status NOT IN('queued','rejected','unknown','missing_owner') OR p_status IS NULL
 OR length(coalesce(p_provider_message_id,''))>200 OR length(coalesce(p_error_code,''))>80
 OR (p_status='queued' AND nullif(trim(p_provider_message_id),'') IS NULL)
 THEN RAISE EXCEPTION 'Invalid delivery result'; END IF;
 UPDATE public.bf_shift_alerts SET delivery_status=p_status,completed_at=now(),provider_message_id=p_provider_message_id,error_code=p_error_code
 WHERE id=p_alert_id AND lease_token=p_lease_token AND delivery_status='processing';
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_claim_shift_alerts(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.brand_finance_complete_shift_alert(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.brand_finance_claim_shift_alerts(uuid,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_complete_shift_alert(uuid,uuid,text,text,text) TO service_role;
COMMIT;
