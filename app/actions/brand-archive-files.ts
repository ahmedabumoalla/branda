'use server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/data/cafes';
import { createClient } from '@/lib/supabase/server';

export async function listArchivedBrandFiles(cafeId: string, offset = 0) {
  await requirePlatformAdmin();
  z.uuid().parse(cafeId);z.number().int().min(0).max(100000).parse(offset);
  const client = await createClient();
  const result = await client.from('brand_archive_assets').select('bucket,path').eq('cafe_id', cafeId).order('bucket').order('path').range(offset, offset + 49);
  if (result.error) throw new Error('تعذر قراءة ملفات الأرشيف');
  return result.data as { bucket: string; path: string }[];
}
export async function signArchivedBrandFile(cafeId: string, bucket: string, path: string) {
  await requirePlatformAdmin();z.uuid().parse(cafeId);z.string().min(1).max(200).parse(bucket);z.string().min(1).max(2000).parse(path);
  const client = await createClient();
  const asset = await client.from('brand_archive_assets').select('path').eq('cafe_id', cafeId).eq('bucket', bucket).eq('path', path).maybeSingle();
  if (asset.error || !asset.data) throw new Error('الملف غير موجود في أرشيف العلامة');
  const result = await client.storage.from(bucket).createSignedUrl(path, 60);
  if (result.error || !result.data?.signedUrl) throw new Error('تعذر تجهيز رابط تنزيل الملف');
  return result.data.signedUrl;
}
