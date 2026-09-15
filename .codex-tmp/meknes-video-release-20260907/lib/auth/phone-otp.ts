import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getPublicCafeBySlugAdmin } from "@/lib/data/cafes";
import { greenApiProviderInstanceKey } from "@/lib/whatsapp/green-api";
import { ensureCustomerPhoneAuthUser } from "@/lib/auth/customer-phone-auth";
import {
  normalizeSaudiPhone,
  type CustomerPhoneOtpPurpose,
} from "@/lib/auth/phone-utils";

export { normalizeSaudiPhone };
export type { CustomerPhoneOtpPurpose };

const OTP_RESEND_SECONDS = 60;
const OTP_MAX_HOURLY_SENDS = 3;
const OTP_MAX_DAILY_SENDS = 5;
const OTP_DEFAULT_GLOBAL_DAILY_NEW_CHATS = 20;

type RequestRpcRow = {
  request_id?: string | null;
  result?: string | null;
  retry_after_seconds?: number | null;
};

export type PhoneOtpRequestResult =
  | { required: false; ok: true }
  | {
      required: true;
      ok: true;
      maskedPhone: string;
      resendAfterSeconds: number;
    }
  | {
      required: true;
      ok: false;
      message: string;
      retryAfterSeconds?: number;
    };

function csvSet(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function firstRow(data: unknown): RequestRpcRow {
  if (Array.isArray(data)) return (data[0] ?? {}) as RequestRpcRow;
  return (data ?? {}) as RequestRpcRow;
}

function maskedPhone(phone: string) {
  return `${phone.slice(0, 4)}****${phone.slice(-4)}`;
}

export function isPhoneOtpRequiredForBrand(slug: string) {
  if (!enabled(process.env.PHONE_OTP_ENABLED)) return false;
  if (process.env.WHATSAPP_PROVIDER?.trim().toLowerCase() !== "green_api") return false;
  if (!enabled(process.env.PHONE_OTP_TEST_MODE)) return true;
  return csvSet(process.env.PHONE_OTP_ALLOWED_BRAND_SLUGS).has(
    slug.trim().toLowerCase(),
  );
}

export function isAllowedCustomerOtpPhone(phoneNormalized: string) {
  if (!enabled(process.env.PHONE_OTP_TEST_MODE)) return true;
  return [...csvSet(process.env.PHONE_OTP_ALLOWED_PHONES)].some(
    (phone) => normalizeSaudiPhone(phone) === phoneNormalized,
  );
}

function requestError(result: string | null | undefined, retryAfter?: number) {
  if (result === "cooldown") {
    return {
      message: "انتظر قليلًا قبل طلب رمز جديد.",
      retryAfterSeconds: retryAfter ?? OTP_RESEND_SECONDS,
    };
  }
  if (result === "hourly_limit" || result === "daily_limit" || result === "global_limit") {
    return { message: "تم بلوغ حد إرسال رموز التحقق. حاول لاحقًا." };
  }
  return { message: "تعذر إرسال رمز التحقق. حاول مرة أخرى." };
}

export async function requestCustomerPhoneOtp(
  slug: string,
  phone: string,
  purpose: CustomerPhoneOtpPurpose,
): Promise<PhoneOtpRequestResult> {
  if (!isPhoneOtpRequiredForBrand(slug)) {
    return { required: false, ok: true };
  }

  const phoneNormalized = normalizeSaudiPhone(phone);
  if (!phoneNormalized) {
    return {
      required: true,
      ok: false,
      message: "أدخل رقم جوال سعودي صحيحًا.",
    };
  }
  if (!isAllowedCustomerOtpPhone(phoneNormalized)) {
    return {
      required: true,
      ok: false,
      message: "تعذر إرسال رمز التحقق لهذا الرقم.",
    };
  }

  const cafe = await getPublicCafeBySlugAdmin(slug);
  if (!cafe) {
    return {
      required: true,
      ok: false,
      message: "تعذر إرسال رمز التحقق. حاول مرة أخرى.",
    };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("begin_customer_phone_otp_request", {
    p_cafe_id: cafe.id,
    p_phone_normalized: phoneNormalized,
    p_purpose: purpose,
    p_provider_instance: greenApiProviderInstanceKey(),
    p_resend_seconds: OTP_RESEND_SECONDS,
    p_hourly_limit: OTP_MAX_HOURLY_SENDS,
    p_daily_limit: OTP_MAX_DAILY_SENDS,
    p_global_daily_limit: positiveInteger(
      process.env.PHONE_OTP_MAX_UNIQUE_RECIPIENTS_PER_DAY,
      OTP_DEFAULT_GLOBAL_DAILY_NEW_CHATS,
    ),
  });
  if (error) throw error;

  const row = firstRow(data);
  if (row.result !== "created" || !row.request_id) {
    return {
      required: true,
      ok: false,
      ...requestError(row.result, row.retry_after_seconds ?? undefined),
    };
  }

  try {
    await ensureCustomerPhoneAuthUser(phoneNormalized);
    const supabase = await createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      phone: `+${phoneNormalized}`,
      options: { shouldCreateUser: false },
    });
    if (otpError) throw otpError;

    const { error: completionError } = await admin.rpc(
      "complete_customer_phone_otp_request",
      {
        p_request_id: row.request_id,
        p_accepted: true,
      },
    );
    if (completionError) throw completionError;
  } catch (error) {
    try {
      await admin.rpc("complete_customer_phone_otp_request", {
        p_request_id: row.request_id,
        p_accepted: false,
      });
    } catch {
      // Preserve the original request failure.
    }
    console.error("[requestCustomerPhoneOtp]", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "OTP request failed",
      phone: maskedPhone(phoneNormalized),
    });
    return {
      required: true,
      ok: false,
      message: "تعذر إرسال رمز التحقق. حاول مرة أخرى.",
    };
  }

  return {
    required: true,
    ok: true,
    maskedPhone: maskedPhone(phoneNormalized),
    resendAfterSeconds: OTP_RESEND_SECONDS,
  };
}
