import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import { requireCustomerProfileForSession } from "@/lib/data/customers";
import { createNotification } from "@/lib/data/notifications";
import { getCashierToken } from "@/lib/data/cashier";
import { parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import {
  escapeEmailHtml,
  isBarndaksaEmailConfigured,
  sendBarndaksaEmail,
} from "@/lib/email/resend";

export type ExperienceRewardStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "redeemed";

export type ExperienceRewardItem = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
};

export type CustomerExperienceReward = {
  id: string;
  experienceUrl: string;
  currentViews: number;
  currentComments: number;
  customerNotes: string;
  status: ExperienceRewardStatus;
  reviewNotes: string;
  rewardCode: string;
  rewardExpiresAt: string;
  approvedAt: string;
  rejectedAt: string;
  usedAt: string;
  createdAt: string;
  items: ExperienceRewardItem[];
};

export type OwnerExperienceRewardSubmission = CustomerExperienceReward & {
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerCreatedAt: string;
  orderCount: number;
  orderTotal: number;
  loyaltyEventsCount: number;
  previousSubmissionsCount: number;
};

function makeRewardCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "EXP-";
  for (let i = 0; i < 10; i += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
}

function normalizeRewardItems(rows: unknown): ExperienceRewardItem[] {
  const list = Array.isArray(rows) ? rows : [];
  return list.map((row) => {
    const item = row as Record<string, unknown>;
    return {
      id: String(item.id ?? ""),
      productId: String(item.product_id ?? ""),
      productName: String(item.product_name ?? ""),
      quantity: Number(item.quantity ?? 1),
    };
  });
}

function normalizeSubmission(
  row: Record<string, unknown>,
): CustomerExperienceReward {
  return {
    id: String(row.id),
    experienceUrl: String(row.experience_url ?? ""),
    currentViews: Number(row.current_views ?? 0),
    currentComments: Number(row.current_comments ?? 0),
    customerNotes: String(row.customer_notes ?? ""),
    status: String(row.status ?? "pending") as ExperienceRewardStatus,
    reviewNotes: String(row.review_notes ?? ""),
    rewardCode: String(row.reward_code ?? ""),
    rewardExpiresAt: String(row.reward_expires_at ?? ""),
    approvedAt: String(row.approved_at ?? ""),
    rejectedAt: String(row.rejected_at ?? ""),
    usedAt: String(row.used_at ?? ""),
    createdAt: String(row.created_at ?? ""),
    items: normalizeRewardItems(row.experience_reward_items),
  };
}

const customerSubmissionSchema = z.object({
  cafeSlug: z.string().min(1),
  experienceUrl: z.string().url(),
  currentViews: z.number().int().min(0).max(100000000),
  currentComments: z.number().int().min(0).max(100000000).default(0),
  customerNotes: z.string().max(1000).optional(),
});

