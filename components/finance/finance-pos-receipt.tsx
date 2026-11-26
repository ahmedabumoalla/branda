"use client";
import type { CSSProperties } from "react";
import type { FinanceDocument, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { financeReceiptQr } from "@/lib/finance/receipt-tax";
import type { ReceiptBrand, ReceiptCopy } from "./finance-receipt-print";
import { documentKindNames } from "./finance-ui";
import { FinancePosLocaleProvider, PosNumeric as Numeric, useFinancePosLocale } from "./finance-pos-locale";
import receiptStyles from "./finance-receipt.module.css";
type ReceiptProps = { document: FinanceDocument; snapshot: FinanceSnapshot; brand?: ReceiptBrand; copy?: ReceiptCopy; preview?: boolean };

export function FinanceReceipt(props: ReceiptProps) {
  const receipt = <ReceiptContent {...props} />;
  return props.snapshot.cafe.slug === "mind-hospital" && props.copy !== "preparation"
    ? <FinancePosLocaleProvider enabled={false}>{receipt}</FinancePosLocaleProvider>
    : receipt;
}

function ReceiptContent({ document, snapshot, brand, copy = "customer", preview = false }: ReceiptProps) {
  const { t, dir, language, displayName, productName, date } = useFinancePosLocale();
  const customer = snapshot.parties.find((party) => party.id === document.party_id);
  const account = snapshot.accounts.find((item) => item.id === document.account_id);
  const preparation = copy === "preparation" && document.kind === "sale";
  const refund = document.kind === "refund";
  const original = snapshot.documents.find((item) => item.id === document.reference_id);
  const returned = document.refunded_total ?? (document.refunded ? document.total : 0);
  const taxQr = !preparation && !preview ? financeReceiptQr(document, snapshot.cafe.slug === "mind-hospital" || snapshot.cafe.businessCategory === "butcher_shops") : null;
  const taxReady = taxQr?.kind === "tax";
  const title = preparation ? t("طلب تحضير") : refund ? taxReady ? t("إشعار دائن ضريبي مبسط", "Simplified tax credit note") : t("فاتورة مرتجع") : document.kind === "sale" ? taxReady ? t("فاتورة ضريبية مبسطة", "Simplified tax invoice") : t("فاتورة مبيعات") : documentKindNames[document.kind] ?? t("مستند مالي");
  return <article dir={dir} lang={language} data-finance-receipt data-receipt-preparation={preparation || undefined} className={receiptStyles.receipt} style={{ "--receipt-brand": brand?.color ?? "#3a2117" } as CSSProperties}>
    <header data-receipt-header>
      {/* The original tenant logo must retain its proportions and authenticated signed URL. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {brand?.logoUrl && <img src={brand.logoUrl} alt={brand.name} />}
      <h3>{document.receipt_seller?.name || displayName(brand?.name || snapshot.cafe.name)}</h3>
      {!preparation && document.receipt_seller?.vatNumber && <p>{t("الرقم الضريبي", "VAT registration number")} <bdi dir="ltr">{document.receipt_seller.vatNumber}</bdi></p>}
      <p data-receipt-title>{t(title)}</p>{preview ? <p><strong>{t("معاينة فقط لم تُسجل الفاتورة")}</strong></p> : <><p>{document.number ? `#${document.number}` : document.local_reference}</p>{document.local_reference && document.number > 0 && <p>{t("المرجع المحلي ")}{document.local_reference}</p>}{document.sync_status && document.sync_status !== "synced" && <p>{t("محفوظة على الجهاز بانتظار المزامنة")}</p>}</>}
      <p>{date(document.created_at)}</p>
    </header>
    <div data-receipt-meta>
      {preparation ? <p>{t("نسخة المطبخ أو البار")}</p> : <>
        {customer && <p>{t("العميل: ")}{displayName(customer.name)}</p>}
        {document.customer_phone && <p>{t("رقم العميل: ")}<bdi dir="ltr">{document.customer_phone}</bdi></p>}
        {customer?.tax_number && <p>{t("رقم العميل الضريبي: ")}{customer.tax_number}</p>}
        {account && <p>{refund ? t("طريقة إعادة المبلغ") : t("طريقة التحصيل")}: {account.kind === "cash" ? t("نقدي") : account.kind === "pos" ? t("نقاط البيع") : account.kind === "bank" ? t("تحويل بنكي") : t(account.name)}</p>}
        <p>{t("جميع المبالغ بالريال السعودي")}</p>
      </>}
      {refund && <p>{t("مرجع الفاتورة: ")}{original || document.reference_number ? `#${original?.number ?? document.reference_number}` : document.reference_id}</p>}
    </div>
    <table data-receipt-items><thead><tr><th scope="col">{t("الصنف")}</th><th scope="col">{t("الكمية")}</th>{!preparation && <th scope="col">{t("الإجمالي")}</th>}</tr></thead><tbody>
      {document.lines.map((line) => <tr key={line.id}><td>{productName({ name: line.name })}{!preparation && <small>{t("سعر الوحدة ")}<Numeric value={line.unit_price} money unitPrice={!!line.unit_id} /></small>}</td><td><Numeric value={line.quantity} /></td>{!preparation && <td><Numeric value={line.net + line.tax} money /></td>}</tr>)}
    </tbody></table>
    {!preparation && <>
      <div data-receipt-row><span>{t("المجموع قبل الخصم")}</span><Numeric value={document.subtotal} money /></div>
      {document.discount > 0 && <div data-receipt-row><span>{t("الخصم")}</span><Numeric value={document.discount} money /></div>}
      <div data-receipt-row><span>{t("القيمة قبل الضريبة")}</span><Numeric value={document.total - document.tax} money /></div>
      <div data-receipt-row><span>{t("ضريبة القيمة المضافة")}{document.vat_rate != null ? ` ${document.vat_rate}%` : ""}</span><Numeric value={document.tax} money /></div>
      {document.tax_inclusive != null && <p>{document.tax_inclusive ? t("الأسعار شاملة الضريبة") : t("الأسعار غير شاملة الضريبة")}</p>}
      <div data-receipt-row data-receipt-total><span>{refund ? t("إجمالي المرتجع") : t("الإجمالي")}</span><Numeric value={document.total} money /></div>
      {refund ? <>
        <div data-receipt-row><span>{t("المبلغ المعاد للعميل")}</span><Numeric value={document.paid} money /></div>
        {document.total - document.paid > .009 && <div data-receipt-row><span>{t("تخفيض الرصيد الآجل")}</span><Numeric value={document.total - document.paid} money /></div>}
      </> : <>
        {returned > .009 && <div data-receipt-row><span>{document.refunded ? t("مرتجع كامل") : t("مرتجع جزئي")}</span><Numeric value={returned} money /></div>}
        <div data-receipt-row><span>{preview ? t("المبلغ المتوقع تحصيله") : returned > .009 ? t("صافي المدفوع بعد المرتجع") : t("المدفوع")}</span><Numeric value={Math.max(0, document.total - returned - document.outstanding)} money /></div>
        {document.outstanding > .009 && <div data-receipt-row><span>{t("المتبقي")}</span><Numeric value={document.outstanding} money /></div>}
      </>}
    </>}
    {taxQr && <div data-receipt-qr><svg data-receipt-tax-qr role="img" aria-label={t("رمز الفاتورة", "Invoice QR code")} viewBox={`0 0 ${taxQr.size} ${taxQr.size}`} xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges"><rect width={taxQr.size} height={taxQr.size} fill="#fff" /><path d={taxQr.path} fill="#000" /></svg></div>}
    {document.note && <p data-receipt-note>{preparation ? t("ملاحظة الطلب") : t("ملاحظة")}: {t(document.note)}</p>}
    <footer data-receipt-footer>{preview ? t("معاينة فقط وليست إثبات دفع") : preparation ? t("نسخة تحضير وليست فاتورة تحصيل") : t("شكرًا لزيارتكم")}</footer>
  </article>;
}
