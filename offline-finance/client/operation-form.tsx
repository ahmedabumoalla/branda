import { useEffect, type ComponentProps } from "react";
import { FinanceOperationForm as OriginalForm } from "../../components/finance/finance-operation-form";
import type { FinanceForm, FinanceFormOperation } from "../../components/finance/finance-operation-form";
import Link from "./navigation";
export type { FinanceForm, FinanceFormOperation };
function LocalStaffRedirect({ userId }: { userId?: string }) {
  const href = userId ? `/local/users?edit=${encodeURIComponent(userId)}` : "/local/users?new=1";
  useEffect(() => { history.pushState(null, "", href); }, [href]);
  return <p role="status"><Link href={href}>جار فتح إدارة المستخدمين المحلية</Link></p>;
}
export function FinanceOperationForm(props: ComponentProps<typeof OriginalForm>) {
  if (["staff", "staff_create", "sales_cashier_create"].includes(props.form.operation)) return props.snapshot.role === "owner"
    ? <LocalStaffRedirect userId={typeof props.form.values?.userId === "string" ? props.form.values.userId : undefined} />
    : <p role="alert">إدارة المستخدمين متاحة للمالك فقط</p>;
  return <OriginalForm {...props} />;
}
