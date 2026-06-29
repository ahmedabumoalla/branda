export type StatementAccountView = "summary" | "details";

export type StatementAccountAmount = number;

export type StatementAccountRow = {
  currency: string;
  account: string;
  relatedAccount: string;
  date: string;
  serialNumber: string;
  source: string;
  movement: string;
  reference: string;
  costCenter: string;
  project: string;
  debit: StatementAccountAmount;
  credit: StatementAccountAmount;
  balance: StatementAccountAmount;
};

export type StatementAccountOption = {
  id: string;
  label: string;
};

export type StatementAccountColumnId = keyof StatementAccountRow;

export type StatementAccountColumn = {
  id: StatementAccountColumnId;
  label: string;
  defaultVisible: boolean;
  defaultOrder: number;
  align: "start" | "end" | "center";
  valueKey: StatementAccountColumnId;
};

export type StatementAccountColumnState = {
  id: StatementAccountColumnId;
  visible: boolean;
};

export const statementAccountDateRanges: StatementAccountOption[] = [
  { id: "last-3-months", label: "آخر 3 أشهر" },
  { id: "last-6-months", label: "آخر 6 أشهر" },
  { id: "last-12-months", label: "آخر 12 شهر" },
  { id: "current-month", label: "الشهر الحالي" },
  { id: "current-quarter", label: "الربع الحالي" },
  { id: "current-fiscal-year", label: "السنة المالية الحالية" },
  { id: "previous-month", label: "الشهر السابق" },
  { id: "previous-quarter", label: "الربع السابق" },
  { id: "previous-fiscal-year", label: "السنة المالية السابقة" },
  { id: "custom-range", label: "نطاق زمني مخصص" },
];

export const statementAccountFilters: StatementAccountOption[] = [
  { id: "account", label: "الحساب" },
  { id: "currency", label: "العملة" },
  { id: "source", label: "المصدر" },
  { id: "cost-center", label: "مركز التكلفة" },
  { id: "project", label: "المشروع" },
  { id: "debit-credit", label: "نوع الحركة" },
];

export const statementAccountColumns: StatementAccountColumn[] = [
  {
    id: "currency",
    label: "العملة",
    defaultVisible: true,
    defaultOrder: 10,
    align: "center",
    valueKey: "currency",
  },
  {
    id: "account",
    label: "الحساب",
    defaultVisible: true,
    defaultOrder: 20,
    align: "start",
    valueKey: "account",
  },
  {
    id: "relatedAccount",
    label: "الحسابات المقابلة",
    defaultVisible: true,
    defaultOrder: 30,
    align: "start",
    valueKey: "relatedAccount",
  },
  {
    id: "date",
    label: "التاريخ",
    defaultVisible: true,
    defaultOrder: 40,
    align: "center",
    valueKey: "date",
  },
  {
    id: "serialNumber",
    label: "الرقم التسلسلي",
    defaultVisible: true,
    defaultOrder: 50,
    align: "center",
    valueKey: "serialNumber",
  },
  {
    id: "source",
    label: "المصدر",
    defaultVisible: true,
    defaultOrder: 60,
    align: "start",
    valueKey: "source",
  },
  {
    id: "movement",
    label: "الحركة",
    defaultVisible: true,
    defaultOrder: 70,
    align: "start",
    valueKey: "movement",
  },
  {
    id: "reference",
    label: "المرجع",
    defaultVisible: true,
    defaultOrder: 80,
    align: "start",
    valueKey: "reference",
  },
  {
    id: "costCenter",
    label: "مركز التكلفة",
    defaultVisible: true,
    defaultOrder: 90,
    align: "start",
    valueKey: "costCenter",
  },
  {
    id: "project",
    label: "المشروع",
    defaultVisible: true,
    defaultOrder: 100,
    align: "start",
    valueKey: "project",
  },
  {
    id: "debit",
    label: "مدين",
    defaultVisible: true,
    defaultOrder: 110,
    align: "end",
    valueKey: "debit",
  },
  {
    id: "credit",
    label: "دائن",
    defaultVisible: true,
    defaultOrder: 120,
    align: "end",
    valueKey: "credit",
  },
  {
    id: "balance",
    label: "الرصيد",
    defaultVisible: true,
    defaultOrder: 130,
    align: "end",
    valueKey: "balance",
  },
];

export const statementAccountExportOptions: StatementAccountOption[] = [
  { id: "pdf", label: "إلى PDF" },
  { id: "excel", label: "تصدير إلى Excel" },
  { id: "pdf-en", label: "إلى PDF في الإنجليزية" },
  { id: "excel-en", label: "إلى Excel في الإنجليزية" },
];

export const defaultStatementAccountColumnState: StatementAccountColumnState[] =
  statementAccountColumns
    .slice()
    .sort((a, b) => a.defaultOrder - b.defaultOrder)
    .map((column) => ({
      id: column.id,
      visible: column.defaultVisible,
    }));

export const statementAccountRows: StatementAccountRow[] = [];

export function getStatementAccountColumnsByState(columnState: StatementAccountColumnState[]) {
  const byId = new Map(statementAccountColumns.map((column) => [column.id, column]));
  return columnState
    .map((state) => ({
      state,
      column: byId.get(state.id),
    }))
    .filter(
      (entry): entry is { state: StatementAccountColumnState; column: StatementAccountColumn } =>
        Boolean(entry.column),
    );
}
