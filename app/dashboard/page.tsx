import { DashboardHomeClient } from "@/components/dashboard/dashboard-home-client";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getCafeCustomers } from "@/lib/data/customers";
import { getOwnerExperienceData } from "@/lib/data/experience";
import { getOwnerMenu } from "@/lib/data/menu";
import { getOwnerOrders } from "@/lib/data/orders";
import { getOwnerReservations } from "@/lib/data/reservations";
import { getOwnerCafeSettings } from "@/lib/data/settings";

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <DashboardHomeClient
        customers={[]}
        orders={[]}
        reservations={[]}
        productCount={0}
        experienceSubmissionCount={0}
        cafeSlug=""
        cafeName="الكوفي"
        ownerName=""
        configError="قم بإعداد Supabase في env local"
      />
    );
  }

  try {
    const cafe = await requireOwnerCafeContext();

    const [settings, orders, reservations, customerRows, menu, experienceData] =
      await Promise.all([
        getOwnerCafeSettings(),
        getOwnerOrders(),
        getOwnerReservations(),
        getCafeCustomers(),
        getOwnerMenu(),
        getOwnerExperienceData(),
      ]);

    return (
      <DashboardHomeClient
        customers={customerRows.map((customer) => ({
          id: String(customer.id),
          cafeSlug: cafe.slug,
          fullName: String(customer.full_name ?? ""),
          phone: String(customer.phone ?? ""),
          email: customer.email ? String(customer.email) : undefined,
          createdAt: String(customer.created_at ?? "").slice(0, 10),
        }))}
        orders={orders}
        reservations={reservations}
        productCount={menu.products.length}
        experienceSubmissionCount={experienceData.submissions.length}
        cafeSlug={cafe.slug}
        cafeName={settings.cafeName || cafe.name}
        ownerName={settings.ownerName || ""}
      />
    );
  } catch (error) {
    console.error("[DashboardPage]", error);

    return (
      <DashboardHomeClient
        customers={[]}
        orders={[]}
        reservations={[]}
        productCount={0}
        experienceSubmissionCount={0}
        cafeSlug=""
        cafeName="الكوفي"
        ownerName=""
        configError="تعذر تحميل بيانات لوحة التحكم"
      />
    );
  }
}
