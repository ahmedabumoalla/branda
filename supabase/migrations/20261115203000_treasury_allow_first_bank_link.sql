-- Bug fix 2026-11-15. A network point without a linked bank account that already holds a balance made every
-- treasury read fail with the settle-the-network-balance message: brand_finance_private.treasury_seed links such
-- a point to bank 1010 on each read, and the account guard rejected any change of linked_bank_id while the balance
-- is not zero, including that first link from NULL. The treasury page then fell back to stale snapshot data.
-- The rule now applies only when an existing link is being changed. Linking for the first time is allowed.
-- Nothing else in the guard changes. Idempotent: a second run finds the new text and does nothing.
DO $$DECLARE source text;hits integer;
 needle text:='IF TG_OP=''UPDATE'' AND OLD.linked_bank_id IS DISTINCT FROM NEW.linked_bank_id AND brand_finance_private.treasury_balance(NEW.cafe_id,NEW.id)<>0 THEN';
 patched text:='IF TG_OP=''UPDATE'' AND OLD.linked_bank_id IS NOT NULL AND OLD.linked_bank_id IS DISTINCT FROM NEW.linked_bank_id AND brand_finance_private.treasury_balance(NEW.cafe_id,NEW.id)<>0 THEN';
BEGIN
 SELECT pg_get_functiondef('brand_finance_private.treasury_account_guard()'::regprocedure) INTO source;
 IF position(patched in source)>0 THEN RETURN;END IF;
 hits:=(length(source)-length(replace(source,needle,'')))/length(needle);
 IF hits<>1 THEN RAISE EXCEPTION 'Treasury account guard baseline mismatch';END IF;
 EXECUTE replace(source,needle,patched);
END$$;
