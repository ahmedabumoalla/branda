BEGIN;
SET LOCAL lock_timeout='5s';
-- Keep the existing financial-invoice delivery permission in the same transaction.
CREATE FUNCTION brand_finance_private.sync_aldeem_policy_whatsapp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state jsonb; settings jsonb; platforms jsonb; enabled boolean;
BEGIN
 IF auth.uid() IS NULL OR brand_finance_private.role_for(NEW.cafe_id) IS DISTINCT FROM 'owner'
   OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=NEW.cafe_id AND slug='khayal-aldeem')
 THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.cafe_id::text,60412));
 state:=public.brand_finance_invoice_settings(NEW.cafe_id,'get');
 settings:=state->'settings';
 SELECT coalesce(jsonb_agg(value),'[]'::jsonb) INTO platforms
 FROM jsonb_array_elements(settings#>'{advanced,socialPlatforms}') WHERE value <> '"whatsapp"'::jsonb;
 IF (NEW.policy->>'whatsapp')::boolean THEN
   platforms:=platforms||'"whatsapp"'::jsonb; enabled:=true;
 ELSE
   enabled:=coalesce((settings#>>'{advanced,socialEnabled}')::boolean,false) AND jsonb_array_length(platforms)>0;
 END IF;
 settings:=jsonb_set(jsonb_set(settings,'{advanced,socialPlatforms}',platforms),'{advanced,socialEnabled}',to_jsonb(enabled));
 PERFORM public.brand_finance_invoice_settings(NEW.cafe_id,'save',settings,(state->>'revision')::integer);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.sync_aldeem_policy_whatsapp() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER sync_aldeem_policy_whatsapp BEFORE INSERT OR UPDATE OF policy
 ON brand_finance_private.aldeem_sales_policies FOR EACH ROW EXECUTE FUNCTION brand_finance_private.sync_aldeem_policy_whatsapp();

-- Preserve any choices already saved since the account policy was activated.
DO $$ DECLARE owner_id uuid; BEGIN
 SELECT c.owner_user_id INTO owner_id FROM public.cafes c
 JOIN brand_finance_private.aldeem_sales_policies p ON p.cafe_id=c.id WHERE c.slug='khayal-aldeem';
 IF owner_id IS NOT NULL THEN
   PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
   UPDATE brand_finance_private.aldeem_sales_policies p SET policy=p.policy
   FROM public.cafes c WHERE p.cafe_id=c.id AND c.slug='khayal-aldeem';
 END IF;
END $$;
COMMIT;
