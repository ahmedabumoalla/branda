"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { mapMenuBranch } from "@/lib/data/menu-branches";
import { resolveBranchGoogleMapsUrl } from "@/lib/maps/resolve-branch-location";

const revision = z.string().datetime({ offset: true }).nullable();
const saveSchema = z.object({
  id: z.string().uuid(), expectedUpdatedAt: revision,
  name: z.string().trim().min(1).max(120), address: z.string().trim().max(300), city: z.string().trim().max(100),
  lat: z.number().finite().min(-90).max(90).nullable(), lng: z.number().finite().min(-180).max(180).nullable(),
  welcomeMessage: z.string().trim().max(300), active: z.boolean(),
}).strict().refine(input => (input.lat === null) === (input.lng === null), { message: "أدخل خط العرض وخط الطول معًا" });
const modeSchema = z.object({ id: z.string().uuid(), expectedUpdatedAt: revision, usesBrandMenu: z.boolean() }).strict();

async function context() {
  const cafe = await requireOwnerCafeContext();
  const features = await getOwnerFeatureCodes();
  if (!featureCodesAllow(features, "menu") || !featureCodesAllow(features, "branches") || featureCodesAllow(features, "finance")) throw new Error("إدارة فروع المنيو غير متاحة لهذا الحساب");
  return cafe;
}

async function command(operation: "save" | "menu-source", input: Record<string, unknown>) {
  const cafe = await context();
  const db = await createClient();
  const { data, error } = await db.rpc("manage_menu_branch", { p_cafe: cafe.id, p_operation: operation, p_input: input });
  if (error || !data) {
    if (error?.code === "40001") throw new Error("تغير الفرع أثناء التعديل حدّث الصفحة ثم أعد المحاولة");
    if (error?.code === "42501") throw new Error("ليست لديك صلاحية تعديل هذا الفرع");
    if (error?.code === "22023") throw new Error("راجع بيانات الفرع ولا توقف الفرع صاحب المنيو الأساسي");
    throw new Error("تعذر تأكيد حفظ الفرع أعد المحاولة بنفس البيانات");
  }
  revalidatePath("/dashboard/branches");
  revalidatePath("/dashboard/menu");
  revalidatePath(`/menu/${cafe.slug}`);
  return mapMenuBranch(data as Record<string, unknown>);
}

export async function saveMenuBranchAction(input: z.infer<typeof saveSchema>) {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) throw new Error("راجع اسم الفرع وإحداثياته وأكمل الخانات المطلوبة");
  return command("save", parsed.data);
}

export async function setMenuBranchSourceAction(input: z.infer<typeof modeSchema>) {
  const parsed = modeSchema.safeParse(input);
  if (!parsed.success) throw new Error("تعذر تحديد الفرع حدّث الصفحة ثم أعد المحاولة");
  return command("menu-source", parsed.data);
}

export async function resolveMenuBranchLocationAction(url: string) {
  await context();
  return resolveBranchGoogleMapsUrl(z.string().trim().min(1).max(2048).parse(url));
}
