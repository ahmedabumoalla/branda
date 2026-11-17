"use client";
import { useAldeemAutoLoad } from "@/components/aldeem/use-auto-load";

import { useRef, useState } from "react";
import { getPoints } from "@/app/actions/erp-points";
import type { PointsSnapshot } from "@/lib/erp/points";
import { PointsWorkspace } from "./points";
import { Action, aldeem as s } from "./aldeem-ui";

export function AldeemCustomerPoints() {
  const [snapshot, setSnapshot] = useState<PointsSnapshot | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(true);
  const busy = useRef(false);
  useAldeemAutoLoad(load);
  async function load() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try { const result = await getPoints({}, "khayal-aldeem"); if (result.ok) setSnapshot(result.data); else setError(result.message); }
    catch { setError("تعذر الاتصال حاول مجددًا"); }
    finally { busy.current = false; setPending(false); }
  }
  return <section className={s.page} dir="rtl"><div className={s.toolbar}><Action onClick={load} disabled={pending} help="يعرض أرصدة النقاط وحركات الاكتساب والاستبدال الفعلية">{pending ? "جار تحديث السجل" : error ? "إعادة المحاولة" : "تحديث"}</Action></div>{error && <p role="alert" className={s.error}>{error}</p>}{snapshot ? <PointsWorkspace key={JSON.stringify(snapshot)} initialSnapshot={snapshot} /> : <div className={s.panel}><div className={s.empty}><strong>نقاط العملاء والاكتساب والاستبدال</strong><span>{error ? "تعذر تحميل الأرصدة يمكنك إعادة المحاولة" : "جار تحميل أرصدة النقاط وحركاتها"}</span></div></div>}</section>;
}
