import { AdminRepresentativesPage } from "@/components/admin/pages/admin-representatives-page";
import { getAdminPlatformPlans } from "@/lib/data/admin";
import { getAdminRepresentatives } from "@/lib/data/representatives";

export default async function AdminRepresentativesRoutePage() {
  try {
    const [representatives, plans] = await Promise.all([
      getAdminRepresentatives(),
      getAdminPlatformPlans(),
    ]);

    return (
      <AdminRepresentativesPage
        initialRepresentatives={representatives}
        availablePlans={plans}
      />
    );
  } catch (error) {
    console.error("[AdminRepresentativesRoutePage]", error);

    return (
      <AdminRepresentativesPage
        initialRepresentatives={[]}
        availablePlans={[]}
        configError="تعذر تحميل بيانات المناديب"
      />
    );
  }
}
