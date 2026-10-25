import { redirect } from "next/navigation";
import { CashierLoginForm } from "@/components/cashier/cashier-login-form";
import { getCashierLandingPath } from "@/lib/data/cashier";
import { CashierAccessPicker } from "@/components/cashier/cashier-access-picker";
import { SalesCashierLogin } from "@/components/finance/sales-cashier-login";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CashierLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; type?: string }>;
}) {
  const { reason, type } = await searchParams;
  if (type === "sales") return <SalesCashierLogin />;
  if (type !== "loyalty" && reason !== "session") return <CashierAccessPicker />;
  const landing = await getCashierLandingPath().catch(() => null);
  if (landing) redirect(landing);
  return (
    <CashierLoginForm
      initialMessage={
        reason === "session"
          ? "انتهت الجلسة أو تم تعطيل الحساب سجّل الدخول بحساب نشط"
          : ""
      }
    />
  );
}
