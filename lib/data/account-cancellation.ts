import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/** Final pre-dispatch check, with no provider call and no account/session mutation. */
export async function brandAllowsNewWork(cafeId: string): Promise<boolean> {
  const admin = createAdminClient();
  const result = await admin.rpc('brand_account_not_cancelled', { p_cafe_id: cafeId });
  // Local development can precede the archive migration. Never turn an outage
  // into access, and still deny an archived/deactivated brand during rollout.
  if (result.error?.code === 'PGRST202' && process.env.NODE_ENV === 'development') {
    const archived = await admin.from('brand_account_cancellations').select('cafe_id').eq('cafe_id', cafeId).maybeSingle();
    if (archived.data) return false;
    if (archived.error && archived.error.code !== 'PGRST205') throw new Error('BRAND_ARCHIVE_CHECK_UNAVAILABLE');
    const brand = await admin.from('cafes').select('status,deleted_at').eq('id', cafeId).maybeSingle();
    if (brand.error) throw new Error('BRAND_ARCHIVE_CHECK_UNAVAILABLE');
    return Boolean(brand.data && !brand.data.deleted_at && ['active', 'published'].includes(brand.data.status));
  }
  if (result.error) throw new Error('BRAND_ARCHIVE_CHECK_UNAVAILABLE');
  return result.data === true;
}

export async function brandSlugAllowsNewWork(slug: string): Promise<boolean> {
  const result = await createAdminClient().from('cafes').select('id').eq('slug', slug).maybeSingle();
  if (result.error) throw new Error('BRAND_ARCHIVE_CHECK_UNAVAILABLE');
  return Boolean(result.data && await brandAllowsNewWork(String(result.data.id)));
}
