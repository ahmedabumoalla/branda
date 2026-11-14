import "server-only";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { manufacturingError } from "@/lib/data/erp-manufacturing";
import { isOwnedMenuAsset } from "@/lib/menu/standalone-menu";
import type { LabSnapshot } from "@/lib/erp/lab-orders";

export async function readLabOrders(slug?: string): Promise<LabSnapshot> {
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("erp_lab_read", { p_cafe: cafe.id });
  manufacturingError(error);
  if (!data || !Array.isArray(data.orders) || !Array.isArray(data.products)) throw new Error("تعذر تحميل طلبات المعمل");
  const media = (row: { imageUrl: string | null; imageStoragePath?: string | null }) => {
    const { imageStoragePath, ...rest } = row;
    return { ...rest, imageUrl: imageStoragePath ? isOwnedMenuAsset(imageStoragePath, cafe.id) ? `/api/finance/${encodeURIComponent(cafe.slug)}/media?path=${encodeURIComponent(imageStoragePath)}` : null : row.imageUrl };
  };
  return { ...data, slug: cafe.slug, cafeName: cafe.name,
    products: data.products.map(media),
    orders: data.orders.map((o: LabSnapshot["orders"][number]) => ({ ...o, lines: o.lines.map(media) })),
  } as LabSnapshot;
}
