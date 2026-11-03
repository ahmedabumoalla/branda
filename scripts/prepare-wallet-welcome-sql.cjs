const fs = require('node:fs');
const source = fs.readFileSync('supabase/migrations/20261103090344_wallet_download_welcome.sql', 'utf8').replace(/\r\n/g, '\n');
const body = source.replace(/^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, '');
fs.mkdirSync('output/wallet-welcome', { recursive: true });
const verify = `
DO $verify$
DECLARE card public.loyalty_cards; job jsonb; job_id uuid; other uuid;
BEGIN
 SELECT lc.* INTO card FROM public.loyalty_cards lc
 JOIN public.customer_profiles cp ON cp.id=lc.customer_profile_id AND cp.cafe_id=lc.cafe_id
 JOIN public.cafes c ON c.id=lc.cafe_id JOIN public.cafe_loyalty_programs lp ON lp.cafe_id=lc.cafe_id
 WHERE lc.status='active' AND cp.status='active' AND cp.blocked_at IS NULL AND NOT cp.phone_auth_conflict
 AND cp.phone_normalized ~ '^9665[0-9]{8}$' AND c.status='active' AND c.deleted_at IS NULL
 AND lp.enabled AND platform_access_private.service_enabled(c.id,'loyalty') LIMIT 1;
 IF card.id IS NULL THEN RAISE EXCEPTION 'Missing eligible rollback fixture'; END IF;
 IF EXISTS(SELECT 1 FROM loyalty_audit_private.wallet_welcomes) THEN RAISE EXCEPTION 'Unexpected backfill'; END IF;
 INSERT INTO loyalty_audit_private.wallet_customer_events(cafe_id,card_id,provider,kind,origin)
 VALUES(card.cafe_id,card.id,'apple','download','historical'),(card.cafe_id,card.id,'apple','installed','live');
 IF EXISTS(SELECT 1 FROM loyalty_audit_private.wallet_welcomes) THEN RAISE EXCEPTION 'Wrong trigger event'; END IF;
 INSERT INTO loyalty_audit_private.wallet_customer_events(cafe_id,card_id,provider,kind)
 VALUES(card.cafe_id,card.id,'apple','download'),(card.cafe_id,card.id,'google','save_link'),(card.cafe_id,card.id,'apple','download');
 IF (SELECT count(*) FROM loyalty_audit_private.wallet_welcomes)<>1 THEN RAISE EXCEPTION 'Duplicate welcome'; END IF;
 SELECT id INTO job_id FROM loyalty_audit_private.wallet_welcomes;
 -- A suspended member must not be sent a welcome
 UPDATE public.loyalty_cards SET status='suspended' WHERE id=card.id;
 IF public.claim_wallet_welcome(card.id) IS NOT NULL THEN RAISE EXCEPTION 'Inactive claim'; END IF;
 UPDATE public.loyalty_cards SET status='active' WHERE id=card.id;
 job:=public.claim_wallet_welcome(card.id);
 IF job IS NULL OR (job->>'id')::uuid<>job_id OR job->>'brandName' IS NULL THEN RAISE EXCEPTION 'Claim context failed'; END IF;
 IF public.claim_wallet_welcome(card.id) IS NOT NULL THEN RAISE EXCEPTION 'Claim replay'; END IF;
 IF public.finish_wallet_welcome(job_id,gen_random_uuid(),'queued','test') THEN RAISE EXCEPTION 'Invalid lease accepted'; END IF;
 IF NOT public.finish_wallet_welcome(job_id,(job->>'claimToken')::uuid,'queued','test') THEN RAISE EXCEPTION 'Finish failed'; END IF;
 IF public.finish_wallet_welcome(job_id,(job->>'claimToken')::uuid,'queued','test') THEN RAISE EXCEPTION 'Finish replay'; END IF;
 IF public.claim_wallet_welcome(card.id) IS NOT NULL THEN RAISE EXCEPTION 'Sent claim repeated'; END IF;
 UPDATE loyalty_audit_private.wallet_welcomes SET status='dispatching',attempted_at=now()-interval '6 minutes' WHERE id=job_id;
 IF public.claim_wallet_welcome(card.id) IS NOT NULL THEN RAISE EXCEPTION 'Ambiguous retry'; END IF;
 IF (SELECT status FROM loyalty_audit_private.wallet_welcomes WHERE id=job_id)<>'unknown' THEN RAISE EXCEPTION 'Stale dispatch not marked unknown'; END IF;
 UPDATE loyalty_audit_private.wallet_welcomes SET status='pending',created_at=now()-interval '25 hours' WHERE id=job_id;
 PERFORM public.claim_wallet_welcome(card.id);
 IF (SELECT status FROM loyalty_audit_private.wallet_welcomes WHERE id=job_id)<>'expired' THEN RAISE EXCEPTION 'Stale welcome'; END IF;
 IF has_function_privilege('anon','public.claim_wallet_welcome(uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.claim_wallet_welcome(uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.finish_wallet_welcome(uuid,uuid,text,text)','EXECUTE')
 OR has_table_privilege('service_role','loyalty_audit_private.wallet_welcomes','SELECT')
 OR NOT has_function_privilege('service_role','public.claim_wallet_welcome(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Unsafe privileges'; END IF;
END $verify$;
SET LOCAL ROLE anon;
DO $denied$ BEGIN
 BEGIN PERFORM public.claim_wallet_welcome(NULL); RAISE EXCEPTION 'Anon claim allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $denied$;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.claim_wallet_welcome(NULL) IS NULL AS no_replayed_jobs;
RESET ROLE;
`;
fs.writeFileSync('output/wallet-welcome/rollback.sql', 'BEGIN;\n' + body + verify + '\nROLLBACK;');
fs.writeFileSync('output/wallet-welcome/apply.sql', 'BEGIN;\n' + body + `\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261103090344','wallet_download_welcome',ARRAY['${source.replaceAll("'", "''")}']);\nCOMMIT;`);
console.log('Prepared rollback-only validation and scoped application');
