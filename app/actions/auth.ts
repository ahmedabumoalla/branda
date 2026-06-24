"use server";

import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSupabaseAnonKey, requireSupabaseUrl } from "@/lib/barndaksa/env";
import {
  changeCustomerPassword,
  clearPersistedCustomerSession,
  createCustomerPasswordReset,
  getCustomerProfileBySessionToken,
  loginCustomerByEmail,
  mapCustomerProfileToSession,
  persistCustomerSession,
  registerCustomer,
  resetCustomerPasswordWithToken,
} from "@/lib/data/customers";
import type { BarndaksaCustomerSession } from "@/lib/customer/session";
import { getDashboardPathForCategory } from "@/lib/platform/business-categories";
import { escapeEmailHtml, isBarndaksaEmailConfigured, sendBarndaksaEmail } from "@/lib/email/resend";

const PASSWORD_RECOVERY_COOKIE = "barndaksa_password_recovery";
const CUSTOMER_SESSION_DAYS = 30;

type BasicActionResult = {
  ok: boolean;
  message: string;
  redirectTo?: string | null;
};

type CustomerAuthActionResult = {
  ok: boolean;
  message: string;
  session?: BarndaksaCustomerSession;
};

type CustomerPasswordResetActionResult = {
  ok: boolean;
  message: string;
};

type OwnerProfileAccessRow = {
  role?: string | null;
  status?: string | null;
};

type CafeMembershipRow = {
  cafes?: { business_category?: string | null } | Array<{ business_category?: string | null }> | null;
};

function getAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"
  );
}

function logAuthError(context: string, error: unknown) {
  if (!error || typeof error !== "object") {
    console.error(context, { error: String(error) });
    return;
  }

  const details = error as {
    name?: string;
    message?: string;
    status?: number;
    code?: string;
  };

  console.error(context, {
    name: details.name,
    message: details.message,
    status: details.status,
    code: details.code,
  });
}

function normalizeSlugForCookie(slug: string) {
  return slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 80);
}

function getCustomerSessionCookieName(slug: string) {
  return `barndaksa_customer_session_${normalizeSlugForCookie(slug)}`;
}

