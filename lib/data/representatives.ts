import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/data/cafes";

export type RepresentativeItem = {
  id: string;
  employeeNumber: string;
  fullName: string;
  email: string;
  phone: string;
  region: string;
  nationality: string;
  couponCode: string;
  discountPercent: number;
  freeTrialDays: number;
  eligiblePlanIds: string[];
  paidBrandsCount: number;
  registeredBrandsCount: number;
  subscriptionRevenue: number;
  renewalsRevenue: number;
  commissionAmount: number;
  active: boolean;
};

export type RepresentativeSession = {
  id: string;
  employeeNumber: string;
  fullName: string;
  email: string;
  couponCode: string;
};

export type RepresentativeSubscriptionDetail = {
  id: string;
  planName: string;
  startedAt: string;
  expiresAt?: string;
  amount: number;
  commissionRate: number;
  commissionAmount: number;
  commissionStatus: "accrued" | "paid" | "cancelled" | "none";
  type: "initial" | "renewal";
};

export type RepresentativeBrandDetail = {
  id: string;
  name: string;
  slug: string;
  registeredAt: string;
  firstPaidSubscriptionAt?: string;
  commissionEndAt?: string;
  renewalsCount: number;
  subscriptionsAmount: number;
  commissionAmount: number;
  unsettledAmount: number;
  branch?: {
    name: string;
    address: string;
    city: string;
    lat?: number;
    lng?: number;
    mapUrl?: string;
  };
  subscriptions: RepresentativeSubscriptionDetail[];
};

export type RepresentativeDashboard = {
  representative: RepresentativeSession;
  summary: {
    registeredBrandsCount: number;
    paidBrandsCount: number;
    subscriptionsAmount: number;
    commissionAmount: number;
    unsettledAmount: number;
  };
  brands: RepresentativeBrandDetail[];
};

const optionalText = (maxLength: number) =>
  z.string().trim().max(maxLength).optional().transform((value) => value || undefined);

const representativeSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(20),
  birthDate: z.string().min(1),
  email: z.string().trim().email(),
  region: z.string().trim().min(1).max(100),
  nationality: z.string().trim().min(1).max(100),
  bankAccountNumber: optionalText(80),
  iban: optionalText(60),
  accountName: optionalText(120),
  swiftCode: optionalText(30),
  couponCode: z.string().trim().toUpperCase().min(3).max(30).regex(/^[A-Z0-9-]+$/),
  discountPercent: z.number().min(0).max(100),
  freeTrialDays: z.number().int().min(0).max(365),
  eligiblePlanIds: z.array(z.string().trim().min(1).max(60)).max(30),
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(8).max(72),
  newPassword: z.string().min(8).max(72),
});

function generateTemporaryPassword() {
  const token = crypto.randomUUID().replaceAll("-", "");
  return `Branda!${token.slice(0, 6)}${token.slice(8, 12)}9`;
}

function buildRepresentativeAuthEmail() {
  return `rep-login-${crypto.randomUUID()}@auth.branda.local`;
}

function getBankDocumentExtension(file: File) {
  const allowed: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  const extension = allowed[file.type];
  if (!extension) {
    throw new Error("مرفق الحساب البنكي يجب أن يكون PDF أو صورة JPG أو PNG أو WEBP");
  }

  if (file.size > 8 * 1024 * 1024) {
    throw new Error("حجم مرفق الحساب البنكي يجب ألا يتجاوز 8MB");
  }

  return extension;
}

export async function getAdminRepresentatives(): Promise<RepresentativeItem[]> {
  await requirePlatformAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_representatives")
    .select(
      "*, representative_coupons(code, discount_percent, free_trial_days, eligible_plan_ids), brand_referrals(id, first_paid_subscription_at), representative_commissions(amount_sar, base_amount_sar, commission_type)"
    )
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const coupons = row.representative_coupons as Array<Record<string, unknown>> | null;
    const referrals = row.brand_referrals as Array<Record<string, unknown>> | null;
    const commissions = row.representative_commissions as Array<Record<string, unknown>> | null;
    const coupon = coupons?.[0];

    return {
      id: String(row.id),
      employeeNumber: String(row.employee_number),
      fullName: String(row.full_name),
      email: String(row.email),
      phone: String(row.phone),
      region: String(row.region),
      nationality: String(row.nationality),
      couponCode: String(coupon?.code ?? ""),
      discountPercent: Number(coupon?.discount_percent ?? 0),
      freeTrialDays: Number(coupon?.free_trial_days ?? 0),
      eligiblePlanIds: Array.isArray(coupon?.eligible_plan_ids)
        ? (coupon?.eligible_plan_ids as string[])
        : [],
      registeredBrandsCount: referrals?.length ?? 0,
      paidBrandsCount:
        referrals?.filter((item) => Boolean(item.first_paid_subscription_at)).length ?? 0,
      subscriptionRevenue: (commissions ?? [])
        .filter((item) => item.commission_type === "initial")
        .reduce((sum, item) => sum + Number(item.base_amount_sar ?? 0), 0),
      renewalsRevenue: (commissions ?? [])
        .filter((item) => item.commission_type === "renewal")
        .reduce((sum, item) => sum + Number(item.base_amount_sar ?? 0), 0),
      commissionAmount: (commissions ?? []).reduce(
        (sum, item) => sum + Number(item.amount_sar ?? 0),
        0
      ),
      active: Boolean(row.active),
    };
  });
}

