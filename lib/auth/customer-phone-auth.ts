import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicCafeBySlugAdmin } from "@/lib/data/cafes";
import {
  mapCustomerProfileToSession,
  type CustomerProfileRow,
} from "@/lib/data/customers";
import {
  normalizeSaudiPhone,
  type CustomerPhoneOtpPurpose,
} from "@/lib/auth/phone-utils";

type LinkRpcRow = {
  profile_id?: string | null;
  result?: string | null;
};

function firstRow(data: unknown): LinkRpcRow {
  if (Array.isArray(data)) return (data[0] ?? {}) as LinkRpcRow;
  return (data ?? {}) as LinkRpcRow;
}

async function findAuthUserByPhone(phoneNormalized: string) {
  const admin = createAdminClient();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw error;
    const found = data.users.find((user) => user.phone === `+${phoneNormalized}`);
    if (found) return found;
    if (data.users.length < 100) break;
  }
  return null;
}

export async function ensureCustomerPhoneAuthUser(phoneNormalized: string) {
  const admin = createAdminClient();
  const { data: identity, error: identityError } = await admin
    .from("customer_phone_auth_identities")
    .select("auth_user_id")
    .eq("phone_normalized", phoneNormalized)
    .maybeSingle();
  if (identityError) throw identityError;

  const { data: linkedProfile, error: profileError } = await admin
    .from("customer_profiles")
    .select("user_id")
    .eq("phone_normalized", phoneNormalized)
    .eq("phone_auth_conflict", false)
    .not("user_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (profileError) throw profileError;

  const linkedUserId =
    String(identity?.auth_user_id ?? linkedProfile?.user_id ?? "") || null;
  let user = null;

  if (linkedUserId) {
    const { data, error } = await admin.auth.admin.getUserById(linkedUserId);
    if (!error) user = data.user;
  }
  if (!user) user = await findAuthUserByPhone(phoneNormalized);

  if (user) {
    const { data: platformProfile, error: platformProfileError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (platformProfileError) throw platformProfileError;
    if (platformProfile?.role && platformProfile.role !== "customer") {
      throw new Error("CUSTOMER_PHONE_AUTH_ROLE_CONFLICT");
    }
  }

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      phone: `+${phoneNormalized}`,
      phone_confirm: false,
      user_metadata: {
        branda_customer_phone_auth: true,
      },
    });
    if (error || !data.user) throw error ?? new Error("CUSTOMER_AUTH_CREATE_FAILED");
    user = data.user;
  } else if (user.phone !== `+${phoneNormalized}`) {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      phone: `+${phoneNormalized}`,
      user_metadata: {
        ...user.user_metadata,
        branda_customer_phone_auth: true,
      },
    });
    if (error || !data.user) throw error ?? new Error("CUSTOMER_AUTH_UPDATE_FAILED");
    user = data.user;
  }

  return user;
}

export async function linkCustomerAfterSupabasePhoneOtp(input: {
  slug: string;
  phone: string;
  purpose: CustomerPhoneOtpPurpose;
  authUserId: string;
}) {
  const cafe = await getPublicCafeBySlugAdmin(input.slug);
  const phoneNormalized = normalizeSaudiPhone(input.phone);
  if (!cafe || !phoneNormalized) {
    return {
      ok: false as const,
      reason: "failed" as const,
      message: "تعذر إكمال المصادقة. حاول مرة أخرى.",
    };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc(
    "link_customer_after_supabase_phone_otp",
    {
      p_cafe_id: cafe.id,
      p_phone_normalized: phoneNormalized,
      p_purpose: input.purpose,
      p_auth_user_id: input.authUserId,
    },
  );
  if (error) throw error;

  const row = firstRow(data);
  if (row.result !== "authenticated" || !row.profile_id) {
    return {
      ok: false as const,
      reason:
        row.result === "not_found"
          ? ("not_found" as const)
          : ("conflict" as const),
      message:
        row.result === "not_found"
          ? "لا يوجد حساب عميل لهذا الرقم في هذه العلامة. يمكنك إنشاء حساب جديد."
          : "تعذر الدخول لهذا الرقم حاليًا. تواصل مع إدارة العلامة.",
    };
  }

  const { data: profile, error: profileLoadError } = await admin
    .from("customer_profiles")
    .select("*")
    .eq("id", row.profile_id)
    .eq("cafe_id", cafe.id)
    .eq("user_id", input.authUserId)
    .single();
  if (profileLoadError || !profile) {
    throw profileLoadError ?? new Error("CUSTOMER_PROFILE_LOAD_FAILED");
  }

  return {
    ok: true as const,
    session: mapCustomerProfileToSession(input.slug, profile as CustomerProfileRow),
  };
}
