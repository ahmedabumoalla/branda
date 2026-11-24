-- Branch reporting preserves original ledgers and never invents historical cashier locations
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.loyalty_activity_events ADD COLUMN branch_id uuid, ADD COLUMN branch_name text;
CREATE INDEX loyalty_activity_branch_time ON public.loyalty_activity_events(cafe_id,branch_id,occurred_at DESC,id DESC);
CREATE INDEX loyalty_wallet_branch_report_time ON loyalty_audit_private.wallet_customer_events(cafe_id,occurred_at DESC,card_id);
CREATE INDEX loyalty_issued_read_provenance ON loyalty_read_private.operations(cafe_id,(result->>'cardId'),completed_at,request_id)
WHERE result->>'cardCreated'='true' AND status IN ('succeeded','duplicate');

CREATE FUNCTION loyalty_audit_private.snapshot_activity_branch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.origin='historical' THEN
    NEW.branch_id:=NULL; NEW.branch_name:=NULL; RETURN NEW;
  END IF;
  -- Snapshot the actual employee assignment at execution, never their future assignment
  SELECT b.id,b.name INTO NEW.branch_id,NEW.branch_name
  FROM public.cafe_cashiers k JOIN public.branches b ON b.id=k.loyalty_branch_id AND b.cafe_id=k.cafe_id
  WHERE k.id=NEW.cashier_id AND k.cafe_id=NEW.cafe_id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION loyalty_audit_private.snapshot_activity_branch() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER loyalty_activity_branch_snapshot BEFORE INSERT ON public.loyalty_activity_events
FOR EACH ROW EXECUTE FUNCTION loyalty_audit_private.snapshot_activity_branch();

ALTER TABLE loyalty_read_private.cashier_issued_cards ADD COLUMN cashier_id uuid, ADD COLUMN cashier_name text;
DO $patch$
DECLARE signature regprocedure := 'loyalty_read_private.ensure_cashier_phone_card(text,text,uuid,text,numeric,numeric,integer)'::regprocedure;
  definition text; old_text text := 'INSERT INTO loyalty_read_private.cashier_issued_cards(card_id) VALUES(card.id);';
