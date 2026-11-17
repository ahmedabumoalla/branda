BEGIN;

CREATE TABLE brand_finance_private.aldeem_sales_policies (
  cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id) ON DELETE CASCADE,
  policy jsonb NOT NULL CHECK (jsonb_typeof(policy) = 'object'),
  revision integer NOT NULL CHECK (revision > 0),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE brand_finance_private.aldeem_sales_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE brand_finance_private.aldeem_sales_policies FROM PUBLIC, anon, authenticated, service_role;

-- The table has no direct API grants; the tenant-checked RPC is its only entry.
CREATE FUNCTION public.aldeem_sales_policy(p_cafe_id uuid, p_action text DEFAULT 'get', p_policy jsonb DEFAULT NULL, p_revision integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; key text;
  boolean_keys text[] := ARRAY['autoNumber','editNumber','editDate','lastPrice','showCost','minimumPrice','discounts','print','whatsapp','preview','credit','belowCost','outOfStock','cash','network','visa','transfer','taxEnabled'];
BEGIN
  IF auth.uid() IS NULL OR brand_finance_private.role_for(p_cafe_id) IS DISTINCT FROM 'owner'
    OR NOT EXISTS (SELECT 1 FROM public.cafes WHERE id = p_cafe_id AND slug = 'khayal-aldeem')
  THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;

  IF p_action = 'get' THEN
    SELECT jsonb_build_object('policy', policy, 'revision', revision) INTO result
      FROM brand_finance_private.aldeem_sales_policies WHERE cafe_id = p_cafe_id;
    RETURN result;
  END IF;
  IF p_action IS DISTINCT FROM 'save' OR p_revision IS NULL OR p_revision < 0
    OR jsonb_typeof(p_policy) IS DISTINCT FROM 'object'
  THEN RAISE EXCEPTION 'Invalid policy request' USING ERRCODE = '22023'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_policy)) <> 22
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_policy) k WHERE NOT (k = ANY(boolean_keys || ARRAY['firstNumber','decimals','taxName','taxRate'])))
  THEN RAISE EXCEPTION 'Invalid policy keys' USING ERRCODE = '22023'; END IF;
  FOREACH key IN ARRAY boolean_keys LOOP
    IF jsonb_typeof(p_policy->key) IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Invalid policy switch' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH key IN ARRAY ARRAY['firstNumber','decimals','taxRate'] LOOP
    IF jsonb_typeof(p_policy->key) IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Invalid policy number' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF (p_policy->>'firstNumber')::numeric NOT BETWEEN 1 AND 999999999
    OR trunc((p_policy->>'firstNumber')::numeric) <> (p_policy->>'firstNumber')::numeric
    OR (p_policy->>'decimals')::numeric NOT BETWEEN 0 AND 6
    OR trunc((p_policy->>'decimals')::numeric) <> (p_policy->>'decimals')::numeric
    OR (p_policy->>'taxRate')::numeric NOT BETWEEN 0 AND 100
    OR jsonb_typeof(p_policy->'taxName') IS DISTINCT FROM 'string'
    OR length(btrim(p_policy->>'taxName')) NOT BETWEEN 1 AND 80
    OR NOT ((p_policy->>'print')::boolean OR (p_policy->>'whatsapp')::boolean)
    OR NOT ((p_policy->>'cash')::boolean OR (p_policy->>'network')::boolean OR (p_policy->>'visa')::boolean OR (p_policy->>'transfer')::boolean)
  THEN RAISE EXCEPTION 'Invalid policy values' USING ERRCODE = '22023'; END IF;

  IF p_revision = 0 THEN
    INSERT INTO brand_finance_private.aldeem_sales_policies(cafe_id, policy, revision, updated_by)
      VALUES(p_cafe_id, p_policy, 1, auth.uid()) ON CONFLICT (cafe_id) DO NOTHING
      RETURNING jsonb_build_object('policy', policy, 'revision', revision) INTO result;
  ELSE
    UPDATE brand_finance_private.aldeem_sales_policies
      SET policy = p_policy, revision = revision + 1, updated_by = auth.uid(), updated_at = now()
      WHERE cafe_id = p_cafe_id AND revision = p_revision
      RETURNING jsonb_build_object('policy', policy, 'revision', revision) INTO result;
  END IF;
  IF result IS NULL THEN RAISE EXCEPTION 'Policy revision conflict' USING ERRCODE = '40001'; END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.aldeem_sales_policy(uuid,text,jsonb,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aldeem_sales_policy(uuid,text,jsonb,integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
