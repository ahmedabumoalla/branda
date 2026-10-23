import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { isOwnedMenuAsset } from "@/lib/menu/standalone-menu";
import type { FinanceCommandResult, FinanceHistory, FinanceProduct, FinanceSnapshot } from "@/lib/finance/brand-finance";

const commandSchema = z.object({
  operation: z.enum(["sale", "purchase", "refund", "party", "account", "item", "warehouse", "stock_adjust", "stock_transfer", "treasury", "settlement", "shift_open", "shift_close", "shift_handover", "shift_accept", "settings", "staff", "journal"]),
  requestId: z.uuid(), payload: z.record(z.string(), z.unknown()),
});

export async function getBrandFinanceContext(slug?: string) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("سجل الدخول للوصول إلى برندة المالية");
  const target = slug ? z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/).parse(slug) : (await requireOwnerCafeContext()).slug;
  const { data, error } = await client.rpc("brand_finance_context", { p_slug: target });
  if (error) throw new Error("لا تملك صلاحية المالية لهذه العلامة أو أن الباقة غير مفعلة");
  return { client, cafe: data as { id: string; name: string; slug: string; role: "owner" | "manager" | "cashier" } };
}

export async function getBrandFinanceSnapshot(slug?: string): Promise<FinanceSnapshot> {
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("brand_finance_snapshot", { p_cafe_id: cafe.id });
  if (error) throw new Error("تعذر تحميل المالية حاول مجددا");
  const snapshot = data as FinanceSnapshot;
  const products = snapshot.products as (FinanceProduct & { imageStoragePath?: string | null })[];
  // The authenticated media endpoint refreshes signatures throughout long shifts.
  snapshot.products = products.map(({ imageStoragePath, ...product }) => ({ ...product,
    imageUrl: imageStoragePath ? (isOwnedMenuAsset(imageStoragePath, cafe.id)
      ? `/api/finance/${encodeURIComponent(cafe.slug)}/media?path=${encodeURIComponent(imageStoragePath)}` : null) : product.imageUrl,
  }));
  return snapshot;
}

export async function executeBrandFinanceCommand(input: unknown, slug?: string): Promise<FinanceCommandResult> {
  const command = commandSchema.parse(input);
  if (JSON.stringify(command.payload).length > 100_000) throw new Error("بيانات العملية أكبر من الحد المسموح");
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("brand_finance_execute", { p_cafe_id: cafe.id, p_operation: command.operation, p_payload: command.payload, p_request_id: command.requestId });
  if (error) {
    if (/[\u0600-\u06ff]/.test(error.message) && error.message.length < 300) throw new Error(error.message);
    if (error.code === "42501") throw new Error("لا تملك صلاحية تنفيذ هذه العملية");
    throw new Error("لم تحفظ العملية راجع البيانات والأرصدة ثم أعد المحاولة بنفس الطلب");
  }
  return data as FinanceCommandResult;
}

export async function getBrandFinanceHistory(kind: unknown, offset: unknown, slug?: string): Promise<FinanceHistory> {
  const parsedKind = z.enum(["documents", "journal", "movements"]).parse(kind);
  const parsedOffset = z.number().int().min(0).max(10_000_000).parse(offset);
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("brand_finance_history", { p_cafe_id: cafe.id, p_kind: parsedKind, p_offset: parsedOffset });
  if (error) throw new Error("تعذر تحميل السجل المالي حاول مجددا");
  return data as FinanceHistory;
}
