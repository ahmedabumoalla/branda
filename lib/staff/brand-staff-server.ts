import "server-only";

import { z } from "zod";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import { LOCO_CAFE_ID } from "@/lib/whatsapp/brand-connection-types";
import { brandStaffAccessFromPermissions, brandStaffLandingPath } from "@/lib/staff/brand-staff-access";

// Loco dashboard employee management (user request 2026-11-17)
// Cashier records and cashier permissions are read only here; cashier login never changes

export type BrandStaffMember = {
  key: string;
  accountId: string | null;
  cashierId: string | null;
  name: string;
  phone: string | null;
  cashierActive: boolean | null;
  hasLogin: boolean;
  canLogin: boolean;
  menu: boolean;
  messages: boolean;
  rewards: boolean;
};

type AccountRow = {
  id: string; cafe_id: string; cashier_id: string | null; user_id: string | null; full_name: string; phone: string;
  can_login: boolean; can_edit_menu: boolean; can_send_messages: boolean; can_manage_rewards: boolean;
};

function toLatinDigits(value: string) {
  return value.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0));
}

/** E.164 form (+9665XXXXXXXX) or null */
export function normalizeStaffPhone(value: string | null | undefined) {
  const digits = normalizeSaudiPhone(toLatinDigits(String(value ?? "")));
  return digits ? `+${digits}` : null;
}

const passwordSchema = z.string().min(8, "كلمة المرور 8 أحرف أو أرقام على الأقل").max(72, "كلمة المرور طويلة جدًا").refine(value => !/[\r\n]/.test(value), "كلمة المرور غير صالحة");

async function requireLocoOwner() {
  const cafe = await requireOwnerCafeContext();
  if (cafe.id !== LOCO_CAFE_ID || !["owner", "platform_admin"].includes(cafe.role)) {
    throw new Error("إدارة صلاحيات الموظفين متاحة لمالك العلامة فقط");
  }
  return cafe;
}

/** Owner page guard: true only for the Loco owner or a platform admin in Loco */
export async function canManageBrandStaff() {
  try { await requireLocoOwner(); return true; } catch { return false; }
}

const accountColumns = "id,cafe_id,cashier_id,user_id,full_name,phone,can_login,can_edit_menu,can_send_messages,can_manage_rewards";

function memberFromAccount(row: AccountRow, cashier?: { id: string; full_name: string; phone: string | null; active: boolean }): BrandStaffMember {
  return {
    key: cashier ? `cashier:${cashier.id}` : `account:${row.id}`,
    accountId: row.id,
    cashierId: cashier?.id ?? row.cashier_id,
    name: cashier?.full_name ?? row.full_name,
    phone: row.phone,
    cashierActive: cashier ? cashier.active : null,
    hasLogin: Boolean(row.user_id),
    canLogin: row.can_login,
    menu: row.can_edit_menu,
    messages: row.can_send_messages,
    rewards: row.can_manage_rewards,
  };
}

export async function listBrandStaff() {
  const cafe = await requireLocoOwner();
  const admin = createAdminClient();
  const [accounts, cashiers] = await Promise.all([
    admin.from("brand_staff_accounts").select(accountColumns).eq("cafe_id", cafe.id).order("created_at"),
    // Owner "open as cashier" sessions are not employees
    admin.from("cafe_cashiers").select("id,full_name,phone,active").eq("cafe_id", cafe.id).is("owner_user_id", null).order("created_at"),
  ]);
  if (accounts.error || cashiers.error) throw new Error("تعذر تحميل الموظفين حاول مجددًا");
  const rows = (accounts.data ?? []) as AccountRow[];
  const byCashier = new Map(rows.filter(row => row.cashier_id).map(row => [row.cashier_id as string, row]));
  const cashierMembers: BrandStaffMember[] = (cashiers.data ?? []).map(cashier => {
    const row = byCashier.get(cashier.id);
    if (row) return memberFromAccount(row, cashier);
    return {
      key: `cashier:${cashier.id}`, accountId: null, cashierId: cashier.id, name: cashier.full_name,
      phone: normalizeStaffPhone(cashier.phone), cashierActive: cashier.active, hasLogin: false,
      canLogin: false, menu: false, messages: false, rewards: false,
    };
  });
  const employees = rows.filter(row => !row.cashier_id).map(row => memberFromAccount(row));
  return { employees, cashiers: cashierMembers };
}

