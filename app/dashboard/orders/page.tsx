export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { OrdersPageClient } from "@/components/dashboard/pages/orders-page";
import { redirect } from "next/navigation";
import { isStorefrontEnabled } from "@/lib/platform/storefront-availability";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerCafeContext } from "@/lib/data/cafes";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getOwnerOrders } from "@/lib/data/orders";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { GiftOrdersPage, type GiftOrdersFinance } from "@/components/dashboard/pages/gift-orders-page";
import { getOwnerGiftOrders } from "@/lib/data/gift-orders";
import { getBrandFinanceSnapshot } from "@/lib/data/brand-finance";

export default async function OrdersPage() {
  if (isSupabaseConfigured()) {
    const cafe = await getOwnerCafeContext();
    if (cafe?.businessCategory === "gifts_flowers") {
      const features = await getOwnerFeatureCodes();
      if (!featureCodesAllow(features, "menu")) return <DashboardFeatureBlockedState title="طلبات المنتجات والخدمات" />;
      let finance: GiftOrdersFinance | null = null;
      let financeMessage = "برندة المالية غير مفعلة ضمن اشتراكك يمكنك إدارة الطلبات وتفعيل المالية لتسجيل التحصيل";
      if (featureCodesAllow(features, "finance")) {
        try {
          const snapshot = await getBrandFinanceSnapshot(cafe.slug);
          if (["owner", "manager"].includes(snapshot.role)) {
            finance = {
              accounts: snapshot.accounts.filter(account => account.active && ["cash", "bank", "pos"].includes(account.kind)).map(({ id, name, kind }) => ({ id, name, kind })),
              warehouses: snapshot.warehouses.filter(warehouse => warehouse.active).map(({ id, name }) => ({ id, name })),
              shifts: snapshot.shifts.filter(shift => shift.user_id === snapshot.userId && shift.status === "open" && !shift.supervisor_paused).map(shift => ({ id: shift.id, accountId: shift.account_id, number: shift.shift_number ?? null })),
            };
          } else financeMessage = "تأكيد التحصيل يحتاج صلاحية مالك أو مدير في برندة المالية";
        } catch { financeMessage = "تعذر تحميل حسابات المالية حدث الصفحة أو راجع صلاحيات المالية قبل تأكيد التحصيل"; }
      }
      const data = await getOwnerGiftOrders().catch(() => null);
      return <GiftOrdersPage initialOrders={data?.orders ?? []} initialSettings={data?.settings ?? null} initialHasMore={data?.hasMore ?? false} cafe={{ name: cafe.name, slug: cafe.slug }} finance={finance} financeMessage={financeMessage} configError={data ? undefined : "تعذر تحميل الطلبات حدث الصفحة وحاول مجددًا"} />;
    }
  }
  if (!isStorefrontEnabled()) redirect("/dashboard");
  if (!isSupabaseConfigured()) {
    return <OrdersPageClient initialOrders={[]} configError="قم بإعداد Supabase في .env.local" />;
  }

  const features = await getOwnerFeatureCodes().catch(() => null);
  if (features && !featureCodesAllow(features, "orders")) return <DashboardFeatureBlockedState title="طلبات المنيو" />;
  const data = features ? await Promise.all([getOwnerOrders(), getOwnerCafeContext()]).catch(() => null) : null;
  return <OrdersPageClient initialOrders={data?.[0] ?? []} businessCategory={data?.[1]?.businessCategory} configError={data ? undefined : "تعذر تحميل الطلبات تأكد من تسجيل الدخول"} />;
}
