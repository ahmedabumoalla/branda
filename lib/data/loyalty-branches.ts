import "server-only";
import { z } from "zod";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { assertOwnerServiceEnabled } from "@/lib/data/owner-service-access";
import { usesExistingBranchWorkflow } from "@/lib/loyalty/branch-access";
import { resolveBranchGoogleMapsUrl } from "@/lib/maps/resolve-branch-location";
import type { LoyaltyBranch, LoyaltyBranchesDashboard } from "@/lib/loyalty/branch-types";

const fields = "id,name,active,updated_at,address,lat,lng,welcome_message,loyalty_enabled,loyalty_logo,loyalty_banner,loyalty_background,loyalty_foreground,loyalty_accent";
const uuid = z.string().uuid();
export function mapLoyaltyBranch(row: Record<string, unknown>): LoyaltyBranch {
  return { id: String(row.id), name: String(row.name), active: row.active === true, enabled: row.loyalty_enabled === true,
    updatedAt: String(row.updated_at), address: String(row.address ?? ""), latitude: row.lat == null ? null : Number(row.lat),
    longitude: row.lng == null ? null : Number(row.lng), nearbyMessage: String(row.welcome_message ?? ""),
    logo: row.loyalty_logo ? String(row.loyalty_logo) : null, banner: row.loyalty_banner ? String(row.loyalty_banner) : null,
    background: String(row.loyalty_background ?? "#171717"), foreground: String(row.loyalty_foreground ?? "#ffffff"), accent: String(row.loyalty_accent ?? "#ff7900") };
}

async function ownerContext() {
  await assertOwnerServiceEnabled("loyalty");
  const cafe = await requireOwnerCafeContext();
  if (usesExistingBranchWorkflow(cafe.slug)) await assertOwnerServiceEnabled("branches");
  return cafe;
}

export async function getOwnerLoyaltyBranches(): Promise<LoyaltyBranchesDashboard> {
  const cafe = await ownerContext();
  const client = await createClient();
  const { data, error } = await client.rpc("get_loyalty_branch_dashboard", { p_cafe: cafe.id });
  if (error || !Array.isArray(data?.branches) || !Array.isArray(data?.cashiers)) throw new Error("تعذر تحميل فروع الولاء");
  return { slug: cafe.slug, brandName: cafe.name, branches: data.branches.map(mapLoyaltyBranch), cashiers: data.cashiers.map((row: Record<string, unknown>) => ({ id: String(row.id), name: String(row.full_name), active: row.active === true, branchId: row.loyalty_branch_id ? String(row.loyalty_branch_id) : null })) };
}

// The caller must first authorize this cafe's public loyalty program or customer card
export async function getLoyaltyBranch(cafeId: string, branchId: string, issuedCard = false): Promise<LoyaltyBranch | null> {
  if (!uuid.safeParse(branchId).success) return null;
  let query = createAdminClient().from("branches").select(fields).eq("id", branchId).eq("cafe_id", cafeId);
  if (!issuedCard) query = query.is("deleted_at", null).eq("loyalty_enabled", true).eq("active", true);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("تعذر تحميل هوية الفرع");
  return data ? mapLoyaltyBranch(data) : null;
}

export async function listPublicLoyaltyBranches(cafeId: string) {
  const { data, error } = await createAdminClient().from("branches").select(fields).eq("cafe_id", cafeId).is("deleted_at", null).eq("loyalty_enabled", true).eq("active", true).order("sort_order").order("id");
  if (error) throw new Error("تعذر تحميل فروع الولاء");
  return (data ?? []).map(mapLoyaltyBranch);
}

const image = z.string().max(700_000).nullable();
const color = z.string().regex(/^#[\da-f]{6}$/i);
const branchSchema = z.object({ id: uuid, expectedUpdatedAt: z.string().datetime({ offset: true }).nullable(), name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300), mapsUrl: z.string().trim().max(2048).optional(), latitude: z.number().min(-90).max(90).nullable(), longitude: z.number().min(-180).max(180).nullable(),
  nearbyMessage: z.string().trim().max(240), active: z.boolean(), enabled: z.boolean(), logo: image, banner: image, background: color, foreground: color, accent: color });

async function normalizeBranchImage(value: string | null, banner: boolean) {
  if (!value) return null;
  const match = /^data:image\/(?:png|jpeg|webp);base64,([a-zA-Z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error("اختر صورة بصيغة PNG أو JPG أو WebP");
  const buffer = await sharp(Buffer.from(match[1], "base64"), { limitInputPixels: 16_000_000 }).rotate()
    .resize(banner ? 1125 : 640, banner ? 432 : 640, { fit: banner ? "cover" : "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  if (buffer.length > 350_000) throw new Error("حجم الصورة كبير اختر صورة أصغر");
  return `data:image/webp;base64,${buffer.toString("base64")}`;
}

export async function saveLoyaltyBranch(input: unknown) {
  const cafe = await ownerContext();
  const parsed = branchSchema.parse(input);
  const location = parsed.mapsUrl ? await resolveBranchGoogleMapsUrl(parsed.mapsUrl) : { latitude: parsed.latitude, longitude: parsed.longitude };
  if ((location.latitude === null) !== (location.longitude === null)) throw new Error("حدد إحداثيات موقع الفرع كاملة");
  const [logo, banner] = await Promise.all([normalizeBranchImage(parsed.logo, false), normalizeBranchImage(parsed.banner, true)]);
  if (parsed.enabled && !logo) throw new Error("أضف شعار الفرع قبل تفعيل بطاقته");
  const { error } = await (await createClient()).rpc("save_loyalty_branch", { p_cafe: cafe.id, p_input: { ...parsed, ...location, logo, banner } });
  if (error) throw new Error(error.code === "40001" ? "تم تعديل الفرع من جلسة أخرى حدث الصفحة قبل الحفظ" : "تعذر حفظ الفرع");
  return getOwnerLoyaltyBranches();
}

export async function assignLoyaltyCashierBranch(cashierId: string, branchId: string | null) {
  const cafe = await ownerContext();
  const { error } = await (await createClient()).rpc("assign_loyalty_cashier_branch", { p_cafe: cafe.id, p_cashier: uuid.parse(cashierId), p_branch: branchId === null ? null : uuid.parse(branchId) });
  if (error) throw new Error("تعذر ربط الكاشير بالفرع");
  return getOwnerLoyaltyBranches();
}
