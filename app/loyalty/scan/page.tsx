import { redirect } from "next/navigation";
import { getCashierToken } from "@/lib/data/cashier";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLoyaltyBrand } from "@/lib/data/loyalty-experience";
import { LoyaltyScanner } from "@/components/loyalty/loyalty-scanner";

export const dynamic = "force-dynamic";

export default async function LoyaltyScannerPage() {
  const token = await getCashierToken();
  if (!token) redirect("/loyalty/scan/login");
  const admin = createAdminClient();
  const { data: session, error } = await admin.from("cafe_cashier_sessions")
    .select("cafe_id,cashier_id").eq("token", token).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !session) redirect("/loyalty/scan/login");
  const [{ data: cashier }, { data: cafe }] = await Promise.all([
    admin.from("cafe_cashiers").select("full_name").eq("id", session.cashier_id).eq("cafe_id", session.cafe_id).eq("active", true).maybeSingle(),
    admin.from("cafes").select("slug").eq("id", session.cafe_id).is("deleted_at", null).maybeSingle(),
  ]);
  if (!cashier || !cafe) redirect("/loyalty/scan/login");
  const brand = await getLoyaltyBrand(String(cafe.slug));
  if (!brand || !brand.program.enabled) return <main dir="rtl" className="p-8"><p>برنامج الولاء غير فعّال لهذه العلامة.</p></main>;
  if (brand.program.pointsProgram?.mode === "points") redirect("/cashier");
  return <LoyaltyScanner identity={brand.identity} employee={String(cashier.full_name)} />;
}
