"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Clock3, RefreshCw, ShieldCheck, X } from "lucide-react";
import { loadEmployeeApprovals, reviewEmployeeApproval } from "@/app/actions/finance-employee-approvals";
import { employeePermissionCatalog } from "@/lib/finance/employee-permissions";
import type { EmployeeApproval } from "@/lib/finance/employee-approvals";
import styles from "./employee-approval-workspace.module.css";

const actions: Record<string, string> = { create: "إضافة", update: "تعديل", delete: "حذف", pay: "سداد", return: "مرتجع", approve: "اعتماد", credit: "شراء آجل", settings: "الإعدادات", stamp: "إضافة ختم", redeem: "صرف مكافأة", issue: "إصدار بطاقة" };
const states = { pending: "بانتظار الاعتماد", approved: "معتمد وجاهز للتنفيذ", rejected: "مرفوض", consumed: "تم التنفيذ" };
const labels: Record<string, string> = { amount: "المبلغ", total: "الإجمالي", expectedTotal: "الإجمالي المتوقع", name: "الاسم", supplierId: "معرف المورد", supplierName: "المورد", customerId: "معرف العميل", customerName: "العميل", quantity: "الكمية", qty: "الكمية", price: "السعر", unitPrice: "سعر الوحدة", unit: "الوحدة", itemId: "معرف الصنف", itemName: "الصنف", productId: "معرف المنتج", items: "الأصناف", lines: "البنود", invoice: "الفاتورة", invoiceId: "رقم الفاتورة", note: "ملاحظة", notes: "ملاحظات", reason: "السبب", taxRate: "نسبة الضريبة", discount: "الخصم", warehouseId: "المستودع", accountId: "حساب الدفع", paymentMethod: "طريقة السداد", paid: "المدفوع", date: "التاريخ", branchId: "الفرع", payload: "بيانات العملية", p_payload: "بيانات العملية", p_input: "بيانات العملية", p_operation: "الإجراء", p_action: "الإجراء", p_mode: "نوع العملية", requestId: "مرجع الطلب", p_request_id: "مرجع الطلب", countedCash: "النقدية المعدودة", cashAccountId: "الصندوق" };
function Details({ value }: { value: unknown }) {
  if (value == null) return <span>—</span>;
  if (typeof value !== "object") return <span>{typeof value === "boolean" ? value ? "نعم" : "لا" : String(value)}</span>;
  if (Array.isArray(value)) return <ol className={styles.lines}>{value.map((entry, i) => <li key={i}><Details value={entry} /></li>)}</ol>;
  return <dl className={styles.details}>{Object.entries(value).filter(([key]) => !/password|token|secret|p_cafe|p_user|session/i.test(key)).map(([key, entry]) => <div key={key}><dt>{labels[key] ?? key}</dt><dd><Details value={entry} /></dd></div>)}</dl>;
}
export function EmployeeApprovalWorkspace({ slug, name, initial }: { slug: string; name: string; initial: EmployeeApproval[] }) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, start] = useTransition();
  const pending = rows.filter(row => row.status === "pending").length;
  function refresh() { start(async () => { try { setRows((await loadEmployeeApprovals(slug)).rows); setMessage(""); } catch { setMessage("تعذر التحديث حاول مجددًا"); } }); }
  function review(row: EmployeeApproval, decision: "approved" | "rejected") {
    if (decision === "rejected" && !notes[`${row.request_id}:${row.permission}`]?.trim()) { setMessage("اكتب سبب الرفض ليعرف الموظف ما يحتاج إلى تصحيحه"); return; }
    start(async () => { const result = await reviewEmployeeApproval(slug, { requestId: row.request_id, permission: row.permission, decision, note: notes[`${row.request_id}:${row.permission}`] ?? "" }); if (result.ok) { setRows(result.rows); setMessage(decision === "approved" ? "تم الاعتماد يستطيع الموظف الآن إعادة تنفيذ العملية بنفس البيانات" : "تم رفض الطلب"); } else setMessage(result.message); });
  }
  return <main className={styles.page} dir="rtl">
    <header className={styles.header}><div className={styles.title}><ShieldCheck /><div><small>{name}</small><h1>طلبات اعتماد الموظفين</h1><p>راجع تفاصيل الإجراء قبل الموافقة عليه</p></div></div><div className={styles.tools}><Link href={`/finance/${slug}`}>العودة للمالية</Link><button onClick={refresh} disabled={busy}><RefreshCw size={16} />تحديث</button></div></header>
    <div className={styles.notice}><Clock3 size={19} /><span>الموافقة تسمح للموظف بإعادة تنفيذ الطلب بنفس البيانات ولا تنفذ العملية المالية تلقائيًا</span></div>
    <nav className={styles.tabs} aria-label="تصفية طلبات الاعتماد">{[["pending", `المعلقة (${pending})`], ["all", "كل الطلبات"]].map(([key, label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</nav>
    {message && <div role="status" className={styles.notice}>{message}</div>}
    <section className={styles.grid}>{rows.filter(row => filter === "all" || row.status === filter).map(row => { const key = `${row.request_id}:${row.permission}`; const [domain, action] = row.permission.split("."); return <article className={styles.card} key={key}>
      <header><h2>{employeePermissionCatalog.find(group => group.domain === domain)?.label ?? domain} · {actions[action] ?? action}</h2><span className={styles.status} data-state={row.status}>{states[row.status]}</span></header>
      <div className={styles.people}><div><small>مقدم الطلب</small><strong>{row.requester_name || "الموظف"}</strong></div><div><small>مسؤول الاعتماد</small><strong>{row.approver_name || "مالك العلامة"}</strong></div><time>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", calendar: "gregory" }).format(new Date(row.created_at))}</time></div>
      <details className={styles.payload} open={row.status === "pending"}><summary>تفاصيل العملية</summary><Details value={row.payload} /></details>
      {row.review_note && <p className={styles.note}>{row.review_note}</p>}
      {row.can_review && <div className={styles.review}><label>ملاحظة الاعتماد أو سبب الرفض <small>مطلوب عند الرفض</small><textarea maxLength={1000} value={notes[key] ?? ""} onChange={event => setNotes({ ...notes, [key]: event.target.value })} /></label><div className={styles.tools}><button className={styles.approve} disabled={busy} onClick={() => review(row, "approved")}><Check size={16} />اعتماد الطلب</button><button disabled={busy} onClick={() => review(row, "rejected")}><X size={16} />رفض الطلب</button></div></div>}
    </article>; })}</section>
    {!rows.some(row => filter === "all" || row.status === filter) && <div className={styles.empty}><ShieldCheck /><h2>لا توجد طلبات {filter === "pending" ? "معلقة" : "اعتماد"}</h2><p>تظهر هنا الطلبات الموجهة إليك والطلبات التي قدمتها</p></div>}
  </main>;
}
