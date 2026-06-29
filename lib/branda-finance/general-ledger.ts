export type GeneralLedgerAmount = number;

export type GeneralLedgerRow = {
  journalDocumentId: string;
  source: string;
  date: string;
  account: string;
  relatedAccounts: string;
  contact: string;
  employee: string;
  description: string;
  entryReference: string;
  entryNotes: string;
  currency: string;
  debit: GeneralLedgerAmount;
  credit: GeneralLedgerAmount;
  taxRate: string;
  accountType: string;
  costCenter: string;
  project: string;
  createdAt: string;
  updatedAt: string;
};

export type GeneralLedgerOption = {
  id: string;
  label: string;
};

export type GeneralLedgerEmptyAction = {
  id: string;
  title: string;
  description: string;
};

export type GeneralLedgerColumnId = keyof GeneralLedgerRow;

export type GeneralLedgerColumn = {
  id: GeneralLedgerColumnId;
  label: string;
  defaultVisible: boolean;
  defaultOrder: number;
  align: "start" | "end" | "center";
  valueKey: GeneralLedgerColumnId;
};

export type GeneralLedgerColumnState = {
  id: GeneralLedgerColumnId;
  visible: boolean;
};

export const generalLedgerDateRanges: GeneralLedgerOption[] = [
  { id: "last-3-months", label: "آخر 3 أشهر" },
  { id: "last-6-months", label: "آخر 6 أشهر" },
  { id: "last-12-months", label: "آخر 12 شهر" },
  { id: "current-month", label: "الشهر الحالي" },
  { id: "current-quarter", label: "الربع الحالي" },
  { id: "current-fiscal-year", label: "السنة المالية الحالية" },
  { id: "two-fiscal-years", label: "سنتان ماليتان" },
  { id: "three-fiscal-years", label: "3 سنوات مالية" },
  { id: "previous-month", label: "الشهر السابق" },
  { id: "previous-quarter", label: "الربع السابق" },
  { id: "previous-fiscal-year", label: "السنة المالية السابقة" },
  { id: "previous-two-fiscal-years", label: "السنتان الماليتان السابقتان" },
  { id: "custom-range", label: "نطاق زمني مخصص" },
];

export const generalLedgerFilters: GeneralLedgerOption[] = [
  { id: "account", label: "الحساب" },
  { id: "main-category", label: "التصنيف الرئيسي" },
  { id: "account-type", label: "نوع الحساب" },
  { id: "currency", label: "العملة" },
  { id: "tax-rate", label: "معدل ضريبي" },
  { id: "source", label: "المصدر" },
  { id: "contact", label: "جهة الاتصال" },
  { id: "employee", label: "موظف" },
  { id: "project", label: "المشروع" },
  { id: "branch", label: "الفرع" },
  { id: "cost-center", label: "مركز التكلفة" },
  { id: "product-service", label: "المنتج أو الخدمة" },
  { id: "status", label: "الحالة" },
  { id: "entry-id", label: "معرّف القيد" },
];

