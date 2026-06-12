import { isBarndaksaEmailConfigured, sendBarndaksaEmail } from "@/lib/email/resend";
import { vatFromInclusive, netOfVat, roundMoney } from "@/lib/finance/barndaksa-finance";

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] ?? char));
}

export async function sendSubscriptionInvoiceEmail(subscription: Record<string, unknown>) {
  if (!isBarndaksaEmailConfigured()) return;
  const cafe = subscription.cafes as Record<string, unknown> | null;
  const to = String(cafe?.owner_email ?? "").trim();
  if (!to) return;

  const amount = Number(subscription.amount_sar ?? 0);
  const net = netOfVat(amount);
  const vat = vatFromInclusive(amount);
  const discount = Number(subscription.discount_amount_sar ?? 0);
  const invoiceType = cafe?.tax_number ? "فاتورة ضريبية" : "فاتورة ضريبية مبسطة";
  const invoiceNumber = `BR-${String(subscription.id).slice(0, 8).toUpperCase()}`;

  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;background:#fcf8f3;padding:24px;color:#241610;line-height:1.8">
      <div style="max-width:720px;margin:auto;background:white;border:1px solid #eadcc8;border-radius:24px;overflow:hidden">
        <div style="background:#241610;color:#f6c35b;padding:24px">
          <h1 style="margin:0;font-size:26px">${invoiceType} - بارنداكسا</h1>
          <p style="margin:8px 0 0;color:#f8f4ef">رقم الفاتورة: ${invoiceNumber}</p>
        </div>
        <div style="padding:24px">
          <h2 style="margin-top:0">بيانات العلامة التجارية</h2>
          <p><strong>العلامة:</strong> ${escapeHtml(cafe?.name)}</p>
          <p><strong>السجل التجاري:</strong> ${escapeHtml(cafe?.commercial_register || "غير مضاف")}</p>
          <p><strong>الرقم الضريبي:</strong> ${escapeHtml(cafe?.tax_number || "غير مضاف")}</p>
          <table style="width:100%;border-collapse:collapse;margin-top:18px">
            <tr><td style="border:1px solid #eadcc8;padding:10px">الباقة</td><td style="border:1px solid #eadcc8;padding:10px">${escapeHtml(subscription.plan_name_snapshot)}</td></tr>
            <tr><td style="border:1px solid #eadcc8;padding:10px">المبلغ قبل الضريبة</td><td style="border:1px solid #eadcc8;padding:10px">${roundMoney(net)} ر.س</td></tr>
            <tr><td style="border:1px solid #eadcc8;padding:10px">ضريبة القيمة المضافة المضمنة 15%</td><td style="border:1px solid #eadcc8;padding:10px">${roundMoney(vat)} ر.س</td></tr>
            <tr><td style="border:1px solid #eadcc8;padding:10px">الخصم</td><td style="border:1px solid #eadcc8;padding:10px">${roundMoney(discount)} ر.س</td></tr>
            <tr><td style="border:1px solid #eadcc8;padding:10px"><strong>الإجمالي شامل الضريبة</strong></td><td style="border:1px solid #eadcc8;padding:10px"><strong>${roundMoney(amount)} ر.س</strong></td></tr>
          </table>
          <p style="margin-top:22px;color:#6b3a25">شكرًا لاشتراككم في منصة بارنداكسا.</p>
        </div>
      </div>
    </div>`;

  await sendBarndaksaEmail({
    to,
    subject: `${invoiceType} من بارنداكسا - ${invoiceNumber}`,
    html,
    text: `${invoiceType} من بارنداكسا. الإجمالي شامل الضريبة: ${roundMoney(amount)} ر.س`,
  });
}
