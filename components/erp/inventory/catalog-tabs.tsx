import Link from "next/link";
import { Coffee, Package } from "lucide-react";
import styles from "./catalog-tabs.module.css";

export function InventoryCatalogTabs({ active }: { active: "menu" | "stock" }) {
  return <nav className={styles.tabs} aria-label="المنتجات والخدمات">
    <Link href="/dashboard/system/inventory/items?view=products" aria-current={active === "menu" ? "page" : undefined}>
      <Coffee aria-hidden="true" /><span><strong>المنيو</strong><small>المنتجات التي تباع للعملاء</small></span>
    </Link>
    <Link href="/dashboard/system/inventory/items?view=stock" aria-current={active === "stock" ? "page" : undefined}>
      <Package aria-hidden="true" /><span><strong>الأصناف المخزنية</strong><small>المواد والمكونات وكمياتها في المخزن</small></span>
    </Link>
  </nav>;
}
