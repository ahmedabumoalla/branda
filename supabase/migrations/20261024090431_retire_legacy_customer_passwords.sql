-- Authorized one-time retirement of customer passwords, not customer identities.
-- Staff/owner/admin passwords and OTP/card access must remain unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Prevent concurrent role assignment while the customer-only cohort is selected.
LOCK TABLE public.profiles, public.cafes, public.cafe_members, public.bf_staff,
  public.platform_representatives, public.cafe_cashiers IN SHARE MODE;
LOCK TABLE auth.users, public.customer_profiles IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE retired_customer_password_targets ON COMMIT DROP AS
SELECT u.id FROM auth.users u JOIN public.profiles p ON p.id = u.id
WHERE p.role = 'customer'
  AND NOT EXISTS (SELECT 1 FROM public.cafes c WHERE c.owner_user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.cafe_members m WHERE m.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.bf_staff s WHERE s.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.platform_representatives r WHERE r.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.cafe_cashiers c WHERE c.owner_user_id = u.id);

-- Only revoke sessions known to originate from passwords. Keep OTP sessions.
CREATE TEMP TABLE retired_customer_password_sessions ON COMMIT DROP AS
SELECT s.id FROM auth.sessions s
JOIN retired_customer_password_targets t ON t.id = s.user_id
WHERE EXISTS (SELECT 1 FROM auth.mfa_amr_claims a
              WHERE a.session_id = s.id AND a.authentication_method = 'password')
  AND NOT EXISTS (SELECT 1 FROM auth.mfa_amr_claims a
                  WHERE a.session_id = s.id AND a.authentication_method = 'otp');

CREATE TEMP TABLE customer_password_cleanup_result ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM retired_customer_password_targets) AS customer_identities,
  (SELECT count(*) FROM auth.users u JOIN retired_customer_password_targets t ON t.id=u.id
    WHERE coalesce(u.encrypted_password,'') <> '') AS auth_passwords_removed,
  (SELECT count(*) FROM public.customer_profiles WHERE password_hash IS NOT NULL) AS legacy_passwords_removed,
  (SELECT count(*) FROM retired_customer_password_sessions) AS password_sessions_revoked,
  (SELECT count(*) FROM auth.users u JOIN public.profiles p ON p.id=u.id
    WHERE p.role='customer' AND NOT EXISTS (SELECT 1 FROM retired_customer_password_targets t WHERE t.id=u.id)) AS employee_customer_identities_preserved;

-- Fingerprints stay in this transaction only; no credentials are exported.
CREATE TEMP TABLE customer_password_auth_before ON COMMIT DROP AS
SELECT u.id, md5((CASE WHEN t.id IS NULL THEN to_jsonb(u)
  ELSE to_jsonb(u) - ARRAY['encrypted_password','recovery_token','recovery_sent_at','updated_at'] END)::text) AS fingerprint
FROM auth.users u LEFT JOIN retired_customer_password_targets t ON t.id=u.id;
CREATE TEMP TABLE customer_password_profiles_before ON COMMIT DROP AS
SELECT id, md5((to_jsonb(c) - ARRAY['password_hash','password_updated_at',
  'password_reset_token_hash','password_reset_expires_at','updated_at'])::text) AS fingerprint
FROM public.customer_profiles c;
CREATE TEMP TABLE customer_password_preserved_tables(table_name text PRIMARY KEY, fingerprint text) ON COMMIT DROP;
DO $$
DECLARE relation text; fingerprint text;
BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'public.profiles','public.cafes','public.cafe_members','public.bf_staff',
    'public.platform_representatives','public.cafe_cashiers',
    'public.customer_phone_auth_identities','auth.identities',
    'public.loyalty_cards','public.loyalty_accounts','public.loyalty_transactions',
    'public.loyalty_card_events','public.loyalty_activity_events',
    'public.customer_reward_instances','public.customer_reward_redemptions',
    'public.wallet_passes','public.wallet_apple_registrations'
  ] LOOP
    EXECUTE format('SELECT md5(coalesce(string_agg(h, '''' ORDER BY h), '''')) FROM (SELECT md5(to_jsonb(r)::text) h FROM %s r) s',relation::regclass) INTO fingerprint;
    INSERT INTO customer_password_preserved_tables VALUES (relation,fingerprint);
  END LOOP;
END $$;
CREATE TEMP TABLE customer_password_sessions_before ON COMMIT DROP AS
SELECT s.id,md5(to_jsonb(s)::text) AS fingerprint FROM auth.sessions s
WHERE NOT EXISTS (SELECT 1 FROM retired_customer_password_sessions d WHERE d.id=s.id);

