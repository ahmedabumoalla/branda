import { hasBrandFeature } from "@/lib/data/feature-entitlements";
import { getPublicCafeBySlugAdmin, requireOwnerCafeContext } from "@/lib/data/cafes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const TABLE_WARS_FEATURE_KEY = "in_store_table_wars";

export type TableWarsTableLink = {
  id: string;
  label: string;
  qrCode: string;
  isActive: boolean;
  publicPath: string;
};

export type TableWarsRoundSummary = {
  id: string;
  status: string;
  statusLabel: string;
  durationSeconds: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string | null;
};

export type TableWarsDashboardData =
  | {
      enabled: false;
      cafeName: string;
    }
  | {
      enabled: true;
      cafeName: string;
      cafeSlug: string;
      tableCount: number;
      activeRoundCount: number;
      currentRounds: TableWarsRoundSummary[];
      recentRounds: TableWarsRoundSummary[];
      tableLinks: TableWarsTableLink[];
      missingSources: string[];
    };

export type PublicTableWarsEntry =
  | {
      cafeFound: false;
      cafeName: null;
      enabled: false;
      tableCode: string | null;
      table: null;
      currentRound: null;
      errorMessage: string;
    }
  | {
      cafeFound: true;
      cafeName: string;
      enabled: boolean;
      tableCode: string | null;
      table: {
        id: string;
        label: string;
      } | null;
      currentRound: TableWarsRoundSummary | null;
      errorMessage?: string;
    };

type SafeResponse = {
  data?: unknown;
  error?: { message?: string } | null;
  count?: number | null;
};

type QueryClient = {
  from(table: string): any;
};

function db(client: Awaited<ReturnType<typeof createClient>>) {
  return client as unknown as QueryClient;
}

function adminDb(client: ReturnType<typeof createAdminClient>) {
  return client as unknown as QueryClient;
}

function text(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const next = String(value).trim();
  return next || fallback;
}

function nullableText(value: unknown) {
  const next = text(value);
  return next || null;
}

function numberValue(value: unknown) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function intValue(value: unknown) {
  return Math.max(0, Math.trunc(numberValue(value)));
}

function firstQueryValue(value: unknown) {
  if (Array.isArray(value)) return text(value[0]);
  return text(value);
}

function roundStatusLabel(status: string) {
  if (status === "active") return "نشطة";
  if (status === "finished") return "منتهية";
  if (status === "cancelled") return "ملغاة";
  return "بانتظار البدء";
}

function mapRound(row: Record<string, unknown>): TableWarsRoundSummary {
  const status = text(row.status, "waiting");
  return {
    id: text(row.id),
    status,
    statusLabel: roundStatusLabel(status),
    durationSeconds: intValue(row.duration_seconds) || 180,
    startsAt: nullableText(row.starts_at),
    endsAt: nullableText(row.ends_at),
    createdAt: nullableText(row.created_at),
  };
}

function formatPublicPath(slug: string, qrCode: string) {
  return `/c/${encodeURIComponent(slug)}/play/table-wars?table=${encodeURIComponent(qrCode)}`;
}

async function safeCount(sourceName: string, promise: PromiseLike<SafeResponse>) {
  try {
    const result = await promise;
    if (result.error) return { value: 0, missing: true, sourceName };
    return { value: Number(result.count ?? 0), missing: false, sourceName };
  } catch {
    return { value: 0, missing: true, sourceName };
  }
}

async function safeRows<T>(
  sourceName: string,
  promise: PromiseLike<SafeResponse>,
  mapper: (row: Record<string, unknown>) => T,
) {
  try {
    const result = await promise;
    if (result.error) return { rows: [], missing: true, sourceName };
    const rows = Array.isArray(result.data) ? result.data : [];
    return {
      rows: rows.map((row) => mapper(row as Record<string, unknown>)),
      missing: false,
      sourceName,
    };
  } catch {
    return { rows: [], missing: true, sourceName };
  }
}

