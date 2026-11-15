BEGIN;
-- Branch separation for enterprise brands. Cashier sales, refunds, settlements and expenses are posted through
-- commands that do not enter the branch scope, so those documents were left without a branch and could not be
-- reported per branch. For a brand enabled in erp_enterprise_settings, every new financial document that the
-- existing branch capture did not tag is assigned to its branch from facts already on the document:
--   1. the branch of the document it refers to (a refund or a payment follows its invoice)
--   2. the branch that owns the warehouse the document moves stock in
--   3. the branch of the shift it was recorded in (the first tagged document of that shift)
--   4. the branch of the employee who recorded it
--   5. the branch that user is currently working in
-- Brands without a row in erp_enterprise_settings are not affected: the trigger returns immediately.
CREATE FUNCTION erp_enterprise_private.warehouse_branch(c uuid,w uuid) RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT b.id FROM public.bf_warehouses x
 CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN x.inventory_payload#>>'{permissions,write,mode}'='branches' AND jsonb_typeof(x.inventory_payload#>'{permissions,write,ids}')='array' THEN x.inventory_payload#>'{permissions,write,ids}' ELSE '[]'::jsonb END) v
 JOIN public.branches b ON b.cafe_id=c AND b.id::text=v AND b.deleted_at IS NULL
 WHERE x.cafe_id=c AND x.id=w LIMIT 1
$$;
CREATE FUNCTION erp_enterprise_private.tag_document() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b uuid;BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.erp_enterprise_settings WHERE cafe_id=NEW.cafe_id AND enabled) THEN RETURN NEW;END IF;
 IF EXISTS(SELECT 1 FROM public.erp_branch_documents WHERE document_id=NEW.id) THEN RETURN NEW;END IF;
 IF NEW.reference_id IS NOT NULL THEN SELECT branch_id INTO b FROM public.erp_branch_documents WHERE cafe_id=NEW.cafe_id AND document_id=NEW.reference_id;END IF;
 IF b IS NULL AND NEW.warehouse_id IS NOT NULL THEN b:=erp_enterprise_private.warehouse_branch(NEW.cafe_id,NEW.warehouse_id);END IF;
 IF b IS NULL AND NEW.shift_id IS NOT NULL THEN
  SELECT bd.branch_id INTO b FROM public.bf_documents d JOIN public.erp_branch_documents bd ON bd.cafe_id=d.cafe_id AND bd.document_id=d.id WHERE d.cafe_id=NEW.cafe_id AND d.shift_id=NEW.shift_id ORDER BY d.created_at LIMIT 1;
 END IF;
 IF b IS NULL THEN SELECT e.branch_id INTO b FROM public.erp_hr_employees e WHERE e.cafe_id=NEW.cafe_id AND e.user_id=NEW.created_by AND e.active;END IF;
 IF b IS NULL THEN SELECT s.branch_id INTO b FROM public.erp_branch_scopes s WHERE s.cafe_id=NEW.cafe_id AND s.user_id=NEW.created_by;END IF;
 IF b IS NOT NULL AND EXISTS(SELECT 1 FROM public.branches x WHERE x.cafe_id=NEW.cafe_id AND x.id=b AND x.deleted_at IS NULL) THEN
  INSERT INTO public.erp_branch_documents(cafe_id,document_id,branch_id) VALUES(NEW.cafe_id,NEW.id,b) ON CONFLICT(document_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
-- Fires after erp_branch_capture (triggers on one event run in name order), so an explicit branch scope always wins
CREATE TRIGGER erp_enterprise_branch_tag AFTER INSERT ON public.bf_documents FOR EACH ROW EXECUTE FUNCTION erp_enterprise_private.tag_document();
COMMIT;
