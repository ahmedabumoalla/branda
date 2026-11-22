BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.save_loyalty_points_program(
  p_cafe_id uuid, p_mode text, p_rate_sar numeric, p_rate_quantity integer,
  p_milestones jsonb, p_expected jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  program public.cafe_loyalty_programs;
  saved jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_cafe_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND deleted_at IS NULL)
    OR platform_access_private.service_enabled(p_cafe_id,'loyalty') IS NOT TRUE
    OR (public.is_cafe_owner(p_cafe_id) OR public.is_platform_admin()) IS NOT TRUE THEN
    RAISE EXCEPTION 'Loyalty settings denied' USING ERRCODE='42501';
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('stamps','points') THEN RAISE EXCEPTION 'Invalid mode' USING ERRCODE='22023'; END IF;
  INSERT INTO public.cafe_loyalty_programs(cafe_id) VALUES(p_cafe_id) ON CONFLICT(cafe_id) DO NOTHING;
  SELECT * INTO STRICT program FROM public.cafe_loyalty_programs WHERE cafe_id=p_cafe_id FOR UPDATE;
  saved := jsonb_build_object('mode',program.points_mode,'rateSar',program.points_rate_sar,
    'rateQuantity',program.points_rate_quantity,'milestones',program.points_milestones);
  IF p_mode='points' AND saved=jsonb_build_object('mode',p_mode,'rateSar',p_rate_sar,
    'rateQuantity',p_rate_quantity,'milestones',p_milestones) THEN RETURN; END IF;
  IF p_expected IS NOT NULL AND p_expected IS DISTINCT FROM saved THEN
    -- A stale editor needs owner review. Serialization errors trigger automatic retries.
    RAISE EXCEPTION 'Loyalty settings changed' USING ERRCODE='PT409', DETAIL=saved::text;
  END IF;
  IF p_mode='stamps' THEN
    UPDATE public.cafe_loyalty_programs SET points_mode='stamps',updated_at=clock_timestamp()
      WHERE cafe_id=p_cafe_id AND points_mode<>'stamps';
    RETURN;
  END IF;
  IF p_rate_sar IS NULL OR p_rate_sar NOT BETWEEN 0.01 AND 1000000 OR p_rate_sar<>round(p_rate_sar,2)
    OR p_rate_quantity IS NULL OR p_rate_quantity NOT BETWEEN 1 AND 1000000
    OR jsonb_typeof(p_milestones) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid points settings' USING ERRCODE='22023'; END IF;
  UPDATE public.cafe_loyalty_programs SET points_mode=p_mode,points_rate_sar=p_rate_sar,points_rate_quantity=p_rate_quantity,
    points_milestones=p_milestones,updated_at=clock_timestamp() WHERE cafe_id=p_cafe_id;
END $$;
COMMIT;
