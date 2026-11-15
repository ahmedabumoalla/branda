-- Central Account Settings apply only at future issuance; no historical rows change.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';

CREATE OR REPLACE FUNCTION brand_finance_private.receipt_seller(p_cafe uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('name',c.name,'vatNumber',coalesce(nullif(btrim(s.tax_number),''),''))
 FROM public.cafes c LEFT JOIN public.cafe_settings s ON s.cafe_id=c.id
 WHERE c.id=p_cafe
$$;
REVOKE ALL ON FUNCTION brand_finance_private.receipt_seller(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Existing accounts without central settings retain their original invoice issuer.
-- A deliberately cleared central VAT/address must never revive stale draft values.
CREATE FUNCTION brand_finance_private.company_seller(p_cafe uuid,p_legacy jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN g.cafe_id IS NULL THEN p_legacy ELSE jsonb_build_object(
  'name',c.name,'vatNumber',coalesce(nullif(btrim(s.tax_number),''),''),
  'address',concat_ws('، ',nullif(btrim(g.payload->>'building'),''),nullif(btrim(g.payload->>'street'),''),
    nullif(btrim(g.payload->>'secondary'),''),nullif(btrim(g.payload->>'district'),''),
    nullif(btrim(g.payload->>'city'),''),nullif(btrim(g.payload->>'postal'),''),nullif(btrim(g.payload->>'shortAddress'),''),
    CASE WHEN g.payload->>'country'='SA' AND EXISTS(SELECT 1 FROM unnest(ARRAY['building','street','secondary','district','city','postal','shortAddress']) field WHERE nullif(btrim(g.payload->>field),'') IS NOT NULL) THEN 'المملكة العربية السعودية' END)) END
 FROM public.cafes c LEFT JOIN public.cafe_settings s ON s.cafe_id=c.id
 LEFT JOIN public.erp_system_settings g ON g.cafe_id=c.id AND g.kind='general'
 WHERE c.id=p_cafe
$$;
REVOKE ALL ON FUNCTION brand_finance_private.company_seller(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

DO $migration$
DECLARE source text;signature text;needle text;replacement text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'brand_finance_private.issue_company_invoice_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)',
  'brand_finance_private.issue_manual_invoice_shipping_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)'
 ] LOOP
  SELECT pg_get_functiondef(signature::regprocedure) INTO source;
  needle:=$old$seller:=draft.payload->'issuer';$old$;
  IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Account issuer assignment anchor drift: %',signature;END IF;
  EXECUTE replace(source,needle,$new$seller:=brand_finance_private.company_seller(p_cafe_id,draft.payload->'issuer');$new$);
 END LOOP;

 SELECT pg_get_functiondef('public.erp_system_settings_write(uuid,text,jsonb,uuid)'::regprocedure) INTO source;
 needle:=$old$   PERFORM public.save_owner_cafe_settings(p_cafe,jsonb_build_object($old$;
 replacement:=$new$   IF cfg ? 'taxNumber' AND (jsonb_typeof(cfg->'taxNumber') IS DISTINCT FROM 'string' OR btrim(cfg->>'taxNumber') !~ '^(|3[0-9]{13}3)$') THEN
    RAISE EXCEPTION 'أدخل رقمًا ضريبيًا صحيحًا من ١٥ رقمًا يبدأ وينتهي بالرقم ٣ أو اتركه فارغًا' USING ERRCODE='22023';
   END IF;
   IF cfg ? 'taxNumber' THEN cfg:=jsonb_set(cfg,'{taxNumber}',to_jsonb(btrim(cfg->>'taxNumber')));END IF;
   PERFORM public.save_owner_cafe_settings(p_cafe,jsonb_build_object($new$;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Account VAT validation anchor drift';END IF;
 EXECUTE replace(source,needle,replacement);
END $migration$;

-- Keep the existing authorized RPC, immutable receipt trigger, refund inheritance,
-- offline conflict guard, company invoice snapshots, tax amounts and ledgers intact.
NOTIFY pgrst,'reload schema';
COMMIT;
