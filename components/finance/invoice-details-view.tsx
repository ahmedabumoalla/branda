import Image from "next/image";
import { Package, UserRound } from "lucide-react";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import type { InvoiceDetail } from "@/lib/finance/invoice-management";
import { financeDate, Numeric } from "./finance-ui";
import styles from "./finance-invoice-detail.module.css";

function dateOnly(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "غير محدد" : new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

/** Pure presentation of persisted invoice data; no inferred due date or salesperson. */
export function renderInvoiceDetails(detail: InvoiceDetail, snapshot: FinanceSnapshot) {
  const document = detail.document, issued = detail.invoice;
  const customer = issued?.customer.name || detail.customer?.name || "عميل نقدي";
  const returned = document.refunded_total ?? 0;
  const paid = Math.max(0, document.total - returned - document.outstanding);
  const collectible = Math.max(0, document.total - returned);
  const ratio = collectible > 0 ? Math.min(100, Math.max(0, paid / collectible * 100)) : 0;
  const latest = [...detail.activity].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const creator = detail.creator.id === snapshot.userId ? "المستخدم الحالي" : detail.creator.name;
  const rows = issued ? issued.lines.map((line, index) => ({ key: String(index), productId: line.productId, name: line.name, description: line.description, price: line.price, quantity: line.quantity, net: line.net, tax: line.tax })) : document.lines.map(line => ({ key: line.id, productId: line.product_id, name: line.name, description: "", price: line.unit_price, quantity: line.quantity, net: line.net, tax: line.tax }));
  const methods = new Map<string, number>();
  function add(account: string | null, amount: number) { if (amount) methods.set(account ?? "", Math.round(((methods.get(account ?? "") ?? 0) + amount) * 100) / 100); }
  add(document.account_id, document.paid);
  for (const payment of detail.related) {
    if (payment.kind === "settlement" || payment.kind === "receipt") add(payment.account_id, payment.paid);
    if (payment.kind === "refund") add(payment.account_id, -payment.paid);
  }
  const kindNames: Record<string, string> = { cash: "نقدي", bank: "تحويل بنكي", pos: "نقاط البيع", employee: "عهدة موظف" };
  const delivery = detail.metadata.delivery ?? issued?.delivery;
  return <div className={styles.detailsView}>
    <div className={styles.detailsSummary}>
      <div className={styles.customerCard}><span className={styles.customerAvatar} aria-hidden="true">{Array.from(customer.trim())[0] || <UserRound size={32} />}</span><div><span className={styles.caption}>فاتورة إلى</span><strong>{customer}</strong>{(detail.customer?.phone || issued?.customer.phone) && <small dir="ltr">{detail.customer?.phone || issued?.customer.phone}</small>}{(issued?.customer.vatNumber || detail.customer?.tax_number) && <small>الرقم الضريبي {issued?.customer.vatNumber || detail.customer?.tax_number}</small>}</div></div>
      <dl className={styles.dateTrack}><div><dt>تاريخ الإصدار</dt><dd><time dateTime={issued?.issuedAt ?? document.created_at} dir="ltr">{dateOnly(issued?.issuedAt ?? document.created_at)}</time></dd></div><div><dt>تاريخ الاستحقاق</dt><dd>غير محدد</dd></div></dl>
      <div className={styles.collectionCard}><span className={styles.caption}>إجمالي المبلغ</span><strong className={styles.grandAmount}><Numeric value={document.total} money /></strong><div className={styles.collectionTrack} role="img" aria-label={`نسبة السداد ${Math.round(ratio)}٪ من المبلغ بعد المرتجعات`}><span style={{ width: `${ratio}%` }} /></div><div className={styles.collectionAmounts}><div><strong><Numeric value={paid} /></strong><span>مدفوعة</span></div><div><strong><Numeric value={document.outstanding} /></strong><span>المبلغ المستحق</span></div></div>{returned > .009 && <small>المرتجع <Numeric value={returned} money /></small>}</div>
    </div>
    <div className={styles.peopleRow}>
      <div><span className={styles.caption}>أنشئ بواسطة</span><div className={styles.person}><span className={styles.personAvatar} aria-hidden="true">{Array.from(creator)[0]}</span><div><strong>{creator}</strong><time dateTime={document.created_at}>{financeDate(document.created_at)}</time></div></div></div>
      <div><span className={styles.caption}>أحدث إجراء</span>{latest ? <div className={styles.latestAction}><span className={styles.actionBadge}>{latest.action}</span><div><strong>{latest.actor}</strong><time dateTime={latest.created_at}>{financeDate(latest.created_at)}</time></div></div> : <p className={styles.hint}>لا توجد نشاطات مسجلة</p>}</div>
      <div><span className={styles.caption}>مسؤول مبيعات</span><div className={styles.person}><span className={styles.personAvatar} aria-hidden="true"><UserRound size={18} /></span><span>غير محدد</span></div></div>
    </div>
    <div className={`${styles.tableWrap} ${styles.itemTable}`}><table><caption className={styles.visuallyHidden}>بنود الفاتورة</caption><thead><tr><th scope="col">البند</th><th scope="col">الوصف</th><th scope="col">سعر الوحدة</th><th scope="col">الكمية</th><th scope="col">الضريبة الأولى</th><th scope="col">المجموع</th></tr></thead><tbody>{rows.map(line => {
      const product = snapshot.products.find(item => item.id === line.productId);
      return <tr key={line.key}><td><span className={styles.productName}>{product?.imageUrl ? <Image src={product.imageUrl} alt="" width={32} height={32} unoptimized /> : <Package size={22} aria-hidden="true" />}<span>{line.name}</span></span></td><td className={styles.description}>{line.description || "—"}</td><td><Numeric value={line.price} /></td><td><Numeric value={line.quantity} /></td><td>{line.tax > 0 ? <><span>القيمة المضافة</span><small><Numeric value={line.tax} money /></small></> : "لا توجد ضريبة"}</td><td><Numeric value={line.net} /></td></tr>;
    })}</tbody></table></div>
    <div className={styles.financialSummary}><table aria-label="إجماليات الفاتورة"><tbody>
      {document.discount > .009 && <><tr><th scope="row">المجموع قبل الخصم{document.tax_inclusive ? " شامل الضريبة" : ""}</th><td><Numeric value={document.subtotal} money /></td></tr><tr><th scope="row">الخصم</th><td><Numeric value={-document.discount} money /></td></tr></>}
      <tr><th scope="row">الصافي قبل الضريبة</th><td><Numeric value={Math.round((document.total - document.tax) * 100) / 100} money /></td></tr><tr><th scope="row">القيمة المضافة{document.vat_rate != null ? ` (${document.vat_rate}٪)` : ""}</th><td><Numeric value={document.tax} money /></td></tr><tr className={styles.totalRow}><th scope="row">الإجمالي</th><td><Numeric value={document.total} money /></td></tr>{returned > .009 && <tr><th scope="row">المرتجعات</th><td><Numeric value={-returned} money /></td></tr>}<tr><th scope="row">مدفوعة</th><td><Numeric value={-paid} money /></td></tr><tr><th scope="row">المبلغ المستحق</th><td><Numeric value={document.outstanding} money /></td></tr>
    </tbody></table><h4>طرق الدفع</h4>{[...methods].some(([, amount]) => Math.abs(amount) >= .01) ? <table aria-label="طرق الدفع"><tbody>{[...methods].filter(([, amount]) => Math.abs(amount) >= .01).map(([accountId, amount]) => { const account = snapshot.accounts.find(item => item.id === accountId); return <tr key={accountId}><th scope="row">{account ? kindNames[account.kind] ?? account.name : "حساب غير محدد"}{account && <small>{account.name}</small>}</th><td><Numeric value={amount} money /></td></tr>; })}</tbody></table> : <p className={styles.noPayments}>لا توجد دفعات محصلة</p>}</div>
    <section className={styles.shippingSection}><h4>بيانات الشحن</h4><dl><div><dt>المستودع</dt><dd>{detail.warehouse?.name ?? "غير محدد"}</dd></div><div><dt>عنوان الشحن</dt><dd>{issued?.shipping?.address || "غير محدد"}</dd></div><div><dt>حالة التسليم</dt><dd>{delivery?.confirmed ? "مسلّم" : "لم يؤكد التسليم"}</dd></div><div><dt>تاريخ التوريد</dt><dd>{issued?.supplyDate || "غير محدد"}</dd></div></dl></section>
    {(issued?.note || document.note) && <section className={styles.invoiceNotes}><h4>ملاحظات</h4><p className={styles.note}>{issued?.note || document.note}</p></section>}
  </div>;
}
