"use client";
import { useEffect, useId, useState } from "react";
import { BadgeCheck, ReceiptText } from "lucide-react";
import { fetchAdminBrandBillingAction } from "@/app/actions/admin-brand-onboarding";
import type { AdminBrandBilling, AdminBrandBillingRow } from "@/lib/data/admin-brand-billing";
import { formatSar } from "@/lib/format";
import b from "./brand-billing.module.css";

export type BrandBillingState = { loading: boolean; error: string; data: AdminBrandBilling | null };

/** One read per opened brand file, repeated when its packages change */
export function useBrandBilling(cafeId: string, revision: string | null | undefined): BrandBillingState {
  const [state, setState] = useState<BrandBillingState>({ loading: true, error: "", data: null });
  useEffect(() => {
    let cancelled = false;
    fetchAdminBrandBillingAction(cafeId).then(result => {
      if (cancelled) return;
      setState(result.ok ? { loading: false, error: "", data: result.data } : { loading: false, error: result.message, data: null });
    }).catch(() => {
      if (!cancelled) setState({ loading: false, error: "تعذر تحميل أسعار اشتراك العلامة حاول مجددًا", data: null });
    });
    return () => { cancelled = true; };
  }, [cafeId, revision]);
  return state;
}

const day = (value: string) => new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });

function totalText(data: AdminBrandBilling) {
  if (!data.currentCount) return "لا توجد باقة حالية";
  return data.currentTotal > 0 ? formatSar(data.currentTotal) : "بدون مبلغ مسجل";
}

/** Compact answer on the brand file: which package the account runs on and the price recorded for it */
export function BrandBillingCard({ billing, planName }: { billing: BrandBillingState; planName: string }) {
  return <section className={b.card} aria-label="الباقة وسعر الاشتراك" aria-busy={billing.loading}>
    <div><BadgeCheck aria-hidden="true" /><span><small>الباقة التي يعمل عليها الحساب</small><strong dir="auto">{planName}</strong></span></div>
    <div><ReceiptText aria-hidden="true" /><span><small>سعر الاشتراك المحسوب</small><strong>{billing.loading ? "جارٍ التحميل" : billing.data ? totalText(billing.data) : "تعذر التحميل"}</strong></span></div>
  </section>;
}

function Row({ row }: { row: AdminBrandBillingRow }) {
  const prepared = row.state === "جاهزة ولم تبدأ التجربة";
  const facts = [
    row.duration && `المدة ${row.duration}`,
    row.method,
    prepared ? "تبدأ بعد إرسال تفاصيل الدخول" : row.startedAt && `من ${day(row.startedAt)}`,
    !prepared && row.expiresAt && `إلى ${day(row.expiresAt)}`,
    row.paidAt && `دُفع في ${day(row.paidAt)}`,
  ].filter(Boolean);
  return <li className={`${b.row} ${row.current ? b.current : ""}`}>
    <div className={b.rowHead}><strong dir="auto">{row.planName}</strong><span className={row.current ? b.stateOn : b.stateOff}>{row.state}</span></div>
    <p className={b.price}>
      <span>السعر المحسوب</span><b>{row.amount > 0 ? formatSar(row.amount) : "بدون مبلغ"}</b>
      {row.amount > 0 && row.discount > 0 && row.baseAmount !== null && <em>بعد خصم {formatSar(row.discount)} من {formatSar(row.baseAmount)}</em>}
      {row.listPrice !== null && row.listPrice > 0 && <em>سعر الباقة في القائمة {formatSar(row.listPrice)}</em>}
    </p>
    {!!facts.length && <p className={b.facts}>{facts.join(" · ")}</p>}
  </li>;
}

/** Every package of the brand with the price recorded on its subscription */
export function BrandBillingDetails({ billing }: { billing: BrandBillingState }) {
  const titleId = useId();
  const current = billing.data?.rows.filter(row => row.current) ?? [];
  const previous = billing.data?.rows.filter(row => !row.current) ?? [];
  return <section className={b.details} aria-labelledby={titleId} aria-busy={billing.loading}>
    <h3 id={titleId}>الباقات وسعر الاشتراك</h3>
    <p className={b.hint}>السعر المسجل على كل اشتراك عند تفعيله مع سعر الباقة في القائمة للمقارنة</p>
    {billing.loading && <p className={b.hint} role="status">جارٍ تحميل أسعار الاشتراك</p>}
    {billing.error && <p className={b.error} role="alert">{billing.error}</p>}
    {billing.data && <>
      <p className={b.total}><span>إجمالي سعر الباقات الحالية</span><strong>{totalText(billing.data)}</strong></p>
      {current.length ? <ul className={b.rows}>{current.map(row => <Row key={row.id} row={row} />)}</ul> : <p className={b.hint}>لا توجد باقة حالية لهذه العلامة</p>}
      {!!previous.length && <details className={b.previous}><summary>الاشتراكات السابقة {previous.length}</summary><ul className={b.rows}>{previous.map(row => <Row key={row.id} row={row} />)}</ul></details>}
    </>}
  </section>;
}
