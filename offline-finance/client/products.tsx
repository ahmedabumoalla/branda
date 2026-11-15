import { useEffect, useState } from "react";
import { MenuPageClient } from "../../components/dashboard/pages/menu-page";
import { fetchOwnerMenuAction } from "@/app/actions/menu";
import type { FinanceSnapshot } from "../../lib/finance/brand-finance";
import styles from "../../components/finance/finance.module.css";

export function LocalProducts({ snapshot }: { snapshot: FinanceSnapshot }) {
  const [menu, setMenu] = useState<Awaited<ReturnType<typeof fetchOwnerMenuAction>> | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    void fetchOwnerMenuAction().then(value => { if (active) setMenu(value); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "تعذر تحميل المنتجات"); });
    return () => { active = false; };
  }, [attempt]);
  if (error) return <div role="alert"><p className={styles.error}>{error}</p><button className={styles.secondary} onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button></div>;
  if (!menu) return <p role="status">جار تحميل المنتجات والأسعار</p>;
  return <MenuPageClient initialProducts={menu.products} initialCategories={menu.categories} businessCategory={snapshot.cafe.businessCategory} cafeSlug={snapshot.cafe.slug} />;
}
