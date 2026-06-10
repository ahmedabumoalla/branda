"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { loginCustomerByEmail, registerCustomer } from "@/lib/data/customers";
import type { BrandaCustomerSession } from "@/lib/customer/session";
import { getDashboardPathForCategory } from "@/lib/platform/business-categories";
import { escapeEmailHtml, isBrandaEmailConfigured, sendBrandaEmail } from "@/lib/email/resend";

export async function loginOwnerAction(email: string, password: string) {
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

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, status")
      .eq("id", authData.user.id)
      .maybeSingle();

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
      const { data: membership } = await supabase
        .from("cafe_members")
        .select("cafes(business_category)")
        .eq("user_id", authData.user.id)
        .limit(1)
        .maybeSingle();

      const cafe = membership?.cafes as unknown as { business_category?: string } | null;

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

const cafeOwnerRegistrationSchema = z.object({
  ownerName: z.string().trim().min(2).max(120),
  brandName: z.string().trim().min(2).max(120),
  brandCategory: z.literal("cafes_coffee"),
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
  brandCategory: "cafes_coffee";
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
}) {
  try {
    const parsed = cafeOwnerRegistrationSchema.parse(input);
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

    if (isBrandaEmailConfigured()) {
      await sendBrandaEmail({
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
      redirectTo: data.session ? "/dashboard" : "/login",
    };
  } catch (error) {
    console.error("[registerCafeOwnerAction]", error);
    return { ok: false as const, message: "تحقق من بيانات التسجيل والرابط المختصر", redirectTo: null };
  }
}

export async function requestPasswordResetAction(email: string) {
  try {
    const normalized = z.string().trim().email().parse(email);
    const supabase = await createClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const { error } = await supabase.auth.resetPasswordForEmail(normalized.toLowerCase(), {
      redirectTo: `${appUrl}/auth/callback?next=/auth/update-password`,
    });
    if (error) throw error;
    return { ok: true as const, message: "تم إرسال رابط استعادة كلمة المرور إلى بريدك" };
  } catch {
    return { ok: false as const, message: "تعذر إرسال رابط الاستعادة" };
  }
}

export async function updatePasswordAction(password: string) {
  const parsed = z.string().min(8).max(72).parse(password);
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed });
  if (error) throw error;
  return { ok: true as const };
}

export async function logoutAction() {
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
): Promise<{ ok: boolean; message: string; session?: BrandaCustomerSession }> {
  try {
    const session = await registerCustomer({ cafeSlug, email, password, fullName, phone });
    return { ok: true, message: "تم إنشاء الحساب بنجاح", session };
  } catch (error) {
    console.error("[registerCustomerAction]", error);
    return { ok: false, message: "تعذر إنشاء الحساب تحقق من البيانات وحاول مرة أخرى" };
  }
}

export async function loginCustomerAction(
  cafeSlug: string,
  email: string,
  password: string
): Promise<{ ok: boolean; message: string; session?: BrandaCustomerSession }> {
  try {
    const session = await loginCustomerByEmail({ cafeSlug, email, password });
    return { ok: true, message: "تم تسجيل الدخول", session };
  } catch (error) {
    console.error("[loginCustomerAction]", error);
    return { ok: false, message: "بيانات الدخول غير صحيحة" };
  }
}

export async function getCustomerSessionAction(cafeSlug: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { getCustomerProfileByUser, mapCustomerProfileToSession } = await import("@/lib/data/customers");
  const profile = await getCustomerProfileByUser(cafeSlug, user.id);
  if (!profile) return null;
  return mapCustomerProfileToSession(cafeSlug, profile);
}

export async function logoutCustomerAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