export const generalLedgerColumns: GeneralLedgerColumn[] = [
  {
    id: "journalDocumentId",
    label: "مستند هوية الدفتر اليومي",
    defaultVisible: true,
    defaultOrder: 10,
    align: "start",
    valueKey: "journalDocumentId",
  },
  {
    id: "source",
    label: "المصدر",
    defaultVisible: true,
    defaultOrder: 20,
    align: "start",
    valueKey: "source",
  },
  {
    id: "date",
    label: "التاريخ",
    defaultVisible: true,
    defaultOrder: 30,
    align: "center",
    valueKey: "date",
  },
  {
    id: "account",
    label: "الحساب",
    defaultVisible: true,
    defaultOrder: 40,
    align: "start",
    valueKey: "account",
  },
  {
    id: "relatedAccounts",
    label: "الحسابات المقابلة",
    defaultVisible: true,
    defaultOrder: 50,
    align: "start",
    valueKey: "relatedAccounts",
  },
  {
    id: "contact",
    label: "جهة الاتصال",
    defaultVisible: false,
    defaultOrder: 60,
    align: "start",
    valueKey: "contact",
  },
  {
    id: "employee",
    label: "الموظف",
    defaultVisible: false,
    defaultOrder: 70,
    align: "start",
    valueKey: "employee",
  },
  {
    id: "description",
    label: "الوصف",
    defaultVisible: true,
    defaultOrder: 80,
    align: "start",
    valueKey: "description",
  },
  {
    id: "entryReference",
    label: "مرجع القيد",
    defaultVisible: false,
    defaultOrder: 90,
    align: "start",
    valueKey: "entryReference",
  },
  {
    id: "entryNotes",
    label: "ملاحظات القيد",
    defaultVisible: false,
    defaultOrder: 100,
    align: "start",
    valueKey: "entryNotes",
  },
  {
    id: "currency",
    label: "العملة",
    defaultVisible: true,
    defaultOrder: 110,
    align: "center",
    valueKey: "currency",
  },
  {
    id: "debit",
    label: "مدين",
    defaultVisible: true,
    defaultOrder: 120,
    align: "end",
    valueKey: "debit",
  },
  {
    id: "credit",
    label: "دائن",
    defaultVisible: true,
    defaultOrder: 130,
    align: "end",
    valueKey: "credit",
  },
  {
    id: "taxRate",
    label: "المعدل الضريبي",
    defaultVisible: false,
    defaultOrder: 140,
    align: "center",
    valueKey: "taxRate",
  },
  {
    id: "accountType",
    label: "نوع الحساب",
    defaultVisible: false,
    defaultOrder: 150,
    align: "start",
    valueKey: "accountType",
  },
  {
    id: "costCenter",
    label: "مركز التكلفة",
    defaultVisible: true,
    defaultOrder: 160,
    align: "start",
    valueKey: "costCenter",
  },
  {
    id: "project",
    label: "المشروع",
    defaultVisible: true,
    defaultOrder: 170,
    align: "start",
    valueKey: "project",
  },
  {
    id: "createdAt",
    label: "تم إنشاؤها في",
    defaultVisible: false,
    defaultOrder: 180,
    align: "center",
    valueKey: "createdAt",
  },
  {
    id: "updatedAt",
    label: "تم التعديل",
    defaultVisible: false,
    defaultOrder: 190,
    align: "center",
    valueKey: "updatedAt",
  },
];

export const generalLedgerEmptyActions: GeneralLedgerEmptyAction[] = [
  {
    id: "sales-invoice",
    title: "أنشئ أو أرسل فاتورة بيع لعملائك",
    description: "أرسل فاتورة لعميلك ثم سجّل الدفع",
  },
  {
    id: "supplier-bill",
    title: "سجّل فاتورة من مورد",
    description: "سجّل فاتورة كمصروف من مورد، يتم دفعها لاحقًا",
  },
  {
    id: "payroll",
    title: "الرواتب",
    description: "قم بعملية صرف الرواتب",
  },
  {
    id: "expense",
    title: "سجّل مصروف",
    description: "المصروفات هي مشتريات تم دفعها حين الشراء",
  },
];

export const generalLedgerExportOptions: GeneralLedgerOption[] = [
  { id: "pdf", label: "إلى PDF" },
  { id: "excel", label: "تصدير إلى Excel" },
  { id: "pdf-en", label: "إلى PDF في الإنجليزية" },
  { id: "excel-en", label: "إلى Excel في الإنجليزية" },
];

export const defaultGeneralLedgerColumnState: GeneralLedgerColumnState[] = generalLedgerColumns
  .slice()
  .sort((a, b) => a.defaultOrder - b.defaultOrder)
  .map((column) => ({
    id: column.id,
    visible: column.defaultVisible,
  }));

export const generalLedgerRows: GeneralLedgerRow[] = [];

export function getGeneralLedgerColumnsByState(columnState: GeneralLedgerColumnState[]) {
  const byId = new Map(generalLedgerColumns.map((column) => [column.id, column]));
  return columnState
    .map((state) => ({
      state,
      column: byId.get(state.id),
    }))
    .filter(
      (entry): entry is { state: GeneralLedgerColumnState; column: GeneralLedgerColumn } =>
        Boolean(entry.column),
    );
}