const accessSchema = z.object({
  accountId: z.uuid().nullable().optional(),
  cashierId: z.uuid().nullable().optional(),
  phone: z.string().max(30).optional(),
  canLogin: z.boolean(),
  menu: z.boolean(),
  messages: z.boolean(),
  rewards: z.boolean(),
  password: z.string().max(200).optional(),
});

const employeeSchema = z.object({
  name: z.string().trim().min(2, "اكتب اسم الموظف").max(80, "الاسم طويل جدًا"),
  phone: z.string().max(30),
});

type Result = { ok: true; message: string } | { ok: false; message: string };

function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message || "تحقق من البيانات";
}

export async function addBrandEmployee(input: z.input<typeof employeeSchema> & Omit<z.input<typeof accessSchema>, "accountId" | "cashierId" | "phone">): Promise<Result> {
  const parsed = employeeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const phone = normalizeStaffPhone(parsed.data.phone);
  if (!phone) return { ok: false, message: "رقم الجوال غير صحيح اكتبه بصيغة 05XXXXXXXX" };
  const cafe = await requireLocoOwner();
  const admin = createAdminClient();
  const created = await admin.from("brand_staff_accounts")
    .insert({ cafe_id: cafe.id, full_name: parsed.data.name, phone })
    .select("id").single();
  if (created.error) {
    return { ok: false, message: created.error.code === "23505" ? "رقم الجوال مضاف مسبقًا لموظف آخر" : "تعذر إضافة الموظف حاول مجددًا" };
  }
  const saved = await saveBrandStaffAccess({ ...input, accountId: created.data.id, cashierId: null });
  if (!saved.ok) {
    // Keep the list clean so the owner can retry with corrected details
    await admin.from("brand_staff_accounts").delete().eq("id", created.data.id).is("user_id", null);
    return saved;
  }
  return { ok: true, message: "تمت إضافة الموظف وحفظ صلاحياته" };
}