export async function submitCustomerExperienceRewardProof(
  input: z.infer<typeof customerSubmissionSchema>,
) {
  const parsed = customerSubmissionSchema.parse(input);
  const { profile } = await requireCustomerProfileForSession(parsed.cafeSlug);
  const cafe = await getCafeBySlug(parsed.cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("experience_reward_submissions")
    .insert({
      cafe_id: cafe.id,
      customer_id: profile.id,
      experience_url: parsed.experienceUrl,
      current_views: parsed.currentViews,
      current_comments: parsed.currentComments,
      customer_notes: parsed.customerNotes ?? null,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) throw error;

  try {
    const admin = createAdminClient();
    await admin.from("notifications").insert({
      cafe_id: cafe.id,
      audience: "cafe",
      customer_id: null,
      title: "توثيق تجربة جديد",
      body: `${String(profile.full_name ?? "عميل")} أرسل رابط تجربة للمراجعة`,
      type: "experience_submission",
      read: false,
      meta: {
        submissionId: String(data.id),
        experienceUrl: parsed.experienceUrl,
      },
    });
  } catch (notificationError) {
    console.warn(
      "Experience reward cafe notification skipped",
      notificationError,
    );
  }

  if (isBarndaksaEmailConfigured()) {
    try {
      const { data: settings } = await supabase
        .from("cafe_settings")
        .select("owner_email")
        .eq("cafe_id", cafe.id)
        .maybeSingle();
      const ownerEmail = settings?.owner_email
        ? String(settings.owner_email)
        : undefined;
      if (ownerEmail) {
        await sendBarndaksaEmail({
          to: ownerEmail,
          subject: "توثيق تجربة جديد يحتاج مراجعة",
          text: `وصل توثيق تجربة جديد من ${String(profile.full_name ?? "عميل")}. الرابط: ${parsed.experienceUrl}`,
          html: `<div dir="rtl"><h2>توثيق تجربة جديد</h2><p>العميل: ${escapeEmailHtml(String(profile.full_name ?? "عميل"))}</p><p>الرابط: ${escapeEmailHtml(parsed.experienceUrl)}</p><p>المشاهدات: ${parsed.currentViews}</p><p>التعليقات: ${parsed.currentComments}</p></div>`,
        });
      }
    } catch (emailError) {
      console.warn("Experience reward email skipped", emailError);
    }
  }

  return normalizeSubmission(data as Record<string, unknown>);
}

export async function getCustomerExperienceRewardSubmissions(
  cafeSlug: string,
  customerId?: string,
  limit = 5,
): Promise<CustomerExperienceReward[]> {
  const profile = customerId
    ? { id: customerId }
    : (await requireCustomerProfileForSession(cafeSlug)).profile;
  const cafe = await getCafeBySlug(cafeSlug);
  if (!cafe) return [];

  const supabase = customerId ? createAdminClient() : await createClient();
  const { data, error } = await supabase
    .from("experience_reward_submissions")
    .select("*, experience_reward_items(*)")
    .eq("cafe_id", cafe.id)
    .eq("customer_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeSubmission);
}

export async function getCustomerExperienceRewardNotifications(
  cafeSlug: string,
) {
  try {
    return await getCustomerExperienceRewardSubmissions(cafeSlug);
  } catch {
    return [];
  }
}

export async function getOwnerExperienceRewardReviews(): Promise<
  OwnerExperienceRewardSubmission[]
> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("experience_reward_submissions")
    .select(
      "*, experience_reward_items(*), customer_profiles(id, full_name, phone, email, created_at)",
    )
    .eq("cafe_id", cafe.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  const rows = (data ?? []) as Record<string, unknown>[];
  const customerIds = Array.from(
    new Set(rows.map((row) => String(row.customer_id)).filter(Boolean)),
  );

  const [ordersResult, loyaltyResult, submissionsResult] = await Promise.all([
    customerIds.length
      ? supabase
          .from("orders")
          .select("customer_id,total,total_amount,final_price")
          .eq("cafe_id", cafe.id)
          .in("customer_id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? supabase
          .from("loyalty_cards")
          .select("id,customer_profile_id,loyalty_card_events(id)")
          .eq("cafe_id", cafe.id)
          .in("customer_profile_id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? supabase
          .from("experience_reward_submissions")
          .select("customer_id")
          .eq("cafe_id", cafe.id)
          .in("customer_id", customerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const orderStats = new Map<string, { count: number; total: number }>();
  for (const order of (ordersResult.data ?? []) as Record<string, unknown>[]) {
    const customerId = String(order.customer_id ?? "");
    const current = orderStats.get(customerId) ?? { count: 0, total: 0 };
    const amount = Number(
      order.total ?? order.total_amount ?? order.final_price ?? 0,
    );
    orderStats.set(customerId, {
      count: current.count + 1,
      total: current.total + amount,
    });
  }

  const loyaltyStats = new Map<string, number>();
  for (const card of (loyaltyResult.data ?? []) as Record<string, unknown>[]) {
    const customerId = String(card.customer_profile_id ?? "");
    const events = Array.isArray(card.loyalty_card_events)
      ? card.loyalty_card_events.length
      : 0;
    loyaltyStats.set(customerId, (loyaltyStats.get(customerId) ?? 0) + events);
  }

  const submissionStats = new Map<string, number>();
  for (const item of (submissionsResult.data ?? []) as Record<
    string,
    unknown
  >[]) {
    const customerId = String(item.customer_id ?? "");
    submissionStats.set(customerId, (submissionStats.get(customerId) ?? 0) + 1);
  }

  return rows.map((row) => {
    const base = normalizeSubmission(row);
    const customerRaw = Array.isArray(row.customer_profiles)
      ? row.customer_profiles[0]
      : row.customer_profiles;
    const customer = (
      customerRaw && typeof customerRaw === "object" ? customerRaw : {}
    ) as Record<string, unknown>;
    const customerId = String(row.customer_id ?? "");
    const stats = orderStats.get(customerId) ?? { count: 0, total: 0 };

    return {
      ...base,
      customerId,
      customerName: String(customer.full_name ?? "عميل"),
      customerPhone: String(customer.phone ?? ""),
      customerEmail: String(customer.email ?? ""),
      customerCreatedAt: String(customer.created_at ?? ""),
      orderCount: stats.count,
      orderTotal: stats.total,
      loyaltyEventsCount: loyaltyStats.get(customerId) ?? 0,
      previousSubmissionsCount: submissionStats.get(customerId) ?? 0,
    };
  });
}

const approveSchema = z.object({
  submissionId: z.string().uuid(),
  rewardExpiresAt: z.string().min(4),
  reviewNotes: z.string().max(1000).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        productName: z.string().min(1),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1),
});

export async function approveOwnerExperienceRewardSubmission(
  input: z.infer<typeof approveSchema>,
) {
  const parsed = approveSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const { data: submission, error: fetchError } = await supabase
    .from("experience_reward_submissions")
    .select("*, customer_profiles(full_name, email)")
    .eq("id", parsed.submissionId)
    .eq("cafe_id", cafe.id)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!submission) throw new Error("Submission not found");

  const productIds = Array.from(
    new Set(parsed.items.map((item) => item.productId)),
  );
  const { data: rewardProducts, error: productsError } = await supabase
    .from("menu_products")
    .select("id")
    .eq("cafe_id", cafe.id)
    .in("id", productIds);

  if (productsError) throw productsError;
  if ((rewardProducts ?? []).length !== productIds.length) {
    throw new Error("Reward product does not belong to this cafe");
  }

  const rewardCode = makeRewardCode();

  const { error: updateError } = await supabase
    .from("experience_reward_submissions")
    .update({
      status: "approved",
      reward_code: rewardCode,
      reward_expires_at: parsed.rewardExpiresAt,
      review_notes: parsed.reviewNotes ?? null,
      approved_at: new Date().toISOString(),
      rejected_at: null,
      reviewed_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.submissionId)
    .eq("cafe_id", cafe.id);

  if (updateError) throw updateError;

  const { error: deleteError } = await supabase
    .from("experience_reward_items")
    .delete()
    .eq("submission_id", parsed.submissionId);

  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase
    .from("experience_reward_items")
    .insert(
      parsed.items.map((item) => ({
        submission_id: parsed.submissionId,
        product_id: item.productId,
        product_name: item.productName,
        quantity: item.quantity,
      })),
    );

  if (insertError) throw insertError;

  const itemsText = parsed.items
    .map((item) => `${item.productName} × ${item.quantity}`)
    .join("، ");

  await createNotification({
    cafeSlug: cafe.slug,
    audience: "customer",
    customerId: String(submission.customer_id),
    title: "لديك مكافأة مقابل توثيق التجربة",
    body: `مكافأتك: ${itemsText}. صالحة حتى ${parsed.rewardExpiresAt}. كود المكافأة ${rewardCode}`,
    type: "experience_reward",
    meta: {
      submissionId: parsed.submissionId,
      rewardCode,
      rewardExpiresAt: parsed.rewardExpiresAt,
      experienceUrl: String(submission.experience_url ?? ""),
      rewardItems: itemsText,
    },
  });

  const customerRaw = Array.isArray(submission.customer_profiles)
    ? submission.customer_profiles[0]
    : submission.customer_profiles;
  const customer =
    customerRaw && typeof customerRaw === "object"
      ? (customerRaw as Record<string, unknown>)
      : null;
  const customerEmail = customer?.email ? String(customer.email) : undefined;
  if (customerEmail && isBarndaksaEmailConfigured()) {
    await sendBarndaksaEmail({
      to: customerEmail,
      subject: "تم اعتماد توثيق تجربتك",
      text: `تم اعتماد توثيق تجربتك. مكافأتك: ${itemsText}.`,
      html: `<div dir="rtl"><h2>تم اعتماد توثيق تجربتك</h2><p>المكافأة: ${escapeEmailHtml(itemsText)}</p><p>كود المكافأة: <strong>${escapeEmailHtml(rewardCode)}</strong></p><p>صالحة حتى: ${escapeEmailHtml(parsed.rewardExpiresAt)}</p></div>`,
    }).catch(() => undefined);
  }

  return { ok: true, rewardCode };
}

export async function rejectOwnerExperienceRewardSubmission(
  submissionId: string,
  reviewNotes: string,
) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const { data: submission, error: fetchError } = await supabase
    .from("experience_reward_submissions")
    .select("*, customer_profiles(email, full_name)")
    .eq("id", z.string().uuid().parse(submissionId))
    .eq("cafe_id", cafe.id)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!submission) throw new Error("Submission not found");

  const { error } = await supabase
    .from("experience_reward_submissions")
    .update({
      status: "rejected",
      review_notes: reviewNotes,
      rejected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", submissionId)
    .eq("cafe_id", cafe.id);

  if (error) throw error;

  await createNotification({
    cafeSlug: cafe.slug,
    audience: "customer",
    customerId: String(submission.customer_id),
    title: "تمت مراجعة توثيق التجربة",
    body: reviewNotes || "لم يتم اعتماد التوثيق هذه المرة",
    type: "experience_submission",
    meta: { submissionId },
  });

  const customerRaw = Array.isArray(submission.customer_profiles)
    ? submission.customer_profiles[0]
    : submission.customer_profiles;
  const customer =
    customerRaw && typeof customerRaw === "object"
      ? (customerRaw as Record<string, unknown>)
      : null;
  const customerEmail = customer?.email ? String(customer.email) : undefined;
  if (customerEmail && isBarndaksaEmailConfigured()) {
    await sendBarndaksaEmail({
      to: customerEmail,
      subject: "تمت مراجعة توثيق تجربتك",
      text: reviewNotes || "لم يتم اعتماد التوثيق هذه المرة",
      html: `<div dir="rtl"><h2>تمت مراجعة توثيق تجربتك</h2><p>${escapeEmailHtml(reviewNotes || "لم يتم اعتماد التوثيق هذه المرة")}</p></div>`,
    }).catch(() => undefined);
  }

  return { ok: true };
}

export async function redeemOwnerExperienceReward(rewardCode: string) {
  const cafe = await requireOwnerCafeContext();
  const code =
    parseBarndaksaQrPayload(rewardCode, "experience-reward") ??
    rewardCode.trim().toUpperCase();
  if (!code) throw new Error("QR المكافأة مطلوب");

  const admin = createAdminClient();

  const { data: submission, error: submissionError } = await admin
    .from("experience_reward_submissions")
    .select("*, experience_reward_items(*)")
    .eq("reward_code", code)
    .eq("cafe_id", cafe.id)
    .maybeSingle();

  if (submissionError) throw submissionError;
  if (!submission) throw new Error("مكافأة غير موجودة");

  const row = submission as Record<string, unknown>;
  if (String(row.status) !== "approved") {
    throw new Error("المكافأة غير قابلة للصرف");
  }

  if (row.used_at) {
    throw new Error("تم استخدام هذه المكافأة مسبقًا");
  }

  const expiresAt = row.reward_expires_at
    ? new Date(String(row.reward_expires_at))
    : null;
  if (
    expiresAt &&
    expiresAt < new Date(new Date().toISOString().slice(0, 10))
  ) {
    throw new Error("انتهت صلاحية المكافأة");
  }

  const items = normalizeRewardItems(row.experience_reward_items);

  const { data: customer } = await admin
    .from("customer_profiles")
    .select("full_name, email")
    .eq("id", String(row.customer_id))
    .eq("cafe_id", cafe.id)
    .maybeSingle();

  const customerName =
    customer && typeof customer === "object"
      ? String((customer as Record<string, unknown>).full_name ?? "عميل")
      : "عميل";

  const { error: updateError } = await admin
    .from("experience_reward_submissions")
    .update({
      status: "redeemed",
      used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", String(row.id))
    .eq("cafe_id", cafe.id)
    .is("used_at", null)
    .eq("status", "approved");

  if (updateError) throw updateError;

  const customerEmail =
    customer && typeof customer === "object"
      ? String((customer as Record<string, unknown>).email ?? "")
      : "";
  if (customerEmail && isBarndaksaEmailConfigured()) {
    await sendBarndaksaEmail({
      to: customerEmail,
      subject: "تم صرف مكافأة توثيق التجربة",
      text: `تم صرف مكافأتك: ${items.map((item) => `${item.productName} × ${item.quantity}`).join("، ")}`,
      html: `<div dir="rtl"><h2>تم صرف المكافأة</h2><p>${escapeEmailHtml(items.map((item) => `${item.productName} × ${item.quantity}`).join("، "))}</p></div>`,
    }).catch(() => undefined);
  }

  return {
    ok: true,
    submissionId: String(row.id),
    customerName,
    rewardCode: code,
    experienceUrl: String(row.experience_url ?? ""),
    views: Number(row.current_views ?? 0),
    comments: Number(row.current_comments ?? 0),
    expiresAt: String(row.reward_expires_at ?? ""),
    items,
  };
}

export async function redeemCashierExperienceReward(rewardCode: string) {
  const token = await getCashierToken();
  if (!token) throw new Error("جلسة الكاشير منتهية");

  const code =
    parseBarndaksaQrPayload(rewardCode, "experience-reward") ??
    rewardCode.trim().toUpperCase();
  if (!code) throw new Error("QR المكافأة مطلوب");

  const admin = createAdminClient();

  const { data: session, error: sessionError } = await admin
    .from("cafe_cashier_sessions")
    .select("id,cafe_id,cashier_id,expires_at,revoked_at")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!session || session.revoked_at) throw new Error("جلسة الكاشير منتهية");

  const { data: submission, error: submissionError } = await admin
    .from("experience_reward_submissions")
    .select("*, experience_reward_items(*)")
    .eq("reward_code", code)
    .maybeSingle();

  if (submissionError) throw submissionError;
  if (!submission) throw new Error("مكافأة غير موجودة");

  const row = submission as Record<string, unknown>;
  const currentCafeId = String(session.cafe_id);
  const rewardCafeId = String(row.cafe_id ?? "");
  if (rewardCafeId !== currentCafeId) {
    console.warn("[redeemCashierExperienceReward:cross-cafe-reward]", {
      currentCafeId,
      rewardCafeId,
      reason: "experience_reward_belongs_to_another_cafe",
    });
    throw new Error("هذه المكافأة تابعة لعلامة تجارية أخرى");
  }

  if (String(row.status) !== "approved") {
    throw new Error("المكافأة غير قابلة للصرف");
  }

  if (row.used_at) {
    throw new Error("تم استخدام هذه المكافأة مسبقًا");
  }

  const expiresAt = row.reward_expires_at
    ? new Date(String(row.reward_expires_at))
    : null;
  if (
    expiresAt &&
    expiresAt < new Date(new Date().toISOString().slice(0, 10))
  ) {
    throw new Error("انتهت صلاحية المكافأة");
  }

  const items = normalizeRewardItems(row.experience_reward_items);

  const { data: customer } = await admin
    .from("customer_profiles")
    .select("full_name, email")
    .eq("id", String(row.customer_id))
    .eq("cafe_id", currentCafeId)
    .maybeSingle();

  const customerName =
    customer && typeof customer === "object"
      ? String((customer as Record<string, unknown>).full_name ?? "عميل")
      : "عميل";

  const { error: updateError } = await admin
    .from("experience_reward_submissions")
    .update({
      status: "redeemed",
      used_at: new Date().toISOString(),
      used_by_cashier_id: String(session.cashier_id),
      updated_at: new Date().toISOString(),
    })
    .eq("id", String(row.id))
    .eq("cafe_id", currentCafeId)
    .is("used_at", null)
    .eq("status", "approved");

  if (updateError) throw updateError;

  await admin.from("cafe_cashier_activity_logs").insert({
    cafe_id: currentCafeId,
    cashier_id: String(session.cashier_id),
    action_type: "loyalty_redeem",
    target_type: "experience_reward_submission",
    target_id: String(row.id),
    invoice_barcode: code,
    details: {
      source: "experience_reward",
      customerName,
      rewardCode: code,
      experienceUrl: String(row.experience_url ?? ""),
      items,
    },
  });

  const customerEmail =
    customer && typeof customer === "object"
      ? String((customer as Record<string, unknown>).email ?? "")
      : "";
  if (customerEmail && isBarndaksaEmailConfigured()) {
    await sendBarndaksaEmail({
      to: customerEmail,
      subject: "تم صرف مكافأة توثيق التجربة",
      text: `تم صرف مكافأتك من الكاشير: ${items.map((item) => `${item.productName} × ${item.quantity}`).join("، ")}`,
      html: `<div dir="rtl"><h2>تم صرف المكافأة</h2><p>${escapeEmailHtml(items.map((item) => `${item.productName} × ${item.quantity}`).join("، "))}</p></div>`,
    }).catch(() => undefined);
  }

  return {
    ok: true,
    submissionId: String(row.id),
    customerName,
    rewardCode: code,
    experienceUrl: String(row.experience_url ?? ""),
    views: Number(row.current_views ?? 0),
    comments: Number(row.current_comments ?? 0),
    expiresAt: String(row.reward_expires_at ?? ""),
    items,
  };
}
