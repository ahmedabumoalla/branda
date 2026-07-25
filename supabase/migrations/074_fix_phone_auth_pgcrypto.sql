-- Ensure OTP challenge consumption can resolve the cryptographic byte generator.
BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
DECLARE
  v_extension_schema text;
BEGIN
  SELECT namespace.nspname
  INTO v_extension_schema
  FROM pg_catalog.pg_extension AS extension
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'pgcrypto';

  IF v_extension_schema IS NULL THEN
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
  ELSIF v_extension_schema <> 'extensions' THEN
    ALTER EXTENSION pgcrypto SET SCHEMA extensions;
  END IF;

  IF to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL THEN
    RAISE EXCEPTION 'PGCRYPTO_GEN_RANDOM_BYTES_MISSING';
  END IF;
END;
$$;

-- Preserve the deployed atomic bodies while replacing every unqualified call
-- with the verified, schema-qualified pgcrypto function.
DO $$
DECLARE
  v_function regprocedure;
  v_definition text;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'public.finalize_customer_phone_auth(uuid,text,uuid,text,text,uuid)'::regprocedure,
    'public.register_verified_customer(uuid,text,uuid,text,text,text,text)'::regprocedure
  ]
  LOOP
    SELECT pg_catalog.pg_get_functiondef(v_function::oid)
    INTO v_definition;

    IF v_definition NOT LIKE '%gen_random_bytes(%' THEN
      RAISE EXCEPTION 'PHONE_AUTH_RANDOM_BYTES_CALL_MISSING: %', v_function;
    END IF;

    v_definition := replace(
      v_definition,
      'gen_random_bytes(',
      'extensions.gen_random_bytes('
    );
    EXECUTE v_definition;
  END LOOP;
END;
$$;

COMMIT;