async function createCustomerSessionCookie(cafeSlug: string, customerId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CUSTOMER_SESSION_DAYS * 24 * 60 * 60 * 1000);
  await persistCustomerSession(customerId, token, expiresAt);

  const cookieStore = await cookies();
  cookieStore.set(getCustomerSessionCookieName(cafeSlug), token, {
    httpOnly: true,
    expires: expiresAt,
    path: `/c/${normalizeSlugForCookie(cafeSlug)}`,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

async function deleteCustomerSessionCookie(cafeSlug: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(getCustomerSessionCookieName(cafeSlug), "", {
    httpOnly: true,
    maxAge: 0,
    path: `/c/${normalizeSlugForCookie(cafeSlug)}`,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function loginOwnerAction(
  email: string,
  password: string,
): Promise<BasicActionResult> {
  try {
    const supabase = await createClient();
    const normalizedEmail = email.trim().toLowerCase();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (authError || !authData.user) {
      const { loginRepresentativeWithPassword } = await import("@/lib/data/representatives");
      const representativeId = await loginRepresentativeWithPassword(normalizedEmail, password);

      if (representativeId) {
        return {
          ok: true as const,
          message: "تم تسجيل الدخول بنجاح",
          redirectTo: "/representative",
        };
      }

      const { loginCashierWithPassword } = await import("@/lib/data/cashier");
      const cashier = await loginCashierWithPassword(normalizedEmail, password);

      if (cashier) {
        return {
          ok: true as const,
          message: "تم تسجيل الدخول بنجاح",
          redirectTo: "/cashier",
        };
      }

      return { ok: false as const, message: "بيانات الدخول غير صحيحة", redirectTo: null };
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, status")
      .eq("id", authData.user.id)
      .maybeSingle();
    const profile = profileData as OwnerProfileAccessRow | null;

    if (profileError || !profile) {
      await supabase.auth.signOut();
      return { ok: false as const, message: "ملف الحساب غير موجود داخل المنصة", redirectTo: null };
    }

    if (profile.status === "suspended") {
      await supabase.auth.signOut();
      return { ok: false as const, message: "هذا الحساب موقوف", redirectTo: null };
    }

    if (profile.role === "platform_admin") {
      return { ok: true as const, message: "تم تسجيل الدخول بنجاح", redirectTo: "/admin" };
    }

    if (["cafe_owner", "cafe_manager", "cafe_staff"].includes(String(profile.role))) {
      const { data: membershipData } = await supabase
        .from("cafe_members")
        .select("cafes(business_category)")
        .eq("user_id", authData.user.id)
        .limit(1)
        .maybeSingle();
      const membership = membershipData as CafeMembershipRow | null;

      const cafeRaw = Array.isArray(membership?.cafes)
        ? membership?.cafes[0]
        : membership?.cafes;
      const cafe = cafeRaw as { business_category?: string | null } | null | undefined;

      return {
        ok: true as const,
        message: "تم تسجيل الدخول بنجاح",
        redirectTo: getDashboardPathForCategory(cafe?.business_category),
      };
    }

    await supabase.auth.signOut();
    return { ok: false as const, message: "لا تملك صلاحية الدخول لهذه اللوحة", redirectTo: null };
  } catch (error) {
    console.error("[loginOwnerAction]", error);
    return { ok: false as const, message: "تعذر تسجيل الدخول", redirectTo: null };
  }
}

const availableOwnerCategorySchema = z.enum(["cafes_coffee", "restaurants", "events_conferences"]);

const cafeOwnerRegistrationSchema = z.object({
  ownerName: z.string().trim().min(2).max(120),
  brandName: z.string().trim().min(2).max(120),
  brandCategory: availableOwnerCategorySchema,
  slug: z.string().trim().toLowerCase().min(3).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  email: z.string().trim().email(),
  phone: z.string().trim().min(8).max(20),
  password: z.string().min(8).max(72),
  primaryBranchName: z.string().trim().min(2).max(100),
  primaryBranchAddress: z.string().trim().min(3).max(250),
  primaryBranchCity: z.string().trim().min(2).max(100),
  primaryBranchLat: z.number().min(-90).max(90),
  primaryBranchLng: z.number().min(-180).max(180),
  primaryBranchRadiusMeters: z.number().int().min(10).max(500).default(50),
  couponCode: z.string().trim().max(30).optional(),
});

export async function registerCafeOwnerAction(input: {
  ownerName: string;
  brandName: string;
  brandCategory: z.infer<typeof availableOwnerCategorySchema>;
  slug: string;
  email: string;
  phone: string;
  password: string;
  primaryBranchName: string;
  primaryBranchAddress: string;
  primaryBranchCity: string;
  primaryBranchLat: number;
  primaryBranchLng: number;
  primaryBranchRadiusMeters?: number;
  couponCode?: string;
}): Promise<BasicActionResult> {
  try {
    const normalizedSlug =
  String(input.slug ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") ||
  `brand-${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;

const normalizedInput = {
  ...input,
  slug: normalizedSlug,
};

const parsed = cafeOwnerRegistrationSchema.parse(normalizedInput);
    const supabase = await createClient();
    const couponCode = parsed.couponCode?.trim().toUpperCase() || null;

    if (couponCode) {
      const { data: couponValid, error: couponError } = await supabase.rpc(
        "validate_representative_coupon",
        { p_code: couponCode }
      );
      if (couponError || !couponValid) {
        return { ok: false as const, message: "كوبون الخصم غير صالح", redirectTo: null };
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email: parsed.email.toLowerCase(),
      password: parsed.password,
      options: {
        data: {
          account_type: "cafe_owner",
          full_name: parsed.ownerName,
          cafe_name: parsed.brandName,
          brand_category: parsed.brandCategory,
          cafe_slug: parsed.slug,
          phone: parsed.phone.replace(/\D/g, ""),
          primary_branch_name: parsed.primaryBranchName,
          primary_branch_address: parsed.primaryBranchAddress,
          primary_branch_city: parsed.primaryBranchCity,
          primary_branch_lat: parsed.primaryBranchLat.toString(),
          primary_branch_lng: parsed.primaryBranchLng.toString(),
          primary_branch_radius_meters: String(parsed.primaryBranchRadiusMeters ?? 50),
          coupon_code: couponCode,
        },
      },
    });

    if (error || !data.user) {
      return {
        ok: false as const,
        message: error?.message.includes("already")
          ? "البريد مسجل مسبقا"
          : "تعذر إنشاء حساب العلامة التجارية",
        redirectTo: null,
      };
    }

    if (isBarndaksaEmailConfigured()) {
      await sendBarndaksaEmail({
        to: parsed.email.toLowerCase(),
        subject: "مرحبًا بك في برندة",
        html: `
          <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8">
            <h2>مرحبًا ${escapeEmailHtml(parsed.ownerName)}</h2>
            <p>تم إنشاء حساب العلامة التجارية <strong>${escapeEmailHtml(parsed.brandName)}</strong> في منصة برندة.</p>
            <p>رابط الدخول: <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login">تسجيل الدخول</a></p>
          </div>
        `,
        text: `مرحبًا ${parsed.ownerName}، تم إنشاء حساب ${parsed.brandName} في برندة.`,
      }).catch((mailError) => console.error("[registerCafeOwnerAction:email]", mailError));
    }

    return {
      ok: true as const,
      message: data.session
        ? "تم إنشاء حساب العلامة التجارية وتفعيل الباقة الأساسية"
        : "تم إنشاء الحساب تحقق من بريدك ثم سجل الدخول",
      redirectTo: data.session ? getDashboardPathForCategory(parsed.brandCategory) : "/login",
    };
  } catch (error) {
    console.error("[registerCafeOwnerAction]", error);
    return { ok: false as const, message: "تحقق من بيانات التسجيل والرابط المختصر", redirectTo: null };
  }
}

export async function requestPasswordResetAction(
  email: string,
): Promise<BasicActionResult> {
  const parsed = z.string().trim().email().safeParse(email);
  if (!parsed.success) {
    return { ok: false as const, message: "أدخل بريدًا إلكترونيًا صحيحًا." };
  }

  const supabase = await createClient();
  const appUrl = getAppBaseUrl();

  await supabase.auth.resetPasswordForEmail(parsed.data.toLowerCase(), {
    redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent("/auth/update-password")}`,
  });

  return {
    ok: true as const,
    message: "إذا كان البريد مسجلًا لدينا، سيصلك رابط استعادة كلمة المرور خلال دقائق.",
  };
}

export async function getPasswordRecoveryStateAction(): Promise<{ ok: boolean }> {
  const cookieStore = await cookies();
  if (cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value !== "1") {
    return { ok: false as const };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false as const };
  }

  return { ok: true as const };
}

export async function confirmPasswordRecoverySessionAction(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false as const };
  }

  const cookieStore = await cookies();
  cookieStore.set(PASSWORD_RECOVERY_COOKIE, "1", {
    httpOnly: true,
    maxAge: 15 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return { ok: true as const };
}

export async function updatePasswordAction(
  password: string,
  confirmPassword?: string,
): Promise<BasicActionResult> {
  const parsed = z.string().min(8).max(72).safeParse(password);
  if (!parsed.success) {
    return {
      ok: false as const,
      message: "كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.",
    };
  }

  if (confirmPassword !== undefined && parsed.data !== confirmPassword) {
    return {
      ok: false as const,
      message: "تأكيد كلمة المرور يجب أن يطابق كلمة المرور الجديدة.",
    };
  }

  const cookieStore = await cookies();
  if (cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value !== "1") {
    return {
      ok: false as const,
      message: "رابط استعادة كلمة المرور غير صالح أو منتهي. اطلب رابطًا جديدًا.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false as const,
      message: "رابط استعادة كلمة المرور غير صالح أو منتهي. اطلب رابطًا جديدًا.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    return {
      ok: false as const,
      message: "تعذر تحديث كلمة المرور. اطلب رابطًا جديدًا وحاول مرة أخرى.",
    };
  }

  cookieStore.delete(PASSWORD_RECOVERY_COOKIE);
  return {
    ok: true as const,
    message: "تم تحديث كلمة المرور بنجاح، يمكنك تسجيل الدخول الآن.",
  };
}

const changeOwnerPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72),
  confirmPassword: z.string().min(1),
});

export async function changeOwnerPasswordAction(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<BasicActionResult> {
  const parsed = changeOwnerPasswordSchema.safeParse(input);
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    if (errors.currentPassword) {
      return { ok: false as const, message: "كلمة المرور الحالية مطلوبة." };
    }
    if (errors.newPassword) {
      return { ok: false as const, message: "كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف." };
    }
    return { ok: false as const, message: "تحقق من حقول كلمة المرور وحاول مرة أخرى." };
  }

  const { currentPassword, newPassword, confirmPassword } = parsed.data;

  if (newPassword !== confirmPassword) {
    return {
      ok: false as const,
      message: "تأكيد كلمة المرور يجب أن يطابق كلمة المرور الجديدة.",
    };
  }

  if (currentPassword === newPassword) {
    return {
      ok: false as const,
      message: "كلمة المرور الجديدة يجب أن تكون مختلفة عن كلمة المرور الحالية.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !user.email) {
    if (userError) logAuthError("[changeOwnerPasswordAction:getUser]", userError);
    return {
      ok: false as const,
      message: "يجب تسجيل الدخول لتغيير كلمة المرور.",
    };
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileData as OwnerProfileAccessRow | null;

  if (
    profileError ||
    !profile ||
    profile.status === "suspended" ||
    !["cafe_owner", "cafe_manager", "cafe_staff"].includes(String(profile.role))
  ) {
    if (profileError) logAuthError("[changeOwnerPasswordAction:profile]", profileError);
    return {
      ok: false as const,
      message: "لا تملك صلاحية تغيير كلمة مرور هذا الحساب.",
    };
  }

  const verifyClient = createSupabaseJsClient(
    requireSupabaseUrl(),
    requireSupabaseAnonKey(),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    }
  );

  const { data: verified, error: verifyError } = await verifyClient.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  await verifyClient.auth.signOut();

  if (verifyError || !verified.user || verified.user.id !== user.id) {
    if (verifyError) logAuthError("[changeOwnerPasswordAction:verifyCurrentPassword]", verifyError);
    return { ok: false as const, message: "كلمة المرور الحالية غير صحيحة." };
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    password: newPassword,
  });
  if (updateError) {
    logAuthError("[changeOwnerPasswordAction:updateUserById]", updateError);
    const weakPassword =
      updateError.message?.toLowerCase().includes("password") ||
      updateError.message?.toLowerCase().includes("weak") ||
      updateError.message?.toLowerCase().includes("strength");

    return {
      ok: false as const,
      message: weakPassword
        ? "كلمة المرور الجديدة ضعيفة أو غير مقبولة."
        : "تعذر تغيير كلمة المرور، حاول مرة أخرى.",
    };
  }

  return { ok: true as const, message: "تم تغيير كلمة المرور بنجاح." };
}

export async function logoutAction(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function registerCustomerAction(
  cafeSlug: string,
  email: string,
  password: string,
  fullName: string,
  phone: string
): Promise<CustomerAuthActionResult> {
  try {
    const session = await registerCustomer({ cafeSlug, email, password, fullName, phone });
    await createCustomerSessionCookie(cafeSlug, session.id);
    return { ok: true, message: "تم إنشاء الحساب بنجاح", session };
  } catch (error) {
    console.error("[registerCustomerAction]", error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : "تعذر إنشاء الحساب تحقق من البيانات وحاول مرة أخرى",
    };
  }
}

export async function loginCustomerAction(
  cafeSlug: string,
  email: string,
  password: string
): Promise<CustomerAuthActionResult> {
  try {
    const session = await loginCustomerByEmail({ cafeSlug, email, password });
    await createCustomerSessionCookie(cafeSlug, session.id);
    return { ok: true, message: "تم تسجيل الدخول", session };
  } catch (error) {
    console.error("[loginCustomerAction]", error);
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "بيانات الدخول غير صحيحة",
    };
  }
}

export async function getCustomerSessionAction(
  cafeSlug: string,
): Promise<BarndaksaCustomerSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getCustomerSessionCookieName(cafeSlug))?.value;
  if (!token) return null;

  const profile = await getCustomerProfileBySessionToken(cafeSlug, token);
  if (!profile) return null;
  return mapCustomerProfileToSession(cafeSlug, profile);
}

