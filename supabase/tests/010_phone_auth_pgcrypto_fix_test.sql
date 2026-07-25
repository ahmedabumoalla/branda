-- pgTAP: pgcrypto resolution for atomic phone OTP consumption.
BEGIN;
SELECT plan(4);

SELECT is(
  (
    SELECT namespace.nspname
    FROM pg_catalog.pg_extension AS extension
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = extension.extnamespace
    WHERE extension.extname = 'pgcrypto'
  ),
  'extensions',
  'pgcrypto is installed in extensions schema'
);

SELECT ok(
  to_regprocedure('extensions.gen_random_bytes(integer)') IS NOT NULL,
  'cryptographic random byte generator is available'
);

SELECT like(
  pg_catalog.pg_get_functiondef(
    'public.finalize_customer_phone_auth(uuid,text,uuid,text,text,uuid)'::regprocedure
  ),
  '%extensions.gen_random_bytes(32)%',
  'phone auth finalizer uses schema-qualified random bytes'
);

SELECT like(
  pg_catalog.pg_get_functiondef(
    'public.register_verified_customer(uuid,text,uuid,text,text,text,text)'::regprocedure
  ),
  '%extensions.gen_random_bytes(32)%',
  'legacy verified registration uses schema-qualified random bytes'
);

SELECT * FROM finish();
ROLLBACK;
