-- Cashier drawers consume the same three-account cash allowance.
-- Deletion retains an audit tombstone and any zero-value opening metadata.
BEGIN;
ALTER TABLE public.bf_accounts ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.bf_accounts DROP CONSTRAINT bf_cashier_drawer_eligible;
ALTER TABLE public.bf_accounts ADD CONSTRAINT bf_cashier_drawer_eligible CHECK(
 NOT is_cashier_drawer OR (kind='cash' AND NOT is_primary AND (active OR deleted_at IS NOT NULL)));
ALTER TABLE public.bf_accounts ADD CONSTRAINT bf_deleted_account_inactive CHECK(deleted_at IS NULL OR (NOT active AND NOT is_primary AND kind='cash'));

CREATE FUNCTION brand_finance_private.can_delete_cash(p_cafe uuid,p_account uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.bf_accounts a WHERE a.cafe_id=p_cafe AND a.id=p_account
  AND a.kind='cash' AND a.code LIKE 'T-%' AND NOT a.is_primary AND a.deleted_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM public.bf_journal WHERE cafe_id=p_cafe AND account_id=p_account)
 AND NOT EXISTS(SELECT 1 FROM public.bf_documents WHERE cafe_id=p_cafe AND account_id=p_account AND (kind<>'opening' OR total<>0 OR paid<>0))
 AND NOT EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=p_cafe AND account_id=p_account)
 AND NOT EXISTS(SELECT 1 FROM public.bf_treasury_reconciliations WHERE cafe_id=p_cafe AND account_id=p_account)
 AND NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe AND linked_bank_id=p_account)
 AND NOT EXISTS(SELECT 1 FROM public.bf_treasury_attachments f JOIN public.bf_documents d ON d.id=f.document_id AND d.cafe_id=f.cafe_id WHERE d.cafe_id=p_cafe AND d.account_id=p_account AND NOT f.abandoned)
$$;
REVOKE ALL ON FUNCTION brand_finance_private.can_delete_cash(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION brand_finance_private.cash_deletion_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.cafe_id::text,60412));
 IF OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'الخزينة محذوفة ولا يمكن إعادة استخدامها'; END IF;
 IF NEW.deleted_at IS NOT NULL AND NOT brand_finance_private.can_delete_cash(OLD.cafe_id,OLD.id) THEN
  RAISE EXCEPTION 'لا يمكن حذف خزينة رئيسية أو أساسية أو خزينة لها حركات أو ورديات أو ارتباطات';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.cash_deletion_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER bf_cash_deletion_guard BEFORE UPDATE ON public.bf_accounts FOR EACH ROW EXECUTE FUNCTION brand_finance_private.cash_deletion_guard();

DO $$ DECLARE src text; old text; BEGIN
 SELECT pg_get_functiondef('brand_finance_private.treasury_account_guard()'::regprocedure) INTO src;
 old:='IF NEW.kind IN(''cash'',''bank'',''pos'') AND NOT NEW.is_cashier_drawer THEN';
 IF strpos(src,old)=0 THEN RAISE EXCEPTION 'Unexpected cash quota guard'; END IF;
 src:=replace(src,old,'IF NEW.kind IN(''cash'',''bank'',''pos'') THEN');
 src:=replace(src,'IF NEW.active AND (TG_OP=''INSERT'' OR NOT OLD.active)','IF NEW.deleted_at IS NULL AND (NEW.kind=''cash'' OR NEW.active) AND (TG_OP=''INSERT'' OR (NEW.active AND NOT OLD.active))');
 src:=replace(src,'kind=NEW.kind AND active AND NOT is_cashier_drawer AND id<>NEW.id','kind=NEW.kind AND (active OR NEW.kind=''cash'') AND deleted_at IS NULL AND id<>NEW.id');
 EXECUTE src;
 SELECT pg_get_functiondef('brand_finance_private.cashier_drawer_guard()'::regprocedure) INTO src;
 EXECUTE replace(src,'IF NEW.is_cashier_drawer AND (','IF NEW.is_cashier_drawer AND NEW.deleted_at IS NULL AND (');
 SELECT pg_get_functiondef('brand_finance_private.cashier_drawer(uuid)'::regprocedure) INTO src;
 EXECUTE replace(src,'WHERE cafe_id=p_cafe AND is_cashier_drawer','WHERE cafe_id=p_cafe AND is_cashier_drawer AND deleted_at IS NULL');

 SELECT pg_get_functiondef('public.brand_finance_treasury_execute(uuid,text,jsonb,uuid)'::regprocedure) INTO src;
 old:='ELSIF p_operation=''account_archive'' THEN';
 IF strpos(src,old)=0 THEN RAISE EXCEPTION 'Unexpected account operation baseline'; END IF;
 src:=replace(src,'IF NOT FOUND OR a.kind NOT IN','IF NOT FOUND OR a.deleted_at IS NOT NULL OR a.kind NOT IN');
 src:=replace(src,old,$replacement$ELSIF p_operation='account_delete' THEN
  IF aid IS NULL OR NOT brand_finance_private.can_delete_cash(p_cafe_id,aid) THEN
   RAISE EXCEPTION 'لا يمكن حذف خزينة رئيسية أو أساسية أو خزينة لها حركات أو ورديات أو ارتباطات';
  END IF;
  UPDATE public.bf_accounts SET active=false,deleted_at=now() WHERE id=aid AND cafe_id=p_cafe_id;
  result:=jsonb_build_object('id',aid,'deleted',true);
 $replacement$||old);
 EXECUTE src;

 SELECT pg_get_functiondef('public.brand_finance_treasury_snapshot(uuid)'::regprocedure) INTO src;
 old:='FROM public.bf_accounts a WHERE a.cafe_id=p_cafe_id)';
 IF strpos(src,old)=0 THEN RAISE EXCEPTION 'Unexpected treasury snapshot baseline'; END IF;
 src:=replace(src,old,'FROM public.bf_accounts a WHERE a.cafe_id=p_cafe_id AND a.deleted_at IS NULL)');
 src:=replace(src,'to_jsonb(a)-''cafe_id''||jsonb_build_object(''balance''','to_jsonb(a)-''cafe_id''||jsonb_build_object(''can_delete'',brand_finance_private.can_delete_cash(p_cafe_id,a.id),''balance''');
 EXECUTE src;
 SELECT pg_get_functiondef('public.brand_finance_snapshot(uuid)'::regprocedure) INTO src;
 old:='FROM public.bf_accounts a WHERE cafe_id=p_cafe_id AND';
 IF strpos(src,old)=0 THEN RAISE EXCEPTION 'Unexpected finance snapshot baseline'; END IF;
 src:=replace(src,old,'FROM public.bf_accounts a WHERE cafe_id=p_cafe_id AND a.deleted_at IS NULL AND');
 src:=replace(src,'j ON j.account_id=a.id WHERE a.cafe_id=p_cafe_id)','j ON j.account_id=a.id WHERE a.cafe_id=p_cafe_id AND a.deleted_at IS NULL)');
 EXECUTE src;
END $$;
COMMIT;
