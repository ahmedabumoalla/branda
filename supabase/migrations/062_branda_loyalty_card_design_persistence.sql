-- Persist the full Branda loyalty card designer payload.
-- Do not run manually from the app; apply through the normal migration flow.

ALTER TABLE public.cafe_loyalty_programs
  ADD COLUMN IF NOT EXISTS card_design jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.set_cafe_loyalty_card_design(
  p_cafe_id uuid,
  p_card_design jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (public.has_cafe_permission(p_cafe_id, 'loyalty') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.cafe_loyalty_programs
  SET
    card_design = COALESCE(p_card_design, '{}'::jsonb),
    updated_at = now()
  WHERE cafe_id = p_cafe_id;

  IF NOT FOUND THEN
    INSERT INTO public.cafe_loyalty_programs (cafe_id, card_design, updated_at)
    VALUES (p_cafe_id, COALESCE(p_card_design, '{}'::jsonb), now());
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_cafe_loyalty_card_design(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_cafe_loyalty_card_design(uuid, jsonb) TO authenticated;
