"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { loadLoyaltyBranchReportAction } from "@/app/actions/loyalty-branch-report";
import type { BranchReportFilters, LoyaltyBranchReportResult } from "@/lib/loyalty/branch-report-types";
import { activityAge, branchActivityLabel } from "@/lib/loyalty/branch-report-display";
import s from "./branch-customers-report.module.css";

const dates = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
const date = (value: string | null) => value ? dates.format(new Date(value)) : "غير مسجل";
const count = (value: number) => new Intl.NumberFormat("ar-SA-u-nu-latn").format(value);
const source = (value: string) => value === "cashier" ? "إضافة من الكاشير" : value === "registration" ? "تسجيل العميل" : "غير مسجل";

export function BranchCustomersReport({ initial, filters }: { initial: LoyaltyBranchReportResult; filters: BranchReportFilters }) {
  const [result, setResult] = useState(initial);
  const [draft, setDraft] = useState(filters);
  const [applied, setApplied] = useState(filters);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initial.ok ? "" : initial.message);
  const request = useRef(0);
  const data = result.ok ? result.data : null;
  const branch = data?.branches.find(item => (item.id ?? "unassigned") === filters.branchId);
  async function load(next: BranchReportFilters) {
    if ((next.from || next.to) && (!next.from || !next.to || next.from > next.to)) { setError("اختر تاريخ البداية والنهاية بترتيب صحيح أو اتركهما لعرض كل الفترات"); return; }
    const id = ++request.current;
    setPending(true); setError("");
    try {
      const loaded = await loadLoyaltyBranchReportAction(next);
      if (id !== request.current) return;
      if (!loaded.ok) { setError(loaded.message); return; }
      setResult(loaded); setApplied(next);
    } catch { if (id === request.current) setError("تعذر تحميل تفاصيل الفرع حاول مجددًا"); }
    finally { if (id === request.current) setPending(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void load({ ...draft, page: 1 }); }
  const exportQuery = new URLSearchParams({ branch: applied.branchId, from: applied.from, to: applied.to, search: applied.search });
  return <main className={s.page} dir="rtl">
    <header className={s.header}><div><Link href="/dashboard/loyalty/branches">العودة إلى الفروع</Link><h1>تفاصيل عملاء الفرع</h1><p>{branch?.name ?? "متابعة عملاء الفرع وبطاقاتهم"}</p></div><div className={s.actions}><a href={`/api/loyalty/branches/export?${exportQuery}`} className={s.primary}>تصدير تقرير الفرع</a><Link className={s.secondary} href={`/dashboard/read-operations?branch=${encodeURIComponent(filters.branchId)}`}>سجل عمليات الفرع</Link></div></header>
    <p className={s.note}>إصدار البطاقة يشمل إضافة العميل من الكاشير حتى لو لم يحمّلها وتُحسب بطاقات باركود الفرع أيضًا كل بطاقة تُحسب مرة واحدة ضمن الإصدار ومرة واحدة ضمن التحميل أو الحفظ</p>
    <form className={s.filters} onSubmit={submit}><label>العميل<input type="search" value={draft.search} maxLength={80} placeholder="ابحث عن العميل" onChange={event => setDraft({ ...draft, search: event.target.value })} /></label><label>من تاريخ<input type="date" value={draft.from} onChange={event => setDraft({ ...draft, from: event.target.value })} /></label><label>إلى تاريخ<input type="date" value={draft.to} min={draft.from || undefined} onChange={event => setDraft({ ...draft, to: event.target.value })} /></label><button className={s.primary} disabled={pending}>{pending ? "جار التحميل" : "عرض النتائج"}</button><button type="button" className={s.secondary} disabled={pending} onClick={() => { const next = { ...filters, from: "", to: "", search: "", page: 1 }; setDraft(next); void load(next); }}>كل الفترات</button></form>
    {error && <p role="alert" className={s.error}>{error}{data ? " النتائج السابقة ظاهرة حتى ينجح التحديث" : ""}</p>}
    {data && <div aria-busy={pending}>
      <div className={s.metrics}>{([["البطاقات الصادرة", data.summary.issuedCards], ["بطاقات آبل المحمّلة أو المحفوظة", data.summary.downloadedCards], ["الأختام المضافة", data.summary.stamps], ["المكافآت المصروفة", data.summary.redemptions]] as const).map(([label, value]) => <section key={label}><span>{label}</span><strong>{count(value)}</strong></section>)}</div>
      <p className={s.note}>بطاقات سُجّل حفظها في آبل: {count(data.summary.appleInstalledCards)} · روابط حفظ جوجل المنشأة: {count(data.summary.googleSaveLinks)} · إنشاء رابط جوجل لا يؤكد حفظ البطاقة</p>
      {branch && <section className={s.panel}><h2>بيانات الفرع</h2><dl className={s.details}><div><dt>الحالة</dt><dd>{branch.active ? "نشط" : "غير نشط"}</dd></div><div><dt>العنوان</dt><dd>{[branch.city, branch.address].filter(Boolean).join(" — ") || "غير مسجل"}</dd></div><div><dt>التواصل</dt><dd><bdi>{branch.phone || "غير مسجل"}</bdi></dd></div><div><dt>ساعات العمل</dt><dd>{branch.workingHours || "غير مسجلة"}</dd></div><div><dt>آخر نشاط</dt><dd>{branchActivityLabel(branch.lastActivityKind)}<small>{activityAge(branch.lastActivityAt, data.asOf)} · {date(branch.lastActivityAt)}</small></dd></div></dl></section>}
      <section className={s.panel}><h2>عملاء الفرع <span>{count(data.total)}</span></h2><p className={s.note}>تظهر البطاقات الصادرة من هذا الفرع والعملاء الذين لديهم عمليات فيه حتى لو صدرت بطاقتهم من فرع آخر الأختام والمكافآت تخص نشاط هذا الفرع ولا تمثل الرصيد الحالي</p>{data.customers.length ? <div className={s.tableWrap} tabIndex={0} role="region" aria-label="جدول عملاء الفرع"><table><thead><tr>{["العميل", "الإصدار", "حالة البطاقة", "الأختام", "المكافآت المصروفة", "آخر نشاط"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{data.customers.map(customer => <tr key={customer.cardId}><td>{customer.name || "غير مسجل"}<small><bdi>{customer.phone}</bdi></small></td><td>{source(customer.source)}<small>فرع إصدار البطاقة: {customer.branchName || "غير مسجل"}</small><small>{customer.cashierName || "الموظف غير مسجل"}</small><small>{date(customer.issuedAt)}</small></td><td>{customer.appleInstalledAt ? "سُجّل حفظها في آبل" : customer.downloadedAt ? "تحميل آبل مسجل" : customer.googleSaveLinkAt ? "أُنشئ رابط جوجل" : (applied.from ? "لا يوجد تحميل مسجل خلال الفترة" : "لم يسجل تحميل")}<small>آخر تسجيل لهذه الحالة: {date(customer.appleInstalledAt ?? customer.downloadedAt ?? customer.googleSaveLinkAt)}</small></td><td>{count(customer.stamps)}</td><td>{count(customer.redemptions)}</td><td>{branchActivityLabel(customer.lastActivityKind)}<small>{activityAge(customer.lastActivityAt, data.asOf)}</small><small>{date(customer.lastActivityAt)}</small></td></tr>)}</tbody></table></div> : <p className={s.empty}>لا يوجد عملاء يطابقون الفترة والبحث المحددين</p>}
      <nav className={s.pagination} aria-label="صفحات عملاء الفرع"><button className={s.secondary} disabled={pending || data.page <= 1} onClick={() => void load({ ...applied, page: data.page - 1 })}>السابق</button><span>صفحة {count(data.page)} من {count(Math.max(1, Math.ceil(data.total / data.pageSize)))}</span><button className={s.secondary} disabled={pending || data.page * data.pageSize >= data.total} onClick={() => void load({ ...applied, page: data.page + 1 })}>التالي</button></nav></section>
      <section className={s.panel}><h2>موظفو الفرع</h2><p className={s.note}>يشمل الموظفين الحاليين ومن نفّذ عمليات في هذا الفرع سابقًا حتى لو تغيّر فرعهم الحالي</p>{data.staff.length ? <div className={s.tableWrap} tabIndex={0} role="region" aria-label="جدول موظفي الفرع"><table><thead><tr>{["الموظف", "البطاقات الصادرة", "الأختام", "المكافآت المصروفة", "آخر نشاط"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{data.staff.map(employee => <tr key={employee.id}><td>{employee.name}<small>{employee.active ? "نشط" : "غير نشط"}</small><small>الفرع الحالي: {employee.branchName || "غير مسجل"}</small></td><td>{count(employee.issuedCards)}</td><td>{count(employee.stamps)}</td><td>{count(employee.redemptions)}</td><td>{branchActivityLabel(employee.lastActivityKind)}<small>{activityAge(employee.lastActivityAt, data.asOf)}</small><small>{date(employee.lastActivityAt)}</small></td></tr>)}</tbody></table></div> : <p className={s.empty}>لا يوجد موظفون مسجلون للفرع</p>}</section>
      <p className={s.note}>العمليات القديمة التي لم يُحفظ فرعها تظهر ضمن غير محدد ولا ننسبها إلى فرع الموظف الحالي · الأوقات بتوقيت الرياض · آخر تحديث {date(data.asOf)}</p>
    </div>}
  </main>;
}
