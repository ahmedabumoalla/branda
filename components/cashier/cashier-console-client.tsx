"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Clock3,
  DoorOpen,
  FileSpreadsheet,
  Gift,
  Languages,
  LogOut,
  Printer,
  QrCode,
  RefreshCw,
  ScanLine,
  ShoppingBag,
  Ticket,
  UserRound,
} from "lucide-react";
import {
  acceptCashierOrderAction,
  acceptCashierReservationAction,
  cashierRedeemExperienceRewardAction,
  cashierScanLoyaltyAction,
  confirmCashierTicketAction,
  confirmReservationCodeAction,
  fetchCashierConsoleAction,
  logoutCashierAction,
  updateCashierOrderStatusAction,
  updateCashierReservationStatusAction,
} from "@/app/actions/cashier";
import { Modal } from "@/components/dashboard/ui/modal";
import { BarcodeCameraScanner } from "@/components/loyalty/barcode-camera-scanner";
import type { CashierConsole } from "@/lib/data/cashier";
import { exportRowsToExcel, exportRowsToPdf } from "@/lib/export/admin-report-export";
import { parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import { getBusinessCopy } from "@/lib/platform/business-copy";
import { printThermalReceipt } from "@/lib/print/thermal";

type Props = { initialData: CashierConsole };
type Row = Record<string, unknown>;
type ActiveModal =
  | "loyalty"
  | "reward"
  | "orders"
  | "reservations"
  | "checkin"
  | "ticket"
  | "order-details"
  | "reservation-details"
  | "operation-details"
  | null;
type StatusTableFilter = "pending" | "all" | "accepted" | "rejected" | "completed";
type ConsoleKind = "cafe" | "restaurant" | "events";
type OperationKind = "order" | "reservation" | "ticket" | "reward";
type OperationFilter = "all" | "orders" | "reservations" | "tickets" | "rewards" | "accepted" | "rejected" | "completed" | "pending";
type CashierActionTarget =
  | { type: "order"; id: string; action: "accept" | "reject"; row: Row }
  | { type: "reservation"; id: string; action: "accept" | "reject" | "modify"; row: Row }
  | null;
type OrderItemView = {
  id: string;
  name: string;
  type: string;
  quantity: string;
  price: string;
  total: string;
  notes: string;
  additions: string;
  options: string;
};
type TranslateLanguage = {
  code: string;
  label: string;
};
type OperationRow = {
  id: string;
  key: string;
  kind: OperationKind;
  raw: Row;
  date: string;
  time: string;
  operationType: string;
  title: string;
  customerName: string;
  phone: string;
  email: string;
  status: string;
  statusGroup: "accepted" | "rejected" | "completed" | "pending" | "other";
  summary: string;
  searchText: string;
};

const translateLanguages: TranslateLanguage[] = [
  { code: "ar", label: "العربية" },
  { code: "en", label: "English" },
  { code: "ur", label: "Urdu" },
  { code: "hi", label: "Hindi" },
  { code: "bn", label: "Bengali" },
  { code: "tl", label: "Filipino" },
  { code: "id", label: "Indonesian" },
];

const operationFilters: Array<{ id: OperationFilter; label: string }> = [
  { id: "all", label: "الكل" },
  { id: "orders", label: "الطلبات" },
  { id: "reservations", label: "الحجوزات" },
  { id: "tickets", label: "التذاكر" },
  { id: "rewards", label: "المكافآت" },
  { id: "accepted", label: "المقبولة" },
  { id: "rejected", label: "المرفوضة" },
  { id: "completed", label: "المكتملة" },
  { id: "pending", label: "تحتاج إجراء" },
];

function playAlert() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.18;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      void ctx.close();
    }, 420);
  } catch {}
}

function valueOf(row: Row | null | undefined, keys: string[], fallback = "-") {
  if (!row) return fallback;
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value);
    }
  }
  return fallback;
}

function amountOf(row: Row) {
  return valueOf(row, ["total", "totalAmount", "total_amount", "finalPrice", "final_price", "amount"], "-");
}

function decimalText(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return String(Math.round(number * 100) / 100);
}

function readableValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  if (Array.isArray(value)) {
    const text: string = value.map((item) => readableValue(item)).filter((item) => item !== "-").join("، ");
    return text || "-";
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `${key}: ${readableValue(entry)}`)
      .join("، ") || "-";
  }
  return String(value);
}

function textIncludes(value: string, words: string[]) {
  const normalized = value.toLowerCase();
  return words.some((word) => normalized.includes(word));
}

function orderItems(row: Row, kind: ConsoleKind): OrderItemView[] {
  const rawItems = row.items ?? row.orderItems ?? row.order_items ?? row.products ?? row.tickets;
  if (!Array.isArray(rawItems)) return [];

  return rawItems.map((item, index) => {
    const record = item && typeof item === "object" ? (item as Row) : { name: String(item) };
    const name = valueOf(
      record,
      [
        "name",
        "productName",
        "product_name",
        "menuItemName",
        "menu_item_name",
        "ticketName",
        "ticket_name",
        "packageName",
        "package_name",
        "planName",
        "plan_name",
        "title",
      ],
      kind === "events" ? "تذكرة" : kind === "restaurant" ? "وجبة" : "منتج",
    );
    const explicitType = valueOf(
      record,
      ["categoryName", "category_name", "category", "type", "itemType", "item_type", "productType", "product_type", "ticketType", "ticket_type"],
      "",
    );
    const quantity = valueOf(record, ["quantity", "qty", "count"], "1");
    const price = valueOf(record, ["price", "unitPrice", "unit_price", "amount"], "-");
    const explicitTotal = valueOf(record, ["total", "lineTotal", "line_total", "subtotal"], "");
    const computedTotal = explicitTotal || decimalText(Number(quantity) * Number(price));
    const itemType =
      explicitType ||
      (kind === "events"
        ? textIncludes(name, ["package", "bundle", "plan", "باقة"]) ? "باقة" : "تذكرة"
        : kind === "restaurant"
          ? "وجبة"
          : "منتج");
    return {
      id: valueOf(record, ["id", "productId", "product_id", "ticketId", "ticket_id"], String(index + 1)),
      name,
      type: itemType,
      quantity,
      price,
      total: computedTotal || "-",
      notes: valueOf(record, ["notes", "note", "specialInstructions", "special_instructions", "description"], "-"),
      additions: readableValue(record.additions ?? record.addons ?? record.extras ?? record.modifiers),
      options: readableValue(record.options ?? record.variant ?? record.choices ?? record.customizations),
    };
  });
}

function orderKind(row: Row, kind: ConsoleKind) {
  const raw = valueOf(
    row,
    ["type", "orderType", "order_type", "eventType", "event_type", "source", "sourceType", "source_type", "rewardType", "reward_type"],
    "",
  );
  const items = orderItems(row, kind);
  const itemText = items.map((item) => `${item.name} ${item.type}`).join(" ");
  const signal = `${raw} ${itemText}`;

  if (kind === "events") {
    if (textIncludes(signal, ["upgrade", "ترقية"])) return "ترقية حضور";
    if (textIncludes(signal, ["reward", "مكافأة"])) return "مكافأة حضور";
    if (textIncludes(signal, ["entry", "checkin", "check-in", "admission", "دخول", "حضور"])) return "دخول فعالية";
    if (textIncludes(signal, ["package", "bundle", "plan", "باقة"])) return "شراء باقة";
    return "شراء تذكرة";
  }

  if (textIncludes(signal, ["reward", "redeem", "مكافأة"])) return "طلب مكافأة";
  if (textIncludes(signal, ["loyalty", "stamp", "ولاء"])) return "طلب ولاء";
  if (textIncludes(signal, ["pickup", "takeaway", "استلام"])) return "طلب استلام";
  return kind === "restaurant" ? "طلب وجبة" : "طلب منتج";
}

function orderName(row: Row, kind: ConsoleKind) {
  const items = orderItems(row, kind);
  if (items.length === 1) return items[0].name;
  if (items.length > 1) {
    const extraCount = items.length - 1;
    return `${items[0].name} + ${extraCount} ${extraCount === 1 ? "عنصر" : "عناصر"}`;
  }
  return valueOf(
    row,
    ["orderName", "order_name", "productName", "product_name", "ticketName", "ticket_name", "packageName", "package_name", "title"],
    kind === "events" ? "تذكرة" : kind === "restaurant" ? "وجبة" : "منتج",
  );
}

function orderDetails(row: Row, kind: ConsoleKind) {
  const items = orderItems(row, kind);
  if (items.length) {
    return items
      .map((item) => `${item.name} - ${item.type} - كمية ${item.quantity} - سعر ${item.price} - إجمالي جزئي ${item.total}`)
      .join(" | ");
  }
  return valueOf(row, ["notes", "description", "details", "specialRequests", "special_requests"], kind === "events" ? "تفاصيل التذكرة" : "تفاصيل الطلب");
}

function dateParts(value: string) {
  if (!value || value === "-") return { date: "-", time: "-" };
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return {
      date: date.toLocaleDateString("ar-SA"),
      time: date.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
    };
  }
  const [rawDate, rawTime = ""] = value.split(/[T ]/);
  return { date: rawDate || "-", time: rawTime.slice(0, 5) || "-" };
}

function rowDateTime(row: Row, dateKeys: string[], timeKeys: string[]) {
  const date = valueOf(row, dateKeys, "");
  const time = valueOf(row, timeKeys, "");
  if (date && date !== "-" && time && time !== "-") return { date, time };
  return dateParts(date || valueOf(row, ["createdAt", "created_at"], ""));
}

function shortDetails(row: Row, kind: ConsoleKind) {
  return orderDetails(row, kind);
}