export async function saveBrandStaffAccess(input: z.input<typeof accessSchema>): Promise<Result> {
  const parsedInput = accessSchema.safeParse(input);
  if (!parsedInput.success) return { ok: false, message: firstIssue(parsedInput.error) };
  const parsed = parsedInput.data;
  const cafe = await requireLocoOwner();
  const admin = createAdminClient();

  // Resolve the employee record; a cashier gets one the first time the owner grants something
  let account: AccountRow | null = null;
  if (parsed.accountId) {
    const found = await admin.from("brand_staff_accounts").select(accountColumns).eq("id", parsed.accountId).eq("cafe_id", cafe.id).maybeSingle();
    account = found.data as AccountRow | null;
  } else if (parsed.cashierId) {
    const cashier = await admin.from("cafe_cashiers").select("id,full_name,phone").eq("id", parsed.cashierId).eq("cafe_id", cafe.id).is("owner_user_id", null).maybeSingle();
    if (!cashier.data) return { ok: false, message: "الكاشير غير موجود" };
    const existing = await admin.from("brand_staff_accounts").select(accountColumns).eq("cashier_id", cashier.data.id).maybeSingle();
    account = existing.data as AccountRow | null;
    if (!account) {
      const phone = normalizeStaffPhone(cashier.data.phone) ?? normalizeStaffPhone(parsed.phone);
      if (!phone) return { ok: false, message: "أضف رقم جوال الكاشير لتفعيل دخوله إلى لوحة التحكم" };
      const created = await admin.from("brand_staff_accounts")
        .insert({ cafe_id: cafe.id, cashier_id: cashier.data.id, full_name: cashier.data.full_name, phone })
        .select(accountColumns).single();
      if (created.error) return { ok: false, message: created.error.code === "23505" ? "رقم الجوال مضاف مسبقًا لموظف آخر" : "تعذر حفظ صلاحيات الكاشير" };
      account = created.data as AccountRow;
    }
  }
  if (!account) return { ok: false, message: "الموظف غير موجود" };

  const password = parsed.password?.trim() ? parsed.password : "";
  if (password) {
    const valid = passwordSchema.safeParse(password);
    if (!valid.success) return { ok: false, message: firstIssue(valid.error) };
  }

  let createdUserId: string | null = null;
  if (parsed.canLogin && !account.user_id) {
    if (!password) return { ok: false, message: "حدد كلمة مرور للموظف لتفعيل دخوله إلى لوحة التحكم" };
    const created = await admin.auth.admin.createUser({
      phone: account.phone, password, phone_confirm: true,
      user_metadata: { full_name: account.full_name },
      app_metadata: { brand_staff_cafe_id: cafe.id, brand_staff_account_id: account.id },
    });
    if (created.error || !created.data.user) {
      // Never take over an identity that already exists on the platform
      if (["phone_exists", "user_already_exists"].includes(created.error?.code ?? "")) return { ok: false, message: "رقم الجوال مسجل في برندة بحساب آخر استخدم رقمًا مختلفًا للموظف" };
      if (created.error?.code === "weak_password") return { ok: false, message: "كلمة المرور ضعيفة اختر كلمة أطول" };
      return { ok: false, message: "تعذر إنشاء حساب الدخول حاول مجددًا" };
    }
    createdUserId = created.data.user.id;
  } else if (password && account.user_id) {
    const changed = await admin.auth.admin.updateUserById(account.user_id, { password });
    if (changed.error) return { ok: false, message: "تعذر تغيير كلمة المرور حاول مجددًا" };
  }

  const granted = await admin.rpc("set_brand_staff_access", {
    p_account_id: account.id, p_user_id: createdUserId, p_can_login: parsed.canLogin,
    p_menu: parsed.canLogin && parsed.menu, p_messages: parsed.canLogin && parsed.messages, p_rewards: parsed.canLogin && parsed.rewards,
  });
  if (granted.error) {
    if (createdUserId) {
      // Remove the fresh identity only when the record confirms it was not linked
      const check = await admin.from("brand_staff_accounts").select("user_id").eq("id", account.id).maybeSingle();
      if (!check.error && check.data?.user_id !== createdUserId) await admin.auth.admin.deleteUser(createdUserId).catch(() => undefined);
    }
    return { ok: false, message: "تعذر حفظ الصلاحيات حاول مجددًا" };
  }
  return { ok: true, message: parsed.canLogin ? "تم حفظ الصلاحيات ويستطيع الموظف الدخول من صفحة تسجيل الدخول برقم جواله" : "تم حفظ الصلاحيات وإيقاف دخول الموظف إلى لوحة التحكم" };
}

export async function removeBrandEmployee(accountId: string): Promise<Result> {
  const id = z.uuid().safeParse(accountId);
  if (!id.success) return { ok: false, message: "الموظف غير موجود" };
  const cafe = await requireLocoOwner();
  const admin = createAdminClient();
  const found = await admin.from("brand_staff_accounts").select("id,user_id,cashier_id").eq("id", id.data).eq("cafe_id", cafe.id).maybeSingle();
  if (!found.data) return { ok: false, message: "الموظف غير موجود" };
  if (found.data.cashier_id) return { ok: false, message: "الكاشير يُدار من صفحة إدارة الكاشير" };
  // The delete trigger removes the dashboard membership in the same statement
  const removed = await admin.from("brand_staff_accounts").delete().eq("id", found.data.id);
  if (removed.error) return { ok: false, message: "تعذر حذف الموظف حاول مجددًا" };
  if (found.data.user_id) {
    const user = await admin.auth.admin.getUserById(found.data.user_id);
    // Only identities created by this page are deleted
    if (user.data.user?.app_metadata?.brand_staff_cafe_id === cafe.id) await admin.auth.admin.deleteUser(found.data.user_id).catch(() => undefined);
  }
  return { ok: true, message: "تم حذف الموظف وإلغاء دخوله" };
}

/** Login redirect for a Loco employee with an active dashboard membership */
export async function findBrandStaffLanding(userId: string) {
  const { data } = await createAdminClient().from("cafe_members").select("permissions")
    .eq("user_id", userId).eq("cafe_id", LOCO_CAFE_ID).eq("role", "staff").maybeSingle();
  return data ? brandStaffLandingPath(brandStaffAccessFromPermissions(data.permissions)) : null;
}
