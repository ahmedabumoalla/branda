import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCafeBySlug,
  requireOwnerCafeContext,
  requirePlatformAdmin,
} from "@/lib/data/cafes";
import { assertCustomerIdMatchesSession } from "@/lib/data/customers";
import {
  mapDbReservationToCafeReservation,
  mapReservationStatusToDb,
} from "@/lib/data/mappers";
import type {
  CafeReservation,
  ReservationStatus,
} from "@/lib/mock/reservations";
import {
  escapeEmailHtml,
  isBarndaksaEmailConfigured,
  sendBarndaksaEmail,
} from "@/lib/email/resend";
import { parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import {
  resolvePublishedStoragePathToUrl,
  storageBucketForLogo,
} from "@/lib/storage/resolve-storage-url";
import { createNotification } from "@/lib/data/notifications";
import {
  normalizeWhatsAppPhone,
  sendWhatsAppMessage,
} from "@/lib/notifications/whatsapp";

export type AdminReservationMonitorItem = CafeReservation & {
  cafeId: string;
  cafeName: string;
  cafeSlug: string;
  pendingMinutes: number;
};

type ReservationEmailCustomer = {
  email?: string;
  fullName?: string;
  phone?: string;
};

type ReservationEmailBrand = {
  email?: string;
  ownerName?: string;
  ownerPhone?: string;
  logoUrl?: string;
};

type ReservationDbClient = Pick<ReturnType<typeof createAdminClient>, "from">;

type ReservationServiceRow = {
  id: string;
  name: string;
  price: number | null;
  max_guests: number | null;
};

type ReservationEmailDetails = {
  cafeName: string;
  title: string;
  intro: string;
  status?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  reservationType?: string;
  date?: string;
  time?: string;
  guests?: string | number;
  branchName?: string;
  notes?: string;
  message?: string;
  reservationCode?: string;
  logoUrl?: string;
  actionHref?: string;
  actionLabel?: string;
};

type DbRow = Record<string, unknown>;

type ReservationRow = DbRow & {
  id?: string | null;
  cafe_id?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  phone?: string | null;
  event_type?: string | null;
  reservation_date?: string | null;
  reservation_time?: string | null;
  reservation_code?: string | null;
  branch_name?: string | null;
  status?: string | null;
};

type AdminReservationRow = ReservationRow & {
  cafes?: DbRow | DbRow[] | null;
};

type ReservationBrandContactRow = {
  owner_email?: string | null;
  owner_name?: string | null;
  owner_phone?: string | null;
  logo_url?: string | null;
  logo_storage_path?: string | null;
};

type ReservationCustomerContactRow = {
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
};

type ReservationBranchRow = {
  address?: string | null;
};

export type ConfirmOwnerReservationCodeResult = {
  ok: true;
  reservationId: string;
  customerName: string;
  eventType: string;
  date: string;
  time: string;
};

function cleanText(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function cleanEmail(value: unknown): string | undefined {
  const email = cleanText(value).toLowerCase();
  return email.includes("@") ? email : undefined;
}

function reservationDateTime(row: DbRow): string {
  return [cleanText(row.reservation_date), cleanText(row.reservation_time)]
    .filter(Boolean)
    .join(" ") || "-";
}

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

function confirmedReservationsUrl(slug: string): string {
  return `${appBaseUrl()}/c/${encodeURIComponent(slug)}/reserve?view=my-reservations&status=accepted`;
}

function htmlRow(label: string, value: unknown): string {
  const text = cleanText(value, "-");
  return `<tr><td style="padding:10px 12px;color:#806A5E;font-weight:800;border-bottom:1px solid #E7D7C6;white-space:nowrap">${escapeEmailHtml(label)}</td><td style="padding:10px 12px;color:#311912;font-weight:900;border-bottom:1px solid #E7D7C6">${escapeEmailHtml(text)}</td></tr>`;
}

function buildReservationEmailHtml(details: ReservationEmailDetails): string {
  const logoHtml = details.logoUrl
    ? `<img src="${escapeEmailHtml(details.logoUrl)}" alt="${escapeEmailHtml(details.cafeName)}" style="width:64px;height:64px;border-radius:18px;background:#FCF8F3;object-fit:contain;padding:8px;margin-bottom:12px" />`
    : `<div style="width:64px;height:64px;border-radius:18px;background:#FCF8F3;color:#4A281D;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:24px;margin-bottom:12px">${escapeEmailHtml(details.cafeName.slice(0, 1) || "B")}</div>`;
  const actionHtml = details.actionHref
    ? `<p style="margin:20px 0 0"><a href="${escapeEmailHtml(details.actionHref)}" style="display:inline-block;background:#6B3A25;color:#FCF8F3;text-decoration:none;padding:12px 18px;border-radius:14px;font-weight:900">${escapeEmailHtml(details.actionLabel ?? "فتح الحجوزات")}</a></p>`
    : "";
  const rows = [
    htmlRow("العلامة التجارية", details.cafeName),
    details.status ? htmlRow("الحالة", details.status) : "",
    htmlRow("نوع الحجز", details.reservationType),
    htmlRow("التاريخ", details.date),
    htmlRow("الوقت", details.time),
    htmlRow("عدد الأشخاص", details.guests),
    details.branchName ? htmlRow("الفرع", details.branchName) : "",
    details.customerName ? htmlRow("اسم العميل", details.customerName) : "",
    details.customerPhone ? htmlRow("جوال العميل", details.customerPhone) : "",
    details.customerEmail ? htmlRow("إيميل العميل", details.customerEmail) : "",
    details.reservationCode
      ? htmlRow("كود تأكيد الحجز", details.reservationCode)
      : "",
    details.notes ? htmlRow("ملاحظات العميل", details.notes) : "",
    details.message ? htmlRow("رسالة العلامة", details.message) : "",
  ]
    .filter(Boolean)
    .join("");

  return `<div dir="rtl" style="font-family:Arial,Tahoma,sans-serif;background:#FCF8F3;padding:24px;color:#311912">
    <div style="max-width:620px;margin:auto;background:#fff;border:1px solid #E7D7C6;border-radius:24px;overflow:hidden">
      <div style="background:#4A281D;color:#FCF8F3;padding:22px">
        ${logoHtml}
        <p style="margin:0;color:#D9A33F;font-weight:900;font-size:13px">برندة | Barndaksa</p>
        <h2 style="margin:8px 0 0;font-size:24px">${escapeEmailHtml(details.title)}</h2>
      </div>
      <div style="padding:22px">
        <p style="margin:0 0 18px;line-height:1.9;font-weight:800;color:#806A5E">${escapeEmailHtml(details.intro)}</p>
        <table style="width:100%;border-collapse:collapse;background:#FCF8F3;border-radius:18px;overflow:hidden">${rows}</table>
        ${actionHtml}
        <p style="margin:18px 0 0;color:#806A5E;font-size:12px;line-height:1.8">هذه رسالة آلية من منصة برندة. الرجاء عدم مشاركة كود الحجز إلا عند الوصول للفرع.</p>
      </div>
    </div>
  </div>`;
}

function buildReservationEmailText(details: ReservationEmailDetails): string {
  return [
    details.title,
    details.intro,
    `العلامة التجارية: ${details.cafeName}`,
    details.status ? `الحالة: ${details.status}` : "",
    `نوع الحجز: ${cleanText(details.reservationType, "-")}`,
    `التاريخ: ${cleanText(details.date, "-")}`,
    `الوقت: ${cleanText(details.time, "-")}`,
    `عدد الأشخاص: ${cleanText(details.guests, "-")}`,
    details.branchName ? `الفرع: ${details.branchName}` : "",
    details.customerName ? `اسم العميل: ${details.customerName}` : "",
    details.customerPhone ? `جوال العميل: ${details.customerPhone}` : "",
    details.reservationCode ? `كود الحجز: ${details.reservationCode}` : "",
    details.notes ? `ملاحظات العميل: ${details.notes}` : "",
    details.message ? `رسالة العلامة: ${details.message}` : "",
    details.actionHref ? `${details.actionLabel ?? "رابط الحجوزات"}: ${details.actionHref}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendReservationEmailSafely(input: {
  to?: string;
  subject: string;
  details: ReservationEmailDetails;
  replyTo?: string;
}): Promise<void> {
  if (!input.to || !isBarndaksaEmailConfigured()) return;
  await sendBarndaksaEmail({
    to: input.to,
    subject: input.subject,
    text: buildReservationEmailText(input.details),
    html: buildReservationEmailHtml(input.details),
    replyTo: input.replyTo,
  }).catch((error) => {
    console.error("[reservation-email]", error);
  });
}

async function getReservationBrandContact(
  supabase: ReservationDbClient,
  cafeId: string,
): Promise<ReservationEmailBrand> {
  const { data } = await supabase
    .from("cafe_settings")
    .select("owner_email, owner_name, owner_phone, logo_url, logo_storage_path")
    .eq("cafe_id", cafeId)
    .maybeSingle();

  const row = data as ReservationBrandContactRow | null;
  const logoUrl =
    row?.logo_storage_path
      ? await resolvePublishedStoragePathToUrl(
          storageBucketForLogo(),
          String(row.logo_storage_path),
        )
      : cleanText(row?.logo_url);

  return {
    email: cleanEmail(row?.owner_email),
    ownerName: cleanText(row?.owner_name),
    ownerPhone: cleanText(row?.owner_phone),
    logoUrl: logoUrl || undefined,
  };
}

async function getReservationCustomerContact(
  supabase: ReservationDbClient,
  customerId: string,
): Promise<ReservationEmailCustomer> {
  const { data } = await supabase
    .from("customer_profiles")
    .select("email, full_name, phone")
    .eq("id", customerId)
    .maybeSingle();
  const row = data as ReservationCustomerContactRow | null;

  return {
    email: cleanEmail(row?.email),
    fullName: cleanText(row?.full_name),
    phone: cleanText(row?.phone),
  };
}

function rowReservationDetails(
  cafeName: string,
  row: DbRow,
  overrides: Partial<ReservationEmailDetails> = {},
): ReservationEmailDetails {
  return {
    cafeName,
    title: overrides.title ?? "تحديث على حجزك",
    intro: overrides.intro ?? "تم تحديث طلب الحجز من العلامة التجارية.",
    status: overrides.status,
    customerName: overrides.customerName ?? cleanText(row.customer_name),
    customerPhone: overrides.customerPhone ?? cleanText(row.phone),
    customerEmail: overrides.customerEmail,
    reservationType:
      overrides.reservationType ?? cleanText(row.event_type, "حجز"),
    date: overrides.date ?? cleanText(row.reservation_date),
    time: overrides.time ?? cleanText(row.reservation_time),
    guests: overrides.guests ?? cleanText(row.guests),
    branchName: overrides.branchName ?? cleanText(row.branch_name),
    notes: overrides.notes ?? cleanText(row.notes),
    message: overrides.message,
    reservationCode:
      overrides.reservationCode ?? cleanText(row.reservation_code),
  };
}

function buildAcceptedReservationWhatsApp(input: {
  cafeName: string;
  cafeSlug: string;
  row: DbRow;
  customer: ReservationEmailCustomer;
  branchAddress?: string;
  message?: string | null;
}): string {
  const row = input.row;
  const reservationCode = cleanText(
    row.reservation_code,
    String(row.id ?? "").slice(0, 8).toUpperCase(),
  );
  const reservationLink = confirmedReservationsUrl(input.cafeSlug);
  const notes = cleanText(row.notes, "-");
  const duration = cleanText(row.duration_minutes);

  return [
    `مرحبا ${input.customer.fullName || cleanText(row.customer_name, "عميلنا العزيز")}`,
    `يسعدنا في ${input.cafeName} تأكيد قبول حجزك بنجاح ✅`,
    "نشكرك لثقتك ونتطلع لاستقبالك.",
    "",
    "بيانات الحجز:",
    `رقم الحجز: ${reservationCode}`,
    `نوع الحجز: ${cleanText(row.event_type, "حجز")}`,
    `التاريخ: ${cleanText(row.reservation_date, "-")}`,
    `الوقت: ${cleanText(row.reservation_time, "-")}`,
    `عدد الأشخاص: ${cleanText(row.guests, "-")}`,
    duration ? `المدة: ${duration} دقيقة` : "",
    `الفرع: ${cleanText(row.branch_name, "-")}`,
    `العنوان: ${input.branchAddress || "-"}`,
    "",
    "ملاحظات الحجز:",
    notes,
    input.message ? `\nرسالة العلامة:\n${input.message}` : "",
    "",
    "يرجى إبراز رمز الحجز QR عند الوصول لتسهيل إجراءات الاستقبال 🌷",
    `رابط الحجز والـ QR: ${reservationLink}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function getOwnerReservations(): Promise<CafeReservation[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("cafe_id", cafe.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapDbReservationToCafeReservation);
}

export async function getAdminReservationMonitor(): Promise<
  AdminReservationMonitorItem[]
> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("*, cafes(id, name, slug)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw error;
  const now = Date.now();
  return ((data ?? []) as AdminReservationRow[]).map((row) => {
    const cafeRaw = Array.isArray(row.cafes) ? row.cafes[0] : row.cafes;
    const cafe = cafeRaw as DbRow | null;
    const reservation = mapDbReservationToCafeReservation(
      row as Record<string, unknown>,
    );
    return {
      ...reservation,
      cafeId: String(cafe?.id ?? row.cafe_id ?? ""),
      cafeName: String(cafe?.name ?? "علامة غير معروفة"),
      cafeSlug: String(cafe?.slug ?? ""),
      pendingMinutes:
        reservation.status === "بانتظار الرد"
          ? Math.max(
              0,
              Math.floor(
                (now - new Date(reservation.createdAt).getTime()) / 60000,
              ),
            )
          : 0,
    };
  });
}

export async function updateReservationStatus(
  reservationId: string,
  status: ReservationStatus,
  cafeMessage?: string,
  rejectionReason?: string,
): Promise<void> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  if (status === "بانتظار الرد") {
    throw new Error("Invalid reservation status transition");
  }

  const dbStatus = mapReservationStatusToDb(status);
  const message = (cafeMessage ?? rejectionReason)?.trim() || null;
  const { error } = await supabase.rpc("respond_to_reservation", {
    p_reservation_id: reservationId,
    p_status: dbStatus,
    p_message: message,
  });

  if (error) throw error;

  const { data: row } = await supabase
    .from("reservations")
    .select("*")
    .eq("id", reservationId)
    .maybeSingle();

  const reservationRow = (row ?? {}) as ReservationRow;
  const customerId = cleanText(reservationRow.customer_id);
  const customer = customerId
    ? await getReservationCustomerContact(supabase, customerId)
    : {};
  const { data: reservationBranchData } = reservationRow.branch_name
    ? await supabase
        .from("branches")
        .select("address")
        .eq("cafe_id", cafe.id)
        .eq("name", String(reservationRow.branch_name))
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle()
    : { data: null };
  const reservationBranch = reservationBranchData as ReservationBranchRow | null;
  const customerPhone = normalizeWhatsAppPhone(
    customer.phone || cleanText(reservationRow.phone),
  );
  if (customerPhone) {
    const reservationCode = cleanText(
      reservationRow.reservation_code,
      reservationId.slice(0, 8).toUpperCase(),
    );
    const body =
      dbStatus === "accepted"
        ? `تم تأكيد حجزك لدى ${cafe.name}\nالموعد: ${reservationDateTime(
            reservationRow,
          )}\nرقم الحجز: ${reservationCode}`
        : dbStatus === "rejected"
          ? `تم رفض حجزك لدى ${cafe.name}${
              message ? `\nالسبب إن وجد: ${message}` : ""
            }`
          : `لدى ${cafe.name} اقتراح وقت بديل لحجزك\nالوقت المقترح: ${
              message ?? "-"
            }\nرقم الحجز: ${reservationCode}`;

    const detailedBody =
      dbStatus === "accepted"
        ? buildAcceptedReservationWhatsApp({
            cafeName: cafe.name,
            cafeSlug: cafe.slug,
            row: reservationRow,
            customer,
            branchAddress: cleanText(reservationBranch?.address),
            message,
          })
        : body;

    await sendWhatsAppMessage({
      to: customerPhone,
      body: detailedBody,
      eventType:
        dbStatus === "accepted"
          ? "reservation_accepted"
          : dbStatus === "rejected"
            ? "reservation_rejected"
            : "reservation_alternative_time",
      cafeId: cafe.id,
      recipientName:
        customer.fullName || cleanText(reservationRow.customer_name),
    }).catch(() => undefined);
  }

  if (customerId) {
    await createNotification({
      cafeSlug: cafe.slug,
      audience: "customer",
      customerId,
      title:
        status === "مقبول"
          ? "تم قبول حجزك"
          : status === "مرفوض"
            ? "تم رفض حجزك"
            : "اقتراح تعديل على حجزك",
      body: message || `تم تحديث حالة حجزك إلى ${status}`,
      type:
        status === "مقبول" ? "reservation_accepted" : "reservation_rejected",
      meta: {
        reservationId: String(reservationId),
        status: String(status),
        message: message ?? "",
      },
    }).catch(() => undefined);
  }

  const title =
    status === "مقبول"
      ? `تم قبول حجزك في ${cafe.name}`
      : status === "مرفوض"
        ? `تم رفض حجزك في ${cafe.name}`
        : `اقتراح تعديل على حجزك في ${cafe.name}`;

  const intro =
    status === "مقبول"
      ? "تمت الموافقة على طلب الحجز. ستجد أدناه نفس تفاصيل الحجز المعتمدة، ويمكنك إبراز كود الحجز عند الوصول."
      : status === "مرفوض"
        ? message
          ? `تم رفض طلب الحجز من العلامة التجارية، والسبب: ${message}`
          : "تم رفض طلب الحجز من العلامة التجارية."
        : message
          ? `طلبت العلامة التجارية تعديل الحجز: ${message}`
          : "طلبت العلامة التجارية تعديل بعض تفاصيل الحجز.";

  const brand = await getReservationBrandContact(supabase, cafe.id);

  await sendReservationEmailSafely({
    to: customer.email,
    subject: title,
    replyTo: brand.email,
    details: rowReservationDetails(cafe.name, reservationRow, {
      title,
      intro,
      status,
      customerName:
        customer.fullName || cleanText(reservationRow.customer_name),
      customerPhone: customer.phone || cleanText(reservationRow.phone),
      customerEmail: customer.email,
      message: message ?? undefined,
      logoUrl: brand.logoUrl,
      actionHref:
        status === "مقبول" ? confirmedReservationsUrl(cafe.slug) : undefined,
      actionLabel:
        status === "مقبول" ? "عرض الحجوزات المؤكدة والـ QR" : undefined,
    }),
  });
}

export async function confirmOwnerReservationCode(
  codeInput: string,
): Promise<ConfirmOwnerReservationCodeResult> {
  const cafe = await requireOwnerCafeContext();
  const code =
    parseBarndaksaQrPayload(codeInput, "reservation") ??
    codeInput.trim().toUpperCase();
  if (!code) throw new Error("كود الحجز مطلوب");

  const admin = createAdminClient();
  const { data: reservation, error } = await admin
    .from("reservations")
    .select("*, customer_profiles(email, full_name)")
    .eq("cafe_id", cafe.id)
    .eq("reservation_code", code)
    .eq("status", "accepted")
    .maybeSingle();

  if (error) throw error;
  if (!reservation) throw new Error("كود الحجز غير صالح أو الحجز غير مقبول");

  const row = reservation as ReservationRow & {
    customer_profiles?: DbRow | DbRow[] | null;
    reservation_code_used_at?: string | null;
  };
  if (row.reservation_code_used_at)
    throw new Error("تم استخدام كود الحجز مسبقًا");

  const now = new Date().toISOString();
  const { data: updatedReservation, error: updateError } = await admin
    .from("reservations")
    .update({
      reservation_code_used_at: now,
      cashier_confirmed_at: now,
      updated_at: now,
    })
    .eq("id", String(row.id))
    .eq("cafe_id", cafe.id)
    .is("reservation_code_used_at", null)
    .select("id")
    .maybeSingle();

  if (updateError) throw updateError;
  if (!updatedReservation) throw new Error("تم استخدام هذا الكود سابقًا");

  try {
    await admin.from("reservation_checkins").insert({
      cafe_id: cafe.id,
      reservation_id: String(row.id),
      cashier_id: null,
      code,
      details: {
        source: "dashboard",
        customerName: String(row.customer_name ?? "عميل"),
        eventType: String(row.event_type ?? "حجز"),
        guests: Number(row.guests ?? 0),
        date: String(row.reservation_date ?? ""),
        time: String(row.reservation_time ?? ""),
      },
    });
  } catch {
    // check-in may already exist if another device confirmed it first
  }

  if (row.customer_id) {
    await createNotification({
      cafeSlug: cafe.slug,
      audience: "customer",
      customerId: String(row.customer_id),
      title: "تم تأكيد حضور الحجز",
      body: `تم تأكيد حضور حجزك ${String(row.event_type ?? "")} بنجاح`,
      type: "reservation_accepted",
      meta: { reservationId: String(row.id), code: String(code) },
    }).catch(() => undefined);
  }

  const customerRaw = Array.isArray(row.customer_profiles)
    ? row.customer_profiles[0]
    : row.customer_profiles;
  const customer =
    customerRaw && typeof customerRaw === "object"
      ? (customerRaw as Record<string, unknown>)
      : null;
  const customerEmail = customer?.email ? String(customer.email) : undefined;
  if (customerEmail && isBarndaksaEmailConfigured()) {
    await sendBarndaksaEmail({
      to: customerEmail,
      subject: "تم تأكيد حضور حجزك",
      text: `تم تأكيد حضور حجزك في ${cafe.name}.`,
      html: `<div dir="rtl"><h2>تم تأكيد حضور الحجز</h2><p>العلامة: ${escapeEmailHtml(cafe.name)}</p><p>نوع الحجز: ${escapeEmailHtml(String(row.event_type ?? "حجز"))}</p><p>التاريخ: ${escapeEmailHtml(String(row.reservation_date ?? ""))} ${escapeEmailHtml(String(row.reservation_time ?? ""))}</p></div>`,
    }).catch(() => undefined);
  }

  return {
    ok: true,
    reservationId: String(row.id),
    customerName: String(row.customer_name ?? "عميل"),
    eventType: String(row.event_type ?? "حجز"),
    date: String(row.reservation_date ?? ""),
    time: String(row.reservation_time ?? ""),
  };
}

const createReservationSchema = z.object({
  cafeSlug: z.string(),
  customerId: z.string().uuid(),
  serviceId: z.string().uuid().optional(),
  type: z.string(),
  guests: z.number().int().positive().max(500),
  date: z.string(),
  time: z.string(),
  durationMinutes: z.number().int().positive().optional(),
  branchName: z.string().optional(),
  spaceType: z.string().optional(),
  eventTitle: z.string().optional(),
  needsDecoration: z.boolean().optional(),
  needsCatering: z.boolean().optional(),
  budgetEstimate: z.number().optional(),
  notes: z.string().optional(),
});

export async function createReservation(
  input: z.infer<typeof createReservationSchema>,
): Promise<string> {
  const parsed = createReservationSchema.parse(input);
  await assertCustomerIdMatchesSession(parsed.cafeSlug, parsed.customerId);
  const cafe = await getCafeBySlug(parsed.cafeSlug);
  if (!cafe) throw new Error("Cafe not found");
  if (cafe.status !== "active" || cafe.is_public !== true) {
    throw new Error("Cafe is not available");
  }

  if (parsed.date < new Date().toISOString().slice(0, 10)) {
    throw new Error("Reservation date cannot be in the past");
  }
  if (
    parsed.durationMinutes !== undefined &&
    (parsed.durationMinutes < 15 || parsed.durationMinutes > 1440 * 14)
  ) {
    throw new Error("Invalid duration");
  }
  if (parsed.type.trim().length > 200) {
    throw new Error("Event type too long");
  }
  if (parsed.notes && parsed.notes.trim().length > 500) {
    throw new Error("Notes too long");
  }

  const supabase = createAdminClient();
  const { data: profile, error: profileError } = await supabase
    .from("customer_profiles")
    .select("id, full_name, phone")
    .eq("id", parsed.customerId)
    .eq("cafe_id", cafe.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) throw new Error("Customer profile not found");

  let service: ReservationServiceRow | null = null;

  if (parsed.serviceId) {
    const { data: serviceRow, error: serviceError } = await supabase
      .from("reservation_services")
      .select("id, name, price, max_guests")
      .eq("id", parsed.serviceId)
      .eq("cafe_id", cafe.id)
      .eq("active", true)
      .maybeSingle();

    if (serviceError) throw serviceError;
    if (!serviceRow) throw new Error("Reservation service not found");
    service = serviceRow as ReservationServiceRow;

    if (service?.max_guests && parsed.guests > service.max_guests) {
      throw new Error("Guests exceed capacity");
    }
  }

  const { data: reservation, error } = await supabase
    .from("reservations")
    .insert({
      cafe_id: cafe.id,
      customer_id: parsed.customerId,
      customer_name: String(profile.full_name ?? ""),
      phone: String(profile.phone ?? ""),
      event_type: parsed.type.trim() || service?.name || "حجز",
      guests: parsed.guests,
      reservation_date: parsed.date,
      reservation_time: parsed.time,
      duration_minutes: parsed.durationMinutes ?? null,
      branch_name: parsed.branchName?.trim() || null,
      space_type: parsed.spaceType?.trim() || null,
      event_title: parsed.eventTitle?.trim() || null,
      needs_decoration: parsed.needsDecoration ?? false,
      needs_catering: parsed.needsCatering ?? false,
      budget_estimate: parsed.budgetEstimate ?? null,
      notes: parsed.notes?.trim() || null,
      status: "pending",
      reservation_service_id: parsed.serviceId ?? null,
      reservation_service_name: service?.name ?? null,
      reservation_price: service?.price ?? null,
    })
    .select("id")
    .single();

  if (error) throw error;

  const id = String(reservation.id);

  await createNotification({
    cafeSlug: cafe.slug,
    audience: "cafe",
    title: "حجز جديد",
    body: `وصل حجز جديد من عميل للنوع ${parsed.type} بتاريخ ${parsed.date} الساعة ${parsed.time}`,
    type: "new_reservation",
    meta: {
      reservationId: id,
      type: parsed.type,
      date: parsed.date,
      time: parsed.time,
    },
  }).catch(() => undefined);

  await createNotification({
    cafeSlug: cafe.slug,
    audience: "customer",
    customerId: parsed.customerId,
    title: "تم إرسال طلب الحجز",
    body: `تم إرسال طلب حجزك إلى ${cafe.name} وفي انتظار الرد`,
    type: "new_reservation",
    meta: {
      reservationId: id,
      type: parsed.type,
      date: parsed.date,
      time: parsed.time,
    },
  }).catch(() => undefined);

  const [brand, customerFromDb] = await Promise.all([
    getReservationBrandContact(supabase, cafe.id),
    getReservationCustomerContact(supabase, parsed.customerId),
  ]);

  const customerName = customerFromDb.fullName || "عميل";
  const customerPhone = customerFromDb.phone || "";
  const customerEmail = customerFromDb.email;

  const details: ReservationEmailDetails = {
    cafeName: cafe.name,
    title: "تم إرسال طلب الحجز",
    intro: `تم إرسال طلب الحجز إلى ${cafe.name}، وسيصلك الرد بعد مراجعة العلامة التجارية.`,
    status: "بانتظار الرد",
    customerName,
    customerPhone,
    customerEmail,
    reservationType: parsed.type,
    date: parsed.date,
    time: parsed.time,
    guests: parsed.guests,
    branchName: parsed.branchName,
    notes: parsed.notes,
    logoUrl: brand.logoUrl,
    actionHref: confirmedReservationsUrl(cafe.slug),
    actionLabel: "متابعة حجوزاتي",
  };

  await Promise.all([
    sendReservationEmailSafely({
      to: customerEmail,
      subject: `تم إرسال طلب حجزك إلى ${cafe.name}`,
      replyTo: brand.email,
      details,
    }),
    sendReservationEmailSafely({
      to: brand.email,
      subject: "حجز جديد وصل للعلامة عبر برندة",
      replyTo: customerEmail,
      details: {
        ...details,
        title: "حجز جديد بانتظار مراجعتك",
        intro:
          "وصل طلب حجز جديد من عميل عبر صفحة الفرع الإلكتروني. راجع التفاصيل ثم وافق أو ارفض من لوحة التحكم.",
      },
    }),
  ]);

  return id;
}
