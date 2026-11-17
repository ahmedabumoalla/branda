"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Check, ChevronDown, Globe2, Printer, ReceiptText, Wallet } from "lucide-react";
import type { HospitalDoctorPortalState } from "@/lib/commerce/hospital-doctor-portal";
import { financePosDisplayName, financePosProductName, type FinancePosLanguage } from "@/lib/finance/pos-locale";
import s from "./doctor-account.module.css";

const fallbackLogo = "/menu-art/dabab/dabab-hospital-logo-v1.webp";
function safeLogo(value?: string | null) {
  if (!value) return fallbackLogo;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try { const url = new URL(value); return url.protocol === "https:" ? value : fallbackLogo; } catch { return fallbackLogo; }
}

export function HospitalDoctorAccount({ result, loginHref, initialLanguage = "ar" }: {
  result: HospitalDoctorPortalState;
  loginHref: string;
  initialLanguage?: FinancePosLanguage;
}) {
  const [language, setLanguage] = useState<FinancePosLanguage>(initialLanguage);
  const [logoFailed, setLogoFailed] = useState(false);
  const t = (ar: string, en: string) => language === "ar" ? ar : en;
  const data = result.state === "ready" ? result.data : null;
  const money = (value: number) => new Intl.NumberFormat(language === "ar" ? "ar-SA" : "en-SA", { style: "currency", currency: "SAR" }).format(value);
  const number = (value: number) => new Intl.NumberFormat(language === "ar" ? "ar-SA" : "en-SA", { maximumFractionDigits: 3 }).format(value);
  const date = (value: string) => {
    const instant = new Date(value);
    return Number.isNaN(instant.getTime()) ? "—" : new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Riyadh" }).format(instant);
  };
  return <main className={s.page} dir={language === "ar" ? "rtl" : "ltr"} lang={language}>
    <div className={s.shell}>
      <header className={s.header}>
        <Link href="/menu/mind-hospital" className={s.brand} aria-label={t("منيو MND", "MND menu")}>
          {logoFailed ? <strong>MND</strong> : <Image src={safeLogo(data?.brand.logoUrl)} alt="MND Café & Bakery" width={168} height={72} unoptimized priority onError={() => setLogoFailed(true)} />}
        </Link>
        <div className={s.actions}>
          <button type="button" className={s.button} onClick={() => setLanguage(language === "ar" ? "en" : "ar")} aria-label={t("التبديل للإنجليزية", "Switch to Arabic")}><Globe2 size={17} aria-hidden="true" />{language === "ar" ? "English" : "العربية"}</button>
          {data && <button type="button" className={s.button} onClick={() => window.print()}><Printer size={17} aria-hidden="true" />{t("طباعة الكشف", "Print statement")}</button>}
        </div>
      </header>
      <section className={s.welcome} aria-labelledby="doctor-account-title">
        <p className={s.eyebrow}>{t("MND · المستشفى", "MND · Hospital")}</p>
        <h1 id="doctor-account-title">{t("حسابك لدى MND", "Your MND account")}</h1>
        {data ? <div className={s.identity}><span>{financePosDisplayName(data.doctor.name, language)}</span><bdi>{data.doctor.phone}</bdi></div> : <p className={s.intro}>{t("فواتيرك ومدفوعاتك في مكان واحد", "Your invoices and payments in one place")}</p>}
      </section>
      {!data ? <section className={s.empty} role={result.state === "unavailable" ? "alert" : "status"}>
        <ReceiptText size={34} aria-hidden="true" />
        <h2>{result.state === "unlinked" ? t("لم تُسجل فاتورة لحسابك بعد", "No invoice has been linked to your account yet") : result.state === "unavailable" ? t("تعذر تحميل حسابك الآن", "Your account could not be loaded") : t("تحقق من جوالك لعرض حسابك", "Verify your phone to view your account")}</h2>
        <p>{result.state === "unlinked" ? t("ستظهر هنا فواتيرك بعد تأكيد الكاشير لها على رقم جوالك", "Your invoices appear here once the cashier confirms them against your phone number") : result.state === "unavailable" ? t("حاول مرة أخرى بعد قليل أو تواصل مع كاشير MND", "Try again shortly or contact the MND cashier") : t("استخدم رقم الجوال نفسه المسجل في طلباتك", "Use the same phone number you entered in your orders")}</p>
        {(result.state === "login" || result.state === "verify-phone") && <Link className={s.primary} href={loginHref}>{t("الدخول برقم الجوال", "Sign in with your phone")}<ArrowUpRight size={17} aria-hidden="true" /></Link>}
        {result.state === "unavailable" && <button className={s.primary} type="button" onClick={() => window.location.reload()}>{t("إعادة المحاولة", "Try again")}</button>}
        <Link className={s.menuLink} href="/menu/mind-hospital">{t("العودة للمنيو", "Back to the menu")}</Link>
      </section> : <>
        <section className={s.summary} aria-label={t("ملخص الحساب", "Account summary")}>
          <article><span><ReceiptText size={18} aria-hidden="true" />{t("صافي فواتيرك", "Net invoiced")}</span><strong>{money(data.totalInvoiced)}</strong></article>
          <article><span><Check size={18} aria-hidden="true" />{t("المدفوع", "Paid")}</span><strong>{money(data.totalPaid)}</strong></article>
          <article className={s.balance}><span><Wallet size={18} aria-hidden="true" />{data.balance < 0 ? t("رصيد لك", "Credit in your favour") : t("المتبقي عليك", "Amount due")}</span><strong>{money(Math.abs(data.balance))}</strong><small>{data.balance > 0 ? t("يمكنك السداد لدى كاشير MND", "You can pay at the MND cashier") : t("لا توجد مستحقات عليك", "No payment is due")}</small></article>
        </section>
        <section className={s.invoices} aria-labelledby="doctor-invoices-title">
          <div className={s.sectionHeading}><h2 id="doctor-invoices-title">{t("فواتيرك", "Your invoices")}</h2><span>{number(data.invoices.length)} {t("فاتورة", "invoices")}</span></div>
          {!data.invoices.length ? <p className={s.noInvoices}>{t("ستظهر فواتيرك هنا بعد إصدارها", "Your invoices will appear here once issued")}</p> : data.invoices.map(invoice => <details className={s.invoice} key={invoice.id}>
            <summary>
              <span className={s.invoiceIcon}><ReceiptText size={21} aria-hidden="true" /></span>
              <span className={s.invoiceTitle}><strong>{t("فاتورة", "Invoice")} <bdi>#{invoice.number}</bdi></strong><small>{date(invoice.createdAt)}</small></span>
              <span className={s.invoiceAmount}><strong>{money(invoice.total)}</strong><small className={invoice.outstanding > 0 ? s.unpaid : s.paid}>{invoice.status === "refunded" ? t("مرتجعة", "Refunded") : invoice.outstanding > 0 ? t("متبقي", "Due") + " " + money(invoice.outstanding) : t("مسددة", "Paid")}</small></span>
              <ChevronDown size={18} className={s.chevron} aria-hidden="true" />
            </summary>
            <div className={s.invoiceBody}>
              <div className={s.tableWrap}><table><caption className={s.srOnly}>{t("أصناف الفاتورة", "Invoice items")} #{invoice.number}</caption><thead><tr><th scope="col">{t("الصنف", "Item")}</th><th scope="col">{t("الكمية", "Quantity")}</th><th scope="col">{t("السعر", "Price")}</th><th scope="col">{t("الإجمالي", "Total")}</th></tr></thead><tbody>{invoice.items.map((item, index) => <tr key={index}><td>{financePosProductName({ name: item.name }, language)}</td><td>{number(item.quantity)}</td><td>{money(item.unitPrice)}</td><td>{money(item.total)}</td></tr>)}</tbody></table></div>
              <dl className={s.invoiceTotals}><div><dt>{t("المدفوع", "Paid")}</dt><dd>{money(invoice.paid)}</dd></div>{!!invoice.refundedTotal && <div><dt>{t("المرتجع", "Refunded")}</dt><dd>{money(invoice.refundedTotal)}</dd></div>}<div><dt>{t("المتبقي", "Due")}</dt><dd>{money(invoice.outstanding)}</dd></div></dl>
            </div>
          </details>)}
        </section>
        <footer className={s.footer}><span>{t("للاستفسار أو السداد تواصل مع كاشير MND", "For enquiries or payment, contact the MND cashier")}</span><Link href="/menu/mind-hospital">{t("اطلب من المنيو", "Order from the menu")}<ArrowUpRight size={16} aria-hidden="true" /></Link></footer>
      </>}
    </div>
  </main>;
}
