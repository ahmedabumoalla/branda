const fs = require('node:fs');
const source = fs.readFileSync('supabase/migrations/20261102123500_representative_visit_intake.sql', 'utf8').replace(/\r\n/g, '\n');
const body = source.replace(/^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, '');
fs.mkdirSync('output/representative-visits', { recursive: true });
const verify = `
DO $verify$
DECLARE rid uuid:=gen_random_uuid(); tok uuid:=gen_random_uuid(); result jsonb; stamp timestamptz;
BEGIN
  result:=public.claim_representative_visit(rid,repeat('a',64),repeat('b',64),tok);
  IF result->>'status'<>'claimed' THEN RAISE EXCEPTION 'Claim failed'; END IF;
  result:=public.claim_representative_visit(rid,repeat('a',64),repeat('b',64),tok);
  IF result->>'status'<>'busy' THEN RAISE EXCEPTION 'Lease failed'; END IF;
  stamp:=public.finish_representative_visit(rid,tok,'{"brandName":"Visit test fixture","representativeName":"Test fixture","managerPhone":"","ownerPhone":"","interest":"interested","services":["menu"],"otherService":"","latitude":24,"longitude":46,"mapsUrl":"","hasMenu":false}'::jsonb);
  IF stamp IS NULL THEN RAISE EXCEPTION 'Save failed'; END IF;
  result:=public.claim_representative_visit(rid,repeat('a',64),repeat('b',64),tok);
  IF result->>'status'<>'saved' THEN RAISE EXCEPTION 'Idempotency failed'; END IF;
  IF has_function_privilege('anon','public.claim_representative_visit(uuid,text,text,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.finish_representative_visit(uuid,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Unsafe RPC permissions'; END IF;
END $verify$;
SET LOCAL ROLE authenticated;
DO $owner$ BEGIN IF EXISTS(SELECT 1 FROM public.representative_visits) THEN RAISE EXCEPTION 'Non-admin can read visits'; END IF; END $owner$;
RESET ROLE;
`;
fs.writeFileSync('output/representative-visits/rollback.sql', 'BEGIN;\n' + body + verify + 'ROLLBACK;');
fs.writeFileSync('output/representative-visits/apply.sql', 'BEGIN;\n' + body + `\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261102123500','representative_visit_intake',ARRAY['${source.replaceAll("'", "''")}']);\nCOMMIT;`);
console.log('Prepared scoped migration, rollback verification and exact migration history');
