-- Read-only directory aggregates replace ten HTTP calls per brand.
-- SECURITY INVOKER retains the caller's RLS, in addition to the active-admin guard.
CREATE FUNCTION public.admin_brand_directory_metrics(p_cafe_ids uuid[])
RETURNS TABLE(cafe_id uuid,products_count bigint,offers_count bigint,branches_count bigint,
 customers_count bigint,orders_count bigint,experience_submissions_count bigint,
 experience_rewards_count bigint,loyalty_cards_count bigint,support_tickets_count bigint,total_revenue numeric)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='platform_admin' AND p.status='active') THEN
  RAISE EXCEPTION 'brand_directory_forbidden' USING ERRCODE='42501';
 END IF;
 IF p_cafe_ids IS NULL OR cardinality(p_cafe_ids)>100 OR array_position(p_cafe_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'brand_directory_invalid_batch' USING ERRCODE='22023';
 END IF;
 RETURN QUERY
 WITH targets AS MATERIALIZED(SELECT c.id FROM public.cafes c WHERE c.id=ANY(p_cafe_ids) AND c.deleted_at IS NULL),
 products AS(SELECT p.cafe_id,count(*) n FROM public.menu_products p JOIN targets t ON t.id=p.cafe_id WHERE p.deleted_at IS NULL GROUP BY p.cafe_id),
 offers AS(SELECT p.cafe_id,count(*) n FROM public.offers p JOIN targets t ON t.id=p.cafe_id WHERE p.deleted_at IS NULL GROUP BY p.cafe_id),
 branches AS(SELECT p.cafe_id,count(*) n FROM public.branches p JOIN targets t ON t.id=p.cafe_id WHERE p.deleted_at IS NULL GROUP BY p.cafe_id),
 customers AS(SELECT p.cafe_id,count(*) n FROM public.customer_profiles p JOIN targets t ON t.id=p.cafe_id GROUP BY p.cafe_id),
 orders AS(SELECT p.cafe_id,count(*) n,sum(coalesce(p.total,0)) revenue FROM public.orders p JOIN targets t ON t.id=p.cafe_id GROUP BY p.cafe_id),
 experiences AS(SELECT p.cafe_id,count(*) n,count(*) FILTER(WHERE p.status IN('approved','redeemed')) rewards FROM public.experience_reward_submissions p JOIN targets t ON t.id=p.cafe_id GROUP BY p.cafe_id),
 cards AS(SELECT p.cafe_id,count(*) n FROM public.loyalty_cards p JOIN targets t ON t.id=p.cafe_id GROUP BY p.cafe_id),
 tickets AS(SELECT p.cafe_id,count(*) n FROM public.brand_support_tickets p JOIN targets t ON t.id=p.cafe_id GROUP BY p.cafe_id)
 SELECT t.id,coalesce(p.n,0),coalesce(o.n,0),coalesce(b.n,0),coalesce(c.n,0),coalesce(ord.n,0),
 coalesce(e.n,0),coalesce(e.rewards,0),coalesce(l.n,0),coalesce(s.n,0),coalesce(ord.revenue,0)
 FROM targets t LEFT JOIN products p ON p.cafe_id=t.id LEFT JOIN offers o ON o.cafe_id=t.id
 LEFT JOIN branches b ON b.cafe_id=t.id LEFT JOIN customers c ON c.cafe_id=t.id LEFT JOIN orders ord ON ord.cafe_id=t.id
 LEFT JOIN experiences e ON e.cafe_id=t.id LEFT JOIN cards l ON l.cafe_id=t.id LEFT JOIN tickets s ON s.cafe_id=t.id;
END $$;
REVOKE ALL ON FUNCTION public.admin_brand_directory_metrics(uuid[]) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_brand_directory_metrics(uuid[]) TO authenticated;
