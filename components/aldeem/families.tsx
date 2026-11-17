"use client";
import { useAldeemAutoLoad } from "@/components/aldeem/use-auto-load";

import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getFamilies } from "@/app/actions/erp-families";
import { FamiliesWorkspace } from "@/components/erp/families/workspace";
import type { FamilySnapshot } from "@/lib/erp/families";
import { Action, aldeem as s } from "./aldeem-ui";

export function AldeemFamilies({ section }: { section: string }) {
  const [snapshot, setSnapshot] = useState<FamilySnapshot | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const busy = useRef(false);
  useAldeemAutoLoad(load);
  async function load() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await getFamilies("khayal-aldeem");
      if (result.ok) setSnapshot(result.data);
      else setError(result.message);
    } catch { setError("تعذر الاتصال حاول مرة أخرى"); }
    finally { busy.current = false; setPending(false); }
  }
  const mode = section === "producer-sales" ? "sales" : section === "producer-returns" ? "returns" : section === "producer-settlements" ? "settlements" : "accounts";
  return <section className={s.page} dir="rtl">
    <div className={s.toolbar}><Action disabled={pending} help="يعرض الاستلامات والمبيعات والمرتجعات والدفعات المسجلة فعليًا" onClick={load}><RefreshCw size={16} />{pending ? "جار تحديث السجل" : error ? "إعادة المحاولة" : "تحديث"}</Action></div>
    {error && <p className={s.notice} role="alert">{error}</p>}
    {snapshot ? <FamiliesWorkspace initialSnapshot={snapshot} section={mode} embedded /> : <div className={s.panel}><div className={s.empty}><strong>حسابات الأسر وحركة منتجاتها</strong><span>{error ? "تعذر تحميل السجل يمكنك إعادة المحاولة" : "جار تحميل حسابات الأسر وحركة منتجاتها"}</span></div></div>}
  </section>;
}
