BEGIN;
DO $$DECLARE src text;old_clause text:='(to_jsonb(r)#>>$2::text[])=$3';new_clause text:='(CASE WHEN $6 THEN lower(to_jsonb(r)#>>$2::text[]) ELSE to_jsonb(r)#>>$2::text[] END)=(CASE WHEN $6 THEN lower($3) ELSE $3 END)';old_args text:='v,ctx.filter_key,ctx.filter_value;';BEGIN
 SELECT pg_get_functiondef('erp_settings_private.allocate_number(uuid,text,uuid,timestamp with time zone)'::regprocedure) INTO src;
 IF position(old_clause IN src)=0 OR position(old_args IN src)=0 THEN RAISE EXCEPTION 'Number allocator collision contract changed';END IF;
 src:=replace(src,old_clause,new_clause);src:=replace(src,old_args,'v,ctx.filter_key,ctx.filter_value,ctx.table_name=''erp_branch_details'';');EXECUTE src;
END $$;
COMMIT;
