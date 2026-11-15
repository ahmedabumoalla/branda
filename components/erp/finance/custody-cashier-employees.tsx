"use client";
import { useEffect, useRef, useState } from "react";
import { addCashiersAsEmployees, listCashiersWithoutEmployeeFile } from "@/app/actions/finance-custody-employees";
import s from "../erp.module.css";

// Shown under the custody employee list: cashiers that have no employee file yet, with one action that
// creates their files so they can be chosen as the custody holder.
export function CustodyCashierEmployees({ slug, hasEmployees }: { slug: string; hasEmployees: boolean }) {
  const [missing, setMissing] = useState<{ name: string; source: "finance" | "loyalty" }[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let current = true;
    listCashiersWithoutEmployeeFile(slug).then(result => { if (!current) return; if (result.ok) setMissing(result.missing); else setError(result.message); })
      .catch(() => { if (current) setError("تعذر قراءة الكاشيرات أعد تحميل الصفحة"); });
    return () => { current = false; };
  }, [slug]);
  async function add() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await addCashiersAsEmployees(slug);
      if (!result.ok) { setError(result.message); return; }
      // The custody form reads its employee list once, so reload to show the new files.
      window.location.reload();
    } catch { setError("تعذر تأكيد الإضافة أعد تحميل الصفحة وتحقق من قائمة الموظف"); }
    finally { lock.current = false; setBusy(false); }
  }
  if (error) return <p role="alert" className={s.error}>{error}</p>;
  if (!missing) return null;
  if (!missing.length) return hasEmployees ? null : <p className={s.muted}>لا يوجد موظفون أو كاشيرات بعد أضف الموظف من قسم الموظفين ثم إدارة الموظفين</p>;
  return <div className={s.field}>
    <span>كاشيرات غير مضافين إلى سجل الموظفين</span>
    <p className={s.muted}>{missing.map(cashier => cashier.name).join(" · ")}</p>
    <button type="button" className={s.button} disabled={busy} onClick={() => void add()}>{busy ? "جار الإضافة" : "إضافة الكاشيرات إلى قائمة الموظف"}</button>
  </div>;
}
