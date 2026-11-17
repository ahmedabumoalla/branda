BEGIN;
CREATE FUNCTION public.admin_brand_directory_metrics_v2(p_cafe_ids uuid[])
RETURNS TABLE(cafe_id uuid,products_count bigint,offers_count bigint,branches_count bigint,
 customers_count bigint,orders_count bigint,experience_submissions_count bigint,
 experience_rewards_count bigint,loyalty_cards_count bigint,support_tickets_count bigint,total_revenue numeric,
 loyalty_stamps_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH metrics AS MATERIALIZED(SELECT * FROM public.admin_brand_directory_metrics(p_cafe_ids)),
 stamps AS(SELECT c.cafe_id,sum(c.total_purchases)::bigint AS n FROM public.loyalty_cards c
   JOIN metrics m ON m.cafe_id=c.cafe_id GROUP BY c.cafe_id)
 SELECT m.*,coalesce(s.n,0)::bigint FROM metrics m LEFT JOIN stamps s ON s.cafe_id=m.cafe_id;
$$;
REVOKE ALL ON FUNCTION public.admin_brand_directory_metrics_v2(uuid[]) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_brand_directory_metrics_v2(uuid[]) TO authenticated;
COMMIT;
