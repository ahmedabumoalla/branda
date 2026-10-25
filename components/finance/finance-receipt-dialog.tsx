"use client";

import { Printer } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/dashboard/ui/modal";
import type { FinanceDocument, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { FinanceReceipt } from "./finance-ui";
import { claimAutomaticReceiptPrint, printThermalReceipt, type ReceiptBrand, type ReceiptCopy, type ReceiptPaper, type ReceiptPrintHandler } from "./finance-receipt-print";
import styles from "./finance-receipt.module.css";

/** Both the dashboard and the standalone financial cashier use this exact dialog. */
export function FinanceReceiptDialog({ document, snapshot, onClose, preview = false, autoPrint = false, autoPrintKey, receiptBrand, onPrint }: { document: FinanceDocument; snapshot: FinanceSnapshot; onClose: () => void; preview?: boolean; autoPrint?: boolean; autoPrintKey?: string; receiptBrand?: ReceiptBrand | null; onPrint?: ReceiptPrintHandler }) {
  const [paper, setPaper] = useState<ReceiptPaper>("auto");
  const [copy, setCopy] = useState<ReceiptCopy>("customer");
  const [brand, setBrand] = useState<ReceiptBrand | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState("");
  const [brandWarning, setBrandWarning] = useState("");
  const busy = useRef(false);
  const receipt = useRef<HTMLDivElement>(null);
  const pairedReceipt = useRef<HTMLDivElement>(null);
  const resolvedBrand = receiptBrand === undefined ? brand : receiptBrand ?? { name: snapshot.cafe.name, logoUrl: null, color: "#3a2117" };
  const ready = receiptBrand !== undefined || !loading;
  const selectedCopy = document.kind === "sale" ? copy : "customer";
  useEffect(() => {
    if (receiptBrand !== undefined) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    let disposed = false;
    fetch(`/api/finance/${encodeURIComponent(snapshot.cafe.slug)}/receipt-brand`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error("تعذر تحميل هوية العلامة تحقق من الاتصال وصلاحية الدخول ثم أعد المحاولة"); return response.json() as Promise<ReceiptBrand>; })
      .then(value => { if (!controller.signal.aborted) { setBrand(value); setLoading(false); } })
      .catch(() => { if (!disposed) { setBrand({ name: snapshot.cafe.name, logoUrl: null, color: "#3a2117" }); setBrandWarning("هوية العلامة غير متاحة حاليًا ستُطبع الفاتورة باسم العلامة دون شعار"); setLoading(false); } })
      .finally(() => clearTimeout(timer));
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [snapshot.cafe.slug, snapshot.cafe.name, retry, receiptBrand]);
  const print = useCallback(async (both = false, automatic = false) => {
    if (busy.current || !ready) return;
    busy.current = true; setPrinting(true); setError(""); setPrintStatus("");
    try {
      const result = await (onPrint ?? printThermalReceipt)(both ? pairedReceipt.current : receipt.current, paper, { allCopies: both, newCopy: !automatic });
      setPrintStatus(`${result.submittedToDevice ? "أُرسلت مهمة الطباعة إلى خدمة الطابعة" : both ? "فُتحت طباعة إيصال العميل ونسخة المطبخ معًا" : "فُتحت نافذة الطباعة"} تأكد من خروج النسخ من الطابعة${result.usedAssetFallback ? " استُخدم خط بديل أو أُخفي شعار غير متاح" : ""}`);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر فتح الطباعة حاول مجددًا"); }
    finally { busy.current = false; setPrinting(false); }
  }, [ready, paper, onPrint]);
  useEffect(() => {
    if (!autoPrint || preview || document.kind !== "sale" || !ready) return;
    const frame = requestAnimationFrame(() => {
      if (claimAutomaticReceiptPrint(snapshot.cafe.slug, autoPrintKey ?? document.id)) void print(true, true);
    });
    return () => cancelAnimationFrame(frame);
  }, [autoPrint, preview, document.kind, document.id, ready, snapshot.cafe.slug, autoPrintKey, print]);
  return <Modal open title={preview ? "معاينة الإيصال" : document.kind === "refund" ? `فاتورة مرتجع #${document.number}` : `طباعة الفاتورة ${document.number ? `#${document.number}` : document.local_reference ?? ""}`} onClose={onClose}
    panelClassName="flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
    footer={<div className={styles.tabs}>{document.kind === "sale" && !preview && <button type="button" className={styles.print} disabled={printing || !ready} onClick={() => void print(true)}><Printer size={18} aria-hidden="true" />{printing ? "جارٍ تجهيز الطباعة" : "طباعة الإيصال والمطبخ"}</button>}<button type="button" className={styles.print} disabled={printing || !ready} onClick={() => void print()}><Printer size={18} aria-hidden="true" />{printing ? "جارٍ تجهيز الطباعة" : preview ? "طباعة المعاينة" : selectedCopy === "preparation" ? "طباعة نسخة التحضير" : "طباعة إيصال العميل"}</button></div>}>
    <div className={styles.controls}>
      {preview && <p role="status">معاينة قبل تأكيد البيع لا تُسجل فاتورة ولا تُرسل إشعارات</p>}
      {document.kind === "sale" && <div className={styles.tabs} aria-label="نسخة الطباعة"><button type="button" aria-pressed={selectedCopy === "customer"} onClick={() => setCopy("customer")}>فاتورة العميل</button><button type="button" aria-pressed={selectedCopy === "preparation"} onClick={() => setCopy("preparation")}>المطبخ أو البار</button></div>}
      <label>عرض ورق الطباعة<select value={paper} onChange={event => setPaper(event.target.value as ReceiptPaper)}><option value="auto">حسب إعداد الطابعة</option><option value="80">حراري ٨٠ مم</option><option value="58">حراري ٥٨ مم</option></select></label>
      <p>تتكيف الفاتورة مع عرض الورق المختار في نافذة الطباعة مع حد أقصى ٨٠ مم<br />إذا لم يظهر المقاس الصحيح اختر ٥٨ أو ٨٠ مم هنا وفي إعدادات الطابعة وأوقف رؤوس الصفحة وتذييلاتها</p>
      {!ready && <p role="status">جارٍ تحميل هوية العلامة للطباعة</p>}
      {ready && !resolvedBrand?.logoUrl && <p>{brandWarning || "ستظهر الفاتورة باسم العلامة دون شعار"}</p>}
      {!preview && <p>{onPrint ? "تُرسل النسخ بحسب إعداد الطابعة على هذا الجهاز وتبقى إعادة الطباعة متاحة هنا" : "يفتح المتصفح نافذة الطباعة ولا يؤكد خروج الورق إذا ألغيتها يمكنك إعادة الطباعة من هنا"}</p>}
      {printStatus && <p role="status">{printStatus}</p>}
      {error && <div className={styles.error} role="alert"><p>{error}</p></div>}
      {brandWarning && receiptBrand === undefined && <button type="button" className={styles.retry} onClick={() => { setError(""); setBrandWarning(""); setBrand(null); setLoading(true); setRetry(value => value + 1); }}>إعادة تحميل الشعار</button>}
    </div>
    <div className={styles.preview}><div ref={receipt} className={styles.paper} data-paper={paper}><FinanceReceipt document={document} snapshot={snapshot} brand={resolvedBrand ?? undefined} copy={selectedCopy} preview={preview} /></div></div>
    {document.kind === "sale" && !preview && <div hidden aria-hidden="true" ref={pairedReceipt}><FinanceReceipt document={document} snapshot={snapshot} brand={resolvedBrand ?? undefined} copy="customer" /><FinanceReceipt document={document} snapshot={snapshot} brand={resolvedBrand ?? undefined} copy="preparation" /></div>}
  </Modal>;
}
