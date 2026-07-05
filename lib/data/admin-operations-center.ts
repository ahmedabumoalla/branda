import { requirePlatformAdmin } from "@/lib/data/cafes";
import { operationEventTypes } from "@/lib/data/operation-events";
import { createClient } from "@/lib/supabase/server";

type QueryBuilder = {
  eq: (column: string, value: unknown) => CountQuery;
  in: (column: string, values: unknown[]) => CountQuery;
  is: (column: string, value: unknown) => CountQuery;
};

type CountQuery = QueryBuilder & PromiseLike<{ count: number | null; error: unknown }>;
type DbRow = Record<string, unknown>;

export type OperationsMetricKey =
  | "visits"
  | "appInstallClicks"
  | "brandLogins"
  | "cashierLogins"
  | "loyaltyScans"
  | "rewardRedemptions"
  | "orders"
  | "reservations";

export type OperationsSourceStatus = "available" | "empty" | "missing";

export type OperationsMetricSummary = {
  key: OperationsMetricKey;
  title: string;
  value: number;
  source: string;
  status: OperationsSourceStatus;
  note?: string;
  accepted?: number;
  rejected?: number;
};

export type OperationsVisitDetail = {
  id: string;
  path: string;
  sessionId: string;
  durationSeconds: number | null;
  createdAt: string;
};

export type OperationsAppInstallClickDetail = {
  id: string;
  path: string;
  createdAt: string;
};

export type OperationsBrandLoginDetail = {
  id: string;
  actorName: string;
  actorEmail: string;
  createdAt: string;
};

export type OperationsCashierLoginDetail = {
  id: string;
  cashierName: string;
  cashierEmail: string;
  createdAt: string;
};

export type OperationsLoyaltyScanDetail = {
  id: string;
  customerName: string;
  cardCode: string;
  cashierName: string;
  cashierEmail: string;
  eventType: string;
  invoiceBarcode: string;
  invoiceAmount: number;
  createdAt: string;
};

export type OperationsRewardRedemptionDetail = {
  id: string;
  rewardTitle: string;
  rewardSource: string;
  customerName: string;
  customerEmail: string;
  cashierName: string;
  cashierEmail: string;
  scannedCode: string;
  createdAt: string;
};

export type OperationsOrderDetail = {
  id: string;
  customerName: string;
  status: string;
  total: number;
  branchName: string;
  rejectionReason: string;
  respondedAt: string;
  createdAt: string;
  actorType: string;
  actorName: string;
  actorEmail: string;
  products: string[];
};

export type OperationsReservationDetail = {
  id: string;
  customerName: string;
  phone: string;
  status: string;
  eventType: string;
  guests: number;
  date: string;
  time: string;
  branchName: string;
  details: string;
  rejectionReason: string;
  createdAt: string;
  actorType: string;
  actorName: string;
  actorEmail: string;
};

export type OperationsBrandDetails = {
  visits: OperationsVisitDetail[];
  appInstallClicks: OperationsAppInstallClickDetail[];
  brandLogins: OperationsBrandLoginDetail[];
  cashierLogins: OperationsCashierLoginDetail[];
  loyaltyScans: OperationsLoyaltyScanDetail[];
  rewardRedemptions: OperationsRewardRedemptionDetail[];
  orders: OperationsOrderDetail[];
  reservations: OperationsReservationDetail[];
};

export type AdminOperationsCenterBrand = {
  id: string;
  name: string;
  slug: string;
  status: string;
  businessCategory: string;
  createdAt: string;
  publicUrl: string;
  metrics: OperationsMetricSummary[];
  details: OperationsBrandDetails;
};

export type AdminOperationsCenterData = {
  brands: AdminOperationsCenterBrand[];
  diagnostics: Array<{
    metric: string;
    source: string;
    status: OperationsSourceStatus;
    note: string;
  }>;
};

function asRows(value: unknown): DbRow[] {
  return Array.isArray(value) ? (value as DbRow[]) : [];
}

function nestedRecord(value: unknown): DbRow | null {
  if (Array.isArray(value)) return (value[0] as DbRow | undefined) ?? null;
  if (value && typeof value === "object") return value as DbRow;
  return null;
}

function text(value: unknown, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sourceStatus(count: number | null): OperationsSourceStatus {
  if (count === null) return "missing";
  return count > 0 ? "available" : "empty";
}

async function safeCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  cafeId: string,
  extra?: (query: CountQuery) => CountQuery,
) {
  try {
    let query = supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("cafe_id", cafeId) as unknown as CountQuery;
    if (extra) query = extra(query);
    const result = await query;
    if (result.error) return null;
    return result.count ?? 0;
  } catch {
    return null;
  }
}

