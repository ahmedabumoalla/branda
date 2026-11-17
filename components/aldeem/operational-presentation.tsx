"use client";

import { useAldeemLocation } from "./use-location";
import { AldeemOperationsStructure } from "./operations-structure";
import { AldeemOperationalWorkspace } from "./operational-workspace";
import s from "./operational-presentation.module.css";

export function AldeemOperationalPresentation({ section }: { section: "inventory-warehouses" | "finance-treasuries" }) {
  const [mode, setMode] = useAldeemLocation("presentation", "structure", ["structure", "live"] as const);
  return <section className={s.page} dir="rtl">
    <nav className={s.modes} aria-label="طريقة العرض">
      <button type="button" aria-pressed={mode === "structure"} onClick={() => setMode("structure")}>مخطط الإعداد</button>
      <button type="button" aria-pressed={mode === "live"} onClick={() => setMode("live")}>السجلات الفعلية</button>
    </nav>
    <div hidden={mode !== "structure"}><AldeemOperationsStructure kind={section === "inventory-warehouses" ? "warehouses" : "treasury"} /></div>
    {mode === "live" && <AldeemOperationalWorkspace section={section} />}
  </section>;
}