UPDATE auth.users u SET encrypted_password='', recovery_token='', recovery_sent_at=NULL, updated_at=now()
FROM retired_customer_password_targets t WHERE u.id=t.id
AND (coalesce(u.encrypted_password,'')<>'' OR coalesce(u.recovery_token,'')<>'' OR u.recovery_sent_at IS NOT NULL);
DELETE FROM auth.one_time_tokens o USING retired_customer_password_targets t
WHERE o.user_id=t.id AND o.token_type='recovery_token';
-- Refresh tokens and AMR claims cascade only from the selected sessions.
DELETE FROM auth.sessions s USING retired_customer_password_sessions d WHERE s.id=d.id;

-- Retired legacy credentials also exist for brands without a current subscription.
-- The exclusive table lock prevents other writes during this maintenance exception.
-- Restore the exact trigger before commit; never change RLS or employee Auth data.
ALTER TABLE public.customer_profiles DISABLE TRIGGER package_service_write;
UPDATE public.customer_profiles SET password_hash=NULL, password_updated_at=NULL,
  password_reset_token_hash=NULL, password_reset_expires_at=NULL
WHERE password_hash IS NOT NULL OR password_updated_at IS NOT NULL
  OR password_reset_token_hash IS NOT NULL OR password_reset_expires_at IS NOT NULL;
ALTER TABLE public.customer_profiles ENABLE TRIGGER package_service_write;

DO $$
DECLARE item record; current_fingerprint text;
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users u JOIN retired_customer_password_targets t ON t.id=u.id
             WHERE coalesce(u.encrypted_password,'')<>'' OR coalesce(u.recovery_token,'')<>'')
    OR EXISTS (SELECT 1 FROM public.customer_profiles WHERE password_hash IS NOT NULL
               OR password_reset_token_hash IS NOT NULL)
    OR EXISTS (SELECT 1 FROM auth.sessions s JOIN retired_customer_password_sessions d ON d.id=s.id)
    OR EXISTS (SELECT 1 FROM auth.one_time_tokens o JOIN retired_customer_password_targets t ON t.id=o.user_id WHERE o.token_type='recovery_token')
    THEN RAISE EXCEPTION 'Customer password cleanup incomplete'; END IF;
  IF EXISTS (
    SELECT 1 FROM customer_password_auth_before b FULL JOIN auth.users u ON u.id=b.id
    LEFT JOIN retired_customer_password_targets t ON t.id=u.id
    WHERE b.id IS NULL OR u.id IS NULL OR b.fingerprint IS DISTINCT FROM
      md5((CASE WHEN t.id IS NULL THEN to_jsonb(u) ELSE to_jsonb(u)-ARRAY['encrypted_password','recovery_token','recovery_sent_at','updated_at'] END)::text)
  ) THEN RAISE EXCEPTION 'Identity or employee credential changed'; END IF;
  IF EXISTS (
    SELECT 1 FROM customer_password_profiles_before b FULL JOIN public.customer_profiles c ON c.id=b.id
    WHERE b.id IS NULL OR c.id IS NULL OR b.fingerprint IS DISTINCT FROM
      md5((to_jsonb(c)-ARRAY['password_hash','password_updated_at','password_reset_token_hash','password_reset_expires_at','updated_at'])::text)
  ) THEN RAISE EXCEPTION 'Customer data or card session changed'; END IF;
  IF EXISTS (
    SELECT 1 FROM customer_password_sessions_before b LEFT JOIN auth.sessions s ON s.id=b.id
    WHERE s.id IS NULL OR b.fingerprint IS DISTINCT FROM md5(to_jsonb(s)::text)
  ) THEN RAISE EXCEPTION 'Preserved session changed'; END IF;
  FOR item IN SELECT * FROM customer_password_preserved_tables LOOP
    EXECUTE format('SELECT md5(coalesce(string_agg(h, '''' ORDER BY h), '''')) FROM (SELECT md5(to_jsonb(r)::text) h FROM %s r) s',item.table_name::regclass) INTO current_fingerprint;
    IF current_fingerprint IS DISTINCT FROM item.fingerprint THEN
      RAISE EXCEPTION 'Preserved table changed: %',item.table_name;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.customer_profiles'::regclass
      AND tgname='package_service_write' AND tgenabled='O') THEN
    RAISE EXCEPTION 'Subscription guard was not restored';
  END IF;
END $$;
COMMIT;