function detailEntries(
  row: Row,
  isReservation: boolean,
  kind: ConsoleKind,
): Array<[string, string]> {
  const isEvents = kind === "events";
  const created = rowDateTime(row, ["createdAt", "created_at"], []);
  const scheduled = rowDateTime(
    row,
    isReservation ? ["reservationDate", "reservation_date"] : ["createdAt", "created_at"],
    isReservation ? ["reservationTime", "reservation_time"] : [],
  );
  const common: Array<[string, string]> = [
    ["الرقم", valueOf(row, ["id"])],
    ["تاريخ الإنشاء", created.date],
    ["وقت الإنشاء", created.time],
    ["الاسم", valueOf(row, ["customerName", "customer_name"])],
    ["الجوال", valueOf(row, ["customerPhone", "customer_phone", "phone"])],
    ["الإيميل", valueOf(row, ["customerEmail", "customer_email", "email"])],
    ["الحالة", valueOf(row, ["status"])],
    ["الفرع", valueOf(row, ["branchName", "branch_name"])],
    [isEvents ? "البوابة" : "نقطة التنفيذ", valueOf(row, ["gateName", "gate_name", "pickupPoint", "pickup_point", "deliveryPoint", "delivery_point"])],
    ["الملاحظات", valueOf(row, ["notes"])],
  ];
  if (isReservation) {
    return [
      ...common,
      ["تاريخ الحجز", scheduled.date],
      ["وقت الحجز", scheduled.time],
      ["النوع", valueOf(row, ["eventType", "event_type"], isEvents ? "حضور" : "حجز")],
      [isEvents ? "عدد الحضور" : "عدد الأشخاص", valueOf(row, ["guests", "guestCount", "guest_count", "people"], "-")],
      ["رمز التحقق", valueOf(row, ["reservationCode", "reservation_code", "code"], "-")],
      ["طلبات خاصة", valueOf(row, ["specialRequests", "special_requests", "details"], "-")],
    ];
  }
  return [
    ...common,
    ["نوع الطلب", orderKind(row, kind)],
    ["اسم الطلب", orderName(row, kind)],
    ["طريقة الاستلام", valueOf(row, ["fulfillment", "fulfillmentType", "fulfillment_type", "pickupMethod", "pickup_method"], "-")],
    ["الإجمالي النهائي", amountOf(row)],
    ["التفاصيل", orderDetails(row, kind)],
  ];
}

function statusLabel(row: Row) {
  const raw = valueOf(row, ["status"], "قيد الانتظار");
  const map: Record<string, string> = {
    accepted: "مقبول",
    approved: "مقبول",
    valid: "مقبول",
    rejected: "مرفوض",
    completed: "مكتمل",
    complete: "مكتمل",
    redeemed: "مكتمل",
    pending: "قيد الانتظار",
    pending_cafe: "قيد الانتظار",
    used: "تم الاستخدام",
    cancelled: "مرفوض",
    cancelled_by_customer: "مرفوض",
  };
  return map[raw] ?? raw;
}

function statusGroup(row: Row): OperationRow["statusGroup"] {
  const raw = valueOf(row, ["status"], "").toLowerCase();
  const label = statusLabel(row);
  if (["accepted", "approved", "valid"].includes(raw) || label === "مقبول") return "accepted";
  if (["rejected", "cancelled", "cancelled_by_customer"].includes(raw) || label === "مرفوض") return "rejected";
  if (["completed", "complete", "redeemed", "used"].includes(raw) || ["مكتمل", "تم الاستخدام", "تم الاستقبال"].includes(label)) return "completed";
  if (["pending", "pending_cafe"].includes(raw) || label === "قيد الانتظار") return "pending";
  return "other";
}

function filterStatusRows(rows: Row[], filter: StatusTableFilter) {
  if (filter === "all") return rows;
  return rows.filter((row) => statusGroup(row) === filter);
}

function rawStatus(row: Row) {
  return valueOf(row, ["status"], "").toLowerCase();
}

function canRespond(row: Row) {
  return ["pending", "pending_cafe"].includes(rawStatus(row)) || statusGroup(row) === "pending";
}

function canConfirmReservation(row: Row) {
  return (
    statusGroup(row) === "accepted" &&
    Boolean(valueOf(row, ["reservationCode", "reservation_code", "code"], "").trim()) &&
    !valueOf(row, ["reservationCodeUsedAt", "reservation_code_used_at"], "").trim()
  );
}

function canScanTicket(row: Row) {
  return rawStatus(row) === "valid";
}

function reservationName(row: Row, isEvents: boolean) {
  return valueOf(
    row,
    [
      "serviceName",
      "service_name",
      "reservationServiceName",
      "reservation_service_name",
      "eventTitle",
      "event_title",
      "spaceType",
      "space_type",
      "branchName",
      "branch_name",
      "eventType",
      "event_type",
      "type",
    ],
    isEvents ? "حضور فعالية" : "حجز",
  );
}

function reservationSummary(row: Row, isEvents: boolean) {
  const schedule = rowDateTime(row, ["reservationDate", "reservation_date", "date"], ["reservationTime", "reservation_time", "time"]);
  return `${valueOf(row, ["eventType", "event_type", "type"], isEvents ? "حضور" : "حجز")} - ${valueOf(row, ["guests", "guestCount", "guest_count", "people"], "1")} أشخاص - ${schedule.date} ${schedule.time}`;
}

function rewardItemsText(row: Row) {
  const items = row.items ?? row.experience_reward_items;
  if (!Array.isArray(items) || !items.length) return valueOf(row, ["rewardName", "reward_name", "title"], "مكافأة");
  return items
    .map((item) => {
      const record = item && typeof item === "object" ? (item as Row) : { product_name: String(item) };
      return `${valueOf(record, ["productName", "product_name", "name"], "مكافأة")} × ${valueOf(record, ["quantity", "qty"], "1")}`;
    })
    .join("، ");
}

function ticketName(row: Row) {
  return valueOf(row, ["ticketName", "ticket_name", "productName", "product_name", "packageName", "package_name", "name"], "تذكرة");
}

function buildSearchText(parts: string[]) {
  return parts.join(" ").toLowerCase();
}

function operationRowsFromData(data: CashierConsole, kind: ConsoleKind): OperationRow[] {
  const isEvents = kind === "events";
  const rows: OperationRow[] = [];
  const orders = (data.operationOrders ?? data.orders) as Row[];
  const reservations = (data.operationReservations ?? data.reservations) as Row[];
  const tickets = (data.operationTickets ?? []) as Row[];
  const rewards = (data.operationRewards ?? []) as Row[];

  for (const order of orders) {
    const when = rowDateTime(order, ["createdAt", "created_at"], []);
    const status = statusLabel(order);
    const title = orderName(order, kind);
    const summary = `${orderName(order, kind)} - ${orderItems(order, kind).length || 1} عناصر - الإجمالي ${amountOf(order)}`;
    rows.push({
      id: valueOf(order, ["id"]),
      key: `order-${valueOf(order, ["id"])}`,
      kind: "order",
      raw: order,
      date: when.date,
      time: when.time,
      operationType: orderKind(order, kind),
      title,
      customerName: valueOf(order, ["customerName", "customer_name"], "عميل"),
      phone: valueOf(order, ["customerPhone", "customer_phone", "phone"]),
      email: valueOf(order, ["customerEmail", "customer_email", "email"]),
      status,
      statusGroup: statusGroup(order),
      summary,
      searchText: buildSearchText([valueOf(order, ["id"]), title, summary, valueOf(order, ["customerName", "customer_name"]), valueOf(order, ["customerPhone", "customer_phone", "phone"]), valueOf(order, ["customerEmail", "customer_email", "email"])]),
    });
  }

  for (const reservation of reservations) {
    const when = rowDateTime(reservation, ["createdAt", "created_at"], []);
    const status = statusLabel(reservation);
    const title = reservationName(reservation, isEvents);
    const summary = reservationSummary(reservation, isEvents);
    rows.push({
      id: valueOf(reservation, ["id"]),
      key: `reservation-${valueOf(reservation, ["id"])}`,
      kind: "reservation",
      raw: reservation,
      date: when.date,
      time: when.time,
      operationType: isEvents ? "حضور فعالية" : "حجز",
      title,
      customerName: valueOf(reservation, ["customerName", "customer_name"], "عميل"),
      phone: valueOf(reservation, ["customerPhone", "customer_phone", "phone"]),
      email: valueOf(reservation, ["customerEmail", "customer_email", "email"]),
      status,
      statusGroup: statusGroup(reservation),
      summary,
      searchText: buildSearchText([valueOf(reservation, ["id"]), title, summary, valueOf(reservation, ["customerName", "customer_name"]), valueOf(reservation, ["customerPhone", "customer_phone", "phone"]), valueOf(reservation, ["customerEmail", "customer_email", "email"]), valueOf(reservation, ["reservationCode", "reservation_code"])]),
    });
  }

  for (const ticket of tickets) {
    const when = rowDateTime(ticket, ["usedAt", "used_at", "createdAt", "created_at"], []);
    const status = statusLabel(ticket);
    const title = ticketName(ticket);
    const summary = `${title} - ${status}`;
    rows.push({
      id: valueOf(ticket, ["id", "ticketCode", "ticket_code"]),
      key: `ticket-${valueOf(ticket, ["id", "ticketCode", "ticket_code"])}`,
      kind: "ticket",
      raw: ticket,
      date: when.date,
      time: when.time,
      operationType: "تذكرة",
      title,
      customerName: valueOf(ticket, ["customerName", "customer_name"], "عميل"),
      phone: valueOf(ticket, ["customerPhone", "customer_phone", "phone"]),
      email: valueOf(ticket, ["customerEmail", "customer_email", "email"]),
      status,
      statusGroup: statusGroup(ticket),
      summary,
      searchText: buildSearchText([valueOf(ticket, ["id", "ticketCode", "ticket_code"]), title, summary, valueOf(ticket, ["customerName", "customer_name"]), valueOf(ticket, ["customerPhone", "customer_phone", "phone"]), valueOf(ticket, ["customerEmail", "customer_email"])]),
    });
  }

  for (const reward of rewards) {
    const when = rowDateTime(reward, ["usedAt", "used_at", "approvedAt", "approved_at", "rejectedAt", "rejected_at", "createdAt", "created_at"], []);
    const status = statusLabel(reward);
    const title = rewardItemsText(reward);
    const summary = `${title} - ${status}`;
    rows.push({
      id: valueOf(reward, ["id", "rewardCode", "reward_code"]),
      key: `reward-${valueOf(reward, ["id", "rewardCode", "reward_code"])}`,
      kind: "reward",
      raw: reward,
      date: when.date,
      time: when.time,
      operationType: isEvents ? "مكافأة حضور" : "مكافأة توثيق",
      title,
      customerName: valueOf(reward, ["customerName", "customer_name"], "عميل"),
      phone: valueOf(reward, ["customerPhone", "customer_phone", "phone"]),
      email: valueOf(reward, ["customerEmail", "customer_email", "email"]),
      status,
      statusGroup: statusGroup(reward),
      summary,
      searchText: buildSearchText([valueOf(reward, ["id", "rewardCode", "reward_code"]), title, summary, valueOf(reward, ["customerName", "customer_name"]), valueOf(reward, ["customerPhone", "customer_phone", "phone"]), valueOf(reward, ["customerEmail", "customer_email"])]),
    });
  }

  return rows.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}

