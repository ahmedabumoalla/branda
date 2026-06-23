export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { OrdersPageClient } from "@/components/dashboard/pages/orders-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerCafeContext } from "@/lib/data/cafes";
import { getOwnerOrders } from "@/lib/data/orders";

export default async function OrdersPage() {
  if (!isSupabaseConfigured()) {
    return <OrdersPageClient initialOrders={[]} configError="قم بإعداد Supabase في .env.local" />;
  }

  try {
    const [orders, cafe] = await Promise.all([getOwnerOrders(), getOwnerCafeContext()]);
    return <OrdersPageClient initialOrders={orders} businessCategory={cafe?.businessCategory} />;
  } catch {
    return (
      <OrdersPageClient
        initialOrders={[]}
        configError="تعذر تحميل الطلبات — تأكد من تسجيل الدخول"
      />
    );
  }
}
