-- Loco dashboard employee permissions (user request 2026-11-17)
-- Owners add non-cashier employees or grant existing cashiers dashboard sections
-- Cashier login and cashier permissions stay untouched; a cashier keeps the cashier page as before
-- Enforcement reads cafe_members.permissions, so the existing menu write policies apply unchanged
BEGIN;

CREATE TABLE public.brand_staff_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  cashier_id uuid REFERENCES public.cafe_cashiers(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 80),
  phone text NOT NULL CHECK (phone ~ '^\+9665[0-9]{8}$'),
  can_login boolean NOT NULL DEFAULT false,
  can_edit_menu boolean NOT NULL DEFAULT false,
  can_send_messages boolean NOT NULL DEFAULT false,
  can_manage_rewards boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_staff_accounts_cafe_phone_key UNIQUE (cafe_id, phone),
  CONSTRAINT brand_staff_accounts_cashier_key UNIQUE (cashier_id),
  CONSTRAINT brand_staff_accounts_user_key UNIQUE (user_id)
);

CREATE INDEX brand_staff_accounts_cafe_idx ON public.brand_staff_accounts (cafe_id);

CREATE TRIGGER brand_staff_accounts_updated_at
  BEFORE UPDATE ON public.brand_staff_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Server-managed registry: browsers never read or write it directly
ALTER TABLE public.brand_staff_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brand_staff_accounts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.brand_staff_accounts TO service_role;

CREATE SCHEMA IF NOT EXISTS brand_staff_private;
REVOKE ALL ON SCHEMA brand_staff_private FROM PUBLIC, anon, authenticated;

-- Removing an employee record always removes the dashboard membership it granted
CREATE FUNCTION brand_staff_private.revoke_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.user_id IS NOT NULL THEN
    DELETE FROM public.cafe_members WHERE cafe_id = OLD.cafe_id AND user_id = OLD.user_id AND role = 'staff';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION brand_staff_private.revoke_membership() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER brand_staff_accounts_revoke_membership
  AFTER DELETE ON public.brand_staff_accounts FOR EACH ROW EXECUTE FUNCTION brand_staff_private.revoke_membership();

-- Atomic grant: the registry flags and the dashboard membership change together
CREATE FUNCTION public.set_brand_staff_access(
  p_account_id uuid, p_user_id uuid, p_can_login boolean, p_menu boolean, p_messages boolean, p_rewards boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v public.brand_staff_accounts%ROWTYPE;
BEGIN
  UPDATE public.brand_staff_accounts
     SET user_id = COALESCE(p_user_id, user_id), can_login = p_can_login, can_edit_menu = p_menu,
         can_send_messages = p_messages, can_manage_rewards = p_rewards
   WHERE id = p_account_id
  RETURNING * INTO v;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staff account not found'; END IF;

  IF v.can_login AND v.user_id IS NOT NULL THEN
    -- Never downgrade or reuse an owner or manager identity
    IF EXISTS (SELECT 1 FROM public.cafes WHERE id = v.cafe_id AND owner_user_id = v.user_id)
      OR EXISTS (SELECT 1 FROM public.cafe_members WHERE user_id = v.user_id AND NOT (cafe_id = v.cafe_id AND role = 'staff')) THEN
      RAISE EXCEPTION 'Account already has brand access';
    END IF;
    INSERT INTO public.cafe_members (cafe_id, user_id, role, permissions)
    VALUES (v.cafe_id, v.user_id, 'staff', jsonb_build_object(
      'menu', v.can_edit_menu, 'staff_loyalty_messages', v.can_send_messages, 'staff_loyalty_rewards', v.can_manage_rewards))
    ON CONFLICT (cafe_id, user_id) DO UPDATE SET permissions = EXCLUDED.permissions;
  ELSIF v.user_id IS NOT NULL THEN
    DELETE FROM public.cafe_members WHERE cafe_id = v.cafe_id AND user_id = v.user_id AND role = 'staff';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_brand_staff_access(uuid, uuid, boolean, boolean, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_brand_staff_access(uuid, uuid, boolean, boolean, boolean, boolean) TO service_role;

-- Employee rewards editor: stamps count, reward and branch location only
-- Card design, activation, wallets, terms and validity remain owner settings
CREATE FUNCTION public.save_brand_staff_loyalty_rewards(
  p_cafe_id uuid, p_purchases_required integer, p_reward_name text, p_reward_product_id uuid,
  p_reward_kind text, p_reward_discount_percent integer, p_nearby_message text,
  p_latitude double precision, p_longitude double precision
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.has_cafe_permission(p_cafe_id, 'staff_loyalty_rewards')
    OR NOT platform_access_private.service_enabled(p_cafe_id, 'loyalty') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_purchases_required IS NULL OR p_purchases_required NOT BETWEEN 1 AND 100
    OR char_length(btrim(coalesce(p_reward_name, ''))) NOT BETWEEN 2 AND 80
    OR p_reward_kind IS NULL OR p_reward_kind NOT IN ('product', 'discount', 'custom')
    OR (p_reward_kind = 'discount') <> (p_reward_discount_percent IS NOT NULL)
    OR (p_reward_discount_percent IS NOT NULL AND p_reward_discount_percent NOT BETWEEN 1 AND 100)
    OR (p_reward_kind = 'product') <> (p_reward_product_id IS NOT NULL)
    OR char_length(coalesce(p_nearby_message, '')) NOT BETWEEN 2 AND 240
    OR (p_latitude IS NULL) <> (p_longitude IS NULL) THEN
    RAISE EXCEPTION 'Invalid loyalty settings';
  END IF;
  IF p_reward_product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.menu_products WHERE id = p_reward_product_id AND cafe_id = p_cafe_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Reward product does not belong to cafe';
  END IF;

  UPDATE public.cafe_loyalty_programs
     SET purchases_required = p_purchases_required, reward_name = btrim(p_reward_name),
         reward_product_id = p_reward_product_id, updated_at = now()
   WHERE cafe_id = p_cafe_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loyalty program is not configured'; END IF;

  UPDATE public.cafe_loyalty_experience
     SET reward_kind = p_reward_kind, reward_discount_percent = p_reward_discount_percent,
         nearby_message = p_nearby_message, branch_latitude = p_latitude, branch_longitude = p_longitude, updated_at = now()
   WHERE cafe_id = p_cafe_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loyalty experience is not configured'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.save_brand_staff_loyalty_rewards(uuid, integer, text, uuid, text, integer, text, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_brand_staff_loyalty_rewards(uuid, integer, text, uuid, text, integer, text, double precision, double precision) TO authenticated;

COMMIT;
