import { z } from "zod";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { requireSupabaseAnonKey, requireSupabaseUrl } from "@/lib/barndaksa/env";

import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";

import type { BarndaksaCustomerSession } from "@/lib/customer/session";

import type {
  CustomerOrder,
  CustomerProfile,
} from "@/lib/mock/customer-activity";

import type { CafeReservation } from "@/lib/mock/reservations";
import {
  escapeEmailHtml,
  isBarndaksaEmailConfigured,
  sendBarndaksaEmail,
} from "@/lib/email/resend";

export async function upsertCustomerProfileForUser(
  cafeSlug: string,

  userId: string,

  profile: { fullName: string; phone: string; email?: string },
) {
  const cafe = await getCafeBySlug(cafeSlug);

  if (!cafe) throw new Error("Cafe not found");

  const supabase = await createClient();

  const { data: existingByUser } = await supabase
    .from("customer_profiles")
    .select("*")
    .eq("cafe_id", cafe.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingByUser) {
    const { error } = await supabase.rpc("update_customer_profile", {
      p_cafe_id: cafe.id,
      p_full_name: profile.fullName,
      p_email: profile.email ?? null,
      p_phone: profile.phone,
    });
    if (error) {
      if (error.code === "23505") {
        throw new Error("رقم الجوال مسجّل لحساب آخر في هذا المقهى");
      }
      throw error;
    }
    const { data, error: fetchError } = await supabase
      .from("customer_profiles")
      .select("*")
      .eq("id", existingByUser.id)
      .single();
    if (fetchError) throw fetchError;
    return data;
  }

  const { data, error } = await supabase.rpc("create_customer_profile", {
    p_cafe_id: cafe.id,
    p_full_name: profile.fullName,
    p_phone: profile.phone,
    p_email: profile.email ?? null,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error("رقم الجوال أو الحساب مسجّل مسبقًا في هذا المقهى");
    }
    throw error;
  }

  const { data: created, error: fetchError } = await supabase
    .from("customer_profiles")
    .select("*")
    .eq("id", data)
    .single();

  if (fetchError) throw fetchError;
  return created;
}

export async function getCustomerProfileByUser(
  cafeSlug: string,
  userId: string,
) {
  const cafe = await getCafeBySlug(cafeSlug);

  if (!cafe) return null;

  const supabase = createAdminClient();

  const { data } = await supabase

    .from("customer_profiles")

    .select("*")

    .eq("cafe_id", cafe.id)

    .eq("user_id", userId)

    .maybeSingle();

  return data;
}

function normalizeSlugForCookie(slug: string) {
  return slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 80);
}

function getCustomerSessionCookieName(slug: string) {
  return `barndaksa_customer_session_${normalizeSlugForCookie(slug)}`;
}

export async function getCustomerProfileForActiveSession(cafeSlug: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(getCustomerSessionCookieName(cafeSlug))?.value;
  if (!token) return null;
  return getCustomerProfileBySessionToken(cafeSlug, token);
}

