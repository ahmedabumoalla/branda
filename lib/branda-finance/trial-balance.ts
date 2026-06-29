export type TrialBalanceAmount = number;

export type TrialBalanceRow = {
  accountNumber: string;
  accountName: string;
  mainCategory: string;
  subCategory: string;
  revaluedBalances: TrialBalanceAmount;
  openingDebit: TrialBalanceAmount;
  openingCredit: TrialBalanceAmount;
  movementDebit: TrialBalanceAmount;
  movementCredit: TrialBalanceAmount;
  closingDebit: TrialBalanceAmount;
  closingCredit: TrialBalanceAmount;
};

export type TrialBalanceOption = {
  id: string;
  label: string;
};

export type TrialBalanceColumnId = keyof TrialBalanceRow;

export type TrialBalanceColumnGroup = "opening" | "movement" | "closing" | "valuation";

export type TrialBalanceColumn = {
  id: TrialBalanceColumnId;
  label: string;
  group?: TrialBalanceColumnGroup;
  defaultVisible: boolean;
  defaultOrder: number;
  align: "start" | "end" | "center";
  valueKey: TrialBalanceColumnId;
};

export type TrialBalanceColumnState = {
  id: TrialBalanceColumnId;
  visible: boolean;
};

export const trialBalanceDateRanges: TrialBalanceOption[] = [
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

export const trialBalanceFilters: TrialBalanceOption[] = [
  { id: "branch", label: "الفرع" },
  { id: "income-statement-balances", label: "عرض أرصدة حسابات قائمة الدخل" },
  { id: "zero-balance-accounts", label: "عرض الحسابات برصيد صفر" },
];

export const trialBalanceColumns: TrialBalanceColumn[] = [
  {
    id: "accountNumber",
    label: "رقم الحساب",
    defaultVisible: true,
    defaultOrder: 10,
    align: "start",
    valueKey: "accountNumber",
  },
  {
    id: "accountName",
    label: "اسم الحساب",
    defaultVisible: true,
    defaultOrder: 20,
    align: "start",
    valueKey: "accountName",
  },
  {
    id: "mainCategory",
    label: "التصنيف الرئيسي",
    defaultVisible: true,
    defaultOrder: 30,
    align: "start",
    valueKey: "mainCategory",
  },
  {
    id: "subCategory",
    label: "التصنيف الفرعي",
    defaultVisible: true,
    defaultOrder: 40,
    align: "start",
    valueKey: "subCategory",
  },
  {
    id: "revaluedBalances",
    label: "الأرصدة المعاد تقييمها",
    group: "valuation",
    defaultVisible: false,
    defaultOrder: 50,
    align: "end",
    valueKey: "revaluedBalances",
  },
  {
    id: "openingDebit",
    label: "الرصيد الافتتاحي مدين",
    group: "opening",
    defaultVisible: true,
    defaultOrder: 60,
    align: "end",
    valueKey: "openingDebit",
  },
  {
    id: "openingCredit",
    label: "الرصيد الافتتاحي دائن",
    group: "opening",
    defaultVisible: true,
    defaultOrder: 70,
    align: "end",
    valueKey: "openingCredit",
  },
  {
    id: "movementDebit",
    label: "الحركات مدين",
    group: "movement",
    defaultVisible: true,
    defaultOrder: 80,
    align: "end",
    valueKey: "movementDebit",
  },
  {
    id: "movementCredit",
    label: "الحركات دائن",
    group: "movement",
    defaultVisible: true,
    defaultOrder: 90,
    align: "end",
    valueKey: "movementCredit",
  },
  {
    id: "closingDebit",
    label: "الرصيد الختامي مدين",
    group: "closing",
    defaultVisible: true,
    defaultOrder: 100,
    align: "end",
    valueKey: "closingDebit",
  },
  {
    id: "closingCredit",
    label: "الرصيد الختامي دائن",
    group: "closing",
    defaultVisible: true,
    defaultOrder: 110,
    align: "end",
    valueKey: "closingCredit",
  },
];

export const trialBalanceExportOptions: TrialBalanceOption[] = [
  { id: "pdf", label: "إلى PDF" },
  { id: "excel", label: "تصدير إلى Excel" },
  { id: "pdf-en", label: "إلى PDF في الإنجليزي" },
  { id: "excel-en", label: "إلى Excel في الإنجليزي" },
];

export const defaultTrialBalanceColumnState: TrialBalanceColumnState[] = trialBalanceColumns
  .slice()
  .sort((a, b) => a.defaultOrder - b.defaultOrder)
  .map((column) => ({
    id: column.id,
    visible: column.defaultVisible,
  }));

export const trialBalanceRows: TrialBalanceRow[] = [
  {
    accountNumber: "1001",
    accountName: "النقدية في الصندوق",
    mainCategory: "الأصول",
    subCategory: "الأصول المتداولة",
    revaluedBalances: 0,
    openingDebit: 12500,
    openingCredit: 0,
    movementDebit: 32000,
    movementCredit: 28100,
    closingDebit: 16400,
    closingCredit: 0,
  },
  {
    accountNumber: "1010",
    accountName: "الحساب البنكي",
    mainCategory: "الأصول",
    subCategory: "النقد وما في حكمه",
    revaluedBalances: 0,
    openingDebit: 85500,
    openingCredit: 0,
    movementDebit: 123000,
    movementCredit: 96500,
    closingDebit: 112000,
    closingCredit: 0,
  },
  {
    accountNumber: "1200",
    accountName: "العملاء",
    mainCategory: "الأصول",
    subCategory: "الذمم المدينة",
    revaluedBalances: 0,
    openingDebit: 46200,
    openingCredit: 0,
    movementDebit: 78000,
    movementCredit: 69500,
    closingDebit: 54700,
    closingCredit: 0,
  },
  {
    accountNumber: "1400",
    accountName: "المخزون",
    mainCategory: "الأصول",
    subCategory: "مخزون البضاعة",
    revaluedBalances: 0,
    openingDebit: 33100,
    openingCredit: 0,
    movementDebit: 52000,
    movementCredit: 48600,
    closingDebit: 36500,
    closingCredit: 0,
  },
  {
    accountNumber: "2000",
    accountName: "الموردون",
    mainCategory: "الالتزامات",
    subCategory: "الذمم الدائنة",
    revaluedBalances: 0,
    openingDebit: 0,
    openingCredit: 38400,
    movementDebit: 41000,
    movementCredit: 56600,
    closingDebit: 0,
    closingCredit: 54000,
  },
  {
    accountNumber: "3000",
    accountName: "رأس المال",
    mainCategory: "حقوق الملكية",
    subCategory: "رأس المال المدفوع",
    revaluedBalances: 0,
    openingDebit: 0,
    openingCredit: 138900,
    movementDebit: 0,
    movementCredit: 0,
    closingDebit: 0,
    closingCredit: 138900,
  },
  {
    accountNumber: "4000",
    accountName: "المبيعات",
    mainCategory: "الإيرادات",
    subCategory: "إيرادات النشاط",
    revaluedBalances: 0,
    openingDebit: 0,
    openingCredit: 0,
    movementDebit: 0,
    movementCredit: 200700,
    closingDebit: 0,
    closingCredit: 200700,
  },
  {
    accountNumber: "5000",
    accountName: "تكلفة المبيعات",
    mainCategory: "تكلفة الإيرادات",
    subCategory: "تكلفة المنتجات",
    revaluedBalances: 0,
    openingDebit: 0,
    openingCredit: 0,
    movementDebit: 104000,
    movementCredit: 0,
    closingDebit: 104000,
    closingCredit: 0,
  },
  {
    accountNumber: "6000",
    accountName: "المصروفات التشغيلية",
    mainCategory: "المصروفات",
    subCategory: "مصروفات عامة وإدارية",
    revaluedBalances: 0,
    openingDebit: 0,
    openingCredit: 0,
    movementDebit: 41500,
    movementCredit: 0,
    closingDebit: 41500,
    closingCredit: 0,
  },
  {
    accountNumber: "6100",
    accountName: "الرواتب والأجور",
    mainCategory: "المصروفات",
    subCategory: "تكلفة الموظفين",
    revaluedBalances: 0,
    openingDebit: 0,
    openingCredit: 0,
    movementDebit: 28500,
    movementCredit: 0,
    closingDebit: 28500,
    closingCredit: 0,
  },
];

export function getTrialBalanceTotals(rows: TrialBalanceRow[] = trialBalanceRows): TrialBalanceRow {
  return rows.reduce<TrialBalanceRow>(
    (totals, row) => ({
      ...totals,
      revaluedBalances: totals.revaluedBalances + row.revaluedBalances,
      openingDebit: totals.openingDebit + row.openingDebit,
      openingCredit: totals.openingCredit + row.openingCredit,
      movementDebit: totals.movementDebit + row.movementDebit,
      movementCredit: totals.movementCredit + row.movementCredit,
      closingDebit: totals.closingDebit + row.closingDebit,
      closingCredit: totals.closingCredit + row.closingCredit,
    }),
    {
      accountNumber: "",
      accountName: "إجمالي",
      mainCategory: "",
      subCategory: "",
      revaluedBalances: 0,
      openingDebit: 0,
      openingCredit: 0,
      movementDebit: 0,
      movementCredit: 0,
      closingDebit: 0,
      closingCredit: 0,
    },
  );
}

export function getTrialBalanceColumnsByState(columnState: TrialBalanceColumnState[]) {
  const byId = new Map(trialBalanceColumns.map((column) => [column.id, column]));
  return columnState
    .map((state) => ({
      state,
      column: byId.get(state.id),
    }))
    .filter((entry): entry is { state: TrialBalanceColumnState; column: TrialBalanceColumn } =>
      Boolean(entry.column),
    );
}
