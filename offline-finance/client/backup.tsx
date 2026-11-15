import { useRef, useState } from "react";
import { Download, Power, Upload } from "lucide-react";
import { Panel } from "../../components/finance/finance-ui";
import styles from "../../components/finance/finance.module.css";
import { csrfHeaders, localRequest } from "./api";
import Link from "./navigation";
import sidebar from "../../components/dashboard/finance-sidebar-menu.module.css";

async function checkedResponse(response: Response) {
  if (response.ok) return response;
  const result = await response.json().catch(() => ({}));
  throw new Error(result.message || result.error || "تعذر تنفيذ العملية المحلية");
}

export function BackupLink() {
  return <Link className={sidebar.item} href="/local/backup"><Download className={sidebar.icon} />النسخ الاحتياطي وإغلاق البرنامج</Link>;
}

export function LocalBackup() {
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [closed, setClosed] = useState(false);
  if (closed) return <div className={styles.page}><Panel title="البرنامج مغلق"><p role="status">تم حفظ البيانات وإغلاق البرنامج يمكنك إغلاق هذه النافذة</p></Panel></div>;
  return <div className={styles.page}><header className={styles.header}><h1 className={styles.title}>النسخ الاحتياطي وإغلاق البرنامج</h1></header>{error && <p className={styles.error} role="alert">{error}</p>}<Panel title="نسختك الاحتياطية"><p>نزّل نسخة احتياطية واحتفظ بها على قرص آخر لاستعادتها عند الحاجة</p><p>الاستعادة متاحة أثناء إعداد تثبيت جديد فقط قبل إنشاء المنشأة</p><button className={styles.primary} disabled={pending} onClick={async () => {
    setPending(true); setError("");
    try {
      const response = await checkedResponse(await fetch("/api/backup", { method: "POST", credentials: "same-origin", headers: csrfHeaders() }));
      const blob = await response.blob(), url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `branda-${new Date().toISOString().replace(/[:.]/g, "-")}.branda`;
      document.body.append(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر تنزيل النسخة الاحتياطية"); }
    finally { setPending(false); }
  }}><Download size={18} />{pending ? "جار تنفيذ العملية" : "تنزيل نسخة احتياطية"}</button></Panel><Panel title="إغلاق البرنامج"><p>أغلق البرنامج بعد الانتهاء من العمل لحفظ البيانات وإيقاف الخادم المحلي</p><button className={styles.secondary} disabled={pending} onClick={async () => {
    setPending(true); setError("");
    try { await localRequest("/api/quit", {}); setClosed(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر إغلاق البرنامج"); }
    finally { setPending(false); }
  }}><Power size={18} />إغلاق البرنامج</button></Panel></div>;
}

export function InitialRestore({ refresh }: { refresh: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null), [pending, setPending] = useState(false), [error, setError] = useState("");
  return <section className="offline-restore"><h2>استعادة نسخة سابقة</h2><p>الاستعادة متاحة على تثبيت جديد فقط قبل إنشاء المنشأة</p>{error && <p className={styles.error} role="alert">{error}</p>}<input ref={input} type="file" accept=".branda" aria-label="ملف النسخة الاحتياطية" disabled={pending} /><button type="button" className={styles.secondary} disabled={pending} onClick={async () => {
    const file = input.current?.files?.[0]; setError("");
    if (!file || !file.name.toLowerCase().endsWith(".branda")) { setError("اختر ملف نسخة احتياطية بامتداد branda"); return; }
    setPending(true);
    try { await checkedResponse(await fetch("/api/restore", { method: "POST", credentials: "same-origin", headers: { ...csrfHeaders(), "Content-Type": "application/octet-stream" }, body: file })); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر استعادة النسخة الاحتياطية"); }
    finally { setPending(false); }
  }}><Upload size={18} />{pending ? "جار استعادة النسخة" : "استعادة النسخة الاحتياطية"}</button></section>;
}
