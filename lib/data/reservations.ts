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
import { createNotification } from "@/lib/data/notifications";

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
};

function cleanText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function cleanEmail(value: unknown) {
  const email = cleanText(value).toLowerCase();
  return email.includes("@") ? email : undefined;
}

function htmlRow(label: string, value: unknown) {
  const text = cleanText(value, "-");
  return `<tr><td style="padding:10px 12px;color:#806A5E;font-weight:800;border-bottom:1px solid #E7D7C6;white-space:nowrap">${escapeEmailHtml(label)}</td><td style="padding:10px 12px;color:#311912;font-weight:900;border-bottom:1px solid #E7D7C6">${escapeEmailHtml(text)}</td></tr>`;
}

function buildReservationEmailHtml(details: ReservationEmailDetails) {
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
        <p style="margin:0;color:#D9A33F;font-weight:900;font-size:13px">برندة | Barndaksa</p>
        <h2 style="margin:8px 0 0;font-size:24px">${escapeEmailHtml(details.title)}</h2>
      </div>
      <div style="padding:22px">
        <p style="margin:0 0 18px;line-height:1.9;font-weight:800;color:#806A5E">${escapeEmailHtml(details.intro)}</p>
        <table style="width:100%;border-collapse:collapse;background:#FCF8F3;border-radius:18px;overflow:hidden">${rows}</table>
        <p style="margin:18px 0 0;color:#806A5E;font-size:12px;line-height:1.8">هذه رسالة آلية من منصة برندة. الرجاء عدم مشاركة كود الحجز إلا عند الوصول للفرع.</p>
      </div>
    </div>
  </div>`;
}

function buildReservationEmailText(details: ReservationEmailDetails) {
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
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendReservationEmailSafely(input: {
  to?: string;
  subject: string;
  details: ReservationEmailDetails;
  replyTo?: string;
}) {
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
  supabase: Awaited<ReturnType<typeof createClient>>,
  cafeId: string,
): Promise<ReservationEmailBrand> {
  const { data } = await supabase
    .from("cafe_settings")
    .select("owner_email, owner_name, owner_phone")
    .eq("cafe_id", cafeId)
    .maybeSingle();

  return {
    email: cleanEmail(data?.owner_email),
    ownerName: cleanText(data?.owner_name),
    ownerPhone: cleanText(data?.owner_phone),
  };
}

async function getReservationCustomerContact(
  supabase: Awaited<ReturnType<typeof createClient>>,
  customerId: string,
): Promise<ReservationEmailCustomer> {
  const { data } = await supabase
    .from("customer_profiles")
    .select("email, full_name, phone")
    .eq("id", customerId)
    .maybeSingle();

  return {
    email: cleanEmail(data?.email),
    fullName: cleanText(data?.full_name),
    phone: cleanText(data?.phone),
  };
}

function rowReservationDetails(
  cafeName: string,
  row: Record<string, unknown>,
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
  return (data ?? []).map((row) => {
    const cafe = row.cafes as Record<string, unknown> | null;
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
) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  if (status === "بانتظار الرد") {
    throw new Error("Invalid reservation status transition");
  }

  const message = (cafeMessage ?? rejectionReason)?.trim() || null;
  const { error } = await supabase.rpc("respond_to_reservation", {
    p_reservation_id: reservationId,
    p_status: mapReservationStatusToDb(status),
    p_message: message,
  });

  if (error) throw error;

  const { data: row } = await supabase
    .from("reservations")
    .select("*")
    .eq("id", reservationId)
    .maybeSingle();

  const reservationRow = (row ?? {}) as Record<string, unknown>;
  const customerId = cleanText(reservationRow.customer_id);
  const customer = customerId
    ? await getReservationCustomerContact(supabase, customerId)
    : {};

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

  await sendReservationEmailSafely({
    to: customer.email,
    subject: title,
    replyTo: (await getReservationBrandContact(supabase, cafe.id)).email,
    details: rowReservationDetails(cafe.name, reservationRow, {
      title,
      intro,
      status,
      customerName:
        customer.fullName || cleanText(reservationRow.customer_name),
      customerPhone: customer.phone || cleanText(reservationRow.phone),
      customerEmail: customer.email,
      message: message ?? undefined,
    }),
  });
}

export async function confirmOwnerReservationCode(codeInput: string) {
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

  const row = reservation as Record<string, unknown>;
  if (row.reservation_code_used_at)
    throw new Error("تم استخدام كود الحجز مسبقًا");

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("reservations")
    .update({
      reservation_code_used_at: now,
      cashier_confirmed_at: now,
      updated_at: now,
    })
    .eq("id", String(row.id))
    .eq("cafe_id", cafe.id)
    .is("reservation_code_used_at", null);

  if (updateError) throw updateError;

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
) {
  const parsed = createReservationSchema.parse(input);
  await assertCustomerIdMatchesSession(parsed.cafeSlug, parsed.customerId);
  const cafe = await getCafeBySlug(parsed.cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  const supabase = await createClient();
  const { data: reservationId, error } = await supabase.rpc(
    "create_customer_reservation_v2",
    {
      p_cafe_id: cafe.id,
      p_reservation_service_id: parsed.serviceId ?? null,
      p_event_type: parsed.type,
      p_guests: parsed.guests,
      p_reservation_date: parsed.date,
      p_reservation_time: parsed.time,
      p_duration_minutes: parsed.durationMinutes ?? null,
      p_branch_name: parsed.branchName ?? null,
      p_space_type: parsed.spaceType ?? null,
      p_event_title: parsed.eventTitle ?? null,
      p_needs_decoration: parsed.needsDecoration ?? false,
      p_needs_catering: parsed.needsCatering ?? false,
      p_budget_estimate: parsed.budgetEstimate ?? null,
      p_notes: parsed.notes ?? null,
    },
  );

  if (error) throw error;

  const id = String(reservationId);

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
