BEGIN;

ALTER TABLE public.cafes ADD COLUMN phone_country text NOT NULL DEFAULT 'SA'
  CONSTRAINT cafes_phone_country_check CHECK (phone_country IN ('SA','PS'));

CREATE SCHEMA brand_phone_private;
REVOKE ALL ON SCHEMA brand_phone_private FROM PUBLIC, anon, authenticated, service_role;

-- Registration sets this identity attribute on the original cafe INSERT.
-- Existing applications may still update unrelated brand settings.
CREATE FUNCTION brand_phone_private.keep_country() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'Account phone country cannot be changed after registration' USING ERRCODE='22023';
END $$;
REVOKE ALL ON FUNCTION brand_phone_private.keep_country() FROM PUBLIC;
CREATE TRIGGER keep_brand_phone_country BEFORE UPDATE OF phone_country ON public.cafes
FOR EACH ROW WHEN (OLD.phone_country IS DISTINCT FROM NEW.phone_country)
EXECUTE FUNCTION brand_phone_private.keep_country();

CREATE FUNCTION brand_phone_private.normalize(p_cafe uuid,p_value text)
RETURNS text LANGUAGE sql STABLE STRICT SECURITY INVOKER SET search_path='' AS $$
  WITH input AS (
    SELECT regexp_replace(translate(btrim(p_value),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),
      '[[:space:]()-]','','g') AS v
  )
  SELECT CASE
    WHEN c.phone_country='PS' AND v ~ '^(\+|00)?9700?5[69][0-9]{7}$' THEN '970'||right(v,9)
    WHEN c.phone_country='PS' AND v ~ '^0?5[69][0-9]{7}$' THEN '970'||right(v,9)
    WHEN c.phone_country='SA' AND v ~ '^(\+|00)?9660?5[0-9]{8}$' THEN '966'||right(v,9)
    WHEN c.phone_country='SA' AND v ~ '^0?5[0-9]{8}$' THEN '966'||right(v,9)
    ELSE NULL END
  FROM public.cafes c CROSS JOIN input WHERE c.id=p_cafe
$$;
CREATE FUNCTION brand_phone_private.canonical(p_cafe uuid,p_value text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT coalesce(brand_phone_private.normalize(p_cafe,p_value)=p_value,false)
$$;
CREATE FUNCTION brand_phone_private.sale_phone(p_cafe uuid,p_value text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE normalized text;
BEGIN
  IF nullif(btrim(p_value),'') IS NULL THEN RETURN NULL; END IF;
  normalized:=brand_phone_private.normalize(p_cafe,p_value);
  IF normalized IS NULL THEN RAISE EXCEPTION 'Invalid customer phone'; END IF;
  RETURN normalized;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA brand_phone_private FROM PUBLIC,anon,authenticated,service_role;

GRANT USAGE ON SCHEMA brand_phone_private TO service_role;
GRANT EXECUTE ON FUNCTION brand_phone_private.normalize(uuid,text), brand_phone_private.canonical(uuid,text), brand_phone_private.sale_phone(uuid,text) TO service_role;

COMMIT;
