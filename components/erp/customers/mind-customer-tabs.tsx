import Link from "@/components/erp/navigation";
import { UsersRound, WalletCards } from "lucide-react";
import styles from "../inventory/catalog-tabs.module.css";

export function MindCustomerTabs({ active }: { active: "branch" | "loyalty" }) {
  return <nav className={styles.tabs} aria-label="نوع العملاء">
    <Link href="/dashboard/system/customers" prefetch={true} aria-current={active === "branch" ? "page" : undefined}>
      <UsersRound aria-hidden="true" /><span><strong>عملاء الفرع</strong><small>عملاء فواتير المبيعات وحساباتهم</small></span>
    </Link>
    <Link href="/dashboard/system/customers/loyalty" prefetch={true} aria-current={active === "loyalty" ? "page" : undefined}>
      <WalletCards aria-hidden="true" /><span><strong>عملاء الولاء</strong><small>أصحاب بطاقات الولاء وبياناتهم</small></span>
    </Link>
  </nav>;
}
