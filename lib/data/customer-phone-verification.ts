import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { z } from "zod";

import { getCafeBySlug } from "@/lib/data/cafes";
import { mapCustomerProfileToSession } from "@/lib/data/customers";
import type { CustomerProfileRow } from "@/lib/data/customers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  maskWhatsAppPhone,
  normalizeWhatsAppPhone,
  sendWhatsAppOtp,
} from "@/lib/notifications/whatsapp";
import type { BarndaksaCustomerSession } from "@/lib/customer/session";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

const customerPhoneVerificationSchema = z.object({
  cafeSlug: z.string().min(1),
  customerId: z.string().uuid(),
  purpose: z.enum(["signup", "login"]).default("signup"),
});

type PhoneVerificationCafe = {
  id: string;
  name: string;
};

type PhoneVerificationContext = {
  admin: ReturnType<typeof createAdminClient>;
  cafe: PhoneVerificationCafe;
  profile: CustomerProfileRow;
};

type PhoneVerificationRow = Record<string, unknown> & {
  id?: string | null;
  sent_at?: string | null;
  expires_at?: string | null;
  status?: string | null;
  max_attempts?: number | null;
  attempts_count?: number | null;
  code_salt?: string | null;
  code_hash?: string | null;
  phone_normalized?: string | null;
};

export type SendCustomerPhoneVerificationResult =
  | {
      ok: true;
      maskedPhone?: string;
      cooldownSeconds: number;
      expiresAt: string;
    }
  | {
      ok: false;
      code: "invalid_phone" | "cooldown" | "send_failed";
      message: string;
      maskedPhone?: string;
      cooldownSeconds: number;
    };

export type VerifyCustomerPhoneCodeResult =
  | {
      ok: true;
      session: BarndaksaCustomerSession;
    }
  | {
      ok: false;
      code:
        | "missing_code"
        | "expired"
        | "max_attempts"
        | "invalid_code"
        | "invalid_phone";
      message: string;
    };

export type CustomerPhoneVerificationStateResult = {
  ok: true;
  maskedPhone?: string;
  verified: boolean;
  verifiedAt: string | null;
  cooldownSeconds: number;
  expiresInSeconds: number;
  status: string | null;
};

