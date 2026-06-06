import { OrdersPageClient } from "@/components/dashboard/pages/orders-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getOwnerOrders } from "@/lib/data/orders";

export default async function OrdersPage() {
  if (!isSupabaseConfigured()) {
    return <OrdersPageClient initialOrders={[]} configError="قم بإعداد Supabase في .env.local" />;
  }

  try {
    const orders = await getOwnerOrders();
    return <OrdersPageClient initialOrders={orders} />;
  } catch {
    return (
      <OrdersPageClient
        initialOrders={[]}
        configError="تعذر تحميل الطلبات — تأكد من تسجيل الدخول"
      />
    );
  }
}