async function safeRows<T>(
  promise: PromiseLike<{ data: unknown; error: unknown }>,
  mapper: (row: DbRow) => T,
) {
  try {
    const result = await promise;
    if (result.error) return { rows: [] as T[], available: false };
    return { rows: asRows(result.data).map(mapper), available: true };
  } catch {
    return { rows: [] as T[], available: false };
  }
}

function metadata(row: DbRow) {
  return row.metadata && typeof row.metadata === "object" ? (row.metadata as DbRow) : {};
}

function operationRows(rows: Array<DbRow & { cafeId: string }>, cafeId: string, eventType: string) {
  return rows.filter((row) => row.cafeId === cafeId && text(row.event_type) === eventType);
}

function orderStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending_cafe: "بانتظار الموافقة",
    accepted: "مقبول",
    rejected: "مرفوض",
    cancelled_by_customer: "ملغي من العميل",
  };
  return labels[status] ?? status;
}

function reservationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "بانتظار الرد",
    accepted: "مقبول",
    rejected: "مرفوض",
    modification_requested: "طلب تعديل",
  };
  return labels[status] ?? status;
}

function operationActor(row: DbRow | undefined) {
  if (!row) return null;
  const actorType = text(row.actor_type);
  return {
    actorType:
      actorType === "cashier"
        ? "الكاشير"
        : actorType === "brand_user"
          ? "لوحة العلامة"
          : "النظام",
    actorName: text(row.actor_name, actorType === "cashier" ? "كاشير" : "مستخدم لوحة العلامة"),
    actorEmail: text(row.actor_email),
  };
}

function auditActor(
  row: DbRow | undefined,
  actorProfiles: Map<string, { name: string; email: string }>,
) {
  const action = text(row?.action);
  const newData = row?.new_data && typeof row.new_data === "object" ? (row.new_data as DbRow) : {};
  if (text(newData.actorSource) === "cashier" || action.startsWith("cashier_")) {
    return {
      actorType: "الكاشير",
      actorName: text(newData.cashierName, "كاشير"),
      actorEmail: "",
    };
  }

  const actor = actorProfiles.get(text(row?.actor_id));
  return {
    actorType: "لوحة العلامة",
    actorName: actor?.name ?? "مستخدم لوحة العلامة",
    actorEmail: actor?.email ?? "",
  };
}