export async function requireCustomerProfileForOrderSession(cafeSlug: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(getCustomerSessionCookieName(cafeSlug))?.value;

  if (token) {
    const profile = await getCustomerProfileBySessionToken(cafeSlug, token);
    if (!profile) throw new Error("Customer profile not found");
    return profile;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const profile = await getCustomerProfileByUser(cafeSlug, user.id);
  if (!profile) throw new Error("Customer profile not found");
  return profile;
}

/** Requires authenticated Supabase session linked to a customer profile for this cafe */
export async function requireCustomerProfileForSession(cafeSlug: string) {
  const sessionProfile = await getCustomerProfileForActiveSession(cafeSlug);
  if (sessionProfile) {
    return {
      user: { id: String(sessionProfile.user_id ?? sessionProfile.id) },
      profile: sessionProfile,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const profile = await getCustomerProfileByUser(cafeSlug, user.id);
  if (!profile) throw new Error("Customer profile not found");
  return { user, profile };
}

export async function assertCustomerIdMatchesSession(
  cafeSlug: string,
  customerId: string,
) {
  const { profile } = await requireCustomerProfileForSession(cafeSlug);
  if ((profile.id as string) !== customerId) {
    throw new Error("Forbidden: customer mismatch");
  }
  return profile;
}

export function mapCustomerProfileToSession(
  slug: string,

  row: Record<string, unknown>,
): BarndaksaCustomerSession {
  return {
    id: row.id as string,

    cafeSlug: slug,

    fullName: row.full_name as string,

    phone: row.phone as string,

    email: (row.email as string) ?? undefined,

    avatarUrl: (row.avatar_url as string) ?? undefined,

    avatarAssetId: (row.avatar_storage_path as string) ?? undefined,

    createdAt: row.created_at as string,
  };
}

const customerRegisterSchema = z.object({
  cafeSlug: z.string().min(1),

  email: z.string().email(),

  password: z.string().min(8),

  fullName: z.string().min(1),

  phone: z.string().min(8),
});

const customerLoginSchema = z.object({
  cafeSlug: z.string().min(1),

  email: z.string().email(),

  password: z.string().min(1),
});

const customerPasswordSchema = z.string().min(8).max(72);
const customerResetTokenTtlMs = 30 * 60 * 1000;

function normalizeCustomerEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hashCustomerPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

function verifyCustomerPassword(password: string, storedHash?: string | null) {
  if (!storedHash) return false;
  const [scheme, salt, expectedHash] = storedHash.split("$");
  if (scheme !== "scrypt" || !salt || !expectedHash) return false;

  const expected = Buffer.from(expectedHash, "base64url");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function verifyLegacySupabaseCustomerPassword(
  userId: string | null | undefined,
  email: string,
  password: string,
) {
  if (!userId) return false;

  const verifyClient = createSupabaseJsClient(
    requireSupabaseUrl(),
    requireSupabaseAnonKey(),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );

  const { data, error } = await verifyClient.auth.signInWithPassword({
    email,
    password,
  });

  await verifyClient.auth.signOut();
  return !error && data.user?.id === userId;
}

async function findCustomerProfileByCafeEmail(cafeId: string, email: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("customer_profiles")
    .select("*")
    .eq("cafe_id", cafeId)
    .ilike("email", email)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function setCustomerPasswordHash(
  profileId: string,
  password: string,
  options: { clearSessions?: boolean } = {},
) {
  const admin = createAdminClient();
  const updatePayload: Record<string, string | null> = {
    password_hash: hashCustomerPassword(password),
    password_updated_at: new Date().toISOString(),
    password_reset_token_hash: null,
    password_reset_expires_at: null,
  };

  if (options.clearSessions) {
    updatePayload.session_token_hash = null;
    updatePayload.session_expires_at = null;
  }

  const { error } = await admin
    .from("customer_profiles")
    .update(updatePayload)
    .eq("id", profileId);

  if (error) throw error;
}

export async function persistCustomerSession(
  customerId: string,
  token: string,
  expiresAt: Date,
) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("customer_profiles")
    .update({
      session_token_hash: hashSecret(token),
      session_expires_at: expiresAt.toISOString(),
      last_visit_at: new Date().toISOString(),
    })
    .eq("id", customerId);

  if (error) throw error;
}

export async function clearPersistedCustomerSession(customerId: string) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("customer_profiles")
    .update({
      session_token_hash: null,
      session_expires_at: null,
    })
    .eq("id", customerId);

  if (error) throw error;
}

export async function getCustomerProfileBySessionToken(
  cafeSlug: string,
  token: string,
) {
  const cafe = await getCafeBySlug(cafeSlug);
  if (!cafe) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("customer_profiles")
    .select("*")
    .eq("cafe_id", cafe.id)
    .eq("session_token_hash", hashSecret(token))
    .gt("session_expires_at", new Date().toISOString())
    .not("password_hash", "is", null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/** Register customer with a cafe-scoped password hash. */

export async function registerCustomer(
  input: z.infer<typeof customerRegisterSchema>,
) {
  const parsed = customerRegisterSchema.parse(input);

  const cafe = await getCafeBySlug(parsed.cafeSlug);

  if (!cafe) throw new Error("Cafe not found");

  const normalizedPhone = parsed.phone.replace(/\D/g, "");

  const email = normalizeCustomerEmail(parsed.email);
  const admin = createAdminClient();

  const existing = await findCustomerProfileByCafeEmail(cafe.id, email);
  if (existing) {
    throw new Error("يوجد حساب بهذا البريد لدى هذه العلامة.");
  }

  const { data: profile, error } = await admin
    .from("customer_profiles")
    .insert({
      cafe_id: cafe.id,
      full_name: parsed.fullName.trim(),
      phone: normalizedPhone,
      email,
      password_hash: hashCustomerPassword(parsed.password),
      password_updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("البريد أو رقم الجوال مسجّل مسبقًا في هذه العلامة.");
    }
    throw error;
  }

  if (isBarndaksaEmailConfigured()) {
    await sendBarndaksaEmail({
      to: email,
      subject: `مرحبًا بك في ${cafe.name}`,
      text: `تم إنشاء حسابك في ${cafe.name} عبر برندة.`,
      html: `<div dir="rtl"><h2>مرحبًا ${escapeEmailHtml(parsed.fullName.trim())}</h2><p>تم إنشاء حسابك في <strong>${escapeEmailHtml(cafe.name)}</strong> عبر برندة.</p></div>`,
    }).catch(() => undefined);
  }

  return mapCustomerProfileToSession(parsed.cafeSlug, profile);
}

/** Customer login requires cafe + email + password, never email/password alone. */

export async function loginCustomerByEmail(
  input: z.infer<typeof customerLoginSchema>,
) {
  const parsed = customerLoginSchema.parse(input);

  const cafe = await getCafeBySlug(parsed.cafeSlug);

  if (!cafe) throw new Error("Cafe not found");

  const email = normalizeCustomerEmail(parsed.email);
  const existing = await findCustomerProfileByCafeEmail(cafe.id, email);

  if (!existing) {
    throw new Error("لا يوجد حساب بهذا البريد لدى هذه العلامة. أنشئ حسابًا جديدًا أولًا.");
  }

  const passwordHash = existing.password_hash as string | null | undefined;
  const userId = existing.user_id as string | null | undefined;
  const passwordOk =
    verifyCustomerPassword(parsed.password, passwordHash) ||
    (await verifyLegacySupabaseCustomerPassword(userId, email, parsed.password));

  if (!passwordOk) {
    throw new Error("بيانات الدخول غير صحيحة");
  }

  if (!passwordHash) {
    await setCustomerPasswordHash(existing.id as string, parsed.password);
  }

  return mapCustomerProfileToSession(parsed.cafeSlug, existing);
}

export async function changeCustomerPassword(input: {
  cafeSlug: string;
  customerId: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  const parsed = z
    .object({
      cafeSlug: z.string().min(1),
      customerId: z.string().uuid(),
      currentPassword: z.string().min(1),
      newPassword: customerPasswordSchema,
      confirmPassword: z.string().min(1),
    })
    .parse(input);

  if (parsed.newPassword !== parsed.confirmPassword) {
    throw new Error("تأكيد كلمة المرور يجب أن يطابق كلمة المرور الجديدة.");
  }

  const cafe = await getCafeBySlug(parsed.cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("customer_profiles")
    .select("*")
    .eq("id", parsed.customerId)
    .eq("cafe_id", cafe.id)
    .maybeSingle();

  if (error) throw error;
  if (!profile) throw new Error("Customer profile not found");

  const email = normalizeCustomerEmail(String(profile.email ?? ""));
  const passwordHash = profile.password_hash as string | null | undefined;
  const userId = profile.user_id as string | null | undefined;
  const currentOk =
    verifyCustomerPassword(parsed.currentPassword, passwordHash) ||
    (await verifyLegacySupabaseCustomerPassword(userId, email, parsed.currentPassword));

  if (!currentOk) {
    throw new Error("كلمة المرور الحالية غير صحيحة.");
  }

  await setCustomerPasswordHash(parsed.customerId, parsed.newPassword);
}

export async function createCustomerPasswordReset(input: {
  cafeSlug: string;
  email: string;
}) {
  const parsed = z
    .object({
      cafeSlug: z.string().min(1),
      email: z.string().email(),
    })
    .parse(input);

  const cafe = await getCafeBySlug(parsed.cafeSlug);
  if (!cafe) return null;

  const email = normalizeCustomerEmail(parsed.email);
  const profile = await findCustomerProfileByCafeEmail(cafe.id, email);
  if (!profile) return null;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + customerResetTokenTtlMs);
  const admin = createAdminClient();
  const { error } = await admin
    .from("customer_profiles")
    .update({
      password_reset_token_hash: hashSecret(token),
      password_reset_expires_at: expiresAt.toISOString(),
    })
    .eq("id", profile.id as string);

  if (error) throw error;

  return {
    token,
    cafeName: cafe.name,
    customerName: String(profile.full_name ?? "عميل"),
    email,
  };
}

export async function resetCustomerPasswordWithToken(input: {
  cafeSlug: string;
  token: string;
  newPassword: string;
  confirmPassword: string;
}) {
  const parsed = z
    .object({
      cafeSlug: z.string().min(1),
      token: z.string().min(24),
      newPassword: customerPasswordSchema,
      confirmPassword: z.string().min(1),
    })
    .parse(input);

  if (parsed.newPassword !== parsed.confirmPassword) {
    throw new Error("تأكيد كلمة المرور يجب أن يطابق كلمة المرور الجديدة.");
  }

  const cafe = await getCafeBySlug(parsed.cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("customer_profiles")
    .select("id")
    .eq("cafe_id", cafe.id)
    .eq("password_reset_token_hash", hashSecret(parsed.token))
    .gt("password_reset_expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  if (!profile) throw new Error("رابط استعادة كلمة المرور غير صالح أو منتهي. اطلب رابطًا جديدًا.");

  await setCustomerPasswordHash(profile.id as string, parsed.newPassword, {
    clearSessions: true,
  });
}

export async function getCafeCustomers() {
  const cafe = await requireOwnerCafeContext();

  const supabase = await createClient();

  const { data, error } = await supabase

    .from("customer_profiles")

    .select("*")

    .eq("cafe_id", cafe.id)

    .order("created_at", { ascending: false });

  if (error) throw error;

  return data ?? [];
}

export async function getCustomerOrdersForProfile(
  cafeSlug: string,
  customerId: string,
  limit = 5,
) {
  const cafe = await getCafeBySlug(cafeSlug);

  if (!cafe) return [];

  const supabase = createAdminClient();

  const { data: orders } = await supabase

    .from("orders")

    .select("*, order_items(*)")

    .eq("cafe_id", cafe.id)

    .eq("customer_id", customerId)

    .is("deleted_at", null)

    .order("created_at", { ascending: false })

    .limit(limit);

  if (!orders?.length) return [];

  const { mapDbOrderToCafeOrder } = await import("@/lib/data/mappers");

  return orders.map((o) =>
    mapDbOrderToCafeOrder(
      cafeSlug,
      o,
      (o.order_items as Record<string, unknown>[]) ?? [],
    ),
  );
}

export async function getCustomerReservationsForProfile(
  cafeSlug: string,
  customerId: string,
  limit = 5,
) {
  const cafe = await getCafeBySlug(cafeSlug);

  if (!cafe) return [];

  const supabase = createAdminClient();

  const { data } = await supabase

    .from("reservations")

    .select("*")

    .eq("cafe_id", cafe.id)

    .eq("customer_id", customerId)

    .is("deleted_at", null)

    .order("reservation_date", { ascending: false })

    .limit(limit);

  if (!data?.length) return [];

  const { mapDbReservationToCafeReservation } =
    await import("@/lib/data/mappers");

  return data.map(mapDbReservationToCafeReservation);
}

export async function getOwnerCustomersDashboard(): Promise<{
  customers: CustomerProfile[];

  orders: CustomerOrder[];

  reservations: CafeReservation[];
}> {
  const cafe = await requireOwnerCafeContext();

  const supabase = await createClient();

  const [{ data: profiles }, { data: orders }, { data: reservations }] =
    await Promise.all([
      supabase

        .from("customer_profiles")

        .select("*")

        .eq("cafe_id", cafe.id)

        .order("created_at", { ascending: false }),

      supabase

        .from("orders")

        .select("*, order_items(*)")

        .eq("cafe_id", cafe.id)

        .is("deleted_at", null)

        .order("created_at", { ascending: false }),

      supabase

        .from("reservations")

        .select("*")

        .eq("cafe_id", cafe.id)

        .is("deleted_at", null)

        .order("reservation_date", { ascending: false }),
    ]);

  const { mapDbOrderToCafeOrder, mapDbReservationToCafeReservation } =
    await import("@/lib/data/mappers");

  const customers: CustomerProfile[] = (profiles ?? []).map((row) => ({
    id: row.id as string,

    cafeSlug: cafe.slug,

    fullName: row.full_name as string,

    phone: row.phone as string,

    email: (row.email as string) ?? undefined,

    createdAt: (row.created_at as string).slice(0, 10),
  }));

  const mappedOrders: CustomerOrder[] = (orders ?? []).map((order) => {
    const items = (order.order_items as Record<string, unknown>[]) ?? [];

    const cafeOrder = mapDbOrderToCafeOrder(cafe.slug, order, items);

    return {
      id: cafeOrder.id,

      cafeSlug: cafe.slug,

      customerId: cafeOrder.customerId,

      customerName: cafeOrder.customerName,

      status: cafeOrder.status as CustomerOrder["status"],

      items: cafeOrder.items.map((item) => item.name),

      total: cafeOrder.total,

      createdAt: cafeOrder.createdAt,

      branchName: cafeOrder.branchName,

      pickupAt: cafeOrder.pickupAt,

      notes: cafeOrder.notes,

      rejectionReason: cafeOrder.rejectionReason,
    };
  });

  return {
    customers,

    orders: mappedOrders,

    reservations: (reservations ?? []).map(mapDbReservationToCafeReservation),
  };
}
