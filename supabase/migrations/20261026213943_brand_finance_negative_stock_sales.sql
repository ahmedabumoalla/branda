BEGIN;

-- Only posted sales may create a shortage. Existing documents stay immutable.
ALTER TABLE public.bf_stock DROP CONSTRAINT bf_stock_quantity_check;
ALTER TABLE public.bf_stock DROP CONSTRAINT bf_stock_value_check;
ALTER TABLE public.bf_stock ADD CONSTRAINT bf_stock_value_sign CHECK (
 (quantity > 0 AND value >= 0) OR (quantity < 0 AND value <= 0) OR (quantity = 0 AND value = 0)
);
ALTER TABLE public.bf_stock ADD COLUMN cost_known boolean NOT NULL DEFAULT false;
UPDATE public.bf_stock s SET cost_known = EXISTS (
 SELECT 1 FROM public.bf_movements m WHERE m.cafe_id=s.cafe_id AND m.item_id=s.item_id
 AND m.warehouse_id=s.warehouse_id AND m.quantity>0
);
-- Preserve the last recorded basis when old stock was completely exhausted.
UPDATE public.bf_stock s SET average_cost=coalesce((
 SELECT m.unit_cost FROM public.bf_movements m WHERE m.cafe_id=s.cafe_id
 AND m.item_id=s.item_id AND m.warehouse_id=s.warehouse_id
 ORDER BY m.created_at DESC,m.id DESC LIMIT 1
),0) WHERE s.quantity=0;

ALTER TABLE public.bf_movements
 ADD COLUMN cost_status text NOT NULL DEFAULT 'legacy' CHECK(cost_status IN('legacy','known','estimated','unknown')),
 ADD COLUMN valuation_adjustment numeric(16,2) NOT NULL DEFAULT 0;
ALTER TABLE public.bf_document_lines
 ADD COLUMN cost_status text NOT NULL DEFAULT 'legacy' CHECK(cost_status IN('legacy','known','estimated','unknown','untracked'));

CREATE OR REPLACE FUNCTION brand_finance_private.stock_move(p_cafe uuid,p_doc uuid,p_item uuid,p_warehouse uuid,p_quantity numeric,p_cost numeric)
RETURNS numeric LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
 s public.bf_stock%ROWTYPE; doc public.bf_documents%ROWTYPE;
 movement_value numeric; next_value numeric; next_quantity numeric; covered numeric;
 released_value numeric; adjustment numeric:=0; basis_known boolean; incoming_known boolean:=true;
 status text; next_average numeric;
