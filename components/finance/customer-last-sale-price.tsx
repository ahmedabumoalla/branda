import type { useCustomerSalePrices } from "./use-customer-sale-prices";
import { invoiceSettingsMoney, type InvoiceSettings } from "@/lib/finance/invoice-settings";
import { Numeric } from "./finance-ui";
import css from "./company-invoice-lines.module.css";

export function CustomerLastSalePrice({ productId, history, decimalDisplay }: { productId: string; history: ReturnType<typeof useCustomerSalePrices>; decimalDisplay?: InvoiceSettings["decimalDisplay"] }) {
  if (!productId) return null;
  const price = history.prices.find(item => item.productId === productId);
  return <div className={css.lastSalePrice}>
    {history.status === "no-customer" ? "اختر العميل لعرض آخر سعر بيع" : history.status === "loading" ? "جار تحميل آخر سعر بيع" : history.status === "error" ? <button type="button" onClick={history.retry}>تعذر تحميل آخر سعر بيع أعد المحاولة</button> : !price ? "لا توجد مبيعات سابقة لهذا العميل" : <>
      <span title={`سعر الوحدة قبل الخصم ${price.taxInclusive ? "شامل الضريبة" : "غير شامل الضريبة"}${price.price !== price.maxPrice ? " · بيع الصنف بأكثر من سعر في آخر فاتورة" : ""}`}>آخر سعر بيع لهذا العميل <strong>{decimalDisplay ? <>{invoiceSettingsMoney(price.price, decimalDisplay)}{price.price !== price.maxPrice && <> – {invoiceSettingsMoney(price.maxPrice, decimalDisplay)}</>}</> : <><Numeric value={price.price} />{price.price !== price.maxPrice && <> – <Numeric value={price.maxPrice} /></>} ر.س</>}</strong></span>
      <time dateTime={price.soldAt}>{new Date(price.soldAt).toLocaleDateString("ar-SA-u-ca-gregory", { timeZone: "Asia/Riyadh" })}</time>
      <small>قبل الخصم {price.taxInclusive ? "شامل الضريبة" : "غير شامل الضريبة"}</small>
    </>}
  </div>;
}
