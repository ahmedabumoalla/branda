-- Barndaksa: enforce brand isolation for loyalty cards and rewards.
-- This migration is intentionally additive and does not delete or rewrite data.

CREATE UNIQUE INDEX IF NOT EXISTS customer_profiles_id_cafe_id_unique
  ON public.customer_profiles(id, cafe_id);

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_cards_id_cafe_id_unique
  ON public.loyalty_cards(id, cafe_id);

CREATE UNIQUE INDEX IF NOT EXISTS cafe_cashiers_id_cafe_id_unique
  ON public.cafe_cashiers(id, cafe_id);

CREATE UNIQUE INDEX IF NOT EXISTS experience_reward_submissions_id_cafe_id_unique
  ON public.experience_reward_submissions(id, cafe_id);

CREATE INDEX IF NOT EXISTS idx_loyalty_cards_cafe_code_guard
  ON public.loyalty_cards(cafe_id, upper(card_code));

CREATE INDEX IF NOT EXISTS idx_experience_rewards_cafe_code_guard
  ON public.experience_reward_submissions(cafe_id, upper(reward_code))
  WHERE reward_code IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_cards_customer_same_cafe'
  ) THEN
    ALTER TABLE public.loyalty_cards
      ADD CONSTRAINT loyalty_cards_customer_same_cafe
      FOREIGN KEY (customer_profile_id, cafe_id)
      REFERENCES public.customer_profiles(id, cafe_id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_card_events_card_same_cafe'
  ) THEN
    ALTER TABLE public.loyalty_card_events
      ADD CONSTRAINT loyalty_card_events_card_same_cafe
      FOREIGN KEY (card_id, cafe_id)
      REFERENCES public.loyalty_cards(id, cafe_id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cashier_sessions_cashier_same_cafe'
  ) THEN
    ALTER TABLE public.cafe_cashier_sessions
      ADD CONSTRAINT cashier_sessions_cashier_same_cafe
      FOREIGN KEY (cashier_id, cafe_id)
      REFERENCES public.cafe_cashiers(id, cafe_id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'experience_rewards_customer_same_cafe'
  ) THEN
    ALTER TABLE public.experience_reward_submissions
      ADD CONSTRAINT experience_rewards_customer_same_cafe
      FOREIGN KEY (customer_id, cafe_id)
      REFERENCES public.customer_profiles(id, cafe_id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'experience_rewards_cashier_same_cafe'
  ) THEN
    ALTER TABLE public.experience_reward_submissions
      ADD CONSTRAINT experience_rewards_cashier_same_cafe
      FOREIGN KEY (used_by_cashier_id, cafe_id)
      REFERENCES public.cafe_cashiers(id, cafe_id)
      NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_experience_reward_item_product_same_cafe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_submission_cafe_id uuid;
  v_product_cafe_id uuid;
BEGIN
  SELECT cafe_id
  INTO v_submission_cafe_id
  FROM public.experience_reward_submissions
  WHERE id = NEW.submission_id;

  IF v_submission_cafe_id IS NULL THEN
    RAISE EXCEPTION 'Reward submission not found';
  END IF;

  SELECT cafe_id
  INTO v_product_cafe_id
  FROM public.menu_products
  WHERE id = NEW.product_id;

  IF v_product_cafe_id IS NULL OR v_product_cafe_id <> v_submission_cafe_id THEN
    RAISE EXCEPTION 'Reward product does not belong to submission cafe';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_experience_reward_item_product_same_cafe'
      AND tgrelid = 'public.experience_reward_items'::regclass
  ) THEN
    CREATE TRIGGER trg_experience_reward_item_product_same_cafe
      BEFORE INSERT OR UPDATE OF submission_id, product_id
      ON public.experience_reward_items
      FOR EACH ROW
      EXECUTE FUNCTION public.ensure_experience_reward_item_product_same_cafe();
  END IF;
END $$;
