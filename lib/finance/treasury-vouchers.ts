export const treasuryVoucherCategories = [
  { value: "other_income", label: "إيراد آخر", kind: "receipt", accountCode: "4010" },
  { value: "owner_funding", label: "تمويل من المالك", kind: "receipt", accountCode: "3000" },
  { value: "operating_expense", label: "مصروف تشغيلي", kind: "expense", accountCode: "5100" },
  { value: "owner_draw", label: "مسحوبات المالك", kind: "expense", accountCode: "3010" },
] as const;

export const treasuryExpenseSubcategories = [
  { value: "rent", label: "إيجار" },
  { value: "utilities", label: "كهرباء ومياه واتصالات" },
  { value: "maintenance", label: "صيانة" },
  { value: "wages", label: "رواتب وأجور" },
  { value: "other", label: "مصروف آخر" },
] as const;

export type TreasuryVoucherCategory = typeof treasuryVoucherCategories[number]["value"];