export async function createRepresentative(input: {
  fullName: string;
  phone: string;
  birthDate: string;
  email: string;
  region: string;
  nationality: string;
  bankAccountNumber?: string;
  iban?: string;
  accountName?: string;
  swiftCode?: string;
  couponCode: string;
  discountPercent: number;
  freeTrialDays: number;
  eligiblePlanIds: string[];
  bankDocument?: File;
}) {
  const adminUser = await requirePlatformAdmin();
  const parsed = representativeSchema.parse(input);

  const password = generateTemporaryPassword();
  const loginAuthEmail = buildRepresentativeAuthEmail();
  const admin = createAdminClient();

  let documentPath: string | null = null;
  let authUserId: string | null = null;

  try {
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: loginAuthEmail,
      password,
      email_confirm: true,
      user_metadata: {
        account_type: "representative",
        full_name: parsed.fullName,
        contact_email: parsed.email.toLowerCase(),
      },
    });

    if (authError || !authData.user) {
      throw authError ?? new Error("تعذر إنشاء حساب دخول المندوب");
    }

    authUserId = authData.user.id;

    if (input.bankDocument && input.bankDocument.size > 0) {
      const extension = getBankDocumentExtension(input.bankDocument);
      documentPath = `${authData.user.id}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await admin.storage
        .from("representative-documents")
        .upload(documentPath, input.bankDocument, {
          contentType: input.bankDocument.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;
    }

    const { data: representative, error: representativeError } = await admin
      .from("platform_representatives")
      .insert({
        user_id: authData.user.id,
        auth_login_email: loginAuthEmail,
        full_name: parsed.fullName,
        phone: parsed.phone,
        birth_date: parsed.birthDate,
        email: parsed.email.toLowerCase(),
        region: parsed.region,
        nationality: parsed.nationality,
        bank_account_number: parsed.bankAccountNumber ?? null,
        iban: parsed.iban ?? null,
        account_name: parsed.accountName ?? null,
        swift_code: parsed.swiftCode ?? null,
        bank_document_storage_path: documentPath,
        created_by: adminUser.id,
      })
      .select("id")
      .single();

    if (representativeError || !representative) {
      throw representativeError ?? new Error("تعذر حفظ بيانات المندوب");
    }

    const { error: couponError } = await admin.from("representative_coupons").insert({
      representative_id: representative.id,
      code: parsed.couponCode,
      discount_percent: parsed.discountPercent,
      free_trial_days: parsed.freeTrialDays,
      eligible_plan_ids: parsed.eligiblePlanIds,
      active: true,
    });

    if (couponError) {
      await admin.from("platform_representatives").delete().eq("id", representative.id);
      throw couponError;
    }

    return {
      loginEmail: parsed.email.toLowerCase(),
      temporaryPassword: password,
    };
  } catch (error) {
    if (documentPath) {
      await admin.storage.from("representative-documents").remove([documentPath]);
    }

    if (authUserId) {
      await admin.auth.admin.deleteUser(authUserId);
    }

    throw error;
  }
}

export async function loginRepresentativeWithPassword(email: string, password: string) {
  const admin = createAdminClient();

  const { data: representative, error } = await admin
    .from("platform_representatives")
    .select("id, auth_login_email, active")
    .eq("email", email.trim().toLowerCase())
    .eq("active", true)
    .maybeSingle();

  if (error || !representative?.auth_login_email) {
    return null;
  }

  const supabase = await createClient();
  const { data: authData, error: loginError } = await supabase.auth.signInWithPassword({
    email: String(representative.auth_login_email),
    password,
  });

  if (loginError || !authData.user) {
    return null;
  }

  return String(representative.id);
}

function mapRepresentativeDashboard(payload: Record<string, unknown>): RepresentativeDashboard {
  const representative = payload.representative as Record<string, unknown>;
  const summary = payload.summary as Record<string, unknown>;
  const brandRows = Array.isArray(payload.brands) ? payload.brands : [];

  return {
    representative: {
      id: String(representative.id),
      employeeNumber: String(representative.employeeNumber),
      fullName: String(representative.fullName),
      email: String(representative.email),
      couponCode: String(representative.couponCode ?? ""),
    },
    summary: {
      registeredBrandsCount: Number(summary.registeredBrandsCount ?? 0),
      paidBrandsCount: Number(summary.paidBrandsCount ?? 0),
      subscriptionsAmount: Number(summary.subscriptionsAmount ?? 0),
      commissionAmount: Number(summary.commissionAmount ?? 0),
      unsettledAmount: Number(summary.unsettledAmount ?? 0),
    },
    brands: brandRows.map((value) => {
      const brand = value as Record<string, unknown>;
      const branch = brand.branch as Record<string, unknown> | null;
      const subscriptions = Array.isArray(brand.subscriptions) ? brand.subscriptions : [];

      return {
        id: String(brand.id),
        name: String(brand.name),
        slug: String(brand.slug),
        registeredAt: String(brand.registeredAt),
        firstPaidSubscriptionAt: brand.firstPaidSubscriptionAt
          ? String(brand.firstPaidSubscriptionAt)
          : undefined,
        commissionEndAt: brand.commissionEndAt ? String(brand.commissionEndAt) : undefined,
        renewalsCount: Number(brand.renewalsCount ?? 0),
        subscriptionsAmount: Number(brand.subscriptionsAmount ?? 0),
        commissionAmount: Number(brand.commissionAmount ?? 0),
        unsettledAmount: Number(brand.unsettledAmount ?? 0),
        branch: branch
          ? {
              name: String(branch.name),
              address: String(branch.address ?? ""),
              city: String(branch.city ?? ""),
              lat: branch.lat == null ? undefined : Number(branch.lat),
              lng: branch.lng == null ? undefined : Number(branch.lng),
              mapUrl: branch.mapUrl ? String(branch.mapUrl) : undefined,
            }
          : undefined,
        subscriptions: subscriptions.map((item) => {
          const subscription = item as Record<string, unknown>;
          return {
            id: String(subscription.id),
            planName: String(subscription.planName),
            startedAt: String(subscription.startedAt),
            expiresAt: subscription.expiresAt ? String(subscription.expiresAt) : undefined,
            amount: Number(subscription.amount ?? 0),
            commissionRate: Number(subscription.commissionRate ?? 0),
            commissionAmount: Number(subscription.commissionAmount ?? 0),
            commissionStatus: String(subscription.commissionStatus ?? "none") as RepresentativeSubscriptionDetail["commissionStatus"],
            type: String(subscription.type ?? "renewal") as RepresentativeSubscriptionDetail["type"],
          };
        }),
      };
    }),
  };
}

export async function getRepresentativeDashboard(): Promise<RepresentativeDashboard | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_current_representative_dashboard");

  if (error) {
    if (error.message.includes("Representative not found")) return null;
    throw error;
  }

  if (!data) return null;
  return mapRepresentativeDashboard(data as Record<string, unknown>);
}

export async function getCurrentRepresentative(): Promise<RepresentativeSession | null> {
  const dashboard = await getRepresentativeDashboard();
  return dashboard?.representative ?? null;
}

export async function changeRepresentativePassword(input: {
  currentPassword: string;
  newPassword: string;
}) {
  const parsed = passwordChangeSchema.parse(input);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    throw new Error("الجلسة غير صالحة");
  }

  const { data: representative, error: representativeError } = await supabase.rpc(
    "get_current_representative_dashboard"
  );

  if (representativeError || !representative) {
    throw new Error("حساب المندوب غير موجود");
  }

  const { error: passwordError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.currentPassword,
  });

  if (passwordError) {
    throw new Error("كلمة المرور السابقة غير صحيحة");
  }

  if (parsed.currentPassword === parsed.newPassword) {
    throw new Error("كلمة المرور الجديدة مطابقة للسابقة");
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.newPassword,
  });

  if (updateError) {
    throw updateError;
  }
}
