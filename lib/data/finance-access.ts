import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { getBrandFinanceSnapshot } from "@/lib/data/brand-finance";

const slugSchema = z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const staffSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(2).max(100),
  password: z.string().min(12).max(128),
  role: z.enum(["manager", "cashier"]),
});

export async function signInFinance(slug: string, identity: string, password: string) {
  const safeSlug = slugSchema.parse(slug);
  const value = z.string().trim().min(3).max(254).parse(identity);
  z.string().min(1).max(128).parse(password);
  const supabase = await createClient();
  const phone = value.replace(/[\s()-]/g, "").replace(/^00/, "+");
  const credentials = value.includes("@")
    ? { email: value.toLowerCase(), password }
    : { phone: phone.startsWith("+") ? phone : phone.startsWith("05") ? "+966" + phone.slice(1) : "+" + phone, password };
  const { data, error } = await supabase.auth.signInWithPassword(credentials);
  if (error || !data.user) return { ok: false as const, message: "تعذر تسجيل الدخول تحقق من بياناتك" };
  try {
    await getBrandFinanceSnapshot(safeSlug);
    return { ok: true as const, redirectTo: `/finance/${safeSlug}/pos`, message: "تم تسجيل الدخول" };
  } catch {
    await supabase.auth.signOut({ scope: "local" });
    return { ok: false as const, message: "لا تملك صلاحية المالية لهذه العلامة أو أن الباقة غير مفعلة" };
  }
}

/** Owner-controlled account provisioning; existing accounts are never reset or overwritten. */
export async function provisionFinanceStaff(input: z.infer<typeof staffSchema>) {
  const parsed = staffSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  if (cafe.role !== "owner" || !featureCodesAllow(await getOwnerFeatureCodes(), "finance")) {
    throw new Error("Finance owner access required");
  }
  const supabase = await createClient();
  // Check live finance authorization before creating an Auth account.
  const snapshot = await getBrandFinanceSnapshot(cafe.slug);
  if (snapshot.cafe.id !== cafe.id || !snapshot.canAdminister) throw new Error("Finance owner access required");
  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({
    email: parsed.email,
    password: parsed.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.name },
    app_metadata: { finance_staff_provisioned: true },
  });
  if (created.error || !created.data.user) throw new Error("Staff account creation failed");
  const userId = created.data.user.id;
  const result = await supabase.rpc("brand_finance_execute", {
    p_cafe_id: cafe.id,
    p_operation: "staff",
    p_payload: { email: parsed.email, name: parsed.name, role: parsed.role, active: true },
    p_request_id: crypto.randomUUID(),
  });
  if (result.error) {
    // Only this newly created identity is eligible for compensation, never an existing account.
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) console.error("Finance staff provisioning cleanup failed", { userId });
    throw new Error("Staff access grant failed");
  }
  return { ok: true as const, message: "تم إنشاء حساب الموظف وربطه بالمالية" };
}
