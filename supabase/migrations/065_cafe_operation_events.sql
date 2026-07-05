-- Barndaksa: generic operations-center event tracking.

CREATE TABLE IF NOT EXISTS public.cafe_operation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_type text NOT NULL,
  actor_id uuid NULL,
  actor_name text NULL,
  actor_email text NULL,
  entity_type text NULL,
  entity_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cafe_operation_events_cafe
  ON public.cafe_operation_events(cafe_id);

CREATE INDEX IF NOT EXISTS idx_cafe_operation_events_event_type
  ON public.cafe_operation_events(event_type);

CREATE INDEX IF NOT EXISTS idx_cafe_operation_events_actor_type
  ON public.cafe_operation_events(actor_type);

CREATE INDEX IF NOT EXISTS idx_cafe_operation_events_created_at
  ON public.cafe_operation_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cafe_operation_events_cafe_event_created
  ON public.cafe_operation_events(cafe_id, event_type, created_at DESC);

ALTER TABLE public.cafe_operation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cafe_operation_events_platform_admin_read ON public.cafe_operation_events;
CREATE POLICY cafe_operation_events_platform_admin_read
  ON public.cafe_operation_events
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

REVOKE ALL ON public.cafe_operation_events FROM PUBLIC;
REVOKE ALL ON public.cafe_operation_events FROM anon;
REVOKE ALL ON public.cafe_operation_events FROM authenticated;
GRANT SELECT ON public.cafe_operation_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cafe_operation_events TO service_role;
