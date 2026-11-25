import { headers } from "next/headers";
import { maintenanceHeader, maintenanceParam } from "@/lib/platform/maintenance-workspace";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getBrandNavigationFeatures } from "@/lib/platform/feature-access";
import { getOwnerCafeContext } from "@/lib/data/cafes";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if ((await getOwnerCafeContext())?.slug === "khayal-aldeem") return null;
  const features = await getOwnerFeatureCodes();
  const firstService = getBrandNavigationFeatures().find((feature) => features.includes(feature.id));
  if (firstService) {
    const scope = (await headers()).get(maintenanceHeader);
    if (scope) {
      const [path, query] = firstService.route.split("?");
      const params = new URLSearchParams(query);
      params.set(maintenanceParam, scope);
      redirect(`${path}?${params}`);
    }
    redirect(firstService.route);
  }

  return (
    <section dir="rtl" className="mx-auto max-w-2xl rounded-2xl border border-amber-200/30 bg-white/5 p-8 text-right">
      <h1 className="text-2xl font-bold">خدمات العلامة غير مفعلة</h1>
      <p className="mt-3 leading-8">لا توجد خدمات مفعلة ضمن اشتراك العلامة الحالي فعّل باقة للبدء باستخدام المنيو والعروض والولاء</p>
      <Link href="/dashboard/subscription" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-amber-400 px-5 font-bold text-stone-950">إدارة الاشتراك</Link>
    </section>
  );
}
