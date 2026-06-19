-- Barndaksa menu import draft workflow.
-- Creates private import jobs/items and a private PDF upload bucket.

CREATE TABLE IF NOT EXISTS public.menu_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source_type text NOT NULL CHECK (source_type IN ('pdf', 'url')),
  source_url text,
  source_file_path text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed', 'imported')),
  error_message text,
  raw_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_import_jobs_cafe_created
  ON public.menu_import_jobs(cafe_id, created_at DESC);

DROP TRIGGER IF EXISTS menu_import_jobs_updated_at ON public.menu_import_jobs;
CREATE TRIGGER menu_import_jobs_updated_at
  BEFORE UPDATE ON public.menu_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.menu_import_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.menu_import_jobs(id) ON DELETE CASCADE,
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  category_name text,
  product_name text NOT NULL DEFAULT '',
  description text,
  price numeric(10,2),
  calories int,
  prep_time_minutes int,
  chef_name text,
  image_url text,
  image_storage_path text,
  gallery_urls jsonb,
  gallery_storage_paths jsonb,
  metadata jsonb,
  status text NOT NULL DEFAULT 'needs_review' CHECK (status IN ('ready', 'needs_review', 'skipped', 'imported')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_import_items_job
  ON public.menu_import_items(job_id, status);

CREATE INDEX IF NOT EXISTS idx_menu_import_items_cafe
  ON public.menu_import_items(cafe_id, created_at DESC);

DROP TRIGGER IF EXISTS menu_import_items_updated_at ON public.menu_import_items;
CREATE TRIGGER menu_import_items_updated_at
  BEFORE UPDATE ON public.menu_import_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.menu_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_import_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS menu_import_jobs_staff_read ON public.menu_import_jobs;
CREATE POLICY menu_import_jobs_staff_read ON public.menu_import_jobs
  FOR SELECT USING (
    public.is_platform_admin()
    OR public.is_cafe_owner(cafe_id)
    OR public.has_cafe_permission(cafe_id, 'menu')
  );

DROP POLICY IF EXISTS menu_import_jobs_staff_write ON public.menu_import_jobs;
CREATE POLICY menu_import_jobs_staff_write ON public.menu_import_jobs
  FOR ALL USING (
    public.is_platform_admin()
    OR public.is_cafe_owner(cafe_id)
    OR public.has_cafe_permission(cafe_id, 'menu')
  )
  WITH CHECK (
    public.is_platform_admin()
    OR public.is_cafe_owner(cafe_id)
    OR public.has_cafe_permission(cafe_id, 'menu')
  );

DROP POLICY IF EXISTS menu_import_items_staff_read ON public.menu_import_items;
CREATE POLICY menu_import_items_staff_read ON public.menu_import_items
  FOR SELECT USING (
    public.is_platform_admin()
    OR public.is_cafe_owner(cafe_id)
    OR public.has_cafe_permission(cafe_id, 'menu')
  );

DROP POLICY IF EXISTS menu_import_items_staff_write ON public.menu_import_items;
CREATE POLICY menu_import_items_staff_write ON public.menu_import_items
  FOR ALL USING (
    public.is_platform_admin()
    OR public.is_cafe_owner(cafe_id)
    OR public.has_cafe_permission(cafe_id, 'menu')
  )
  WITH CHECK (
    public.is_platform_admin()
    OR public.is_cafe_owner(cafe_id)
    OR public.has_cafe_permission(cafe_id, 'menu')
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'menu-imports',
  'menu-imports',
  false,
  20971520,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS storage_menu_imports_select_staff ON storage.objects;
CREATE POLICY storage_menu_imports_select_staff ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'menu-imports'
    AND public.storage_staff_can_read_cafe_asset(public.storage_path_cafe_id(name), 'menu')
  );

DROP POLICY IF EXISTS storage_menu_imports_insert_staff ON storage.objects;
CREATE POLICY storage_menu_imports_insert_staff ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'menu-imports'
    AND public.storage_object_path_is_safe(name)
    AND array_length(string_to_array(name, '/'), 1) = 3
    AND public.storage_path_segment(name, 3) <> ''
    AND public.storage_can_write_cafe_asset(public.storage_path_cafe_id(name), 'menu')
  );

DROP POLICY IF EXISTS storage_menu_imports_update_staff ON storage.objects;
CREATE POLICY storage_menu_imports_update_staff ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'menu-imports'
    AND public.storage_can_write_cafe_asset(public.storage_path_cafe_id(name), 'menu')
  );

DROP POLICY IF EXISTS storage_menu_imports_delete_staff ON storage.objects;
CREATE POLICY storage_menu_imports_delete_staff ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'menu-imports'
    AND public.storage_can_write_cafe_asset(public.storage_path_cafe_id(name), 'menu')
  );
