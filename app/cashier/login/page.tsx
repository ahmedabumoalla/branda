import { redirect } from "next/navigation";
import { CashierLoginForm } from "@/components/cashier/cashier-login-form";
import { getCashierLandingPath } from "@/lib/data/cashier";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CashierLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const landing = await getCashierLandingPath().catch(() => null);
  if (landing) redirect(landing);
  const { reason } = await searchParams;
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