export async function getOwnerTableWarsDashboard(): Promise<TableWarsDashboardData> {
  const cafe = await requireOwnerCafeContext();
  const enabled = await hasBrandFeature(cafe.id, TABLE_WARS_FEATURE_KEY);

  if (!enabled) {
    return {
      enabled: false,
      cafeName: cafe.name,
    };
  }

  const supabase = db(await createClient());

  const [tableCount, activeRoundCount, tableLinks, currentRounds, recentRounds] = await Promise.all([
    safeCount(
      "table_wars_tables",
      supabase
        .from("table_wars_tables")
        .select("id", { count: "exact", head: true })
        .eq("cafe_id", cafe.id)
        .eq("is_active", true),
    ),
    safeCount(
      "table_wars_rounds",
      supabase
        .from("table_wars_rounds")
        .select("id", { count: "exact", head: true })
        .eq("cafe_id", cafe.id)
        .in("status", ["waiting", "active"]),
    ),
    safeRows(
      "table_wars_tables",
      supabase
        .from("table_wars_tables")
        .select("id,label,qr_code,is_active")
        .eq("cafe_id", cafe.id)
        .order("label", { ascending: true })
        .limit(30),
      (row): TableWarsTableLink => {
        const qrCode = text(row.qr_code);
        return {
          id: text(row.id),
          label: text(row.label, "طاولة"),
          qrCode,
          isActive: Boolean(row.is_active),
          publicPath: formatPublicPath(cafe.slug, qrCode),
        };
      },
    ),
    safeRows(
      "table_wars_rounds",
      supabase
        .from("table_wars_rounds")
        .select("id,status,duration_seconds,starts_at,ends_at,created_at")
        .eq("cafe_id", cafe.id)
        .in("status", ["waiting", "active"])
        .order("created_at", { ascending: false })
        .limit(5),
      mapRound,
    ),
    safeRows(
      "table_wars_rounds",
      supabase
        .from("table_wars_rounds")
        .select("id,status,duration_seconds,starts_at,ends_at,created_at")
        .eq("cafe_id", cafe.id)
        .order("created_at", { ascending: false })
        .limit(8),
      mapRound,
    ),
  ]);

  const missingSources = Array.from(
    new Set(
      [tableCount, activeRoundCount, tableLinks, currentRounds, recentRounds]
        .filter((source) => source.missing)
        .map((source) => source.sourceName),
    ),
  );

  return {
    enabled: true,
    cafeName: cafe.name,
    cafeSlug: cafe.slug,
    tableCount: tableCount.value,
    activeRoundCount: activeRoundCount.value,
    currentRounds: currentRounds.rows,
    recentRounds: recentRounds.rows,
    tableLinks: tableLinks.rows,
    missingSources,
  };
}

export async function getPublicTableWarsEntry(
  slug: string,
  searchParams: Record<string, string | string[] | undefined>,
): Promise<PublicTableWarsEntry> {
  const tableCode = firstQueryValue(searchParams.table) || null;
  const cafe = await getPublicCafeBySlugAdmin(slug);

  if (!cafe) {
    return {
      cafeFound: false,
      cafeName: null,
      enabled: false,
      tableCode,
      table: null,
      currentRound: null,
      errorMessage: "لم يتم العثور على الفرع.",
    };
  }

  const enabled = await hasBrandFeature(String(cafe.id), TABLE_WARS_FEATURE_KEY);
  if (!enabled) {
    return {
      cafeFound: true,
      cafeName: String(cafe.name),
      enabled: false,
      tableCode,
      table: null,
      currentRound: null,
      errorMessage: "حرب الطاولات غير مفعّلة حاليًا.",
    };
  }

  const supabase = adminDb(createAdminClient());

  const currentRoundResult = await safeRows(
    "table_wars_rounds",
    supabase
      .from("table_wars_rounds")
      .select("id,status,duration_seconds,starts_at,ends_at,created_at")
      .eq("cafe_id", cafe.id)
      .in("status", ["waiting", "active"])
      .order("created_at", { ascending: false })
      .limit(1),
    mapRound,
  );

  if (!tableCode) {
    return {
      cafeFound: true,
      cafeName: String(cafe.name),
      enabled: true,
      tableCode: null,
      table: null,
      currentRound: currentRoundResult.rows[0] ?? null,
    };
  }

  const tableResult = await safeRows(
    "table_wars_tables",
    supabase
      .from("table_wars_tables")
      .select("id,label")
      .eq("cafe_id", cafe.id)
      .eq("qr_code", tableCode)
      .eq("is_active", true)
      .limit(1),
    (row) => ({
      id: text(row.id),
      label: text(row.label, "طاولة"),
    }),
  );

  return {
    cafeFound: true,
    cafeName: String(cafe.name),
    enabled: true,
    tableCode,
    table: tableResult.rows[0] ?? null,
    currentRound: currentRoundResult.rows[0] ?? null,
    errorMessage: tableResult.rows[0] ? undefined : "رمز الطاولة غير صالح لهذا الفرع.",
  };
}