BEGIN
 IF p_quantity=0 OR p_quantity IS NULL OR p_cost<0 OR p_cost IS NULL
 OR p_quantity::text IN('NaN','Infinity','-Infinity') OR p_cost::text IN('NaN','Infinity','-Infinity')
 THEN RAISE EXCEPTION 'Invalid stock movement'; END IF;
 SELECT * INTO STRICT doc FROM public.bf_documents WHERE cafe_id=p_cafe AND id=p_doc;
 INSERT INTO public.bf_stock(cafe_id,warehouse_id,item_id) VALUES(p_cafe,p_warehouse,p_item) ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT s FROM public.bf_stock WHERE cafe_id=p_cafe AND warehouse_id=p_warehouse AND item_id=p_item FOR UPDATE;
 next_quantity:=s.quantity+p_quantity;
 IF p_quantity<0 AND next_quantity<0 AND doc.kind<>'sale' THEN
  RAISE EXCEPTION 'الكمية المتاحة في المخزون غير كافية لهذه العملية';
 END IF;
 basis_known:=s.cost_known;
 IF p_quantity<0 THEN
  movement_value:=CASE WHEN abs(p_quantity)=s.quantity THEN s.value ELSE round(abs(p_quantity)*s.average_cost,2) END;
  next_value:=s.value-movement_value;
  status:=CASE WHEN NOT basis_known THEN 'unknown' WHEN next_quantity<0 THEN 'estimated' ELSE 'known' END;
 ELSE
  -- A returned uncosted sale or transfer cannot invent a known cost basis.
  IF doc.kind='refund' THEN
   incoming_known:=NOT EXISTS(SELECT 1 FROM public.bf_document_lines l WHERE l.cafe_id=p_cafe
    AND l.document_id=doc.reference_id AND l.item_id=p_item
    AND (l.cost_status IN('unknown','untracked') OR (l.cost_status='legacy' AND l.cost=0)));
  ELSIF doc.kind='stock_transfer' THEN
   incoming_known:=NOT EXISTS(SELECT 1 FROM public.bf_movements m WHERE m.cafe_id=p_cafe
    AND m.document_id=p_doc AND m.item_id=p_item AND m.quantity<0 AND m.cost_status='unknown');
  END IF;
  movement_value:=round(p_quantity*p_cost,2);
  next_value:=s.value+movement_value;
  IF s.quantity<0 THEN
   covered:=least(p_quantity,-s.quantity);
   released_value:=CASE WHEN covered=-s.quantity THEN -s.value ELSE round(-s.value*covered/(-s.quantity),2) END;
   -- Liability is cleared at its recorded basis; only remaining stock uses receipt cost.
   next_value:=s.value+released_value+round(greatest(next_quantity,0)*p_cost,2);
   adjustment:=movement_value-(next_value-s.value);
   -- Post current-period valuation correction, never rewrite the original sale.
   PERFORM brand_finance_private.line(p_cafe,p_doc,brand_finance_private.account(p_cafe,'5000'),greatest(adjustment,0),greatest(-adjustment,0));
   PERFORM brand_finance_private.line(p_cafe,p_doc,brand_finance_private.account(p_cafe,'1200'),greatest(-adjustment,0),greatest(adjustment,0));
  END IF;
  basis_known:=CASE WHEN next_quantity<0 THEN s.cost_known
   WHEN s.quantity>0 THEN s.cost_known AND incoming_known ELSE incoming_known END;
  status:=CASE WHEN incoming_known THEN 'known' ELSE 'unknown' END;
 END IF;
 next_average:=CASE WHEN next_quantity<>0 THEN next_value/next_quantity
  WHEN p_quantity>0 AND incoming_known THEN p_cost ELSE s.average_cost END;
 UPDATE public.bf_stock SET quantity=next_quantity,value=next_value,average_cost=next_average,cost_known=basis_known
 WHERE cafe_id=p_cafe AND warehouse_id=p_warehouse AND item_id=p_item;
 INSERT INTO public.bf_movements(cafe_id,document_id,item_id,warehouse_id,quantity,unit_cost,cost_status,valuation_adjustment)
 VALUES(p_cafe,p_doc,p_item,p_warehouse,p_quantity,movement_value/abs(p_quantity),status,adjustment);
 RETURN movement_value;
END $$;

CREATE FUNCTION brand_finance_private.line_cost_status() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.item_id IS NULL THEN NEW.cost_status:='untracked';
 ELSIF NEW.reference_line_id IS NOT NULL THEN
  SELECT l.cost_status INTO NEW.cost_status FROM public.bf_document_lines l
  WHERE l.cafe_id=NEW.cafe_id AND l.id=NEW.reference_line_id;
  NEW.cost_status:=coalesce(NEW.cost_status,'unknown');
 ELSE
  SELECT CASE WHEN bool_or(m.cost_status='unknown') THEN 'unknown'
   WHEN bool_or(m.cost_status='estimated') THEN 'estimated'
   WHEN bool_and(m.cost_status='known') THEN 'known' ELSE 'unknown' END INTO NEW.cost_status
  FROM public.bf_movements m WHERE m.cafe_id=NEW.cafe_id AND m.document_id=NEW.document_id AND m.item_id=NEW.item_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bf_line_cost_status BEFORE INSERT ON public.bf_document_lines
 FOR EACH ROW EXECUTE FUNCTION brand_finance_private.line_cost_status();
REVOKE ALL ON FUNCTION brand_finance_private.line_cost_status() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION brand_finance_private.stock_move(uuid,uuid,uuid,uuid,numeric,numeric) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
