export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { AdminOperationsCenterPage } from "@/components/admin/pages/admin-operations-center-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getAdminOperationsCenter, type AdminOperationsCenterData } from "@/lib/data/admin-operations-center";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeDate(value: string | string[] | undefined) {
  const next = firstParam(value)?.trim() ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : "";
}

function emptyData(filters: AdminOperationsCenterData["activeFilters"]) {
  return {
    brands: [],
    brandOptions: [],
    activeFilters: filters,
    diagnostics: [],
  };
}

export default async function AdminOperationsCenterRoutePage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  let from = safeDate(resolvedSearchParams.from);
  let to = safeDate(resolvedSearchParams.to);
  if (from && to && from > to) {
    [from, to] = [to, from];
  }
  const filters = {
    brandId: firstParam(resolvedSearchParams.brandId)?.trim() ?? "",
    from,
    to,
  };
  if (!isSupabaseConfigured()) {
    return (
      <AdminOperationsCenterPage
        data={emptyData(filters)}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const data = await getAdminOperationsCenter(filters);
    return <AdminOperationsCenterPage data={data} />;
  } catch (error) {
    console.error("[AdminOperationsCenterRoutePage]", error);
    return (
      <AdminOperationsCenterPage
        data={emptyData(filters)}
        configError="تعذر تحميل مركز العمليات"
      />
    );
  }
}
