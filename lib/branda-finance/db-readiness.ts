import {
  BRANDA_FINANCE_CORE_TABLES,
  type BrandaFinanceDbReadiness,
} from "@/lib/branda-finance/db-types";

export const BRANDA_FINANCE_CORE_MIGRATION_DRAFT_PATH =
  "supabase/migrations/061_branda_finance_core.sql";

export const BRANDA_FINANCE_REAL_PERSISTENCE_DISABLED_MESSAGE =
  "الحفظ الحقيقي يحتاج مراجعة وتطبيق جداول برندا المالية الأساسية أولاً";

export function getBrandaFinanceDbReadiness(): BrandaFinanceDbReadiness {
  return {
    active: false,
    migrationDraftPath: BRANDA_FINANCE_CORE_MIGRATION_DRAFT_PATH,
    missingTables: [...BRANDA_FINANCE_CORE_TABLES],
    disabledReason: BRANDA_FINANCE_REAL_PERSISTENCE_DISABLED_MESSAGE,
    canPersistSalesInvoices: false,
    canPersistPayments: false,
    canPostAccounting: false,
  };
}
