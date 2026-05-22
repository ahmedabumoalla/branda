import { MenuPageClient } from "@/components/dashboard/pages/menu-page";
import { mockMenuProducts } from "@/lib/mock/menu";

export default function DashboardMenuPage() {
  return <MenuPageClient initialProducts={mockMenuProducts} />;
}