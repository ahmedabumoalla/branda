BEGIN;
ALTER FUNCTION erp_task_private.target_scope_visible(uuid,text,uuid)RENAME TO target_scope_visible_before_containers;
CREATE FUNCTION erp_task_private.target_visible_deep(c uuid,k text,i uuid,seen text[]DEFAULT'{}')RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=''AS $$
DECLARE node text:=k||':'||i::text;t public.erp_tasks;f public.erp_task_flows;template public.erp_task_templates;child record;line jsonb;BEGIN
 IF k IS NULL AND i IS NULL THEN RETURN true;END IF;
 IF k IS NULL OR i IS NULL OR node=ANY(seen)OR cardinality(seen)>=24 THEN RETURN false;END IF;seen:=array_append(seen,node);
 IF k NOT IN('task','task_flow','task_template')THEN RETURN erp_task_private.target_scope_visible_before_containers(c,k,i);END IF;
 IF NOT erp_access_private.allowed(c,'tasks','read')THEN RETURN false;END IF;
 IF k='task'THEN
  SELECT * INTO t FROM public.erp_tasks WHERE cafe_id=c AND id=i;IF t.id IS NULL OR NOT erp_task_private.target_branch_allowed(c,to_jsonb(t))THEN RETURN false;END IF;
  RETURN erp_task_private.target_visible_deep(c,t.target_kind,t.target_id,seen);
 ELSIF k='task_flow'THEN
  SELECT * INTO f FROM public.erp_task_flows WHERE cafe_id=c AND id=i;IF f.id IS NULL OR NOT erp_task_private.target_branch_allowed(c,to_jsonb(f))THEN RETURN false;END IF;
  FOR child IN SELECT id FROM public.erp_tasks WHERE cafe_id=c AND flow_id=i LOOP IF NOT erp_task_private.target_visible_deep(c,'task',child.id,seen)THEN RETURN false;END IF;END LOOP;RETURN true;
 ELSE
  SELECT * INTO template FROM public.erp_task_templates WHERE cafe_id=c AND id=i;IF template.id IS NULL OR NOT erp_task_private.target_branch_allowed(c,to_jsonb(template))THEN RETURN false;END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(template.lines)LOOP IF NOT erp_task_private.target_visible_deep(c,nullif(line->>'targetKind',''),nullif(line->>'targetId','')::uuid,seen)THEN RETURN false;END IF;END LOOP;RETURN true;
 END IF;
END$$;
CREATE FUNCTION erp_task_private.target_scope_visible(c uuid,k text,i uuid)RETURNS boolean LANGUAGE sql STABLE SET search_path=''AS $$SELECT erp_task_private.target_visible_deep(c,k,i)$$;
CREATE OR REPLACE FUNCTION erp_task_private.task_visible(c uuid,i uuid)RETURNS boolean LANGUAGE sql STABLE SET search_path=''AS $$SELECT erp_task_private.target_visible_deep(c,'task',i)$$;
UPDATE erp_task_private.target_catalog SET predicate='(r->>''active'')::boolean AND erp_task_private.target_visible_deep($1,''task_template'',(r->>''id'')::uuid)'WHERE kind='task_template';
UPDATE erp_task_private.target_catalog SET predicate='erp_task_private.target_visible_deep($1,''task_flow'',(r->>''id'')::uuid)'WHERE kind='task_flow';
CREATE FUNCTION erp_task_private.target_graph_guard()RETURNS trigger LANGUAGE plpgsql SET search_path=''AS $$BEGIN
 IF NOT erp_task_private.target_visible_deep(NEW.cafe_id,CASE TG_TABLE_NAME WHEN'erp_tasks'THEN'task'ELSE'task_template'END,NEW.id)THEN RAISE EXCEPTION 'الربط يشكل دورة أو يتضمن سجلًا خارج نطاق الصلاحية' USING ERRCODE='42501';END IF;RETURN NEW;
END$$;
CREATE TRIGGER erp_tasks_target_graph AFTER INSERT OR UPDATE OF target_kind,target_id,flow_id ON public.erp_tasks FOR EACH ROW EXECUTE FUNCTION erp_task_private.target_graph_guard();
CREATE TRIGGER erp_task_templates_target_graph AFTER INSERT OR UPDATE OF lines ON public.erp_task_templates FOR EACH ROW EXECUTE FUNCTION erp_task_private.target_graph_guard();
REVOKE ALL ON FUNCTION erp_task_private.target_scope_visible_before_containers(uuid,text,uuid),erp_task_private.target_visible_deep(uuid,text,uuid,text[]),erp_task_private.target_scope_visible(uuid,text,uuid),erp_task_private.task_visible(uuid,uuid),erp_task_private.target_graph_guard()FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