function FieldGrid({ entries }: { entries: Array<[string, string]> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {entries.map(([label, value]) => (
        <div key={label} className="rounded-2xl bg-[#F8F4EF] p-4">
          <p className="text-xs font-black text-[#806A5E]">{label}</p>
          <p className="mt-1 break-words font-black text-[#311912]">{value || "-"}</p>
        </div>
      ))}
    </div>
  );
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-[#F8F4EF] px-3 py-1 text-xs font-black text-[#6B3A25]">
      {children}
    </span>
  );
}

export function CashierConsoleClient({ initialData }: Props) {
  const [data, setData] = useState(initialData);
  const [cardCode, setCardCode] = useState("");
  const [reservationCode, setReservationCode] = useState("");
  const [ticketCode, setTicketCode] = useState("");
  const [experienceRewardCode, setExperienceRewardCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [orderFilter, setOrderFilter] = useState<StatusTableFilter>("pending");
  const [reservationFilter, setReservationFilter] = useState<StatusTableFilter>("pending");
  const [selectedOrder, setSelectedOrder] = useState<Row | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<Row | null>(null);
  const [actionTarget, setActionTarget] = useState<CashierActionTarget>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [proposedDate, setProposedDate] = useState("");
  const [proposedTime, setProposedTime] = useState("");
  const [loyaltyResult, setLoyaltyResult] = useState<Row | null>(null);
  const [rewardResult, setRewardResult] = useState<Row | null>(null);
  const [checkinResult, setCheckinResult] = useState<Row | null>(null);
  const [ticketResult, setTicketResult] = useState<Row | null>(null);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [languageHint, setLanguageHint] = useState("");
  const [operationFilter, setOperationFilter] = useState<OperationFilter>("all");
  const [operationSearch, setOperationSearch] = useState("");
  const [selectedOperation, setSelectedOperation] = useState<OperationRow | null>(null);
  const first = useRef(true);
  const copy = getBusinessCopy(data.cafe.businessCategory);
  const consoleKind = copy.kind as ConsoleKind;
  const isEvents = consoleKind === "events";
  const cashierTitle = isEvents ? "بوابة الدخول" : "الكاشير";
  const consoleTitle = isEvents ? "بوابة الدخول" : "لوحة الكاشير";
  const languageTitle = isEvents ? "لغة بوابة الدخول" : "لغة الكاشير";
  const rewardTitle = isEvents ? "صرف مكافأة حضور" : "صرف مكافأة توثيق التجربة";
  const orderTitle = isEvents ? "استقبال طلبات التذاكر" : "استقبال الطلبات";
  const reservationTitle = isEvents ? "استقبال تسجيلات الحضور" : "استقبال الحجوزات";
  const checkinTitle = isEvents ? "تأكيد الحضور" : "تأكيد حضور الحجز";
  const reportTitle = isEvents ? "تقرير بوابة الدخول" : "تقرير الكاشير";

  const allOrderRecords = ((data.operationOrders ?? data.orders) as Row[]);
  const allReservationRecords = ((data.operationReservations ?? data.reservations) as Row[]);
  const pendingOrders = allOrderRecords.filter((row) => statusGroup(row) === "pending").length;
  const pendingReservations = allReservationRecords.filter((row) => statusGroup(row) === "pending").length;
  const pendingCount = pendingOrders + pendingReservations;

  const orderRows = useMemo(() => {
    return filterStatusRows(allOrderRecords, orderFilter);
  }, [allOrderRecords, orderFilter]);

  const reservationRows = useMemo(() => {
    return filterStatusRows(allReservationRecords, reservationFilter);
  }, [allReservationRecords, reservationFilter]);

  const operationRows = useMemo(() => {
    const query = operationSearch.trim().toLowerCase();
    return operationRowsFromData(data, consoleKind).filter((row) => {
      const filterMatches =
        operationFilter === "all" ||
        (operationFilter === "orders" && row.kind === "order") ||
        (operationFilter === "reservations" && row.kind === "reservation") ||
        (operationFilter === "tickets" && row.kind === "ticket") ||
        (operationFilter === "rewards" && row.kind === "reward") ||
        row.statusGroup === operationFilter;
      const searchMatches = !query || row.searchText.includes(query);
      return filterMatches && searchMatches;
    });
  }, [consoleKind, data, operationFilter, operationSearch]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (pendingCount > 0) playAlert();
  }, [pendingCount]);

  function closeModal() {
    setActiveModal(null);
  }

  function openOrderDetails(order: Row) {
    setSelectedOrder(order);
    setActiveModal("order-details");
  }

  function openReservationDetails(reservation: Row) {
    setSelectedReservation(reservation);
    setActiveModal("reservation-details");
  }

  function openOperationDetails(operation: OperationRow) {
    setSelectedOperation(operation);
    setActiveModal("operation-details");
  }

  function openTranslatedPage(languageCode: string) {
    if (typeof window === "undefined") return;
    const currentUrl = window.location.href;
    const host = window.location.hostname;
    const localHost = ["localhost", "127.0.0.1", "::1"].includes(host);
    if (localHost) {
      setLanguageHint("الترجمة تعمل بشكل أفضل على رابط عام أو دومين الإنتاج.");
    } else {
      setLanguageHint("");
    }
    const translateUrl = `https://translate.google.com/translate?sl=auto&tl=${languageCode}&u=${encodeURIComponent(currentUrl)}`;
    window.open(translateUrl, "_blank", "noopener,noreferrer");
    setLanguageMenuOpen(false);
  }

  function printOrder(order: Row) {
    printThermalReceipt({
      title: isEvents ? "شراء تذكرة" : "طلب منيو",
      cafeName: data.cafe.name,
      subtitle: isEvents ? "إيصال بوابة دخول" : "إيصال كاشير",
      lines: [
        { label: isEvents ? "رقم شراء التذاكر" : "رقم الطلب", value: valueOf(order, ["id"]) },
        { label: "نوع الطلب", value: orderKind(order, consoleKind), strong: true },
        { label: "اسم الطلب", value: orderName(order, consoleKind), strong: true },
        { label: "تفاصيل الطلب", value: orderDetails(order, consoleKind) },
        { label: "العميل", value: valueOf(order, ["customerName", "customer_name"], "عميل"), strong: true },
        { label: "الجوال", value: valueOf(order, ["customerPhone", "customer_phone", "phone"]) },
        { label: "الحالة", value: valueOf(order, ["status"]) },
        { label: "الفرع", value: valueOf(order, ["branchName", "branch_name"]) },
        { label: "الملاحظات", value: valueOf(order, ["notes"]) },
      ],
    });
  }

  function printReservationSlip(reservation: Row) {
    printThermalReceipt({
      title: isEvents ? "تذكرة دخول" : "طلب حجز",
      cafeName: data.cafe.name,
      subtitle: isEvents ? "إيصال بوابة دخول" : "إيصال كاشير",
      lines: [
        { label: isEvents ? "رقم التذكرة أو الحضور" : "رقم الحجز", value: valueOf(reservation, ["id"]) },
        { label: "العميل", value: valueOf(reservation, ["customerName", "customer_name"], "عميل"), strong: true },
        { label: "الجوال", value: valueOf(reservation, ["phone", "customerPhone", "customer_phone"]) },
        { label: isEvents ? "نوع الحضور" : "نوع الحجز", value: valueOf(reservation, ["eventType", "event_type"]) },
        { label: "التاريخ", value: valueOf(reservation, ["reservationDate", "reservation_date"]) },
        { label: "الوقت", value: valueOf(reservation, ["reservationTime", "reservation_time"]) },
        { label: isEvents ? "عدد الحضور" : "عدد الضيوف", value: valueOf(reservation, ["guests", "guestCount", "guest_count"]) },
        { label: isEvents ? "كود الدخول" : "كود الحضور", value: valueOf(reservation, ["reservationCode", "reservation_code"]) },
        { label: "ملاحظات", value: valueOf(reservation, ["notes"]) },
      ],
    });
  }

  function printCashierReport() {
    printThermalReceipt({
      title: reportTitle,
      cafeName: data.cafe.name,
      subtitle: data.cashier.fullName,
      lines: [
        { label: isEvents ? "طلبات تذاكر معلقة" : "طلبات معلقة", value: data.orders.length, strong: true },
        { label: isEvents ? "حضور معلق" : "حجوزات معلقة", value: data.reservations.length, strong: true },
        { label: "حركات مسجلة", value: data.logs.length },
        { label: "وقت الطباعة", value: new Date().toLocaleString("ar-SA") },
      ],
    });
  }

  function exportCashierReport(format: "pdf" | "excel") {
    const rows = [
      ...data.orders.map((item) => ({
        type: orderKind(item as Row, consoleKind),
        id: valueOf(item as Row, ["id"]),
        customer: valueOf(item as Row, ["customerName", "customer_name"]),
        order: orderName(item as Row, consoleKind),
        status: valueOf(item as Row, ["status"]),
      })),
      ...data.reservations.map((item) => ({
        type: isEvents ? "حضور" : "حجز",
        id: valueOf(item as Row, ["id"]),
        customer: valueOf(item as Row, ["customerName", "customer_name"]),
        status: valueOf(item as Row, ["status"]),
      })),
      ...data.logs.map((item) => ({
        type: "حركة",
        id: valueOf(item as Row, ["id"]),
        customer: valueOf(item as Row, ["actionType", "action_type"]),
        status: valueOf(item as Row, ["createdAt", "created_at"]),
      })),
    ];
    const columns = [
      { key: "type", title: "النوع" },
      { key: "id", title: "المعرف" },
      { key: "customer", title: "العميل/الإجراء" },
      { key: "order", title: "اسم الطلب" },
      { key: "status", title: "الحالة/التاريخ" },
    ];
    if (format === "pdf") exportRowsToPdf(reportTitle, rows, columns);
    else exportRowsToExcel(isEvents ? "entry-gate-report" : "cashier-report", rows, columns);
  }

  async function refreshConsole() {
    const next = await fetchCashierConsoleAction();
    if (next) setData(next);
  }

  function openCashierAction(target: CashierActionTarget) {
    setActionTarget(target);
    setActionMessage("");
    setProposedDate("");
    setProposedTime("");
  }

  async function acceptOrder(orderId: string) {
    setBusy(true);
    try {
      await updateCashierOrderStatusAction(orderId, "accepted");
      await refreshConsole();
      setMessage(isEvents ? "تم قبول طلب التذاكر" : "تم قبول الطلب");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : isEvents ? "تعذر قبول طلب التذاكر" : "تعذر قبول الطلب");
    } finally {
      setBusy(false);
    }
    return;
    setBusy(true);
    try {
      await acceptCashierOrderAction(orderId);
      setMessage(isEvents ? "تم استقبال شراء التذاكر وتسجيل حركة بوابة الدخول" : "تم استقبال الطلب وتسجيل حركة الكاشير");
      setData((current) => ({
        ...current,
        orders: current.orders.filter((order) => String(order.id) !== orderId),
        operationOrders: (current.operationOrders ?? current.orders).map((order) =>
          String(order.id) === orderId
            ? { ...order, status: "accepted", responded_at: new Date().toISOString() }
            : order,
        ),
      }));
    } catch {
      setMessage(isEvents ? "تعذر استقبال شراء التذاكر" : "تعذر استقبال الطلب");
    } finally {
      setBusy(false);
    }
  }

  async function acceptReservation(reservationId: string) {
    setBusy(true);
    try {
      await updateCashierReservationStatusAction(reservationId, "accepted");
      await refreshConsole();
      setMessage(isEvents ? "تم قبول التسجيل" : "تم قبول الحجز");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : isEvents ? "تعذر قبول التسجيل" : "تعذر قبول الحجز");
    } finally {
      setBusy(false);
    }
    return;
    setBusy(true);
    try {
      await acceptCashierReservationAction(reservationId);
      setMessage(isEvents ? "تم استقبال الحضور وتسجيل حركة بوابة الدخول" : "تم استقبال الحجز وتسجيل حركة الكاشير");
      setData((current) => ({
        ...current,
        reservations: current.reservations.filter((reservation) => String(reservation.id) !== reservationId),
        operationReservations: (current.operationReservations ?? current.reservations).map((reservation) =>
          String(reservation.id) === reservationId
            ? { ...reservation, status: "accepted", cashier_confirmed_at: new Date().toISOString() }
            : reservation,
        ),
      }));
    } catch {
      setMessage(isEvents ? "تعذر استقبال الحضور" : "تعذر استقبال الحجز");
    } finally {
      setBusy(false);
    }
  }

  async function rejectOrder(orderId: string, reason: string) {
    setBusy(true);
    try {
      await updateCashierOrderStatusAction(orderId, "rejected", reason);
      await refreshConsole();
      setMessage(isEvents ? "تم رفض طلب التذاكر" : "تم رفض الطلب");
      setActionTarget(null);
      setActionMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : isEvents ? "تعذر رفض طلب التذاكر" : "تعذر رفض الطلب");
    } finally {
      setBusy(false);
    }
  }

  async function rejectReservation(reservationId: string, reason: string) {
    setBusy(true);
    try {
      await updateCashierReservationStatusAction(reservationId, "rejected", reason);
      await refreshConsole();
      setMessage(isEvents ? "تم رفض التسجيل" : "تم رفض الحجز");
      setActionTarget(null);
      setActionMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : isEvents ? "تعذر رفض التسجيل" : "تعذر رفض الحجز");
    } finally {
      setBusy(false);
    }
  }

  async function proposeReservationTime(reservationId: string) {
    const parts = [
      proposedDate ? `التاريخ المقترح: ${proposedDate}` : "",
      proposedTime ? `الوقت المقترح: ${proposedTime}` : "",
      actionMessage.trim(),
    ].filter(Boolean);
    const messageText = parts.join(" - ");
    setBusy(true);
    try {
      await updateCashierReservationStatusAction(reservationId, "modification_requested", messageText);
      await refreshConsole();
      setMessage(isEvents ? "تم اقتراح وقت بديل للتسجيل" : "تم اقتراح وقت بديل للحجز");
      setActionTarget(null);
      setActionMessage("");
      setProposedDate("");
      setProposedTime("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : isEvents ? "تعذر اقتراح وقت بديل للتسجيل" : "تعذر اقتراح وقت بديل للحجز");
    } finally {
      setBusy(false);
    }
  }

  async function confirmReservation(codeInput?: string, ticketMode = false) {
    const rawCode = codeInput ?? (ticketMode ? ticketCode : reservationCode);
    if (!rawCode.trim()) {
      setMessage(isEvents ? "أدخل كود التذكرة أو اقرأ QR" : "أدخل كود الحجز أو اقرأ QR");
      return;
    }
    setBusy(true);
    if (ticketMode) {
      try {
        const parsedTicketCode =
          parseBarndaksaQrPayload(rawCode, "event-ticket") ??
          rawCode.trim().toUpperCase();
        const result = await confirmCashierTicketAction(parsedTicketCode);
        setTicketResult(result as Row);
        setTicketCode("");
        await refreshConsole();
        setMessage(`تم تأكيد دخول ${String(result.customerName ?? "العميل")} للتذكرة ${String(result.ticketName ?? "")}`);
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : "";
        const text =
          rawMessage.toLowerCase().includes("used")
            ? "تم استخدام هذه التذكرة سابقًا"
            : rawMessage.toLowerCase().includes("expired")
              ? "انتهت صلاحية هذه التذكرة"
              : rawMessage.toLowerCase().includes("cancelled")
                ? "هذه التذكرة ملغية"
                : "كود التذكرة غير صحيح أو غير قابل للدخول";
        setTicketResult({ status: text });
        setMessage(text);
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      const parsedReservationCode =
        parseBarndaksaQrPayload(rawCode, ticketMode ? "event-ticket" : "reservation") ??
        parseBarndaksaQrPayload(rawCode, "reservation") ??
        rawCode.trim().toUpperCase();
      const result = await confirmReservationCodeAction(parsedReservationCode);
      const next = result as Row;
      if (ticketMode) {
        setTicketResult(next);
        setTicketCode("");
      } else {
        setCheckinResult(next);
        setReservationCode("");
      }
      await refreshConsole();
      setMessage(
        isEvents
          ? `تم تأكيد دخول ${String(result.customerName ?? "العميل")} للفعالية`
          : `تم تأكيد حضور ${String(result.customerName ?? "العميل")} للحجز`,
      );
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "";
      const text =
        rawMessage.includes("مستخدم") || rawMessage.toLowerCase().includes("used")
          ? "تم استخدام هذا الكود سابقًا"
          : isEvents
            ? "كود التذكرة غير صحيح أو غير مقبول"
            : "كود الحجز غير صحيح أو الحجز غير مقبول";
      if (ticketMode) setTicketResult({ status: text });
      else setCheckinResult({ status: text });
      setMessage(text);
    } finally {
      setBusy(false);
    }
  }

  async function redeemExperienceReward(codeInput?: string) {
    const rawRewardCode = codeInput ?? experienceRewardCode;
    if (!rawRewardCode.trim()) {
      setMessage("أدخل QR مكافأة توثيق التجربة");
      return;
    }

    setBusy(true);
    try {
      const rewardCode =
        parseBarndaksaQrPayload(rawRewardCode, "experience-reward") ??
        rawRewardCode.trim().toUpperCase();
      const result = await cashierRedeemExperienceRewardAction(rewardCode);
      const items = Array.isArray(result.items)
        ? result.items
            .map((item) => `${String(item.productName ?? "")} × ${String(item.quantity ?? 1)}`)
            .join("، ")
        : "مكافأة";
      setRewardResult({ ...result, rewardItems: items, status: "تم الصرف" } as Row);
      setMessage(`تم صرف مكافأة توثيق التجربة للعميل ${String(result.customerName ?? "عميل")} — ${items}`);
      setExperienceRewardCode("");
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "";
      const text = rawMessage.includes("علامة تجارية أخرى")
        ? "هذه المكافأة تابعة لعلامة تجارية أخرى"
        : "QR مكافأة التوثيق غير صالح أو مستخدم مسبقًا أو منتهي الصلاحية";
      setRewardResult({ status: text });
      setMessage(text);
    } finally {
      setBusy(false);
    }
  }

  async function scanLoyalty(detectedCardCode?: string) {
    const rawCardCode = detectedCardCode ?? cardCode;
    if (!rawCardCode.trim()) {
      setMessage("أدخل QR بطاقة العميل");
      return;
    }
    setBusy(true);
    try {
      const parsedCardCode =
        parseBarndaksaQrPayload(rawCardCode, "loyalty-card") ??
        rawCardCode.trim().toUpperCase();
      const result = await cashierScanLoyaltyAction({
        cafeId: data.cafe.id,
        cardCode: parsedCardCode,
        operation: "stamp",
      });
      setLoyaltyResult({ ...result, cardCode: parsedCardCode } as Row);
      setMessage(`تم احتساب ${isEvents ? "حضور" : "عملية شراء"} للعميل ${String(result.customerName)} وإضافة ختم في بطاقة الولاء`);
      setCardCode("");
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "";
      const text = rawMessage.includes("علامة تجارية أخرى")
        ? "هذه البطاقة تابعة لعلامة تجارية أخرى"
        : "تعذر احتساب عملية الشراء من بطاقة الولاء";
      setLoyaltyResult({ status: text });
      setMessage(text);
    } finally {
      setBusy(false);
    }
  }

  const actions = [
    {
      key: "loyalty" as const,
      title: "قراءة بطاقة الولاء",
      description: isEvents ? "تسجيل حضور ولاء عبر QR" : "احتساب عملية شراء عبر QR",
      icon: ScanLine,
      count: 0,
    },
    {
      key: "reward" as const,
      title: rewardTitle,
      description: "صرف QR المكافأة المعتمدة",
      icon: Gift,
      count: 0,
    },
    {
      key: "orders" as const,
      title: orderTitle,
      description: isEvents ? "اعتماد طلبات شراء التذاكر" : "اعتماد الطلبات الواردة",
      icon: ShoppingBag,
      count: pendingOrders,
    },
    {
      key: "reservations" as const,
      title: reservationTitle,
      description: isEvents ? "متابعة التسجيلات والحضور" : "متابعة الحجوزات الحالية",
      icon: CalendarDays,
      count: pendingReservations,
    },
    {
      key: "checkin" as const,
      title: checkinTitle,
      description: "تأكيد كود أو QR صالح لمرة واحدة",
      icon: QrCode,
      count: 0,
    },
    ...(isEvents
      ? [
          {
            key: "ticket" as const,
            title: "مسح تذكرة",
            description: "تأكيد التذكرة أو دخول الحضور",
            icon: Ticket,
            count: pendingReservations,
          },
        ]
      : []),
  ];

  return (
    <main dir="rtl" className="min-h-screen bg-[#F8F4EF] px-4 py-6 text-[#311912] sm:py-8">
      <section className="mx-auto max-w-7xl">
        <header className="mb-5 rounded-[28px] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-black text-[#6B3A25]">{consoleTitle}</p>
              <h1 className="mt-1 text-3xl font-black">{data.cafe.name}</h1>
              <p className="mt-1 text-sm font-bold leading-7 text-[#806A5E]">
                {isEvents ? "تشغيل بوابة الدخول والتذاكر والحضور" : "تشغيل الطلبات والحجوزات والولاء"} — {data.cashier.fullName}
                {data.cashier.employeeNumber ? ` رقم ${data.cashier.employeeNumber}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={playAlert} className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white">
                <BellRing className="h-4 w-4" /> تنبيه
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setLanguageMenuOpen((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#F8F4EF] px-4 py-3 text-sm font-black text-[#311912]"
                >
                  <Languages className="h-4 w-4" /> {languageTitle} / Language
                </button>
                {languageMenuOpen ? (
                  <div className="absolute left-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-[#E7D7C6] bg-white p-2 text-right shadow-xl">
                    {translateLanguages.map((language) => (
                      <button
                        key={language.code}
                        type="button"
                        onClick={() => openTranslatedPage(language.code)}
                        className="block w-full rounded-xl px-3 py-2 text-right text-sm font-black text-[#311912] hover:bg-[#F8F4EF]"
                      >
                        {language.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button type="button" onClick={printCashierReport} className="inline-flex items-center gap-2 rounded-2xl bg-[#D9A33F] px-4 py-3 text-sm font-black text-[#311912]">
                <Printer className="h-4 w-4" /> طباعة تقرير
              </button>
              <button type="button" onClick={() => exportCashierReport("pdf")} className="inline-flex items-center gap-2 rounded-2xl bg-[#F8F4EF] px-4 py-3 text-sm font-black text-[#311912]">
                <FileSpreadsheet className="h-4 w-4" /> PDF
              </button>
              <button type="button" onClick={() => exportCashierReport("excel")} className="inline-flex items-center gap-2 rounded-2xl bg-[#F8F4EF] px-4 py-3 text-sm font-black text-[#311912]">
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </button>
              <form action={logoutCashierAction}>
                <button className="inline-flex items-center gap-2 rounded-2xl bg-[#311912] px-4 py-3 text-sm font-black text-white">
                  <LogOut className="h-4 w-4" /> خروج
                </button>
              </form>
            </div>
          </div>
          {languageHint ? (
            <p className="mt-3 rounded-2xl bg-[#FFF8EA] px-4 py-3 text-xs font-black text-[#6B3A25]">
              {languageHint}
            </p>
          ) : null}
        </header>

        <section className="mb-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-3xl bg-white p-4 shadow-sm">
            <p className="text-xs font-black text-[#806A5E]">{isEvents ? "طلبات تذاكر تحتاج استقبال" : "طلبات تحتاج استقبال"}</p>
            <p className="mt-1 text-3xl font-black text-[#6B3A25]">{pendingOrders}</p>
          </div>
          <div className="rounded-3xl bg-white p-4 shadow-sm">
            <p className="text-xs font-black text-[#806A5E]">{isEvents ? "حضور أو تسجيلات معلقة" : "حجوزات تحتاج استقبال"}</p>
            <p className="mt-1 text-3xl font-black text-[#6B3A25]">{pendingReservations}</p>
          </div>
          <div className="rounded-3xl bg-white p-4 shadow-sm">
            <p className="text-xs font-black text-[#806A5E]">حركة اليوم</p>
            <p className="mt-1 text-3xl font-black text-[#6B3A25]">{data.logs.length}</p>
          </div>
        </section>

        {pendingCount > 0 ? (
          <div className="mb-5 rounded-3xl border border-red-200 bg-red-50 p-4 font-black text-red-700">
            يوجد {pendingCount} إجراء تشغيلي يحتاج متابعة الآن.
          </div>
        ) : null}
        {message ? (
          <div className="mb-5 rounded-2xl bg-[#FFF8EA] p-4 font-black text-[#6B3A25]">
            {message}
          </div>
        ) : null}

        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                onClick={() => setActiveModal(action.key)}
                className="group flex min-h-36 flex-col items-start justify-between rounded-[28px] border border-[#E7D7C6] bg-white p-5 text-right shadow-sm transition hover:-translate-y-0.5 hover:border-[#D9A33F] hover:shadow-xl"
              >
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#4A281D] text-white transition group-hover:bg-[#D9A33F] group-hover:text-[#311912]">
                    <Icon className="h-6 w-6" />
                  </span>
                  {action.count ? <StatusPill>{action.count}</StatusPill> : null}
                </div>
                <div>
                  <h2 className="text-xl font-black text-[#311912]">{action.title}</h2>
                  <p className="mt-2 text-sm font-bold leading-6 text-[#806A5E]">{action.description}</p>
                </div>
              </button>
            );
          })}
        </section>

        <OperationLogSection
          title={isEvents ? "سجل بوابة الدخول والطلبات" : "سجل العمليات العام"}
          rows={operationRows}
          filter={operationFilter}
          onFilterChange={setOperationFilter}
          search={operationSearch}
          onSearchChange={setOperationSearch}
          onDetails={openOperationDetails}
        />

        <section className="grid gap-5 xl:grid-cols-2">
          <RecentTable
            title={isEvents ? "سجل آخر طلبات التذاكر" : "سجل آخر الطلبات"}
            rows={allOrderRecords}
            isEvents={isEvents}
            consoleKind={consoleKind}
            type="orders"
            emptyText={isEvents ? "لا توجد طلبات تذاكر حالية" : "لا توجد طلبات حالية"}
            onDetails={openOrderDetails}
            onAction={(row, action) => {
              const id = valueOf(row, ["id"], "");
              if (action === "accept") void acceptOrder(id);
              if (action === "reject") openCashierAction({ type: "order", id, action: "reject", row });
            }}
          />
          <RecentTable
            title={isEvents ? "سجل آخر الحضور والتسجيلات" : "سجل آخر الحجوزات"}
            rows={allReservationRecords}
            isEvents={isEvents}
            consoleKind={consoleKind}
            type="reservations"
            emptyText={isEvents ? "لا توجد تسجيلات حضور حالية" : "لا توجد حجوزات حالية"}
            onDetails={openReservationDetails}
            onAction={(row, action) => {
              const id = valueOf(row, ["id"], "");
              if (action === "accept") void acceptReservation(id);
              if (action === "reject") openCashierAction({ type: "reservation", id, action: "reject", row });
              if (action === "modify") openCashierAction({ type: "reservation", id, action: "modify", row });
              if (action === "confirm") void confirmReservation(valueOf(row, ["reservationCode", "reservation_code", "code"], ""));
            }}
          />
        </section>
      </section>

      <Modal open={activeModal === "loyalty"} title="قراءة بطاقة الولاء / QR" onClose={closeModal}>
        <ScannerForm
          inputValue={cardCode}
          onInputChange={setCardCode}
          placeholder="QR بطاقة العميل أو الكود"
          scannerLabel="قراءة QR بطاقة العميل"
          expectedKind="loyalty-card"
          busy={busy}
          buttonLabel={isEvents ? "احتساب حضور" : "احتساب عملية شراء"}
          onSubmit={() => void scanLoyalty()}
          onDetected={(value) => {
            setCardCode(value.toUpperCase());
            void scanLoyalty(value);
          }}
        />
        <ResultPanel
          title="نتيجة القراءة"
          result={loyaltyResult}
          entries={[
            ["اسم العميل", valueOf(loyaltyResult, ["customerName", "customer_name"])],
            ["البطاقة", valueOf(loyaltyResult, ["cardCode", "card_code"])],
            ["التقدم الحالي", valueOf(loyaltyResult, ["stampsAfter", "stamps_after", "progress"], "-")],
            ["المكافأة", valueOf(loyaltyResult, ["rewardName", "reward_name", "reward"], "-")],
            ["الحالة", valueOf(loyaltyResult, ["status"], message || "-")],
          ]}
        />
      </Modal>

      <Modal open={activeModal === "reward"} title={rewardTitle} onClose={closeModal}>
        <ScannerForm
          inputValue={experienceRewardCode}
          onInputChange={setExperienceRewardCode}
          placeholder={isEvents ? "QR مكافأة الحضور أو الكود" : "QR مكافأة التوثيق أو الكود"}
          scannerLabel="قراءة QR المكافأة"
          expectedKind="experience-reward"
          busy={busy}
          buttonLabel="صرف المكافأة"
          onSubmit={() => void redeemExperienceReward()}
          onDetected={(value) => {
            setExperienceRewardCode(value.toUpperCase());
            void redeemExperienceReward(value);
          }}
        />
        <ResultPanel
          title="نتيجة الصرف"
          result={rewardResult}
          entries={[
            ["اسم العميل", valueOf(rewardResult, ["customerName", "customer_name"])],
            ["اسم المكافأة", valueOf(rewardResult, ["rewardItems", "rewardName", "reward_name"], "-")],
            ["حالة الصرف", valueOf(rewardResult, ["status"], message || "-")],
          ]}
        />
      </Modal>

      <Modal open={activeModal === "orders"} title={orderTitle} onClose={closeModal}>
        <FilterTabs value={orderFilter} onChange={setOrderFilter} />
        <OperationsTable
          rows={orderRows}
          isEvents={isEvents}
          consoleKind={consoleKind}
          type="orders"
          emptyText={orderFilter === "completed" ? "لا توجد طلبات مكتملة في مصدر الكاشير الحالي" : "لا توجد طلبات"}
          onDetails={openOrderDetails}
          onAction={(row, action) => {
            const id = valueOf(row, ["id"], "");
            if (action === "accept") void acceptOrder(id);
            if (action === "reject") openCashierAction({ type: "order", id, action: "reject", row });
          }}
        />
      </Modal>

      <Modal open={activeModal === "reservations"} title={reservationTitle} onClose={closeModal}>
        <FilterTabs value={reservationFilter} onChange={setReservationFilter} />
        <OperationsTable
          rows={reservationRows}
          isEvents={isEvents}
          consoleKind={consoleKind}
          type="reservations"
          emptyText={reservationFilter === "completed" ? "لا توجد حجوزات مكتملة في مصدر الكاشير الحالي" : "لا توجد حجوزات"}
          onDetails={openReservationDetails}
          onAction={(row, action) => {
            const id = valueOf(row, ["id"], "");
            if (action === "accept") void acceptReservation(id);
            if (action === "reject") openCashierAction({ type: "reservation", id, action: "reject", row });
            if (action === "modify") openCashierAction({ type: "reservation", id, action: "modify", row });
            if (action === "confirm") void confirmReservation(valueOf(row, ["reservationCode", "reservation_code", "code"], ""));
          }}
        />
      </Modal>

      <Modal open={activeModal === "checkin"} title={checkinTitle} onClose={closeModal}>
        <ScannerForm
          inputValue={reservationCode}
          onInputChange={setReservationCode}
          placeholder={isEvents ? "كود الحضور أو QR" : "كود الحجز أو QR"}
          scannerLabel={isEvents ? "قراءة QR الحضور" : "قراءة QR الحجز"}
          expectedKind="reservation"
          busy={busy}
          buttonLabel="تأكيد الحضور"
          onSubmit={() => void confirmReservation()}
          onDetected={(value) => {
            setReservationCode(value.toUpperCase());
            void confirmReservation(value);
          }}
        />
        <ResultPanel
          title="نتيجة التأكيد"
          result={checkinResult}
          entries={[
            ["اسم العميل", valueOf(checkinResult, ["customerName", "customer_name"])],
            ["الحالة", valueOf(checkinResult, ["status"], message || "-")],
            ["رقم الحجز", valueOf(checkinResult, ["reservationId", "reservation_id", "id"], "-")],
          ]}
        />
      </Modal>

      <Modal open={activeModal === "ticket"} title="تأكيد تذكرة / مسح تذكرة" onClose={closeModal}>
        <ScannerForm
          inputValue={ticketCode}
          onInputChange={setTicketCode}
          placeholder="كود التذكرة أو QR الحضور"
          scannerLabel="قراءة QR التذكرة"
          expectedKind="event-ticket"
          busy={busy}
          buttonLabel="تأكيد الدخول"
          onSubmit={() => void confirmReservation(undefined, true)}
          onDetected={(value) => {
            setTicketCode(value.toUpperCase());
            void confirmReservation(value, true);
          }}
        />
        <ResultPanel
          title="بيانات التذكرة"
          result={ticketResult}
          entries={[
            ["اسم العميل", valueOf(ticketResult, ["customerName", "customer_name"])],
            ["حالة التذكرة", valueOf(ticketResult, ["status"], message || "-")],
            ["رقم التذكرة", valueOf(ticketResult, ["reservationId", "reservation_id", "ticketId", "ticket_id", "id"], "-")],
          ]}
        />
      </Modal>

      <Modal open={activeModal === "order-details"} title="تفاصيل الطلب" onClose={closeModal}>
        {selectedOrder ? (
          <>
            <FieldGrid entries={detailEntries(selectedOrder, false, consoleKind)} />
            <ItemsPanel row={selectedOrder} kind={consoleKind} />
            <div className="mt-5">
              <CashierRowActions
                row={selectedOrder}
                type="orders"
                isEvents={isEvents}
                onAction={(action) => {
                  const id = valueOf(selectedOrder, ["id"], "");
                  if (action === "accept") void acceptOrder(id);
                  if (action === "reject") openCashierAction({ type: "order", id, action: "reject", row: selectedOrder });
                }}
              />
            </div>
          </>
        ) : null}
      </Modal>

      <Modal open={activeModal === "reservation-details"} title="تفاصيل الحجز" onClose={closeModal}>
        {selectedReservation ? (
          <>
            <FieldGrid entries={detailEntries(selectedReservation, true, consoleKind)} />
            <div className="mt-5">
              <CashierRowActions
                row={selectedReservation}
                type="reservations"
                isEvents={isEvents}
                onAction={(action) => {
                  const id = valueOf(selectedReservation, ["id"], "");
                  if (action === "accept") void acceptReservation(id);
                  if (action === "reject") openCashierAction({ type: "reservation", id, action: "reject", row: selectedReservation });
                  if (action === "modify") openCashierAction({ type: "reservation", id, action: "modify", row: selectedReservation });
                  if (action === "confirm") void confirmReservation(valueOf(selectedReservation, ["reservationCode", "reservation_code", "code"], ""));
                }}
              />
            </div>
          </>
        ) : null}
      </Modal>

      <Modal open={activeModal === "operation-details"} title="تفاصيل العملية" onClose={closeModal}>
        {selectedOperation ? (
          <OperationDetails operation={selectedOperation} consoleKind={consoleKind} />
        ) : null}
      </Modal>

      <Modal
        open={Boolean(actionTarget)}
        title={actionTarget?.action === "modify" ? "اقتراح وقت بديل" : "تأكيد الإجراء"}
        onClose={() => setActionTarget(null)}
      >
        {actionTarget ? (
          <div className="grid gap-4">
            <FieldGrid
              entries={[
                ["العميل", valueOf(actionTarget.row, ["customerName", "customer_name"], "عميل")],
                ["الحالة الحالية", statusLabel(actionTarget.row)],
                ["العملية", actionTarget.type === "order" ? orderName(actionTarget.row, consoleKind) : reservationSummary(actionTarget.row, isEvents)],
              ]}
            />
            {actionTarget.action === "modify" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-black text-[#6B3A25]">
                  التاريخ المقترح
                  <input
                    type="date"
                    value={proposedDate}
                    onChange={(event) => setProposedDate(event.target.value)}
                    className="min-h-12 rounded-2xl bg-[#F8F4EF] px-4 text-[#311912] outline-none"
                  />
                </label>
                <label className="grid gap-2 text-sm font-black text-[#6B3A25]">
                  الوقت المقترح
                  <input
                    type="time"
                    value={proposedTime}
                    onChange={(event) => setProposedTime(event.target.value)}
                    className="min-h-12 rounded-2xl bg-[#F8F4EF] px-4 text-[#311912] outline-none"
                  />
                </label>
              </div>
            ) : null}
            <label className="grid gap-2 text-sm font-black text-[#6B3A25]">
              {actionTarget.action === "reject" ? "سبب الرفض" : "رسالة للعميل"}
              <textarea
                value={actionMessage}
                onChange={(event) => setActionMessage(event.target.value)}
                rows={4}
                className="resize-none rounded-2xl bg-[#F8F4EF] px-4 py-3 text-[#311912] outline-none"
                placeholder={actionTarget.action === "modify" ? "مثال: نقدر نستقبلكم في الموعد المقترح بدل الموعد الحالي" : "اكتب رسالة واضحة للعميل"}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (actionTarget.type === "order" && actionTarget.action === "reject") {
                    void rejectOrder(actionTarget.id, actionMessage);
                  }
                  if (actionTarget.type === "reservation" && actionTarget.action === "reject") {
                    void rejectReservation(actionTarget.id, actionMessage);
                  }
                  if (actionTarget.type === "reservation" && actionTarget.action === "modify") {
                    void proposeReservationTime(actionTarget.id);
                  }
                }}
                className="rounded-2xl bg-[#4A281D] px-5 py-3 font-black text-white disabled:opacity-60"
              >
                تأكيد
              </button>
              <button
                type="button"
                onClick={() => setActionTarget(null)}
                className="rounded-2xl bg-[#F8F4EF] px-5 py-3 font-black text-[#6B3A25]"
              >
                إلغاء
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </main>
  );
}

function FilterTabs({
  value,
  onChange,
}: {
  value: StatusTableFilter;
  onChange: (value: StatusTableFilter) => void;
}) {
  const tabs: Array<{ id: StatusTableFilter; label: string }> = [
    { id: "pending", label: "تحتاج إجراء" },
    { id: "all", label: "كل السجل" },
    { id: "accepted", label: "المقبولة" },
    { id: "rejected", label: "المرفوضة" },
    { id: "completed", label: "المكتملة" },
  ];
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded-2xl px-4 py-2 text-sm font-black ${
            value === tab.id ? "bg-[#4A281D] text-white" : "bg-[#F8F4EF] text-[#6B3A25]"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function ScannerForm({
  inputValue,
  onInputChange,
  placeholder,
  scannerLabel,
  expectedKind,
  busy,
  buttonLabel,
  onSubmit,
  onDetected,
}: {
  inputValue: string;
  onInputChange: (value: string) => void;
  placeholder: string;
  scannerLabel: string;
  expectedKind: "loyalty-card" | "experience-reward" | "reservation" | "event-ticket";
  busy: boolean;
  buttonLabel: string;
  onSubmit: () => void;
  onDetected: (value: string) => void;
}) {
  return (
    <div className="grid gap-4 rounded-3xl border border-[#E7D7C6] bg-white p-4 sm:grid-cols-[1fr_auto]">
      <input
        className="min-h-12 rounded-2xl bg-[#F8F4EF] px-4 font-bold text-[#311912] outline-none"
        placeholder={placeholder}
        value={inputValue}
        onChange={(event) => onInputChange(event.target.value.toUpperCase())}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#4A281D] px-5 font-black text-white disabled:opacity-60"
      >
        <BadgeCheck className="h-4 w-4" />
        {busy ? "جاري التنفيذ" : buttonLabel}
      </button>
      <div className="sm:col-span-2">
        <BarcodeCameraScanner label={scannerLabel} expectedKind={expectedKind} onDetected={onDetected} />
      </div>
    </div>
  );
}

function ResultPanel({
  title,
  result,
  entries,
}: {
  title: string;
  result: Row | null;
  entries: Array<[string, string]>;
}) {
  return (
    <div className="mt-5 rounded-3xl bg-[#FCF8F3] p-4">
      <h3 className="flex items-center gap-2 text-lg font-black text-[#311912]">
        <CheckCircle2 className="h-5 w-5 text-[#6B3A25]" />
        {title}
      </h3>
      {result ? (
        <div className="mt-4">
          <FieldGrid entries={entries} />
        </div>
      ) : (
        <p className="mt-3 font-bold text-[#806A5E]">لم يتم تنفيذ العملية بعد.</p>
      )}
    </div>
  );
}

function OperationsTable({
  rows,
  isEvents,
  consoleKind,
  type,
  emptyText,
  onDetails,
  onAction,
}: {
  rows: Row[];
  isEvents: boolean;
  consoleKind: ConsoleKind;
  type: "orders" | "reservations";
  emptyText: string;
  onDetails: (row: Row) => void;
  onAction: (row: Row, action: "accept" | "reject" | "modify" | "confirm") => void;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-3xl border border-dashed border-[#E7D7C6] p-8 text-center font-bold text-[#806A5E]">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-3xl border border-[#E7D7C6]">
      <table className="w-full min-w-[980px] text-right text-sm">
        <thead className="bg-[#F8F4EF] text-[#6B3A25]">
          <tr>
            <th className="p-3">التاريخ</th>
            <th className="p-3">الوقت</th>
            <th className="p-3">العميل</th>
            <th className="p-3">الجوال</th>
            <th className="p-3">الإيميل</th>
            {type === "orders" ? (
              <>
                <th className="p-3">نوع الطلب</th>
                <th className="p-3">اسم الطلب / العنصر</th>
                <th className="p-3">تفاصيل الطلب</th>
              </>
            ) : (
              <>
                <th className="p-3">النوع</th>
                <th className="p-3">الأشخاص</th>
                <th className="p-3">التفاصيل</th>
              </>
            )}
            <th className="p-3">الحالة</th>
            {type === "orders" ? <th className="p-3">المبلغ</th> : null}
            <th className="p-3">الإجراء</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const when = type === "orders"
              ? rowDateTime(row, ["createdAt", "created_at"], [])
              : rowDateTime(row, ["reservationDate", "reservation_date"], ["reservationTime", "reservation_time"]);
            return (
              <tr
                key={valueOf(row, ["id"])}
                className="cursor-pointer border-t border-[#EFE8DF] bg-white hover:bg-[#FCF8F3]"
                onClick={() => onDetails(row)}
              >
                <td className="p-3 font-bold">{when.date}</td>
                <td className="p-3 font-bold">{when.time}</td>
                <td className="p-3 font-black">{valueOf(row, ["customerName", "customer_name"], "عميل")}</td>
                <td className="p-3">{valueOf(row, ["customerPhone", "customer_phone", "phone"])}</td>
                <td className="p-3">{valueOf(row, ["customerEmail", "customer_email", "email"])}</td>
                {type === "orders" ? (
                  <>
                    <td className="p-3 font-black text-[#6B3A25]">{orderKind(row, consoleKind)}</td>
                    <td className="max-w-[190px] truncate p-3 font-black">{orderName(row, consoleKind)}</td>
                    <td className="max-w-[260px] truncate p-3">{orderDetails(row, consoleKind)}</td>
                  </>
                ) : (
                  <>
                    <td className="p-3">{valueOf(row, ["eventType", "event_type", "type"], isEvents ? "حضور" : "حجز")}</td>
                    <td className="p-3">{valueOf(row, ["guests", "guestCount", "guest_count"])}</td>
                    <td className="max-w-[220px] truncate p-3">{valueOf(row, ["notes", "description", "details"], isEvents ? "حضور" : "حجز")}</td>
                  </>
                )}
                <td className="p-3"><StatusPill>{valueOf(row, ["status"])}</StatusPill></td>
                {type === "orders" ? <td className="p-3">{amountOf(row)}</td> : null}
                <td className="p-3">
                  <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                    <button type="button" onClick={() => onDetails(row)} className="rounded-xl bg-[#F8F4EF] px-3 py-2 text-xs font-black text-[#6B3A25]">
                      التفاصيل
                    </button>
                    <CashierRowActions row={row} type={type} isEvents={isEvents} onAction={(action) => onAction(row, action)} />
                    <button type="button" className="hidden" aria-hidden="true" tabIndex={-1}>
                      {type === "orders" ? "استقبال" : "تأكيد"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CashierRowActions({
  row,
  type,
  isEvents,
  onAction,
}: {
  row: Row;
  type: "orders" | "reservations";
  isEvents: boolean;
  onAction: (action: "accept" | "reject" | "modify" | "confirm") => void;
}) {
  const isPending = canRespond(row);
  const showConfirm = type === "reservations" && canConfirmReservation(row);

  if (!isPending && !showConfirm) {
    return (
      <span className="rounded-xl bg-[#FCF8F3] px-3 py-2 text-xs font-black text-[#806A5E]">
        لا يوجد إجراء متاح
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {isPending ? (
        <>
          <button
            type="button"
            onClick={() => onAction("accept")}
            className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700"
          >
            {type === "orders" ? (isEvents ? "قبول طلب التذاكر" : "قبول الطلب") : isEvents ? "قبول التسجيل" : "قبول الحجز"}
          </button>
          <button
            type="button"
            onClick={() => onAction("reject")}
            className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-700"
          >
            {type === "orders" ? (isEvents ? "رفض طلب التذاكر" : "رفض الطلب") : isEvents ? "رفض التسجيل" : "رفض الحجز"}
          </button>
          {type === "reservations" ? (
            <button
              type="button"
              onClick={() => onAction("modify")}
              className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700"
            >
              اقتراح وقت بديل
            </button>
          ) : null}
        </>
      ) : null}
      {showConfirm ? (
        <button
          type="button"
          onClick={() => onAction("confirm")}
          className="rounded-xl bg-[#4A281D] px-3 py-2 text-xs font-black text-white"
        >
          {isEvents ? "تأكيد الدخول" : "تأكيد الحضور"}
        </button>
      ) : null}
    </div>
  );
}

function RecentTable(props: {
  title: string;
  rows: Row[];
  isEvents: boolean;
  consoleKind: ConsoleKind;
  type: "orders" | "reservations";
  emptyText: string;
  onDetails: (row: Row) => void;
  onAction: (row: Row, action: "accept" | "reject" | "modify" | "confirm") => void;
}) {
  return (
    <section className="rounded-[28px] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-black text-[#311912]">{props.title}</h2>
        <StatusPill>{props.rows.length}</StatusPill>
      </div>
      <OperationsTable {...props} />
    </section>
  );
}

function OperationStatusBadge({ row }: { row: OperationRow }) {
  const styles: Record<OperationRow["statusGroup"], string> = {
    accepted: "bg-emerald-50 text-emerald-700",
    rejected: "bg-red-50 text-red-700",
    completed: "bg-blue-50 text-blue-700",
    pending: "bg-amber-50 text-amber-700",
    other: "bg-[#F8F4EF] text-[#6B3A25]",
  };
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${styles[row.statusGroup]}`}>
      {row.status}
    </span>
  );
}

function OperationLogSection({
  title,
  rows,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  onDetails,
}: {
  title: string;
  rows: OperationRow[];
  filter: OperationFilter;
  onFilterChange: (filter: OperationFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onDetails: (row: OperationRow) => void;
}) {
  return (
    <section className="mb-6 rounded-[28px] bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-black text-[#311912]">{title}</h2>
          <p className="mt-1 text-sm font-bold text-[#806A5E]">كل العمليات المهمة في مكان واحد.</p>
        </div>
        <StatusPill>{rows.length}</StatusPill>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto]">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="بحث بالاسم أو الجوال أو البريد أو رقم الطلب أو اسم المنتج"
          className="min-h-12 rounded-2xl bg-[#F8F4EF] px-4 font-bold text-[#311912] outline-none"
        />
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
          {operationFilters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onFilterChange(item.id)}
              className={`shrink-0 rounded-2xl px-4 py-2 text-sm font-black ${
                filter === item.id ? "bg-[#4A281D] text-white" : "bg-[#F8F4EF] text-[#6B3A25]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length ? (
        <>
          <div className="hidden overflow-x-auto rounded-3xl border border-[#E7D7C6] lg:block">
            <table className="w-full min-w-[1120px] text-right text-sm">
              <thead className="bg-[#F8F4EF] text-[#6B3A25]">
                <tr>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">الوقت</th>
                  <th className="p-3">نوع العملية</th>
                  <th className="p-3">اسم الطلب أو الحجز أو التذكرة</th>
                  <th className="p-3">اسم العميل</th>
                  <th className="p-3">رقم الجوال</th>
                  <th className="p-3">البريد الإلكتروني</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3">التفاصيل المختصرة</th>
                  <th className="p-3">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.key}
                    onClick={() => onDetails(row)}
                    className="cursor-pointer border-t border-[#EFE8DF] bg-white hover:bg-[#FCF8F3]"
                  >
                    <td className="p-3 font-bold">{row.date}</td>
                    <td className="p-3 font-bold">{row.time}</td>
                    <td className="p-3 font-black text-[#6B3A25]">{row.operationType}</td>
                    <td className="max-w-[180px] truncate p-3 font-black">{row.title}</td>
                    <td className="p-3">{row.customerName}</td>
                    <td className="p-3">{row.phone}</td>
                    <td className="max-w-[190px] truncate p-3">{row.email}</td>
                    <td className="p-3"><OperationStatusBadge row={row} /></td>
                    <td className="max-w-[260px] truncate p-3">{row.summary}</td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDetails(row);
                        }}
                        className="rounded-xl bg-[#F8F4EF] px-3 py-2 text-xs font-black text-[#6B3A25]"
                      >
                        عرض التفاصيل
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:hidden">
            {rows.map((row) => (
              <button
                key={row.key}
                type="button"
                onClick={() => onDetails(row)}
                className="rounded-3xl border border-[#E7D7C6] bg-[#FCF8F3] p-4 text-right"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-[#806A5E]">{row.date} - {row.time}</p>
                    <h3 className="mt-1 text-lg font-black text-[#311912]">{row.title}</h3>
                    <p className="mt-1 text-sm font-bold text-[#6B3A25]">{row.operationType}</p>
                  </div>
                  <OperationStatusBadge row={row} />
                </div>
                <p className="mt-3 text-sm font-bold leading-6 text-[#806A5E]">{row.summary}</p>
                <p className="mt-2 text-sm font-black text-[#311912]">{row.customerName} - {row.phone}</p>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-3xl border border-dashed border-[#E7D7C6] p-8 text-center font-bold text-[#806A5E]">
          لا توجد عمليات مطابقة.
        </div>
      )}
    </section>
  );
}

function OperationDetails({
  operation,
  consoleKind,
}: {
  operation: OperationRow;
  consoleKind: ConsoleKind;
}) {
  if (operation.kind === "order") {
    return (
      <>
        <FieldGrid entries={detailEntries(operation.raw, false, consoleKind)} />
        <ItemsPanel row={operation.raw} kind={consoleKind} />
      </>
    );
  }

  if (operation.kind === "reservation") {
    const row = operation.raw;
    const created = rowDateTime(row, ["createdAt", "created_at"], []);
    const scheduled = rowDateTime(row, ["reservationDate", "reservation_date", "date"], ["reservationTime", "reservation_time", "time"]);
    return (
      <FieldGrid
        entries={[
          ["رقم الحجز", valueOf(row, ["id"])],
          ["تاريخ الإنشاء", created.date],
          ["وقت الإنشاء", created.time],
          ["اسم العميل", valueOf(row, ["customerName", "customer_name"])],
          ["الجوال", valueOf(row, ["customerPhone", "customer_phone", "phone"])],
          ["البريد", valueOf(row, ["customerEmail", "customer_email", "email"])],
          ["نوع الحجز", valueOf(row, ["eventType", "event_type", "type"])],
          ["موعد الحجز", `${scheduled.date} ${scheduled.time}`],
          ["عدد الأشخاص", valueOf(row, ["guests", "guestCount", "guest_count", "people"])],
          ["الخدمة أو المكان", reservationName(row, consoleKind === "events")],
          ["الملاحظات", valueOf(row, ["notes"])],
          ["الحالة", statusLabel(row)],
          ["كود أو QR الحجز", valueOf(row, ["reservationCode", "reservation_code", "code"])],
        ]}
      />
    );
  }

  if (operation.kind === "ticket") {
    const row = operation.raw;
    const used = rowDateTime(row, ["usedAt", "used_at"], []);
    return (
      <FieldGrid
        entries={[
          ["رقم التذكرة", valueOf(row, ["id", "ticketCode", "ticket_code"])],
          ["نوع التذكرة", valueOf(row, ["ticketType", "ticket_type", "type"], "تذكرة")],
          ["اسم التذكرة أو الباقة", ticketName(row)],
          ["العميل", valueOf(row, ["customerName", "customer_name"])],
          ["الجوال", valueOf(row, ["customerPhone", "customer_phone", "phone"])],
          ["البريد", valueOf(row, ["customerEmail", "customer_email", "email"])],
          ["حالة التذكرة", statusLabel(row)],
          ["وقت الاستخدام", used.date === "-" ? "-" : `${used.date} ${used.time}`],
          ["البوابة", valueOf(row, ["usedGateName", "used_gate_name", "gateName", "gate_name"])],
        ]}
      />
    );
  }

  const row = operation.raw;
  return (
    <FieldGrid
      entries={[
        ["رقم المكافأة", valueOf(row, ["id", "rewardCode", "reward_code"])],
        ["اسم المكافأة", rewardItemsText(row)],
        ["العميل", valueOf(row, ["customerName", "customer_name"])],
        ["الجوال", valueOf(row, ["customerPhone", "customer_phone", "phone"])],
        ["البريد", valueOf(row, ["customerEmail", "customer_email", "email"])],
        ["الحالة", statusLabel(row)],
        ["وقت الصرف", valueOf(row, ["usedAt", "used_at"])],
        ["ملاحظات المراجعة", valueOf(row, ["reviewNotes", "review_notes"])],
      ]}
    />
  );
}

function ItemsPanel({ row, kind }: { row: Row; kind: ConsoleKind }) {
  const items = orderItems(row, kind);
  const isEvents = kind === "events";
  return (
    <div className="mt-5 rounded-3xl bg-[#FCF8F3] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-black text-[#311912]">
          {isEvents ? "التذاكر أو الباقات" : "المنتجات أو العناصر"}
        </h3>
        <StatusPill>الإجمالي النهائي {amountOf(row)}</StatusPill>
      </div>
      {items.length ? (
        <div className="grid gap-2">
          {items.map((item, index) => {
            return (
              <div key={`${item.id}-${index}`} className="rounded-2xl bg-white p-3 text-sm font-bold">
                <div className="grid gap-2 md:grid-cols-6">
                  <span className="font-black">{item.name}</span>
                  <span>التصنيف {item.type}</span>
                  <span>الكمية {item.quantity}</span>
                  <span>السعر {item.price}</span>
                  <span>الإجمالي الجزئي {item.total}</span>
                  <span>ملاحظات {item.notes}</span>
                </div>
                <div className="mt-2 grid gap-2 rounded-xl bg-[#F8F4EF] p-2 text-xs text-[#806A5E] md:grid-cols-2">
                  <span>الإضافات {item.additions}</span>
                  <span>الخيارات {item.options}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="font-bold text-[#806A5E]">{shortDetails(row, kind)}</p>
      )}
    </div>
  );
}