export async function getAdminOperationsCenter(): Promise<AdminOperationsCenterData> {
  await requirePlatformAdmin();

  const supabase = await createClient();
  const { data: cafeRows, error: cafeError } = await supabase
    .from("cafes")
    .select("id, name, slug, status, business_category, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (cafeError) throw cafeError;

  const cafes = asRows(cafeRows);
  const cafeIds = cafes.map((row) => text(row.id)).filter(Boolean);

  if (cafeIds.length === 0) {
    return { brands: [], diagnostics: [] };
  }

  const [
    visitsResult,
    operationEventsResult,
    cashierLoginResult,
    loyaltyScanResult,
    rewardRedemptionResult,
    ordersResult,
    reservationsResult,
    auditResult,
  ] = await Promise.all([
    safeRows(
      supabase
        .from("cafe_visit_events")
        .select("id,cafe_id,session_id,path,duration_seconds,created_at")
        .in("cafe_id", cafeIds)
        .order("created_at", { ascending: false })
        .limit(800),
      (row): OperationsVisitDetail & { cafeId: string } => ({
        id: text(row.id),
        cafeId: text(row.cafe_id),
        path: text(row.path, "/"),
        sessionId: text(row.session_id),
        durationSeconds: row.duration_seconds === null ? null : numberValue(row.duration_seconds),
        createdAt: text(row.created_at),
      }),
    ),
    safeRows(
      supabase
        .from("cafe_operation_events")
        .select("id,cafe_id,event_type,actor_type,actor_id,actor_name,actor_email,entity_type,entity_id,metadata,created_at")
        .in("cafe_id", cafeIds)
        .order("created_at", { ascending: false })
        .limit(1600),
      (row): DbRow & { cafeId: string } => ({ ...row, cafeId: text(row.cafe_id) }),
    ),
    safeRows(
      supabase
        .from("cafe_cashier_activity_logs")
        .select("id,cafe_id,created_at,cafe_cashiers(full_name,email)")
        .in("cafe_id", cafeIds)
        .eq("action_type", "login")
        .order("created_at", { ascending: false })
        .limit(800),
      (row): OperationsCashierLoginDetail & { cafeId: string } => {
        const cashier = nestedRecord(row.cafe_cashiers);
        return {
          id: text(row.id),
          cafeId: text(row.cafe_id),
          cashierName: text(cashier?.full_name, "كاشير"),
          cashierEmail: text(cashier?.email),
          createdAt: text(row.created_at),
        };
      },
    ),
    safeRows(
      supabase
        .from("loyalty_card_events")
        .select("id,cafe_id,event_type,invoice_barcode,invoice_amount,created_at,loyalty_cards!loyalty_card_events_card_same_cafe(customer_name,card_code),cafe_cashiers(full_name,email)")
        .in("cafe_id", cafeIds)
        .order("created_at", { ascending: false })
        .limit(800),
      (row): OperationsLoyaltyScanDetail & { cafeId: string } => {
        const card = nestedRecord(row.loyalty_cards);
        const cashier = nestedRecord(row.cafe_cashiers);
        return {
          id: text(row.id),
          cafeId: text(row.cafe_id),
          customerName: text(card?.customer_name, "عميل"),
          cardCode: text(card?.card_code),
          cashierName: text(cashier?.full_name, "لوحة التحكم"),
          cashierEmail: text(cashier?.email),
          eventType: text(row.event_type),
          invoiceBarcode: text(row.invoice_barcode),
          invoiceAmount: numberValue(row.invoice_amount),
          createdAt: text(row.created_at),
        };
      },
    ),
    safeRows(
      supabase
        .from("customer_reward_redemptions")
        .select("id,cafe_id,scanned_code,created_at,customer_reward_instances(reward_title,source_type),customer_profiles(full_name,email),cafe_cashiers(full_name,email)")
        .in("cafe_id", cafeIds)
        .order("created_at", { ascending: false })
        .limit(800),
      (row): OperationsRewardRedemptionDetail & { cafeId: string } => {
        const reward = nestedRecord(row.customer_reward_instances);
        const customer = nestedRecord(row.customer_profiles);
        const cashier = nestedRecord(row.cafe_cashiers);
        return {
          id: text(row.id),
          cafeId: text(row.cafe_id),
          rewardTitle: text(reward?.reward_title, "مكافأة"),
          rewardSource: text(reward?.source_type),
          customerName: text(customer?.full_name, "عميل"),
          customerEmail: text(customer?.email),
          cashierName: text(cashier?.full_name, "كاشير"),
          cashierEmail: text(cashier?.email),
          scannedCode: text(row.scanned_code),
          createdAt: text(row.created_at),
        };
      },
    ),
    safeRows(
      supabase
        .from("orders")
        .select("id,cafe_id,customer_name,status,total,branch_name,rejection_reason,responded_at,created_at")
        .in("cafe_id", cafeIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1000),
      (row): Omit<OperationsOrderDetail, "actorType" | "actorName" | "actorEmail" | "products"> & { cafeId: string } => ({
        id: text(row.id),
        cafeId: text(row.cafe_id),
        customerName: text(row.customer_name, "عميل"),
        status: orderStatusLabel(text(row.status)),
        total: numberValue(row.total),
        branchName: text(row.branch_name),
        rejectionReason: text(row.rejection_reason),
        respondedAt: text(row.responded_at),
        createdAt: text(row.created_at),
      }),
    ),
    safeRows(
      supabase
        .from("reservations")
        .select("id,cafe_id,customer_name,phone,status,event_type,guests,reservation_date,reservation_time,branch_name,space_type,event_title,rejection_reason,cafe_message,created_at")
        .in("cafe_id", cafeIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1000),
      (row): Omit<OperationsReservationDetail, "actorType" | "actorName" | "actorEmail"> & { cafeId: string } => ({
        id: text(row.id),
        cafeId: text(row.cafe_id),
        customerName: text(row.customer_name, "عميل"),
        phone: text(row.phone),
        status: reservationStatusLabel(text(row.status)),
        eventType: text(row.event_type, "حجز"),
        guests: numberValue(row.guests),
        date: text(row.reservation_date),
        time: text(row.reservation_time),
        branchName: text(row.branch_name),
        details: [row.event_title, row.space_type, row.cafe_message].map((item) => text(item)).filter(Boolean).join(" - "),
        rejectionReason: text(row.rejection_reason),
        createdAt: text(row.created_at),
      }),
    ),
    safeRows(
      supabase
        .from("audit_logs")
        .select("id,cafe_id,actor_id,action,entity_table,entity_id,new_data,created_at")
        .in("cafe_id", cafeIds)
        .in("entity_table", ["orders", "reservations"])
        .order("created_at", { ascending: false })
        .limit(2000),
      (row): DbRow => row,
    ),
  ]);

  const orderIds = ordersResult.rows.map((row) => row.id).filter(Boolean);
  const orderItemsResult = orderIds.length
    ? await safeRows(
        supabase
          .from("order_items")
          .select("order_id,name,quantity")
          .in("order_id", orderIds)
          .order("created_at", { ascending: true }),
        (row): { orderId: string; label: string } => ({
          orderId: text(row.order_id),
          label: `${text(row.name, "منتج")} × ${numberValue(row.quantity) || 1}`,
        }),
      )
    : { rows: [] as Array<{ orderId: string; label: string }>, available: true };

  const actorIds = Array.from(new Set(auditResult.rows.map((row) => text(row.actor_id)).filter(Boolean)));
  const actorResult = actorIds.length
    ? await safeRows(
        supabase.from("profiles").select("id,full_name,email").in("id", actorIds),
        (row): { id: string; name: string; email: string } => ({
          id: text(row.id),
          name: text(row.full_name, "مستخدم لوحة العلامة"),
          email: text(row.email),
        }),
      )
    : { rows: [] as Array<{ id: string; name: string; email: string }>, available: true };

  const actorProfiles = new Map(actorResult.rows.map((row) => [row.id, { name: row.name, email: row.email }]));
  const auditByEntity = new Map<string, DbRow>();
  for (const row of auditResult.rows) {
    const entityId = text(row.entity_id);
    if (entityId && !auditByEntity.has(entityId)) auditByEntity.set(entityId, row);
  }

  const operationByEntity = new Map<string, DbRow>();
  for (const row of operationEventsResult.rows) {
    const entityId = text(row.entity_id);
    if (entityId && !operationByEntity.has(entityId)) operationByEntity.set(entityId, row);
  }

  const productsByOrder = new Map<string, string[]>();
  for (const item of orderItemsResult.rows) {
    const list = productsByOrder.get(item.orderId) ?? [];
    list.push(item.label);
    productsByOrder.set(item.orderId, list);
  }

  const brands = await Promise.all(
    cafes.map(async (cafe): Promise<AdminOperationsCenterBrand> => {
      const cafeId = text(cafe.id);
      const [
        visitCount,
        appInstallClickCount,
        brandLoginCount,
        cashierLoginCount,
        loyaltyScanCount,
        rewardRedemptionCount,
        ordersReceivedCount,
        ordersAcceptedCount,
        ordersRejectedCount,
        reservationsTotalCount,
        reservationsAcceptedCount,
        reservationsRejectedCount,
      ] = await Promise.all([
        safeCount(supabase, "cafe_visit_events", cafeId),
        safeCount(supabase, "cafe_operation_events", cafeId, (query) => query.eq("event_type", operationEventTypes.appInstallClicked)),
        safeCount(supabase, "cafe_operation_events", cafeId, (query) => query.eq("event_type", operationEventTypes.brandLogin)),
        safeCount(supabase, "cafe_cashier_activity_logs", cafeId, (query) => query.eq("action_type", "login")),
        safeCount(supabase, "loyalty_card_events", cafeId),
        safeCount(supabase, "customer_reward_redemptions", cafeId),
        safeCount(supabase, "orders", cafeId, (query) => query.is("deleted_at", null)),
        safeCount(supabase, "orders", cafeId, (query) => query.eq("status", "accepted").is("deleted_at", null)),
        safeCount(supabase, "orders", cafeId, (query) => query.eq("status", "rejected").is("deleted_at", null)),
        safeCount(supabase, "reservations", cafeId, (query) => query.is("deleted_at", null)),
        safeCount(supabase, "reservations", cafeId, (query) => query.eq("status", "accepted").is("deleted_at", null)),
        safeCount(supabase, "reservations", cafeId, (query) => query.eq("status", "rejected").is("deleted_at", null)),
      ]);

      const brandOrders = ordersResult.rows
        .filter((row) => row.cafeId === cafeId)
        .map((row): OperationsOrderDetail => {
          const actor = operationActor(operationByEntity.get(row.id)) ?? auditActor(auditByEntity.get(row.id), actorProfiles);
          return {
            ...row,
            actorType: actor.actorType,
            actorName: actor.actorName,
            actorEmail: actor.actorEmail,
            products: productsByOrder.get(row.id) ?? [],
          };
        });

      const brandReservations = reservationsResult.rows
        .filter((row) => row.cafeId === cafeId)
        .map((row): OperationsReservationDetail => {
          const actor = operationActor(operationByEntity.get(row.id)) ?? auditActor(auditByEntity.get(row.id), actorProfiles);
          return {
            ...row,
            actorType: actor.actorType,
            actorName: actor.actorName,
            actorEmail: actor.actorEmail,
          };
        });

      const appInstallRows = operationRows(operationEventsResult.rows, cafeId, operationEventTypes.appInstallClicked);
      const brandLoginRows = operationRows(operationEventsResult.rows, cafeId, operationEventTypes.brandLogin);

      return {
        id: cafeId,
        name: text(cafe.name, "علامة بدون اسم"),
        slug: text(cafe.slug),
        status: text(cafe.status),
        businessCategory: text(cafe.business_category),
        createdAt: text(cafe.created_at),
        publicUrl: `/c/${text(cafe.slug)}`,
        metrics: [
          {
            key: "visits",
            title: "الدخول للفرع الإلكتروني",
            value: visitCount ?? 0,
            source: "قراءة من سجل الزيارات",
            status: sourceStatus(visitCount),
          },
          {
            key: "appInstallClicks",
            title: "ضغط زر تحميل التطبيق",
            value: appInstallClickCount ?? 0,
            source: "قراءة من سجل العمليات",
            status: sourceStatus(appInstallClickCount),
          },
          {
            key: "brandLogins",
            title: "تسجيل دخول العلامة للوحة",
            value: brandLoginCount ?? 0,
            source: "قراءة من سجل العمليات",
            status: sourceStatus(brandLoginCount),
          },
          {
            key: "cashierLogins",
            title: "تسجيل دخول الكاشير",
            value: cashierLoginCount ?? 0,
            source: "قراءة من سجل الكاشير",
            status: sourceStatus(cashierLoginCount),
          },
          {
            key: "loyaltyScans",
            title: "قراءة باركود بطاقة الولاء",
            value: loyaltyScanCount ?? 0,
            source: "قراءة من سجل الولاء",
            status: sourceStatus(loyaltyScanCount),
          },
          {
            key: "rewardRedemptions",
            title: "المكافآت المصروفة",
            value: rewardRedemptionCount ?? 0,
            source: "قراءة من سجل المكافآت",
            status: sourceStatus(rewardRedemptionCount),
          },
          {
            key: "orders",
            title: "الطلبات",
            value: ordersReceivedCount ?? 0,
            source: "قراءة من سجل الطلبات",
            status: sourceStatus(ordersReceivedCount),
            accepted: ordersAcceptedCount ?? 0,
            rejected: ordersRejectedCount ?? 0,
          },
          {
            key: "reservations",
            title: "الحجوزات",
            value: reservationsTotalCount ?? 0,
            source: "قراءة من سجل الحجوزات",
            status: sourceStatus(reservationsTotalCount),
            accepted: reservationsAcceptedCount ?? 0,
            rejected: reservationsRejectedCount ?? 0,
          },
        ],
        details: {
          visits: visitsResult.rows.filter((row) => row.cafeId === cafeId),
          appInstallClicks: appInstallRows.map((row): OperationsAppInstallClickDetail => ({
            id: text(row.id),
            path: text(metadata(row).path, "/"),
            createdAt: text(row.created_at),
          })),
          brandLogins: brandLoginRows.map((row): OperationsBrandLoginDetail => ({
            id: text(row.id),
            actorName: text(row.actor_name, "مستخدم لوحة العلامة"),
            actorEmail: text(row.actor_email),
            createdAt: text(row.created_at),
          })),
          cashierLogins: cashierLoginResult.rows.filter((row) => row.cafeId === cafeId),
          loyaltyScans: loyaltyScanResult.rows.filter((row) => row.cafeId === cafeId),
          rewardRedemptions: rewardRedemptionResult.rows.filter((row) => row.cafeId === cafeId),
          orders: brandOrders,
          reservations: brandReservations,
        },
      };
    }),
  );

  return { brands, diagnostics: [] };
}
