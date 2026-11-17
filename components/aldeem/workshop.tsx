"use client";
import { useState } from "react";
import { aldeem as s } from "./aldeem-ui";
import { AldeemBranchOrderShowcase } from "./branch-order-showcase";
import { AldeemWorkshopOrders } from "./workshop-orders";
import { useAldeemLocation } from "./use-location";
import presentation from "./branch-order-showcase.module.css";

export function AldeemWorkshop({ section }: { section: string }) {
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useAldeemLocation("workshopMode", "showcase", ["showcase", "live"] as const);
  const view = section === "workshop-product-order" ? "employee" : section === "workshop-deliveries" ? "deliveries" : "lab";
  const [openView, setOpenView] = useAldeemLocation("workshopView", view, ["employee", "lab", "deliveries"] as const);
  return <section className={s.page} dir="rtl">
    <header className={presentation.heading}><div><span className={presentation.eyebrow}>المعمل / خدمة طلبات الفروع</span><h2>من طلب الفرع إلى التجهيز والإرسال</h2><p>يطلب موظف الفرع المنتجات والكميات ثم يستعرض المعمل الطلب ويجهزه ويرسله ويؤكد الفرع الاستلام</p></div></header>
    {openView !== "employee" && <div className={presentation.switcher}><button type="button" disabled={pending} onClick={() => setOpenView("employee")}>فتح واجهة الفرع لطلب المنتجات</button><p>استعرض الواجهة التي يختار منها موظف الفرع الأصناف والكميات ويرسل طلبه للمعمل</p></div>}
    <div className={presentation.switcher} aria-label="نوع بيانات المعمل"><button type="button" disabled={pending} aria-pressed={mode === "showcase"} onClick={() => setMode("showcase")}>العرض التوضيحي</button><button type="button" disabled={pending} aria-pressed={mode === "live"} onClick={() => setMode("live")}>الطلبات الفعلية</button><p>{mode === "showcase" ? "واجهة موظف الفرع ولوحة تجهيز المعمل للتجربة" : "طلبات الفروع المحفوظة في الحساب"}</p></div>
    <div hidden={mode !== "showcase"}><AldeemBranchOrderShowcase initialView={view} /></div>
    {mode === "live" && <AldeemWorkshopOrders key={section} initialView={view} onPendingChange={setPending} />}
  </section>;
}
