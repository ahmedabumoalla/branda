-- Call the actual atomic settings RPC as the existing owner; always ROLLBACK.
DO $$
DECLARE a uuid; owner_id uuid; style text; p jsonb; e jsonb; saved jsonb;
BEGIN
  SELECT c.id,c.owner_user_id INTO a,owner_id FROM public.cafes c
    JOIN public.cafe_loyalty_programs p ON p.cafe_id=c.id
    WHERE c.owner_user_id IS NOT NULL AND c.deleted_at IS NULL
      AND platform_access_private.service_enabled(c.id,'loyalty') LIMIT 1;
  ASSERT a IS NOT NULL AND owner_id IS NOT NULL;
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  SELECT jsonb_build_object('enabled',enabled,'cardTitle',card_title,'cardSubtitle',card_subtitle,
    'purchasesRequired',purchases_required,'rewardProductId',reward_product_id,'rewardName',reward_name,
    'stampLabel',stamp_label,'terms',terms,'cardBackground',card_background,'cardForeground',card_foreground,
    'cardAccent',card_accent,'cardDesign',card_design,'appleWalletEnabled',apple_wallet_enabled,'googleWalletEnabled',google_wallet_enabled)
    INTO p FROM public.cafe_loyalty_programs WHERE cafe_id=a;
  e:=jsonb_build_object('rewardValidityDays',30,'nearbyMessage','Roundtrip fixture only','latitude',NULL,'longitude',NULL,'rewardKind','custom','rewardDiscountPercent',NULL);
  FOREACH style IN ARRAY ARRAY['paper','ceramic','meal','brand'] LOOP
    p:=jsonb_set(p,'{cardDesign}',coalesce(nullif(p->'cardDesign','null'::jsonb),'{}'::jsonb)||jsonb_build_object('stampStyle',style));
    PERFORM public.set_rast_loyalty_settings(a,p,e);
    SELECT card_design INTO saved FROM public.cafe_loyalty_programs WHERE cafe_id=a;
    ASSERT saved->>'stampStyle'=style,'Atomic settings RPC preserves selected stamp style';
  END LOOP;
END;
$$;
