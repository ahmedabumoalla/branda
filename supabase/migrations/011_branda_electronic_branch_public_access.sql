-- Branda Platform — Electronic branch public access repair
-- Version: 011
-- Run after 010_branda_representative_dashboard_primary_branch.sql
-- TARGET: branda-production

BEGIN;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON TABLE public.cafes TO anon, authenticated;

DROP POLICY IF EXISTS cafes_public_read ON public.cafes;

CREATE POLICY cafes_public_read ON public.cafes
  FOR SELECT TO anon, authenticated
  USING (
    (
      is_public = true
      AND status = 'active'
      AND deleted_at IS NULL
    )
    OR public.has_cafe_access(id)
    OR public.is_platform_admin()
  );

CREATE OR REPLACE FUNCTION public.get_public_cafe_by_slug(p_slug text)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  status text,
  is_public boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    c.id,
    c.slug::text,
    c.name,
    c.status::text,
    c.is_public
  FROM public.cafes c
  WHERE lower(c.slug::text) = lower(NULLIF(btrim(p_slug), ''))
    AND c.status = 'active'
    AND c.is_public = true
    AND c.deleted_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_cafe_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_cafe_by_slug(text) TO anon, authenticated;

COMMIT;

SELECT
  id,
  slug,
  name,
  status,
  is_public
FROM public.cafes
WHERE lower(slug::text) = lower('test-cafe');