"use client";

import Link from "@/components/erp/navigation";
import { ErpFiles } from "@/components/erp/files";
import { AldeemItemCard } from "./item-card";
import { useState } from "react";
import styles from "./operational-workspace.module.css";
import css from "./item-card-workspace.module.css";

export function AldeemItemCardWorkspace({ itemId, canUpdate = true, canFiles = true }: { itemId: string; canUpdate?: boolean; canFiles?: boolean }) {
  const [pending, setPending] = useState(false);
  return <section dir="rtl" className={styles.workspace}>
    <nav className={css.navigation} aria-label="إجراءات بطاقة الصنف" aria-disabled={pending} onClickCapture={event => { if (pending) { event.preventDefault(); event.stopPropagation(); } }}>
      <Link href="/dashboard/system/inventory/items">العودة للمنتجات</Link>
      {canUpdate && <Link href={`/dashboard/system/inventory/items/${itemId}/edit`}>تعديل بيانات الصنف</Link>}
      <Link href="/dashboard/system/inventory/requisitions/new?kind=transfer">تحويل مخزني</Link>
    </nav>
    <AldeemItemCard key={itemId} itemId={itemId} onPendingChange={setPending} />
    <ErpFiles entityType="inventory_item" recordId={itemId} slug="khayal-aldeem" canWrite={canFiles} />
  </section>;
}