BEGIN
  definition:=pg_get_functiondef(signature);
  IF array_length(string_to_array(definition,old_text),1) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Unexpected cashier issuance provenance definition';
  END IF;
  EXECUTE replace(definition,old_text,
    'INSERT INTO loyalty_read_private.cashier_issued_cards(card_id,cashier_id,cashier_name)
     SELECT card.id,k.id,k.full_name FROM public.cafe_cashiers k
     WHERE k.id=cashier_session.cashier_id AND k.cafe_id=cashier_session.cafe_id;');
END $patch$;

CREATE TABLE loyalty_audit_private.card_issuances (
  card_id uuid PRIMARY KEY,
  cafe_id uuid NOT NULL,
  profile_id uuid,
  issued_at timestamptz NOT NULL,
  branch_id uuid,
  branch_name text,
  source text NOT NULL CHECK(source IN ('cashier','registration','unknown')),
  cashier_id uuid,
  cashier_name text,
  customer_name text,
  customer_phone text,
  card_suffix text,
  origin text NOT NULL CHECK(origin IN ('live','historical'))
);
ALTER TABLE loyalty_audit_private.card_issuances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON loyalty_audit_private.card_issuances FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX loyalty_branch_issuance_scope ON loyalty_audit_private.card_issuances(cafe_id,branch_id,issued_at DESC,card_id DESC);
CREATE TRIGGER loyalty_issuance_immutable BEFORE UPDATE OR DELETE ON loyalty_audit_private.card_issuances
FOR EACH ROW EXECUTE FUNCTION loyalty_audit_private.reject_mutation();
CREATE TRIGGER loyalty_issuance_no_truncate BEFORE TRUNCATE ON loyalty_audit_private.card_issuances
FOR EACH STATEMENT EXECUTE FUNCTION loyalty_audit_private.reject_mutation();

CREATE FUNCTION loyalty_audit_private.capture_card_issuance(p_card uuid,p_origin text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO loyalty_audit_private.card_issuances(card_id,cafe_id,profile_id,issued_at,branch_id,branch_name,source,cashier_id,cashier_name,customer_name,customer_phone,card_suffix,origin)
  SELECT c.id,c.cafe_id,c.customer_profile_id,c.issued_at,b.id,b.name,
    CASE WHEN marker.card_id IS NOT NULL OR q.cashier_id IS NOT NULL OR EXISTS(
      SELECT 1 FROM loyalty_read_private.card_link_jobs j WHERE j.card_id=c.id AND j.cafe_id=c.cafe_id AND j.card_created
    ) THEN 'cashier' ELSE 'unknown' END,
    coalesce(marker.cashier_id,q.cashier_id),coalesce(marker.cashier_name,q.cashier_name),
    c.customer_name,c.customer_phone,right(c.card_code,4),p_origin
  FROM public.loyalty_cards c
  LEFT JOIN public.branches b ON b.id=c.loyalty_branch_id AND b.cafe_id=c.cafe_id
  LEFT JOIN loyalty_read_private.cashier_issued_cards marker ON marker.card_id=c.id
  LEFT JOIN LATERAL (
    SELECT o.cashier_id,o.cashier_name FROM loyalty_read_private.operations o
    WHERE o.cafe_id=c.cafe_id AND o.result->>'cardId'=c.id::text
      AND o.result->>'cardCreated'='true' AND o.status IN ('succeeded','duplicate')
    ORDER BY o.completed_at,o.request_id LIMIT 1
  ) q ON true
  WHERE c.id=p_card
  ON CONFLICT(card_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION loyalty_audit_private.capture_card_issuance(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

-- Deferred capture sees the final successful cashier receipt in the same transaction
-- A failed/rolled-back issuance has no surviving card and produces no event
CREATE FUNCTION loyalty_audit_private.capture_card_issuance_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM loyalty_audit_private.capture_card_issuance(NEW.id,'live'); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION loyalty_audit_private.capture_card_issuance_trigger() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER loyalty_card_issuance_capture AFTER INSERT ON public.loyalty_cards
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION loyalty_audit_private.capture_card_issuance_trigger();

-- Existing card identities are proof of issuance even when no wallet was downloaded
SELECT loyalty_audit_private.capture_card_issuance(id,'historical') FROM public.loyalty_cards;

CREATE FUNCTION loyalty_audit_private.branch_events(p_cafe uuid)
RETURNS SETOF public.loyalty_activity_events LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT e.* FROM public.loyalty_activity_events e WHERE e.cafe_id=p_cafe
  UNION ALL
  SELECT (jsonb_populate_record(NULL::public.loyalty_activity_events,jsonb_build_object(
    'id',i.card_id,'cafe_id',i.cafe_id,'occurred_at',i.issued_at,'recorded_at',i.issued_at,
    'kind','issue','outcome','success','origin',i.origin,'cashier_id',i.cashier_id,
    'actor_name',i.cashier_name,'actor_type',CASE WHEN i.cashier_id IS NULL THEN 'unknown' ELSE 'cashier' END,
    'card_id',i.card_id,'card_suffix',i.card_suffix,'customer_name',coalesce(cp.full_name,i.customer_name),
    'stamps_delta',0,'rewards_delta',0,'branch_id',i.branch_id,'branch_name',i.branch_name
  ))).* FROM loyalty_audit_private.card_issuances i
  LEFT JOIN public.customer_profiles cp ON cp.id=i.profile_id AND cp.cafe_id=i.cafe_id
  WHERE i.cafe_id=p_cafe
  UNION ALL
  SELECT (jsonb_populate_record(NULL::public.loyalty_activity_events,jsonb_build_object(
    'id',w.id,'cafe_id',w.cafe_id,'occurred_at',w.occurred_at,'recorded_at',w.occurred_at,
    'kind',CASE WHEN w.kind='save_link' THEN 'save_link' ELSE 'download' END,'outcome','success','origin',w.origin,
    'actor_type','unknown','card_id',w.card_id,'card_suffix',i.card_suffix,
    'customer_name',coalesce(cp.full_name,i.customer_name),'stamps_delta',0,'rewards_delta',0,
    'branch_id',i.branch_id,'branch_name',i.branch_name,'reason_code',w.kind
  ))).* FROM loyalty_audit_private.wallet_customer_events w
  JOIN loyalty_audit_private.card_issuances i ON i.card_id=w.card_id AND i.cafe_id=w.cafe_id
  LEFT JOIN public.customer_profiles cp ON cp.id=i.profile_id AND cp.cafe_id=i.cafe_id
  WHERE w.cafe_id=p_cafe AND w.kind IN ('download','installed','save_link')
$$;
REVOKE ALL ON FUNCTION loyalty_audit_private.branch_events(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_owner_loyalty_branch_report(
  p_cafe_id uuid,p_from timestamptz DEFAULT NULL,p_to timestamptz DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL,p_search text DEFAULT '',p_page integer DEFAULT 1,p_page_size integer DEFAULT 25,
  p_unassigned boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_search text:=lower(btrim(coalesce(p_search,''))); v_to timestamptz:=coalesce(p_to,statement_timestamp()); v_result jsonb;
BEGIN
  IF NOT loyalty_audit_private.can_read(p_cafe_id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF p_page IS NULL OR p_page<1 OR p_page>1000000 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 500
    OR length(v_search)>80 OR p_unassigned IS NULL OR (p_branch_id IS NOT NULL AND p_unassigned)
    OR (p_from IS NOT NULL AND p_from>=v_to) THEN RAISE EXCEPTION 'Invalid branch report filters'; END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches WHERE id=p_branch_id AND cafe_id=p_cafe_id) THEN
    RAISE EXCEPTION 'Branch unavailable' USING ERRCODE='42501';
  END IF;
  WITH matching_cards AS MATERIALIZED (
    SELECT i.card_id FROM loyalty_audit_private.card_issuances i
    LEFT JOIN public.customer_profiles cp ON cp.id=i.profile_id AND cp.cafe_id=i.cafe_id
    WHERE i.cafe_id=p_cafe_id AND (v_search='' OR strpos(lower(coalesce(cp.full_name,i.customer_name,'')||' '||coalesce(cp.phone,i.customer_phone,'')),v_search)>0)
  ), events AS MATERIALIZED (
    SELECT * FROM loyalty_audit_private.branch_events(p_cafe_id) e
    WHERE e.occurred_at<v_to AND (p_from IS NULL OR e.occurred_at>=p_from)
      AND (p_branch_id IS NULL OR e.branch_id=p_branch_id) AND (NOT p_unassigned OR e.branch_id IS NULL)
      AND (v_search='' OR EXISTS(SELECT 1 FROM matching_cards m WHERE m.card_id=e.card_id))
  ), issuances AS MATERIALIZED (
    SELECT i.*,coalesce(cp.full_name,i.customer_name,'') AS name,coalesce(cp.phone,i.customer_phone,'') AS phone
    FROM loyalty_audit_private.card_issuances i LEFT JOIN public.customer_profiles cp ON cp.id=i.profile_id AND cp.cafe_id=i.cafe_id
    WHERE i.cafe_id=p_cafe_id AND i.issued_at<v_to
      AND ((p_branch_id IS NULL OR i.branch_id=p_branch_id) AND (NOT p_unassigned OR i.branch_id IS NULL)
        OR EXISTS(SELECT 1 FROM events e WHERE e.card_id=i.card_id))
  ), customer_scope AS MATERIALIZED (
    SELECT i.* FROM issuances i WHERE (p_from IS NULL OR i.issued_at>=p_from OR EXISTS(SELECT 1 FROM events e WHERE e.card_id=i.card_id))
      AND (v_search='' OR strpos(lower(i.name||' '||i.phone),v_search)>0)
  ), customer_page AS (
    SELECT * FROM customer_scope ORDER BY issued_at DESC,card_id DESC LIMIT p_page_size OFFSET ((p_page-1)::bigint*p_page_size)
  ), branch_ids AS (
    SELECT b.id FROM public.branches b WHERE b.cafe_id=p_cafe_id AND b.deleted_at IS NULL
    UNION SELECT branch_id FROM events UNION SELECT branch_id FROM issuances
  ), branch_rows AS (
    SELECT ids.id,coalesce(b.name,(SELECT branch_name FROM events e WHERE e.branch_id=ids.id LIMIT 1),'غير محدد') AS name,
      coalesce(b.active,false) AS active,coalesce(b.address,'') AS address,coalesce(b.city,'') AS city,
      coalesce(b.phone,'') AS phone,coalesce(b.hours->>'summary',b.hours->>'default','') AS working_hours,b.created_at,
      count(e.id) FILTER(WHERE e.kind='issue') AS issued_cards,
      count(DISTINCT e.card_id) FILTER(WHERE e.kind='download') AS downloaded_cards,
      count(DISTINCT e.card_id) FILTER(WHERE e.kind='download' AND e.reason_code='installed') AS installed_cards,
      count(DISTINCT e.card_id) FILTER(WHERE e.kind='save_link') AS google_links,
      coalesce(sum(e.stamps_delta) FILTER(WHERE e.kind='stamp' AND e.outcome='success'),0) AS stamps,
      count(e.id) FILTER(WHERE e.kind='redeem' AND e.outcome='success') AS redemptions,
      max(e.occurred_at) AS last_at,
      (array_agg(e.kind ORDER BY e.occurred_at DESC,e.id DESC) FILTER(WHERE e.id IS NOT NULL))[1] AS last_kind
    FROM branch_ids ids LEFT JOIN public.branches b ON b.id=ids.id AND b.cafe_id=p_cafe_id
    LEFT JOIN events e ON e.branch_id IS NOT DISTINCT FROM ids.id
    WHERE (p_branch_id IS NULL OR ids.id=p_branch_id) AND (NOT p_unassigned OR ids.id IS NULL)
    GROUP BY b.id,b.name,b.active,b.address,b.city,b.phone,b.hours,b.created_at,ids.id
  ), staff_ids AS (
    SELECT k.id FROM public.cafe_cashiers k WHERE k.cafe_id=p_cafe_id AND v_search=''
      AND (p_branch_id IS NULL OR k.loyalty_branch_id=p_branch_id) AND (NOT p_unassigned OR k.loyalty_branch_id IS NULL)
    UNION SELECT cashier_id FROM events WHERE cashier_id IS NOT NULL
  ), staff_rows AS (
    SELECT s.id,coalesce(k.full_name,max(e.actor_name),'') AS name,coalesce(k.active,false) AS active,
      k.loyalty_branch_id AS branch_id,b.name AS branch_name,
      count(e.id) FILTER(WHERE e.kind='issue') AS issued_cards,
      coalesce(sum(e.stamps_delta) FILTER(WHERE e.kind='stamp' AND e.outcome='success'),0) AS stamps,
      count(e.id) FILTER(WHERE e.kind='redeem' AND e.outcome='success') AS redemptions,
      max(e.occurred_at) AS last_at,
      (array_agg(e.kind ORDER BY e.occurred_at DESC,e.id DESC) FILTER(WHERE e.id IS NOT NULL))[1] AS last_kind
    FROM staff_ids s LEFT JOIN public.cafe_cashiers k ON k.id=s.id AND k.cafe_id=p_cafe_id
    LEFT JOIN public.branches b ON b.id=k.loyalty_branch_id AND b.cafe_id=k.cafe_id
    LEFT JOIN events e ON e.cashier_id=s.id GROUP BY s.id,k.full_name,k.active,k.loyalty_branch_id,b.name
  )
  SELECT jsonb_build_object(
    'summary',(SELECT jsonb_build_object('issuedCards',count(*) FILTER(WHERE kind='issue'),
      'downloadedCards',count(DISTINCT card_id) FILTER(WHERE kind='download'),
      'appleInstalledCards',count(DISTINCT card_id) FILTER(WHERE kind='download' AND reason_code='installed'),
      'googleSaveLinks',count(DISTINCT card_id) FILTER(WHERE kind='save_link'),
      'stamps',coalesce(sum(stamps_delta) FILTER(WHERE kind='stamp' AND outcome='success'),0),
      'redemptions',count(*) FILTER(WHERE kind='redeem' AND outcome='success'),
      'customers',(SELECT count(*) FROM customer_scope),'staff',(SELECT count(*) FROM staff_rows),
      'lastActivityAt',max(occurred_at),'lastActivityKind',(array_agg(kind ORDER BY occurred_at DESC,id DESC))[1]) FROM events),
    'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'active',b.active,
      'address',b.address,'city',b.city,'phone',b.phone,'workingHours',b.working_hours,'createdAt',b.created_at,
      'issuedCards',b.issued_cards,'downloadedCards',b.downloaded_cards,'appleInstalledCards',b.installed_cards,
      'googleSaveLinks',b.google_links,'stamps',b.stamps,'redemptions',b.redemptions,
      'customers',(SELECT count(*) FROM customer_scope i WHERE i.branch_id IS NOT DISTINCT FROM b.id
        OR EXISTS(SELECT 1 FROM events e WHERE e.card_id=i.card_id AND e.branch_id IS NOT DISTINCT FROM b.id)),
      'staff',(SELECT count(*) FROM staff_rows s WHERE s.branch_id IS NOT DISTINCT FROM b.id
        OR EXISTS(SELECT 1 FROM events e WHERE e.cashier_id=s.id AND e.branch_id IS NOT DISTINCT FROM b.id)),
      'lastActivityAt',b.last_at,'lastActivityKind',b.last_kind) ORDER BY b.name,b.id) FROM branch_rows b),'[]'::jsonb),
    'customers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',coalesce(i.profile_id,i.card_id),'cardId',i.card_id,'name',i.name,'phone',i.phone,
      'branchId',i.branch_id,'branchName',coalesce(i.branch_name,'غير محدد'),'issuedAt',i.issued_at,'source',i.source,'cashierId',i.cashier_id,'cashierName',i.cashier_name,
      'downloadedAt',a.downloaded_at,'appleInstalledAt',a.installed_at,'googleSaveLinkAt',a.google_at,
      'stamps',a.stamps,'redemptions',a.redemptions,'lastActivityAt',a.last_at,'lastActivityKind',a.last_kind)
      ORDER BY i.issued_at DESC,i.card_id DESC)
      FROM customer_page i LEFT JOIN LATERAL (
        SELECT max(e.occurred_at) FILTER(WHERE e.kind='download') AS downloaded_at,
          max(e.occurred_at) FILTER(WHERE e.kind='download' AND e.reason_code='installed') AS installed_at,
          max(e.occurred_at) FILTER(WHERE e.kind='save_link') AS google_at,
          coalesce(sum(e.stamps_delta) FILTER(WHERE e.kind='stamp' AND e.outcome='success'),0) AS stamps,
          count(*) FILTER(WHERE e.kind='redeem' AND e.outcome='success') AS redemptions,
          max(e.occurred_at) AS last_at,(array_agg(e.kind ORDER BY e.occurred_at DESC,e.id DESC))[1] AS last_kind
        FROM events e WHERE e.card_id=i.card_id
      ) a ON true),'[]'::jsonb),
    'staff',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'active',s.active,
      'branchId',s.branch_id,'branchName',coalesce(s.branch_name,'غير محدد'),'issuedCards',s.issued_cards,'stamps',s.stamps,'redemptions',s.redemptions,
      'lastActivityAt',s.last_at,'lastActivityKind',s.last_kind) ORDER BY s.name,s.id) FROM staff_rows s),'[]'::jsonb),
    'total',(SELECT count(*) FROM customer_scope),'page',p_page,'pageSize',p_page_size,'asOf',statement_timestamp()
  ) INTO v_result;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.get_owner_loyalty_branch_report(uuid,timestamptz,timestamptz,uuid,text,integer,integer,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_loyalty_branch_report(uuid,timestamptz,timestamptz,uuid,text,integer,integer,boolean) TO authenticated;

CREATE FUNCTION public.get_owner_loyalty_activity_v2(
  p_cafe_id uuid,p_from timestamptz DEFAULT NULL,p_to timestamptz DEFAULT NULL,
  p_cashier_id uuid DEFAULT NULL,p_kind text DEFAULT NULL,p_outcome text DEFAULT NULL,
  p_search text DEFAULT '',p_page integer DEFAULT 1,p_page_size integer DEFAULT 25,
  p_branch_id uuid DEFAULT NULL,p_unassigned boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb; v_search text:=lower(btrim(coalesce(p_search,'')));
BEGIN
  IF NOT loyalty_audit_private.can_read(p_cafe_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF p_page IS NULL OR p_page<1 OR p_page>10000 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50
    OR char_length(v_search)>80 OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>=p_to)
    OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_to-p_from>interval '366 days')
    OR (p_kind IS NOT NULL AND p_kind NOT IN ('scan','stamp','redeem','void','issue','download','save_link'))
    OR (p_outcome IS NOT NULL AND p_outcome NOT IN ('success','denied','failed','duplicate')) THEN
    RAISE EXCEPTION 'Invalid activity filters';
  END IF;
  IF p_unassigned IS NULL OR (p_branch_id IS NOT NULL AND p_unassigned) THEN RAISE EXCEPTION 'Invalid activity branch'; END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches WHERE id=p_branch_id AND cafe_id=p_cafe_id) THEN RAISE EXCEPTION 'Branch unavailable' USING ERRCODE='42501'; END IF;
  WITH scope AS MATERIALIZED (
    SELECT e.* FROM loyalty_audit_private.branch_events(p_cafe_id) e WHERE e.cafe_id=p_cafe_id
      AND (p_branch_id IS NULL OR e.branch_id=p_branch_id) AND (NOT p_unassigned OR e.branch_id IS NULL)
      AND (p_from IS NULL OR e.occurred_at>=p_from) AND (p_to IS NULL OR e.occurred_at<p_to)
      AND (p_kind IS NULL OR e.kind=p_kind) AND (p_outcome IS NULL OR e.outcome=p_outcome)
      AND (v_search='' OR strpos(lower(coalesce(e.actor_name,'')||' '||coalesce(e.customer_name,'')||' '||coalesce(e.card_suffix,'')||' '||coalesce(e.reward_name,'')),v_search)>0)
  ), filtered AS MATERIALIZED (SELECT * FROM scope WHERE p_cashier_id IS NULL OR cashier_id=p_cashier_id),
  page AS (SELECT * FROM filtered ORDER BY occurred_at DESC,id DESC LIMIT p_page_size OFFSET ((p_page-1)*p_page_size)),
  employee_ids AS (SELECT id FROM public.cafe_cashiers WHERE cafe_id=p_cafe_id
    AND (p_branch_id IS NULL OR loyalty_branch_id=p_branch_id) AND (NOT p_unassigned OR loyalty_branch_id IS NULL)
    UNION SELECT cashier_id FROM scope WHERE cashier_id IS NOT NULL)
  SELECT jsonb_build_object(
    'events',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',id,'occurredAt',occurred_at,'recordedAt',recorded_at,'kind',kind,'outcome',outcome,'origin',origin,
      'cashierId',cashier_id,'actorName',coalesce(actor_name,''),'actorType',actor_type,'cardId',card_id,'cardSuffix',card_suffix,
      'customerName',customer_name,'stampsDelta',stamps_delta,'rewardsDelta',rewards_delta,'stampsBefore',stamps_before,
      'rewardsBefore',rewards_before,'stampsAfter',stamps_after,'rewardsAfter',rewards_after,'rewardName',reward_name,
      'rewardSuffix',reward_suffix,'rewardKind',reward_kind,'rewardDiscountPercent',reward_discount_percent,
      'rewardExpiresAt',reward_expires_at,'rewardTerms',reward_terms,'reasonCode',reason_code,
      'branchId',branch_id,'branchName',branch_name
    ) ORDER BY occurred_at DESC,id DESC) FROM page),'[]'::jsonb),
    'total',(SELECT count(*) FROM filtered),'page',p_page,'pageSize',p_page_size,
    'summary',(SELECT jsonb_build_object('total',count(*),
      'issuedCards',count(*) FILTER(WHERE kind='issue' AND outcome='success'),
      'downloadedCards',count(DISTINCT card_id) FILTER(WHERE kind='download' AND outcome='success'),
      'scans',count(*) FILTER(WHERE kind='scan' AND outcome='success'),
      'stamps',coalesce(sum(stamps_delta) FILTER(WHERE kind='stamp' AND outcome='success'),0),
      'redemptions',count(*) FILTER(WHERE kind='redeem' AND outcome='success'),
      'rewardsIssued',coalesce(sum(greatest(rewards_delta,0)) FILTER(WHERE outcome='success'),0),
      'denied',count(*) FILTER(WHERE outcome='denied'),'failed',count(*) FILTER(WHERE outcome='failed'),
      'duplicates',count(*) FILTER(WHERE outcome='duplicate'),'uniqueCards',count(DISTINCT card_id) FILTER(WHERE outcome='success'),
      'activeCashiers',count(DISTINCT cashier_id)) FROM filtered),
    'employees',coalesce((SELECT jsonb_agg(employee ORDER BY employee->>'name',employee->>'id') FROM (
      SELECT jsonb_build_object('id',i.id,'name',coalesce(c.full_name,(SELECT actor_name FROM scope WHERE cashier_id=i.id ORDER BY occurred_at DESC,id DESC LIMIT 1),''),
        'active',coalesce(c.active,false),'scans',count(s.id) FILTER(WHERE s.kind='scan' AND s.outcome='success'),
        'stamps',coalesce(sum(s.stamps_delta) FILTER(WHERE s.kind='stamp' AND s.outcome='success'),0),
        'redemptions',count(s.id) FILTER(WHERE s.kind='redeem' AND s.outcome='success'),
        'denied',count(s.id) FILTER(WHERE s.outcome='denied'),'failed',count(s.id) FILTER(WHERE s.outcome='failed'),
        'duplicates',count(s.id) FILTER(WHERE s.outcome='duplicate'),'lastActivityAt',max(s.occurred_at)) employee
      FROM employee_ids i LEFT JOIN public.cafe_cashiers c ON c.id=i.id AND c.cafe_id=p_cafe_id
      LEFT JOIN scope s ON s.cashier_id=i.id GROUP BY i.id,c.full_name,c.active
    ) employee_rows),'[]'::jsonb),
    'branches',public.get_owner_loyalty_branch_report(p_cafe_id,p_from,p_to,NULL,'',1,1,false)->'branches',
    'recordingStartedAt',(SELECT recording_started_at FROM loyalty_audit_private.settings WHERE singleton)
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_owner_loyalty_activity_v2(uuid,timestamptz,timestamptz,uuid,text,text,text,integer,integer,uuid,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_loyalty_activity_v2(uuid,timestamptz,timestamptz,uuid,text,text,text,integer,integer,uuid,boolean) TO authenticated;

COMMIT;