export async function logoutCustomerAction(cafeSlug?: string): Promise<void> {
  if (!cafeSlug) return;

  const cookieStore = await cookies();
  const token = cookieStore.get(getCustomerSessionCookieName(cafeSlug))?.value;
  if (token) {
    const profile = await getCustomerProfileBySessionToken(cafeSlug, token);
    if (profile?.id) {
      await clearPersistedCustomerSession(String(profile.id));
    }
  }

  await deleteCustomerSessionCookie(cafeSlug);
}

export async function changeCustomerPasswordAction(input: {
  cafeSlug: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<CustomerPasswordResetActionResult> {
  try {
    const session = await getCustomerSessionAction(input.cafeSlug);
    if (!session) {
      return { ok: false as const, message: "يجب تسجيل الدخول لتغيير كلمة المرور." };
    }

    await changeCustomerPassword({
      cafeSlug: input.cafeSlug,
      customerId: session.id,
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      confirmPassword: input.confirmPassword,
    });

    return { ok: true as const, message: "تم تغيير كلمة المرور بنجاح." };
  } catch (error) {
    return {
      ok: false as const,
      message:
        error instanceof Error
          ? error.message
          : "تعذر تغيير كلمة المرور الآن. حاول مرة أخرى.",
    };
  }
}

export async function requestCustomerPasswordResetAction(
  cafeSlug: string,
  email: string,
): Promise<CustomerPasswordResetActionResult> {
  const parsedEmail = z.string().trim().email().safeParse(email);
  if (!parsedEmail.success) {
    return { ok: false as const, message: "أدخل بريدًا إلكترونيًا صحيحًا." };
  }

  try {
    const reset = await createCustomerPasswordReset({
      cafeSlug,
      email: parsedEmail.data,
    });

    if (reset && isBarndaksaEmailConfigured()) {
      const appUrl = getAppBaseUrl();
      const resetUrl = `${appUrl}/c/${encodeURIComponent(cafeSlug)}/reset-password?token=${encodeURIComponent(reset.token)}`;

      await sendBarndaksaEmail({
        to: reset.email,
        subject: `استعادة كلمة مرور ${reset.cafeName}`,
        text: `افتح رابط استعادة كلمة المرور الخاص بـ ${reset.cafeName}: ${resetUrl}`,
        html: `
          <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8">
            <h2>استعادة كلمة المرور</h2>
            <p>مرحبًا ${escapeEmailHtml(reset.customerName)}، يمكنك تعيين كلمة مرور جديدة لحسابك في <strong>${escapeEmailHtml(reset.cafeName)}</strong> من الرابط التالي:</p>
            <p><a href="${resetUrl}">تعيين كلمة مرور جديدة</a></p>
            <p>إذا لم تطلب الاستعادة فتجاهل هذه الرسالة.</p>
          </div>
        `,
      });
    }
  } catch (error) {
    console.error("[requestCustomerPasswordResetAction]", {
      message: error instanceof Error ? error.message : "unknown error",
    });
  }

  return {
    ok: true as const,
    message:
      "إذا كان البريد مسجلًا لدى هذه العلامة، سيصلك رابط استعادة كلمة المرور خلال دقائق.",
  };
}

export async function resetCustomerPasswordAction(input: {
  cafeSlug: string;
  token: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<CustomerPasswordResetActionResult> {
  try {
    await resetCustomerPasswordWithToken(input);
    return {
      ok: true as const,
      message: "تم تحديث كلمة المرور بنجاح. يمكنك تسجيل الدخول الآن.",
    };
  } catch (error) {
    return {
      ok: false as const,
      message:
        error instanceof Error
          ? error.message
          : "تعذر حفظ كلمة المرور. اطلب رابطًا جديدًا وحاول مرة أخرى.",
    };
  }
}
