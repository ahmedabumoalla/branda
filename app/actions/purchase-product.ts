'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getBrandFinanceContext } from '@/lib/data/brand-finance';
import { purchaseProductSchema, type PurchaseProductSaved } from '@/lib/erp/purchase-product';
import { isInventoryImagePath, inventoryImageUrl } from '@/lib/finance/inventory-catalog';

export async function savePurchaseProduct(slug: string, input: unknown, requestId: string, shiftId?: string) {
  try {
    const payload = purchaseProductSchema.parse(input);
    const { client, cafe } = await getBrandFinanceContext(slug);
    const mayCreate = cafe.role === 'owner' || (cafe.employeePermissions ? cafe.employeePermissions['inventory.create'].enabled : ['manager', 'warehouse', 'cashier'].includes(cafe.role));
    if (!mayCreate || cafe.role === 'cashier' && !shiftId) throw new Error('لا تملك صلاحية إضافة المنتجات');
    if (payload.imagePath && !isInventoryImagePath(payload.imagePath, cafe.id)) throw new Error('الصورة لا تخص هذه العلامة');
    const { data, error } = await client.rpc('erp_purchase_product_create', { p_cafe: cafe.id, p_input: payload, p_request: z.uuid().parse(requestId), p_shift: shiftId ? z.uuid().parse(shiftId) : null });
    if (error) {
      if (error.code === 'PGRST202') throw new Error('تحديث ربط المنتجات بقاعدة البيانات لم يفعّل بعد لم يتم حفظ المنتج');
      throw new Error(/[\u0600-\u06ff]/.test(error.message) ? error.message : 'تعذر حفظ المنتج راجع البيانات والباركود ثم أعد المحاولة');
    }
    const result = data as PurchaseProductSaved;
    result.item.imageUrl = result.item.image_path ? inventoryImageUrl(result.item.image_path, cafe.slug) : null;
    revalidatePath('/dashboard/system/inventory', 'layout');
    revalidatePath('/dashboard/system/purchases', 'layout');
    revalidatePath(`/finance/${cafe.slug}`, 'layout');
    return { ok: true as const, data: result };
  } catch (error) {
    return { ok: false as const, message: error instanceof z.ZodError ? error.issues[0]?.message ?? 'راجع بيانات المنتج' : error instanceof Error && /[\u0600-\u06ff]/.test(error.message) ? error.message : 'تعذر حفظ المنتج أعد المحاولة بنفس البيانات' };
  }
}
