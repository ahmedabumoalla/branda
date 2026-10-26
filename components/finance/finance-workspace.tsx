"use client";
import { FinanceShiftMonitor } from "./finance-shift-monitor";
import { FinancePrinterSettings } from "./finance-printer-settings";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { financeSections as sections, resolveFinanceSection, type FinanceSection as Section } from "./finance-navigation";
import { useState } from "react";
import { ArrowDownToLine, ArrowLeft, CircleDollarSign, Plus, RefreshCw, Search, Wallet } from "lucide-react";
import { Modal } from "@/components/dashboard/ui/modal";
import type { FinanceDocument, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { FinanceSaleForm } from "./finance-sale-form";
import { FinanceCustomerForm } from "./finance-customer-form";
import { FinanceOperationForm, type FinanceForm } from "./finance-operation-form";
import { documentKindNames, downloadFinanceCsv, Empty, financeDate, financeDocumentStatus, Metric, Numeric, Panel } from "./finance-ui";
import { FinanceRefundRequests } from "./finance-refund-requests";
import { FinanceReceiptDialog } from "./finance-receipt-dialog";
import { FinanceTreasury } from "./finance-treasury";
import { FinanceTrialBalance } from "./finance-trial-balance";
import { useFinance } from "./use-finance";
import { FinanceCashDifferences } from "./finance-cash-differences";
import { FinanceCashHandovers } from "./finance-cash-handovers";
import styles from "./finance.module.css";

const salesCashierLabel = "إضافة كاشير مبيعات";
const staffLabel = "إدارة موظف مالي";

export function FinanceWorkspace({ initialSnapshot, slug }: { initialSnapshot: FinanceSnapshot; slug?: string }) {
  const state = useFinance(initialSnapshot, slug);
  const { snapshot: data, pending, error, message, stale } = state;
  const params = useSearchParams();
  const [localSection, setSection] = useState<Section>("overview");
  const section = slug ? localSection : params.get("section") === "settings" ? "settings" : resolveFinanceSection(params.get("section"), data.canAdminister);
  const [query, setQuery] = useState("");
  const [partyKind, setPartyKind] = useState("all");
  const [warehouseId, setWarehouseId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [form, setForm] = useState<FinanceForm | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const receipt = data.documents.find((item) => item.id === receiptId);
  const disabled = pending || stale;
  const posHref = `/finance/${encodeURIComponent(slug ?? data.cafe.slug)}/pos`;
  const match = (value: string) => value.toLocaleLowerCase("ar").includes(query.trim().toLocaleLowerCase("ar"));
  const dateMatch = (value: string) => { const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); return (!from || date >= from) && (!to || date <= to); };
  const accountName = (id: string | null) => data.accounts.find((account) => account.id === id)?.name ?? "—";
  const partyName = (id: string | null) => data.parties.find((party) => party.id === id)?.name ?? "عميل نقدي";
  const staffName = (id: string) => data.staff.find((staff) => staff.user_id === id)?.name ?? (id === data.userId ? "أنت" : "صاحب العلامة");
  const itemName = (id: string) => data.items.find((item) => item.id === id)?.name ?? "صنف";
  const warehouseName = (id: string) => data.warehouses.find((warehouse) => warehouse.id === id)?.name ?? "مستودع";
  const open = (next: FinanceForm) => { state.clearFeedback(); setForm(next); };
  const addButton = (next: FinanceForm, label = next.title) => <button className={styles.primary} disabled={disabled} onClick={() => open(next)}><Plus size={16} aria-hidden="true" />{label}</button>;
  const exportButton = (name: string, rows: (string | number)[][]) => <button type="button" className={styles.secondary} onClick={() => downloadFinanceCsv(name, rows)}><ArrowDownToLine size={16} aria-hidden="true" />تصدير الجدول</button>;
  const searches = <div className={styles.toolbar}><label className={styles.searchBox}><Search size={18} aria-hidden="true" /><input className={styles.search} aria-label="البحث في السجل" placeholder="ابحث بالاسم أو رقم المستند" value={query} onChange={(event) => setQuery(event.target.value)} /></label>{["sales", "purchases", "reports", "shifts"].includes(section) && <div className={styles.actions}><label className={styles.field}>من<input aria-label="من تاريخ" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className={styles.field}>إلى<input aria-label="إلى تاريخ" type="date" min={from || undefined} value={to} onChange={(event) => setTo(event.target.value)} /></label></div>}</div>;
  function documentsTable(documents: FinanceDocument[], title: string) {
    const filtered = documents.filter((document) => dateMatch(document.created_at) && match(`${document.number} ${partyName(document.party_id)} ${document.note}`));
    return <Panel title={title} action={exportButton("branda-finance-documents.csv", [["الرقم", "النوع", "التاريخ", "الطرف", "الإجمالي", "المدفوع", "المتبقي"], ...filtered.map((document) => [document.number, documentKindNames[document.kind] ?? document.kind, financeDate(document.created_at), partyName(document.party_id), document.total, document.total - (document.refunded_total ?? 0) - document.outstanding, document.refunded ? 0 : document.outstanding])])}>
      {!filtered.length ? <Empty title="لا توجد مستندات مطابقة">ستظهر العمليات المحفوظة هنا مع المبالغ وحالة السداد</Empty> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>المستند</th><th>التاريخ</th><th>الطرف</th><th>الإجمالي</th><th>المتبقي</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{filtered.map((document) => <tr key={document.id}><td><strong>#{document.number}</strong><br /><small>{documentKindNames[document.kind] ?? document.kind}</small></td><td>{financeDate(document.created_at)}</td><td>{partyName(document.party_id)}</td><td><Numeric value={document.total} money /></td><td><Numeric value={document.refunded ? 0 : document.outstanding} money /></td><td><span className={styles.badge}>{financeDocumentStatus(document)}</span></td><td><div className={styles.actions}><button className={styles.secondary} onClick={() => setReceiptId(document.id)}>التفاصيل</button>{!document.refunded && document.outstanding > .009 && ["sale", "purchase"].includes(document.kind) && <button className={styles.secondary} disabled={disabled} onClick={() => open({ operation: "settlement", title: `تسوية مستند #${document.number}`, values: { documentId: document.id, remaining: document.outstanding } })}>تسجيل دفعة</button>}{!document.refunded && ["sale", "purchase"].includes(document.kind) && <button className={styles.danger} disabled={disabled} onClick={() => open({ operation: "refund", title: `إرجاع مستند #${document.number}`, values: { documentId: document.id } })}>مرتجع</button>}</div></td></tr>)}</tbody></table></div>}
    </Panel>;
  }
  const cash = data.accounts.filter((account) => account.kind === "cash").reduce((sum, account) => sum + account.balance, 0);
  const bank = data.accounts.filter((account) => account.kind === "bank").reduce((sum, account) => sum + account.balance, 0);
  const pos = data.accounts.filter((account) => account.kind === "pos").reduce((sum, account) => sum + account.balance, 0);
  const employee = data.accounts.filter((account) => account.kind === "employee").reduce((sum, account) => sum + account.balance, 0);
  const lowStock = data.items.filter((item) => item.active && item.quantity <= item.min_quantity);
  const filteredParties = data.parties.filter((party) => (partyKind === "all" || party.kind === partyKind) && match(`${party.name} ${party.phone} ${party.email}`));
  const inventory = data.items.filter((item) => match(`${item.name} ${item.sku}`)).map((item) => ({ ...item, shownQuantity: warehouseId ? data.stock.find((stock) => stock.item_id === item.id && stock.warehouse_id === warehouseId)?.quantity ?? 0 : item.quantity }));
  const journals = data.journal.filter((line) => dateMatch(line.created_at) && match(`${accountName(line.account_id)} ${line.memo}`));

  return <div className={styles.page} dir="rtl">
    <header className={styles.header}><div><p className={styles.eyebrow}><CircleDollarSign size={16} aria-hidden="true" />برندة المالية · {data.cafe.name}</p><h1 className={styles.title}>حركة علامتك بالأرقام</h1><p className={styles.subtitle}>المبيعات والمخزون والخزينة في دفتر واحد</p></div><div className={styles.actions}><button className={styles.secondary} onClick={state.refresh} disabled={pending}><RefreshCw size={16} aria-hidden="true" />{pending ? "جار التحديث" : "تحديث الأرصدة"}</button><button type="button" className={styles.secondary} disabled={disabled || !data.canAdminister} aria-describedby={!data.canAdminister ? "cashier-owner-hint" : undefined} onClick={() => { if (data.canAdminister) open({ operation: "sales_cashier_create", title: "إضافة كاشير مبيعات" }); }}><Plus size={16} aria-hidden="true" />إضافة كاشير مبيعات</button><Link className={styles.primary} href={posHref}>فتح الكاشير المالي<ArrowLeft size={17} aria-hidden="true" /></Link></div></header>
    {!data.canAdminister && <p id="cashier-owner-hint" className={styles.muted}>إضافة الكاشيرات متاحة لمالك العلامة</p>}
    <Link href="/cashier/login?type=sales" className={styles.secondary}>صفحة دخول كاشير المبيعات<ArrowLeft size={16} aria-hidden="true" /></Link>
    {slug && <nav className={styles.navigation} aria-label="أقسام المالية">{sections.filter((item) => item.id !== "settings" || data.canAdminister).map(({ id, label, icon: Icon }) => <button type="button" aria-current={section === id ? "page" : undefined} key={id} className={`${styles.navItem} ${section === id ? styles.navActive : ""}`} onClick={() => { setSection(id); setQuery(""); }}><Icon size={16} aria-hidden="true" />{label}</button>)}</nav>}
    {message && <div className={styles.success} role="status">{message}</div>}
    {error && !form && <div className={styles.error} role="alert">{error}</div>}
    {stale && <div className={styles.notice}>البيانات المعروضة قديمة مؤقتًا حدّث الأرصدة لاستئناف العمليات</div>}
    {Object.values(state.historyMore).some(Boolean) && <div className={styles.notice}>الجداول تعرض أحدث العمليات استخدم تحميل المزيد لاستعراض الأقدم الأرصدة وميزان المراجعة يشملان كامل السجل</div>}
    <div className={styles.workspace}>
      {section === "overview" && <>
        <div className={styles.metrics}>
          <Metric label="إجمالي المبيعات شامل الضريبة" value={data.summary.salesGross ?? data.summary.sales} note="بعد المرتجعات المعتمدة والخصومات" />
          <Metric label="ضريبة المبيعات" value={data.summary.salesTax ?? 0} note="الضريبة المدرجة في إجمالي المبيعات" />
          <Metric label="صافي المبيعات" value={data.summary.sales} note="بعد استبعاد الضريبة" />
          <Metric label="هامش الربح التشغيلي" value={data.summary.sales > 0 ? Math.round(data.summary.profit / data.summary.sales * 10000) / 100 : 0} percent note={data.summary.sales > 0 ? "الربح التشغيلي ÷ صافي المبيعات" : "لا توجد مبيعات لحساب النسبة"} />
          <Metric label="الربح التشغيلي" value={data.summary.profit} note="بعد التكلفة والمصروفات المسجلة" />
          <Metric label="مستحقات الموردين" value={data.summary.payables} />
          <Metric label="مبالغ مستحقة على العملاء" value={data.summary.receivables} note="مبيعات آجلة لم تُحصّل بعد" />
        </div>
        <div className={styles.twoColumns}><Panel title="أين أرصدة العلامة؟" action={<Wallet size={19} aria-hidden="true" />}><div className={styles.panelBody}>{[["النقدية", cash], ["البنوك", bank], ["نقاط البيع", pos], ["عهد الموظفين", employee], ["قيمة المخزون", data.summary.inventoryValue]].map(([label, value]) => <div key={String(label)} className={styles.balanceLine}><span>{label}</span><strong><Numeric value={Number(value)} money /></strong></div>)}</div></Panel><Panel title="متابعة التشغيل"><div className={styles.panelBody}><div className={styles.balanceLine}><span>ورديات مفتوحة</span><strong>{data.shifts.filter((shift) => shift.status === "open").length}</strong></div><div className={styles.balanceLine}><span>ورديات تنتظر الاستلام</span><strong>{data.shifts.filter((shift) => shift.status === "handover").length}</strong></div><div className={styles.balanceLine}><span>أصناف عند حد التنبيه</span><strong className={lowStock.length ? styles.negative : styles.positive}>{lowStock.length}</strong></div>{lowStock.slice(0, 4).map((item) => <div key={item.id} className={styles.balanceLine}><span>{item.name}</span><span><Numeric value={item.quantity} /> {item.unit}</span></div>)}</div></Panel></div>
        {documentsTable(data.documents.filter((document) => document.kind === "sale").slice(0, 6), "آخر المبيعات")}
      </>}
      {section === "sales" && <><div className={styles.toolbar}><div><h2 className={styles.panelTitle}>فواتير المبيعات</h2><p className={styles.muted}>أضف فاتورة وتابع تحصيلها من هنا</p></div>{data.canManage && addButton({ operation: "sale", title: "إضافة فاتورة مبيعات" }, "إضافة فاتورة")}</div>{searches}{documentsTable(data.documents.filter((document) => ["sale", "refund"].includes(document.kind)), "سجل المبيعات والمرتجعات")}</>}
      {section === "purchases" && <><div className={styles.toolbar}><div><h2 className={styles.panelTitle}>مشتريات العلامة</h2><p className={styles.muted}>استلام الأصناف وتكلفتها وسداد المورد في عملية واحدة</p></div>{addButton({ operation: "purchase", title: "تسجيل مشتريات" })}</div>{searches}{documentsTable(data.documents.filter((document) => document.kind === "purchase"), "فواتير الموردين")}</>}
      {section === "parties" && <><div className={styles.toolbar}><div className={styles.actions}><button className={styles.category} aria-pressed={partyKind === "all"} onClick={() => setPartyKind("all")}>الكل</button>{[["customer", "العملاء"], ["supplier", "الموردون"], ["employee", "الموظفون"]].map(([kind, name]) => <button className={styles.category} key={kind} aria-pressed={partyKind === kind} onClick={() => setPartyKind(kind)}>{name}</button>)}</div>{addButton({ operation: "party", title: "إضافة عميل أو مورد أو موظف", values: { kind: partyKind === "all" ? "customer" : partyKind } }, "إضافة طرف")}</div>{searches}<Panel title="العملاء والموردون والموظفون">{!filteredParties.length ? <Empty title="ابدأ بإضافة أطراف التعامل">أضف عملاءك ومورديك لربط المبيعات والمشتريات بحساباتهم</Empty> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>الاسم</th><th>النوع</th><th>التواصل</th><th>الرصيد</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{filteredParties.map((party) => <tr key={party.id}><td><strong>{party.name}</strong></td><td>{party.kind === "customer" ? "عميل" : party.kind === "supplier" ? "مورد" : "موظف"}</td><td>{party.phone || party.email || "—"}</td><td><Numeric value={party.balance} money /></td><td>{party.active ? "نشط" : "موقوف"}</td><td><button className={styles.secondary} disabled={disabled} onClick={() => open({ operation: "party", title: "تعديل بيانات الطرف", values: { ...party, taxNumber: party.tax_number } })}>تعديل</button></td></tr>)}</tbody></table></div>}</Panel></>}
      {section === "inventory" && <>
        <div className={styles.toolbar}><div className={styles.actions}>{addButton({ operation: "item", title: "إضافة صنف مخزني" })}{addButton({ operation: "warehouse", title: "إضافة مستودع" })}<button disabled={disabled} className={styles.secondary} onClick={() => open({ operation: "stock_adjust", title: "تسوية كمية أو جرد" })}>جرد وتسوية كمية</button><button disabled={disabled} className={styles.secondary} onClick={() => open({ operation: "stock_transfer", title: "تحويل بين المستودعات" })}>تحويل مخزون</button></div><Link href="/dashboard/menu" className={styles.secondary}>صور وأسعار المنيو</Link></div>
        {searches}<label className={styles.field}>المستودع<select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}><option value="">جميع المستودعات</option>{data.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
        <Panel title="الأصناف والكميات" action={exportButton("branda-finance-stock.csv", [["الصنف", "الرمز", "الكمية", "الوحدة", "متوسط التكلفة"], ...inventory.map((item) => [item.name, item.sku, item.shownQuantity, item.unit, item.average_cost])])}>{!inventory.length ? <Empty title="أضف أول صنف مخزني">اربطه بمنتج المنيو ليخصم البيع كميته تلقائيًا ثم سجّل الرصيد أو المشتريات</Empty> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>الصنف</th><th>الرمز</th><th>الكمية</th><th>متوسط التكلفة</th><th>حد التنبيه</th><th>ربط المنيو</th><th>الإجراء</th></tr></thead><tbody>{inventory.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.sku}</td><td className={item.shownQuantity <= item.min_quantity ? styles.negative : undefined}><Numeric value={item.shownQuantity} /> {item.unit}</td><td><Numeric value={item.average_cost} money /></td><td><Numeric value={item.min_quantity} /></td><td>{data.products.find((product) => product.id === item.menu_product_id)?.name ?? "صنف مستقل"}</td><td><button disabled={disabled} className={styles.secondary} onClick={() => open({ operation: "item", title: "تعديل الصنف", values: { ...item, menuProductId: item.menu_product_id ?? "", minQuantity: item.min_quantity } })}>تعديل</button></td></tr>)}</tbody></table></div>}</Panel>
        <Panel title="حركات المخزون">{!data.movements.length ? <Empty title="لا توجد حركة مخزون بعد" /> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>التاريخ</th><th>الصنف</th><th>المستودع</th><th>حركة الكمية</th><th>تكلفة الوحدة</th></tr></thead><tbody>{data.movements.filter((move) => (!warehouseId || move.warehouse_id === warehouseId) && match(itemName(move.item_id))).map((move) => <tr key={move.id}><td>{financeDate(move.created_at)}</td><td>{itemName(move.item_id)}</td><td>{warehouseName(move.warehouse_id)}</td><td className={move.quantity < 0 ? styles.negative : styles.positive}><Numeric value={move.quantity} /></td><td><Numeric value={move.unit_cost} money /></td></tr>)}</tbody></table></div>}</Panel>
      </>}
      {section === "treasury" && <FinanceTreasury snapshot={data} slug={slug} onRefresh={state.refresh} />}
      {section === "printer" && <FinancePrinterSettings brandId={data.cafe.id} />}
      {section === "shifts" && <>
        <FinanceCashDifferences slug={slug} onSettled={() => { void state.refresh(); }} />
        <FinanceCashHandovers snapshot={data} slug={slug} onReceived={() => { void state.refresh(); }} />
        <div className={styles.toolbar}><p className={styles.muted}>بداية الوردية وإقفالها وتسليمها من الكاشير المالي</p><Link href={posHref} className={styles.primary}>إدارة ورديتي<ArrowLeft size={16} /></Link></div>
        {data.canManage && <FinanceShiftMonitor snapshot={data} slug={slug} onChanged={() => { void state.refresh(); }} />}
      </>}
      {section === "reports" && <>
        <div className={styles.metrics}><Metric label="صافي المبيعات" value={data.summary.sales} /><Metric label="المشتريات" value={data.summary.purchases} /><Metric label="المصروفات" value={data.summary.expenses} /><Metric label="الربح التشغيلي" value={data.summary.profit} /></div>
        <p className={styles.muted}>ملخص الأرصدة حتى آخر تحديث مرشحات التاريخ أدناه تخص سجل القيود المعروض</p>
        <Panel title="ميزان المراجعة" action={exportButton("branda-trial-balance.csv", [["الحساب", "مدين", "دائن", "الرصيد"], ...data.trialBalance.map((line) => [line.name, line.debit, line.credit, line.balance])])}><FinanceTrialBalance lines={data.trialBalance} onSelectAccount={setSelectedAccountId} /></Panel>
        {searches}<Panel title="دفتر اليومية" action={<div className={styles.actions}>{addButton({ operation: "journal", title: "ترحيل قيد يدوي متوازن" })}{exportButton("branda-journal.csv", [["التاريخ", "الحساب", "البيان", "مدين", "دائن"], ...journals.map((line) => [financeDate(line.created_at), accountName(line.account_id), line.memo, line.debit, line.credit])])}</div>}>{!journals.length ? <Empty title="لا توجد قيود مطابقة" /> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>التاريخ</th><th>الحساب</th><th>البيان</th><th>مدين</th><th>دائن</th></tr></thead><tbody>{journals.map((line) => <tr key={line.id}><td>{financeDate(line.created_at)}</td><td>{accountName(line.account_id)}</td><td>{line.memo || "—"}</td><td><Numeric value={line.debit} money /></td><td><Numeric value={line.credit} money /></td></tr>)}</tbody></table></div>}</Panel>
      </>}
      {section === "settings" && !data.canAdminister && <Panel title="الإعدادات وفريق المالية"><Empty title="إضافة الكاشير متاحة لمالك العلامة">ادخل بحساب مالك العلامة ثم اختر إضافة كاشير مبيعات</Empty></Panel>}
      {section === "settings" && data.canAdminister && <>
        <div className={styles.twoColumns}><Panel title="السياسة المحاسبية" action={<button className={styles.secondary} disabled={disabled} onClick={() => open({ operation: "settings", title: "إعدادات المالية", values: { vatRate: data.settings.vat_rate } })}>تعديل الإعدادات</button>}><div className={styles.panelBody}><div className={styles.balanceLine}><span>العملة</span><strong>الريال السعودي</strong></div><div className={styles.balanceLine}><span>ضريبة القيمة المضافة</span><strong>{data.settings.vat_rate}%</strong></div><div className={styles.balanceLine}><span>الأسعار</span><strong>{data.settings.tax_inclusive ? "شاملة الضريبة" : "غير شاملة الضريبة"}</strong></div><div className={styles.balanceLine}><span>آخر فترة مقفلة</span><strong>{data.settings.closed_through ?? "لا توجد فترة مقفلة"}</strong></div></div></Panel><Panel title="دخول فريق المالية"><div className={styles.panelBody}><p className={styles.muted}>امنح المدير المالي صلاحية إدارة العمليات والكاشير صلاحية البيع والوردية</p><Link href={`/finance/${data.cafe.slug}/login`} className={styles.secondary}>فتح صفحة دخول المالية<ArrowLeft size={16} /></Link></div></Panel></div>
        <Panel title="فريق المالية" action={<div className={styles.actions}>{addButton({ operation: "sales_cashier_create", title: salesCashierLabel })}{addButton({ operation: "staff", title: staffLabel })}</div>}>{!data.staff.length ? <Empty title="لم تضف موظفين ماليين">يمكنك تشغيل الكاشير بصفتك صاحب العلامة أو إضافة حسابات خاصة بفريقك</Empty> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>الموظف</th><th>الدور</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{data.staff.map((staff) => <tr key={staff.user_id}><td>{staff.name}</td><td>{staff.role === "manager" ? "مدير مالي" : "كاشير مالي"}</td><td>{staff.active ? "نشط" : "موقوف"}</td><td>{staff.user_id !== data.userId && <button className={styles.secondary} disabled={disabled} onClick={() => open({ operation: "staff", title: "تعديل الموظف المالي", values: { userId: staff.user_id, name: staff.name, role: staff.role, active: staff.active } })}>تعديل الصلاحية</button>}</td></tr>)}</tbody></table></div>}</Panel>
      </>}
      {["sales", "purchases"].includes(section) && state.historyMore.documents && <button className={styles.secondary} disabled={pending} onClick={() => state.loadMore("documents")}>{pending ? "جار تحميل المستندات" : "تحميل مستندات أقدم"}</button>}
      {section === "reports" && state.historyMore.journal && <button className={styles.secondary} disabled={pending} onClick={() => state.loadMore("journal")}>{pending ? "جار تحميل القيود" : "تحميل قيود أقدم"}</button>}
      {section === "inventory" && state.historyMore.movements && <button className={styles.secondary} disabled={pending} onClick={() => state.loadMore("movements")}>{pending ? "جار تحميل الحركات" : "تحميل حركات مخزون أقدم"}</button>}
    </div>
    {(["overview", "sales"].includes(section)) && <FinanceRefundRequests snapshot={data} pending={disabled} error={error} onExecute={state.execute} onReceipt={setReceiptId} />}
    <Modal open={!!form} title={form?.title ?? "عملية مالية"} onClose={() => { if (!pending) setForm(null); }} panelClassName={["sale", "refund"].includes(form?.operation ?? "") ? styles.invoicePanel : "flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"}>{form?.operation === "sale" ? <FinanceSaleForm snapshot={data} pending={pending} stale={stale} error={error} onCancel={() => { if (!pending) setForm(null); }} onSubmit={async (operation, payload) => { const result = await state.execute(operation, payload); if (result && operation === "sale") { setForm(null); setQuery(""); setFrom(""); setTo(""); setReceiptId(result.id); } return !!result; }} /> : form?.operation === "party" && form.values?.kind === "customer" ? <FinanceCustomerForm values={form.values} pending={disabled} error={error} onCancel={() => { if (!pending) setForm(null); }} onSubmit={async (operation, payload) => !!(await state.execute(operation, payload))} onSaved={() => setForm(null)} /> : form && <FinanceOperationForm key={`${form.operation}:${String(form.values?.id ?? form.values?.documentId ?? "new")}`} form={form} snapshot={data} pending={pending} error={error} onCancel={() => setForm(null)} onSubmit={async (operation, payload) => { const result = await state.execute(operation, payload); if (result) { setForm(null); if (operation === "refund" && result.status !== "pending") setReceiptId(result.id); } return !!result; }} />}</Modal>
    {receipt && <FinanceReceiptDialog key={`${data.cafe.id}:${receipt.id}`} document={receipt} snapshot={data} onClose={() => setReceiptId(null)} />}
    {selectedAccountId && <FinanceTreasury key={selectedAccountId} snapshot={data} slug={slug} onRefresh={state.refresh} initialAccountId={selectedAccountId} detailOnly onCloseAccount={() => setSelectedAccountId(null)} />}
  </div>;
}