function hashCode(code: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

function verifyHash(code: string, salt: string, expectedHash: string): boolean {
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(hashCode(code, salt), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function randomSixDigitCode(): string {
  return String(100000 + randomBytes(4).readUInt32BE(0) % 900000);
}

function secondsUntil(dateValue?: string | null): number {
  if (!dateValue) return 0;
  return Math.max(0, Math.ceil((new Date(dateValue).getTime() - Date.now()) / 1000));
}

async function getCafeAndCustomer(
  cafeSlug: string,
  customerId: string,
): Promise<PhoneVerificationContext> {
  const cafe = await getCafeBySlug(cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("customer_profiles")
    .select("*")
    .eq("id", customerId)
    .eq("cafe_id", cafe.id)
    .maybeSingle();

  if (error) throw error;
  if (!profile) throw new Error("Customer profile not found");

  return { admin, cafe, profile: profile as CustomerProfileRow };
}

export async function sendCustomerPhoneVerificationCode(
  input: z.infer<typeof customerPhoneVerificationSchema>,
): Promise<SendCustomerPhoneVerificationResult> {
  const parsed = customerPhoneVerificationSchema.parse(input);
  const { admin, cafe, profile } = await getCafeAndCustomer(
    parsed.cafeSlug,
    parsed.customerId,
  );

  const phone = String(profile.phone ?? "");
  const normalizedPhone = normalizeWhatsAppPhone(
    String(profile.phone_normalized ?? "") || phone,
  );
  if (!normalizedPhone) {
    return {
      ok: false as const,
      code: "invalid_phone" as const,
      message: "رقم الجوال غير صالح.",
      maskedPhone: maskWhatsAppPhone(phone),
      cooldownSeconds: 0,
    };
  }

  const { data: recentData } = await admin
    .from("customer_phone_verifications")
    .select("sent_at")
    .eq("cafe_id", cafe.id)
    .eq("customer_profile_id", parsed.customerId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const recent = recentData as PhoneVerificationRow | null;

  const cooldownSeconds = recent?.sent_at
    ? secondsUntil(
        new Date(
          new Date(String(recent.sent_at)).getTime() + OTP_RESEND_COOLDOWN_MS,
        ).toISOString(),
      )
    : 0;

  if (cooldownSeconds > 0) {
    return {
      ok: false as const,
      code: "cooldown" as const,
      message: `يمكنك إعادة إرسال الكود بعد ${cooldownSeconds} ثانية.`,
      maskedPhone: maskWhatsAppPhone(normalizedPhone),
      cooldownSeconds,
    };
  }

  const code = randomSixDigitCode();
  const salt = randomBytes(16).toString("base64url");
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  const { error: expireError } = await admin
    .from("customer_phone_verifications")
    .update({ status: "expired" })
    .eq("cafe_id", cafe.id)
    .eq("customer_profile_id", parsed.customerId)
    .eq("status", "pending");
  if (expireError) throw expireError;

  const { error: insertError } = await admin
    .from("customer_phone_verifications")
    .insert({
      cafe_id: cafe.id,
      customer_profile_id: parsed.customerId,
      phone,
      phone_normalized: normalizedPhone,
      code_hash: hashCode(code, salt),
      code_salt: salt,
      expires_at: expiresAt,
      attempts_count: 0,
      max_attempts: OTP_MAX_ATTEMPTS,
      sent_at: new Date().toISOString(),
      status: "pending",
      purpose: parsed.purpose,
    });

  if (insertError) throw insertError;

  await sendWhatsAppOtp({
    to: normalizedPhone,
    code,
    customerName: String(profile.full_name ?? "عميلنا العزيز"),
    brandName: cafe.name,
    cafeId: cafe.id,
  }).catch((error) => {
    console.warn("[customer-phone-verification:whatsapp]", {
      cafeId: cafe.id,
      customerId: parsed.customerId,
      reason: error instanceof Error ? error.message.slice(0, 120) : "unknown_error",
    });
  });

  return {
    ok: true as const,
    maskedPhone: maskWhatsAppPhone(normalizedPhone),
    cooldownSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
    expiresAt,
  };
}

export async function verifyCustomerPhoneCode(input: {
  cafeSlug: string;
  customerId: string;
  code: string;
}): Promise<VerifyCustomerPhoneCodeResult> {
  const parsed = z
    .object({
      cafeSlug: z.string().min(1),
      customerId: z.string().uuid(),
      code: z.string().regex(/^\d{6}$/),
    })
    .parse(input);

  const { admin, cafe, profile } = await getCafeAndCustomer(
    parsed.cafeSlug,
    parsed.customerId,
  );

  const { data: verificationData, error } = await admin
    .from("customer_phone_verifications")
    .select("*")
    .eq("cafe_id", cafe.id)
    .eq("customer_profile_id", parsed.customerId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const verification = verificationData as PhoneVerificationRow | null;

  if (error) throw error;
  if (!verification) {
    return { ok: false as const, code: "missing_code" as const, message: "لا يوجد كود تحقق نشط." };
  }

  const verificationId = String(verification.id);
  const maxAttempts = Number(verification.max_attempts ?? OTP_MAX_ATTEMPTS);
  const attempts = Number(verification.attempts_count ?? 0);

  if (new Date(String(verification.expires_at)).getTime() < Date.now()) {
    await admin
      .from("customer_phone_verifications")
      .update({ status: "expired" })
      .eq("id", verificationId);
    return { ok: false as const, code: "expired" as const, message: "انتهت صلاحية الكود." };
  }

  if (attempts >= maxAttempts) {
    await admin
      .from("customer_phone_verifications")
      .update({ status: "failed" })
      .eq("id", verificationId);
    return {
      ok: false as const,
      code: "max_attempts" as const,
      message: "تجاوزت عدد المحاولات المسموح.",
    };
  }

  const isValid = verifyHash(
    parsed.code,
    String(verification.code_salt ?? ""),
    String(verification.code_hash ?? ""),
  );

  if (!isValid) {
    const nextAttempts = attempts + 1;
    await admin
      .from("customer_phone_verifications")
      .update({
        attempts_count: nextAttempts,
        status: nextAttempts >= maxAttempts ? "failed" : "pending",
      })
      .eq("id", verificationId);
    return { ok: false as const, code: "invalid_code" as const, message: "الكود غير صحيح." };
  }

  const normalizedPhone = normalizeWhatsAppPhone(
    String(verification.phone_normalized ?? "") || String(profile.phone ?? ""),
  );
  if (!normalizedPhone) {
    return { ok: false as const, code: "invalid_phone" as const, message: "رقم الجوال غير صالح." };
  }

  const now = new Date().toISOString();
  const [{ error: verificationUpdateError }, { data: updatedProfileData, error: profileError }] =
    await Promise.all([
      admin
        .from("customer_phone_verifications")
        .update({ status: "verified", verified_at: now })
        .eq("id", verificationId),
      admin
        .from("customer_profiles")
        .update({
          phone_verified_at: now,
          phone_normalized: normalizedPhone,
          phone_verification_required: false,
        })
        .eq("id", parsed.customerId)
        .eq("cafe_id", cafe.id)
        .select("*")
        .single(),
    ]);
  const updatedProfile = updatedProfileData as CustomerProfileRow;

  if (verificationUpdateError) throw verificationUpdateError;
  if (profileError) throw profileError;

  return {
    ok: true as const,
    session: mapCustomerProfileToSession(parsed.cafeSlug, updatedProfile),
  };
}

export async function getCustomerPhoneVerificationState(input: {
  cafeSlug: string;
  customerId: string;
}): Promise<CustomerPhoneVerificationStateResult> {
  const parsed = z
    .object({
      cafeSlug: z.string().min(1),
      customerId: z.string().uuid(),
    })
    .parse(input);

  const { admin, cafe, profile } = await getCafeAndCustomer(
    parsed.cafeSlug,
    parsed.customerId,
  );

  const { data: recentData } = await admin
    .from("customer_phone_verifications")
    .select("sent_at, expires_at, status")
    .eq("cafe_id", cafe.id)
    .eq("customer_profile_id", parsed.customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const recent = recentData as PhoneVerificationRow | null;

  const verifiedAt = profile.phone_verified_at
    ? String(profile.phone_verified_at)
    : null;
  const phone = String(profile.phone_normalized ?? profile.phone ?? "");

  return {
    ok: true as const,
    maskedPhone: maskWhatsAppPhone(phone),
    verified: Boolean(verifiedAt),
    verifiedAt,
    cooldownSeconds: recent?.sent_at
      ? secondsUntil(
          new Date(
            new Date(String(recent.sent_at)).getTime() + OTP_RESEND_COOLDOWN_MS,
          ).toISOString(),
        )
      : 0,
    expiresInSeconds: secondsUntil(recent?.expires_at ? String(recent.expires_at) : null),
    status: recent?.status ? String(recent.status) : null,
  };
}
