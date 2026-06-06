# Lib Data Auth Supabase Source

# File: lib/branda/env.ts

```typescript
/** Safe env access — never log secrets */

export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

export function getSupabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
}

export function requireSupabaseUrl(): string {
  const url = getSupabaseUrl();
  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL. Copy .env.example to .env.local and configure Supabase."
    );
  }
  return url;
}

export function requireSupabaseAnonKey(): string {
  const key = getSupabaseAnonKey();
  if (!key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and configure Supabase."
    );
  }
  return key;
}

export function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Server-only — never expose to the client."
    );
  }
  return key;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

```

# File: lib/customer/session.ts

```typescript
export type BrandaCustomerSession = {
  id: string;
  cafeSlug: string;
  fullName: string;
  phone: string;
  email?: string;
  avatarUrl?: string;
  avatarAssetId?: string;
  createdAt: string;
};

export function getCustomerKey(_slug: string) {
  return "supabase_auth_session";
}

/** Load customer session from Supabase Auth (server action) */
export async function getCustomerSession(slug: string): Promise<BrandaCustomerSession | null> {
  const { getCustomerSessionAction } = await import("@/app/actions/auth");
  return getCustomerSessionAction(slug);
}

/** @deprecated Sessions are managed by Supabase Auth — use loginCustomerAction */
export function setCustomerSession(_slug: string, _session: BrandaCustomerSession) {
  console.warn("[session] setCustomerSession is deprecated — use loginCustomerAction");
}

export async function updateCustomerSession(
  slug: string,
  updates: Partial<BrandaCustomerSession>
): Promise<BrandaCustomerSession | null> {
  const current = await getCustomerSession(slug);
  if (!current) return null;
  return { ...current, ...updates };
}

export async function clearCustomerSession(_slug: string) {
  const { logoutCustomerAction } = await import("@/app/actions/auth");
  await logoutCustomerAction();
}

/** @deprecated CRM profiles live in customer_profiles table */
export function upsertCustomerProfile(_session: BrandaCustomerSession) {
  /* no-op — handled by loginCustomerAction */
}

```

# File: lib/data/admin.ts

```typescript
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import type {
  PlatformCafe,
  PlatformCustomer,
  PlatformOperation,
  PlatformPlan,
} from "@/lib/platform/admin-data";

function mapDbPlan(row: Record<string, unknown>): PlatformPlan {
  return {
    id: row.id as string,
    name: row.name as string,
    priceMonthly: Number(row.price_sar),
    description: (row.description as string) ?? "",
    active: row.active as boolean,
    features: Array.isArray(row.features) ? (row.features as PlatformPlan["features"]) : [],
  };
}

export async function getPlatformPlans(): Promise<PlatformPlan[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_plans")
    .select("*")
    .eq("active", true)
    .order("sort_order");

  return (data ?? []).map(mapDbPlan);
}

export async function getOwnerActivePlanId(): Promise<string> {
  const { requireOwnerCafeContext } = await import("@/lib/data/cafes");
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("plan_id")
    .eq("cafe_id", cafe.id)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.plan_id as string) ?? "pro";
}

export async function getAdminCafes(): Promise<PlatformCafe[]> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { data: cafes } = await supabase
    .from("cafes")
    .select("*, cafe_settings(*), subscriptions(plan_id, status)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (cafes ?? []).map((row) => {
    const settings = row.cafe_settings as Record<string, unknown> | null;
    const subs = row.subscriptions as { plan_id: string; status: string }[] | null;
    const activeSub = subs?.find((s) => s.status === "active" || s.status === "trialing");
    return {
      id: row.id as string,
      slug: row.slug as string,
      name: row.name as string,
      ownerName: (settings?.owner_name as string) ?? "",
      ownerEmail: (settings?.owner_email as string) ?? "",
      ownerPhone: (settings?.owner_phone as string) ?? "",
      planId: activeSub?.plan_id ?? "pro",
      status: row.status === "active" ? "نشط" : "موقوف",
      totalRevenue: 0,
      totalOrders: 0,
      customersCount: 0,
      createdAt: (row.created_at as string).slice(0, 10),
      customDomain: settings?.custom_domain as string | undefined,
      customDomainStatus: settings?.domain_status as PlatformCafe["customDomainStatus"],
      purchasedDomain: settings?.purchased_domain as string | undefined,
      purchasedDomainStatus: settings?.purchased_domain_status as PlatformCafe["purchasedDomainStatus"],
    };
  });
}

export async function getAdminCustomers(): Promise<PlatformCustomer[]> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("customer_profiles")
    .select("*, cafes(name, id)")
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => {
    const cafe = row.cafes as unknown as { name: string; id: string } | null;
    return {
      id: row.id as string,
      fullName: row.full_name as string,
      phone: row.phone as string,
      email: row.email as string | undefined,
      cafeId: cafe?.id ?? "",
      cafeName: cafe?.name ?? "",
      status: "نشط",
      totalSpent: 0,
      loyaltyPoints: 0,
      createdAt: (row.created_at as string).slice(0, 10),
    };
  });
}

export async function getAdminOperations(): Promise<PlatformOperation[]> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const [{ data: orders }, { data: reservations }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, total, status, customer_name, created_at, cafes(name, id)")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("reservations")
      .select("id, event_type, status, customer_name, created_at, cafes(name, id)")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const ops: PlatformOperation[] = [];

  for (const order of orders ?? []) {
    const cafe = order.cafes as unknown as { name: string; id: string };
    ops.push({
      id: order.id as string,
      cafeId: cafe.id,
      cafeName: cafe.name,
      customerName: order.customer_name as string,
      type: "طلب",
      title: `طلب ${order.id}`,
      amount: Number(order.total),
      status: order.status as string,
      createdAt: (order.created_at as string).slice(0, 10),
    });
  }

  for (const res of reservations ?? []) {
    const cafe = res.cafes as unknown as { name: string; id: string };
    ops.push({
      id: res.id as string,
      cafeId: cafe.id,
      cafeName: cafe.name,
      customerName: res.customer_name as string,
      type: "حجز",
      title: `حجز ${res.event_type}`,
      status: res.status as string,
      createdAt: (res.created_at as string).slice(0, 10),
    });
  }

  return ops.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function savePlatformPlans(plans: PlatformPlan[]) {
  await requirePlatformAdmin();
  const supabase = await createClient();
  for (const plan of plans) {
    const { error } = await supabase.from("platform_plans").upsert(
      {
        id: plan.id,
        name: plan.name,
        price_sar: plan.priceMonthly,
        features: plan.features,
        active: plan.active,
      },
      { onConflict: "id" }
    );
    if (error) throw error;
  }
}

export async function updateCafePlan(cafeId: string, planId: string) {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("subscriptions").upsert(
    {
      cafe_id: cafeId,
      plan_id: planId,
      status: "active",
      amount_sar: 0,
    },
    { onConflict: "cafe_id" }
  );
  if (error) throw error;
}

export async function updateCafeStatus(cafeId: string, active: boolean) {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("cafes")
    .update({ status: active ? "active" : "suspended" })
    .eq("id", cafeId);
  if (error) throw error;
}

```

# File: lib/data/branches.ts

```typescript
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import type { CafeBranch } from "@/lib/mock/branches";

function mapDbBranch(row: Record<string, unknown>): CafeBranch {
  const hours = row.hours as Record<string, string> | null;
  const lat = row.lat != null ? Number(row.lat) : undefined;
  const lng = row.lng != null ? Number(row.lng) : undefined;
  return {
    id: row.id as string,
    name: row.name as string,
    address: (row.address as string) ?? "",
    city: (row.city as string) ?? "",
    phone: (row.phone as string) ?? undefined,
    workingHours: hours?.summary ?? (hours?.default as string) ?? "",
    lat,
    lng,
    mapUrl: lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : undefined,
    active: row.active as boolean,
  };
}

export async function getPublicBranchesBySlug(slug: string): Promise<CafeBranch[]> {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("branches")
    .select("*")
    .eq("cafe_id", cafe.id)
    .eq("active", true)
    .is("deleted_at", null)
    .order("sort_order");

  return (data ?? []).map(mapDbBranch);
}

export async function getOwnerBranches(): Promise<CafeBranch[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branches")
    .select("*")
    .eq("cafe_id", cafe.id)
    .is("deleted_at", null)
    .order("sort_order");

  if (error) throw error;
  return (data ?? []).map(mapDbBranch);
}

const branchSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  workingHours: z.string().optional(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int().optional(),
});

export async function upsertBranch(input: z.infer<typeof branchSchema>) {
  const parsed = branchSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const payload = {
    cafe_id: cafe.id,
    name: parsed.name,
    address: parsed.address ?? null,
    city: parsed.city ?? null,
    phone: parsed.phone ?? null,
    hours: parsed.workingHours ? { summary: parsed.workingHours } : {},
    lat: parsed.lat ?? null,
    lng: parsed.lng ?? null,
    active: parsed.active,
    sort_order: parsed.sortOrder ?? 0,
  };

  if (parsed.id) {
    const { data, error } = await supabase
      .from("branches")
      .update(payload)
      .eq("id", parsed.id)
      .eq("cafe_id", cafe.id)
      .select("*")
      .single();
    if (error) throw error;
    return mapDbBranch(data);
  }

  const { data, error } = await supabase.from("branches").insert(payload).select("*").single();
  if (error) throw error;
  return mapDbBranch(data);
}

export async function softDeleteBranch(branchId: string) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("branches")
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq("id", branchId)
    .eq("cafe_id", cafe.id);
  if (error) throw error;
}

```

# File: lib/data/cafes.ts

```typescript
import { createClient } from "@/lib/supabase/server";

export type CafeContext = {
  id: string;
  slug: string;
  name: string;
  role: "owner" | "manager" | "staff" | "platform_admin";
};

export async function getCafeBySlug(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cafes")
    .select("id, slug, name, status, is_public")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getOwnerCafeContext(): Promise<CafeContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "platform_admin") {
    const { data: cafe } = await supabase
      .from("cafes")
      .select("id, slug, name")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (cafe) {
      return { id: cafe.id, slug: cafe.slug, name: cafe.name, role: "platform_admin" };
    }
  }

  const { data: owned } = await supabase
    .from("cafes")
    .select("id, slug, name")
    .eq("owner_user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (owned) {
    return { id: owned.id, slug: owned.slug, name: owned.name, role: "owner" };
  }

  const { data: member } = await supabase
    .from("cafe_members")
    .select("role, cafes(id, slug, name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const cafe = member?.cafes as unknown as { id: string; slug: string; name: string } | null;
  if (cafe && member) {
    return {
      id: cafe.id,
      slug: cafe.slug,
      name: cafe.name,
      role: member.role as CafeContext["role"],
    };
  }

  return null;
}

export async function requireOwnerCafeContext(): Promise<CafeContext> {
  const ctx = await getOwnerCafeContext();
  if (!ctx) {
    throw new Error("Unauthorized: no cafe access");
  }
  return ctx;
}

/** Admin-only operations (audit, cross-cafe) */
export async function requirePlatformAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "platform_admin") {
    throw new Error("Forbidden: platform admin required");
  }
  return user;
}

```

# File: lib/data/customers.ts

```typescript
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";

import type { BrandaCustomerSession } from "@/lib/customer/session";

import type {

  CustomerOrder,

  CustomerProfile,

} from "@/lib/mock/customer-activity";

import type { CafeReservation } from "@/lib/mock/reservations";



export async function upsertCustomerProfileForUser(

  cafeSlug: string,

  userId: string,

  profile: { fullName: string; phone: string; email?: string }

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



export async function getCustomerProfileByUser(cafeSlug: string, userId: string) {

  const cafe = await getCafeBySlug(cafeSlug);

  if (!cafe) return null;



  const supabase = await createClient();

  const { data } = await supabase

    .from("customer_profiles")

    .select("*")

    .eq("cafe_id", cafe.id)

    .eq("user_id", userId)

    .maybeSingle();



  return data;
}

/** Requires authenticated Supabase session linked to a customer profile for this cafe */
export async function requireCustomerProfileForSession(cafeSlug: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const profile = await getCustomerProfileByUser(cafeSlug, user.id);
  if (!profile) throw new Error("Customer profile not found");
  return { user, profile };
}

export async function assertCustomerIdMatchesSession(cafeSlug: string, customerId: string) {
  const { profile } = await requireCustomerProfileForSession(cafeSlug);
  if ((profile.id as string) !== customerId) {
    throw new Error("Forbidden: customer mismatch");
  }
  return profile;
}

export function mapCustomerProfileToSession(

  slug: string,

  row: Record<string, unknown>

): BrandaCustomerSession {

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



/** Register customer with real Supabase Auth (email + password) */

export async function registerCustomer(input: z.infer<typeof customerRegisterSchema>) {

  const parsed = customerRegisterSchema.parse(input);

  const cafe = await getCafeBySlug(parsed.cafeSlug);

  if (!cafe) throw new Error("Cafe not found");



  const normalizedPhone = parsed.phone.replace(/\D/g, "");

  const supabase = await createClient();



  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({

    email: parsed.email.trim().toLowerCase(),

    password: parsed.password,

    options: {

      data: {

        full_name: parsed.fullName.trim(),

        phone: normalizedPhone,

        role: "customer",

      },

    },

  });



  if (signUpError) throw signUpError;

  if (!signUpData.user) throw new Error("Registration failed");



  const profile = await upsertCustomerProfileForUser(parsed.cafeSlug, signUpData.user.id, {

    fullName: parsed.fullName.trim(),

    phone: normalizedPhone,

    email: parsed.email.trim().toLowerCase(),

  });



  return mapCustomerProfileToSession(parsed.cafeSlug, profile);

}



/** Customer login via real Supabase Auth session */

export async function loginCustomerByEmail(input: z.infer<typeof customerLoginSchema>) {

  const parsed = customerLoginSchema.parse(input);

  const cafe = await getCafeBySlug(parsed.cafeSlug);

  if (!cafe) throw new Error("Cafe not found");



  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({

    email: parsed.email.trim().toLowerCase(),

    password: parsed.password,

  });

  if (error || !data.user) throw error ?? new Error("Invalid credentials");



  const existing = await getCustomerProfileByUser(parsed.cafeSlug, data.user.id);

  if (!existing) {

    const meta = data.user.user_metadata ?? {};

    const profile = await upsertCustomerProfileForUser(parsed.cafeSlug, data.user.id, {

      fullName: (meta.full_name as string) || "عميل",

      phone: (meta.phone as string) || "0000000000",

      email: parsed.email.trim().toLowerCase(),

    });

    return mapCustomerProfileToSession(parsed.cafeSlug, profile);

  }



  return mapCustomerProfileToSession(parsed.cafeSlug, existing);

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



export async function getCustomerOrdersForProfile(cafeSlug: string, customerId: string) {

  const cafe = await getCafeBySlug(cafeSlug);

  if (!cafe) return [];



  const supabase = await createClient();

  const { data: orders } = await supabase

    .from("orders")

    .select("*, order_items(*)")

    .eq("cafe_id", cafe.id)

    .eq("customer_id", customerId)

    .is("deleted_at", null)

    .order("created_at", { ascending: false });



  if (!orders?.length) return [];



  const { mapDbOrderToCafeOrder } = await import("@/lib/data/mappers");

  return orders.map((o) =>

    mapDbOrderToCafeOrder(cafeSlug, o, (o.order_items as Record<string, unknown>[]) ?? [])

  );

}



export async function getCustomerReservationsForProfile(cafeSlug: string, customerId: string) {

  const cafe = await getCafeBySlug(cafeSlug);

  if (!cafe) return [];



  const supabase = await createClient();

  const { data } = await supabase

    .from("reservations")

    .select("*")

    .eq("cafe_id", cafe.id)

    .eq("customer_id", customerId)

    .is("deleted_at", null)

    .order("reservation_date", { ascending: false });



  if (!data?.length) return [];

  const { mapDbReservationToCafeReservation } = await import("@/lib/data/mappers");

  return data.map(mapDbReservationToCafeReservation);

}



export async function getOwnerCustomersDashboard(): Promise<{

  customers: CustomerProfile[];

  orders: CustomerOrder[];

  reservations: CafeReservation[];

}> {

  const cafe = await requireOwnerCafeContext();

  const supabase = await createClient();



  const [{ data: profiles }, { data: orders }, { data: reservations }] = await Promise.all([

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



  const { mapDbOrderToCafeOrder, mapDbReservationToCafeReservation } = await import(

    "@/lib/data/mappers"

  );



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


```

# File: lib/data/domain-orders.ts

```typescript
import { createClient } from "@/lib/supabase/server";

import { getCafeBySlug, getOwnerCafeContext } from "@/lib/data/cafes";

import type { CafePurchasedDomain } from "@/lib/platform/domain-purchase";

export async function requireCafeOwnerForSlug(cafeSlug: string) {
  const ctx = await getOwnerCafeContext();
  if (!ctx) throw new Error("Unauthorized");
  if (ctx.slug !== cafeSlug && ctx.role !== "platform_admin") {
    throw new Error("Forbidden: cafe mismatch");
  }
  const cafe = await getCafeBySlug(cafeSlug);
  if (!cafe) throw new Error("Cafe not found");
  return { ctx, cafe };
}

export async function createDomainOrderRequest(input: {
  cafeSlug: string;
  domain: string;
  tld: string;
  years: number;
  autoRenew: boolean;
}): Promise<CafePurchasedDomain> {
  await requireCafeOwnerForSlug(input.cafeSlug);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const cafe = await getCafeBySlug(input.cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  const { data: orderId, error } = await supabase.rpc("create_domain_order", {
    p_cafe_id: cafe.id,
    p_domain: input.domain,
    p_tld: input.tld,
    p_years: input.years,
    p_auto_renew: input.autoRenew,
  });

  if (error) throw error;

  const { data: row, error: fetchError } = await supabase
    .from("domain_orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (fetchError) throw fetchError;
  return mapDomainOrderToPurchase(input.cafeSlug, row);
}

function mapDomainOrderToPurchase(
  cafeSlug: string,
  row: Record<string, unknown>
): CafePurchasedDomain {
  const status = row.status as string;
  const purchaseStatus =
    status === "completed"
      ? "purchased"
      : status === "processing"
        ? "purchase_pending"
        : status === "failed"
          ? "failed"
          : "purchase_pending";

  return {
    id: row.id as string,
    cafeSlug,
    domain: row.domain as string,
    tld: row.tld as string,
    years: row.years as number,
    autoRenew: row.auto_renew as boolean,
    price: row.price_estimate != null ? Number(row.price_estimate) : undefined,
    currency: row.currency as string,
    status: purchaseStatus,
    vercelOrderId: (row.provider_order_id as string) ?? undefined,
    createdAt: row.created_at as string,
    errorMessage: (row.error_message as string) ?? undefined,
  };
}

```

# File: lib/data/experience.ts

```typescript
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import { assertCustomerIdMatchesSession } from "@/lib/data/customers";
import {
  type ExperienceCampaign,
  type ExperienceSubmission,
} from "@/lib/mock/experience-campaigns";

function mapDbCampaign(slug: string, row: Record<string, unknown>): ExperienceCampaign {
  return {
    id: row.id as string,
    cafeSlug: slug,
    title: row.title as string,
    description: row.description as string,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    terms: (row.terms as string) ?? "",
    platforms: (row.platforms as ExperienceCampaign["platforms"]) ?? [],
    minFollowers: row.min_followers as number | undefined,
    basePoints: row.base_points as number,
    pointsPerView: Number(row.points_per_view),
    pointsPerLike: Number(row.points_per_like),
    pointsPerComment: Number(row.points_per_comment),
    maxPointsPerSubmission: row.max_points_per_submission as number,
    requiresManualApproval: row.requires_manual_approval as boolean,
    status: row.status as ExperienceCampaign["status"],
    createdAt: (row.created_at as string).slice(0, 10),
  };
}

function mapDbSubmission(slug: string, row: Record<string, unknown>): ExperienceSubmission {
  return {
    id: row.id as string,
    campaignId: row.campaign_id as string,
    cafeSlug: slug,
    customerId: row.customer_id as string,
    customerName: (row.customer_name as string) ?? "",
    platform: row.platform as ExperienceSubmission["platform"],
    videoUrl: row.video_url as string,
    platformUsername: row.platform_username as string | undefined,
    note: row.note as string | undefined,
    status: row.status as ExperienceSubmission["status"],
    views: row.views as number | undefined,
    likes: row.likes as number | undefined,
    comments: row.comments as number | undefined,
    shares: row.shares as number | undefined,
    suggestedPoints: row.suggested_points as number | undefined,
    awardedPoints: row.awarded_points as number | undefined,
    rejectionReason: row.rejection_reason as string | undefined,
    createdAt: (row.created_at as string).slice(0, 10),
    reviewedAt: row.reviewed_at as string | undefined,
  };
}

export async function getPublicExperienceCampaigns(slug: string): Promise<ExperienceCampaign[]> {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("experience_campaigns")
    .select("*")
    .eq("cafe_id", cafe.id)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => mapDbCampaign(slug, row));
}

export async function getOwnerExperienceData() {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const [{ data: campaigns }, { data: submissions }] = await Promise.all([
    supabase
      .from("experience_campaigns")
      .select("*")
      .eq("cafe_id", cafe.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("experience_submissions")
      .select("*, customer_profiles(full_name)")
      .eq("cafe_id", cafe.id)
      .order("created_at", { ascending: false }),
  ]);

  return {
    campaigns: (campaigns ?? []).map((row) => mapDbCampaign(cafe.slug, row)),
    submissions: (submissions ?? []).map((row) => {
      const profile = row.customer_profiles as { full_name: string } | null;
      return mapDbSubmission(cafe.slug, {
        ...row,
        customer_name: profile?.full_name,
      });
    }),
  };
}

const campaignSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  terms: z.string().optional(),
  platforms: z.array(z.string()),
  minFollowers: z.number().optional().nullable(),
  basePoints: z.number().int(),
  pointsPerView: z.number(),
  pointsPerLike: z.number(),
  pointsPerComment: z.number(),
  maxPointsPerSubmission: z.number().int(),
  requiresManualApproval: z.boolean(),
  status: z.string(),
});

export async function upsertExperienceCampaign(input: z.infer<typeof campaignSchema>) {
  const parsed = campaignSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const payload = {
    cafe_id: cafe.id,
    title: parsed.title,
    description: parsed.description,
    start_date: parsed.startDate,
    end_date: parsed.endDate,
    terms: parsed.terms ?? null,
    platforms: parsed.platforms,
    min_followers: parsed.minFollowers ?? null,
    base_points: parsed.basePoints,
    points_per_view: parsed.pointsPerView,
    points_per_like: parsed.pointsPerLike,
    points_per_comment: parsed.pointsPerComment,
    max_points_per_submission: parsed.maxPointsPerSubmission,
    requires_manual_approval: parsed.requiresManualApproval,
    status: parsed.status,
  };

  if (parsed.id) {
    const { data, error } = await supabase
      .from("experience_campaigns")
      .update(payload)
      .eq("id", parsed.id)
      .eq("cafe_id", cafe.id)
      .select("*")
      .single();
    if (error) throw error;
    return mapDbCampaign(cafe.slug, data);
  }

  const { data, error } = await supabase
    .from("experience_campaigns")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return mapDbCampaign(cafe.slug, data);
}

const submissionSchema = z.object({
  cafeSlug: z.string(),
  customerId: z.string().uuid(),
  campaignId: z.string().uuid(),
  platform: z.string(),
  videoUrl: z.string().url().optional(),
  platformUsername: z.string().optional(),
  note: z.string().optional(),
});

export async function createExperienceSubmission(input: z.infer<typeof submissionSchema>) {
  const parsed = submissionSchema.parse(input);
  await assertCustomerIdMatchesSession(parsed.cafeSlug, parsed.customerId);
  const cafe = await getCafeBySlug(parsed.cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  const supabase = await createClient();
  const { data: submissionId, error } = await supabase.rpc("submit_experience_submission", {
    p_cafe_id: cafe.id,
    p_campaign_id: parsed.campaignId,
    p_platform: parsed.platform,
    p_video_url: parsed.videoUrl ?? null,
    p_platform_username: parsed.platformUsername ?? null,
    p_note: parsed.note ?? null,
  });

  if (error) throw error;

  const { data } = await supabase
    .from("experience_submissions")
    .select("*")
    .eq("id", submissionId)
    .single();

  if (!data) throw new Error("Submission not found after create");
  return mapDbSubmission(parsed.cafeSlug, data);
}

export async function updateExperienceMetrics(
  submissionId: string,
  metrics: { views?: number; likes?: number; comments?: number; shares?: number }
) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("update_experience_submission_metrics", {
    p_submission_id: submissionId,
    p_views: metrics.views ?? null,
    p_likes: metrics.likes ?? null,
    p_comments: metrics.comments ?? null,
    p_shares: metrics.shares ?? null,
  });

  if (error) throw error;
  if (!data) throw new Error("Submission not found after metrics update");
  return mapDbSubmission(cafe.slug, data as Record<string, unknown>);
}

export async function approveExperienceSubmission(submissionId: string, awardedPoints: number) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("approve_experience_submission", {
    p_submission_id: submissionId,
    p_awarded_points: awardedPoints,
  });

  if (error) throw error;
  return mapDbSubmission(cafe.slug, data as Record<string, unknown>);
}

export async function rejectExperienceSubmission(submissionId: string, reason: string) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reject_experience_submission", {
    p_submission_id: submissionId,
    p_rejection_reason: reason.trim() || "لم تستوفِ شروط الحملة",
  });

  if (error) throw error;
  if (!data) throw new Error("Submission not found after reject");
  return mapDbSubmission(cafe.slug, data as Record<string, unknown>);
}

```

# File: lib/data/loyalty.ts

```typescript
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import type { LoyaltyReward, LoyaltySettings } from "@/lib/mock/loyalty";

const defaultSettings: LoyaltySettings = {
  pointsPerSar: 1,
  welcomePoints: 25,
  enabled: true,
  earnRules: [],
  redemptionRules: [],
};

function mapDbLoyaltyRules(row: Record<string, unknown>): LoyaltySettings {
  return {
    pointsPerSar: Number(row.points_per_sar ?? 1),
    welcomePoints: Number(row.welcome_points ?? 0),
    enabled: Boolean(row.enabled ?? true),
    earnRules: Array.isArray(row.earn_rules) ? (row.earn_rules as LoyaltySettings["earnRules"]) : [],
    redemptionRules: Array.isArray(row.redemption_rules)
      ? (row.redemption_rules as LoyaltySettings["redemptionRules"])
      : [],
  };
}

function mapDbReward(row: Record<string, unknown>): LoyaltyReward {
  return {
    id: row.id as string,
    title: row.title as string,
    points: row.points as number,
    description: (row.description as string) ?? "",
    active: row.active as boolean,
  };
}

export async function getPublicLoyaltyBySlug(slug: string) {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return { settings: defaultSettings, rewards: [] as LoyaltyReward[] };

  const supabase = await createClient();
  const [{ data: rules }, { data: rewards }] = await Promise.all([
    supabase.from("loyalty_rules").select("*").eq("cafe_id", cafe.id).maybeSingle(),
    supabase
      .from("loyalty_rewards")
      .select("*")
      .eq("cafe_id", cafe.id)
      .eq("active", true)
      .order("points"),
  ]);

  return {
    settings: rules ? mapDbLoyaltyRules(rules) : defaultSettings,
    rewards: (rewards ?? []).map(mapDbReward),
  };
}

export async function getOwnerLoyalty() {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const [{ data: rules }, { data: rewards }] = await Promise.all([
    supabase.from("loyalty_rules").select("*").eq("cafe_id", cafe.id).maybeSingle(),
    supabase.from("loyalty_rewards").select("*").eq("cafe_id", cafe.id).order("points"),
  ]);

  return {
    settings: rules ? mapDbLoyaltyRules(rules) : defaultSettings,
    rewards: (rewards ?? []).map(mapDbReward),
  };
}

const loyaltySettingsSchema = z.object({
  enabled: z.boolean(),
  pointsPerSar: z.number(),
  welcomePoints: z.number().int(),
  earnRules: z.array(z.unknown()),
  redemptionRules: z.array(z.unknown()),
});

export async function saveLoyaltySettings(input: z.infer<typeof loyaltySettingsSchema>) {
  const parsed = loyaltySettingsSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const { error } = await supabase.from("loyalty_rules").upsert(
    {
      cafe_id: cafe.id,
      enabled: parsed.enabled,
      points_per_sar: parsed.pointsPerSar,
      welcome_points: parsed.welcomePoints,
      earn_rules: parsed.earnRules,
      redemption_rules: parsed.redemptionRules,
    },
    { onConflict: "cafe_id" }
  );
  if (error) throw error;
}

const rewardSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1),
  points: z.number().int().positive(),
  description: z.string().optional(),
  active: z.boolean(),
});

export async function upsertLoyaltyReward(input: z.infer<typeof rewardSchema>) {
  const parsed = rewardSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const payload = {
    cafe_id: cafe.id,
    title: parsed.title,
    points: parsed.points,
    description: parsed.description ?? null,
    active: parsed.active,
  };

  if (parsed.id) {
    const { data, error } = await supabase
      .from("loyalty_rewards")
      .update(payload)
      .eq("id", parsed.id)
      .eq("cafe_id", cafe.id)
      .select("*")
      .single();
    if (error) throw error;
    return mapDbReward(data);
  }

  const { data, error } = await supabase.from("loyalty_rewards").insert(payload).select("*").single();
  if (error) throw error;
  return mapDbReward(data);
}

export async function deleteLoyaltyReward(rewardId: string) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("loyalty_rewards")
    .delete()
    .eq("id", rewardId)
    .eq("cafe_id", cafe.id);
  if (error) throw error;
}

```

# File: lib/data/mappers.ts

```typescript
import type { CafeSettings } from "@/lib/mock/cafe-settings";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { MenuProduct } from "@/lib/mock/menu";
import type { CafeOffer } from "@/lib/mock/offers";
import type { CafeOrder, OrderStatus } from "@/lib/mock/orders";
import type { CafeReservation, ReservationStatus } from "@/lib/mock/reservations";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";
import type { CafeThemeId } from "@/lib/mock/cafe-theme";

/** DB row shapes (snake_case) */
export type DbCafeSettings = {
  cafe_id: string;
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  logo_url: string | null;
  logo_storage_path: string | null;
  tax_number: string | null;
  commercial_register: string | null;
  maroof_certificate: string | null;
  instagram: string | null;
  whatsapp: string | null;
  description: string | null;
  custom_domain: string | null;
  domain_status: string | null;
  purchased_domain: string | null;
  purchased_domain_status: string | null;
  theme_id: string;
};

export type DbMenuProduct = {
  id: string;
  cafe_id: string;
  category_id: string | null;
  legacy_category: string | null;
  name: string;
  description: string;
  image_url: string | null;
  image_storage_path: string | null;
  image_variant: string;
  price: number;
  calories: number | null;
  loyalty_points: number;
  preparation_time_minutes: number | null;
  redeemable_with_points: boolean;
  redemption_points: number | null;
  available_for_pickup: boolean;
  pickup_lead_minutes: number | null;
  ingredients: string[] | unknown;
  available: boolean;
  promo: unknown;
  sort_order: number;
};

export type DbMenuCategory = {
  id: string;
  cafe_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  image_storage_path: string | null;
  icon: string | null;
  sort_order: number;
  visible: boolean;
  featured: boolean;
  created_at: string;
  updated_at: string;
};

const ORDER_STATUS_TO_UI: Record<string, OrderStatus> = {
  pending_cafe: "بانتظار موافقة الكوفي",
  accepted: "مقبول",
  rejected: "مرفوض",
  cancelled_by_customer: "ملغي من العميل",
};

const ORDER_STATUS_FROM_UI: Record<OrderStatus, string> = {
  "بانتظار موافقة الكوفي": "pending_cafe",
  مقبول: "accepted",
  مرفوض: "rejected",
  "ملغي من العميل": "cancelled_by_customer",
};

const RESERVATION_STATUS_TO_UI: Record<string, ReservationStatus> = {
  pending: "بانتظار الرد",
  accepted: "مقبول",
  rejected: "مرفوض",
  modification_requested: "طلب تعديل",
};

const RESERVATION_STATUS_FROM_UI: Record<ReservationStatus, string> = {
  "بانتظار الرد": "pending",
  مقبول: "accepted",
  مرفوض: "rejected",
  "طلب تعديل": "modification_requested",
};

export function mapOrderStatusFromDb(status: string): OrderStatus {
  return ORDER_STATUS_TO_UI[status] ?? "بانتظار موافقة الكوفي";
}

export function mapOrderStatusToDb(status: OrderStatus): string {
  return ORDER_STATUS_FROM_UI[status];
}

export function mapReservationStatusFromDb(status: string): ReservationStatus {
  return RESERVATION_STATUS_TO_UI[status] ?? "بانتظار الرد";
}

export function mapReservationStatusToDb(status: ReservationStatus): string {
  return RESERVATION_STATUS_FROM_UI[status];
}

export function mapDbSettingsToCafeSettings(
  slug: string,
  row: DbCafeSettings
): CafeSettings {
  return {
    cafeSlug: slug,
    cafeName: slug,
    ownerName: row.owner_name ?? "",
    ownerEmail: row.owner_email ?? "",
    ownerPhone: row.owner_phone ?? "",
    logoAssetId: row.logo_storage_path ?? undefined,
    taxNumber: row.tax_number ?? undefined,
    commercialRegister: row.commercial_register ?? undefined,
    maroofCertificate: row.maroof_certificate ?? undefined,
    instagram: row.instagram ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    description: row.description ?? undefined,
    customDomain: row.custom_domain ?? undefined,
    domainStatus: (row.domain_status as CafeSettings["domainStatus"]) ?? "غير مربوط",
    purchasedDomain: row.purchased_domain ?? undefined,
    purchasedDomainStatus:
      (row.purchased_domain_status as CafeSettings["purchasedDomainStatus"]) ?? undefined,
  };
}

export function mapDbCategoryToRecord(slug: string, row: DbMenuCategory): MenuCategoryRecord {
  return {
    id: row.id,
    cafeSlug: slug,
    name: row.name,
    description: row.description ?? undefined,
    imageAssetId: row.image_storage_path ?? undefined,
    icon: row.icon ?? undefined,
    sortOrder: row.sort_order,
    visible: row.visible,
    featured: row.featured,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDbProductToMenuProduct(row: DbMenuProduct, categoryName?: string): MenuProduct {
  return {
    id: row.id,
    name: row.name,
    category: categoryName ?? row.legacy_category ?? "أخرى",
    categoryId: row.category_id ?? undefined,
    description: row.description,
    imageAssetId: row.image_storage_path ?? undefined,
    imageDataUrl: row.image_url,
    imageVariant: row.image_variant as MenuProduct["imageVariant"],
    price: Number(row.price),
    calories: row.calories ?? undefined,
    loyaltyPoints: row.loyalty_points,
    preparationTimeMinutes: row.preparation_time_minutes ?? undefined,
    redeemableWithPoints: row.redeemable_with_points,
    redemptionPoints: row.redemption_points ?? undefined,
    availableForPickup: row.available_for_pickup,
    pickupLeadTimeMinutes: row.pickup_lead_minutes ?? undefined,
    ingredients: Array.isArray(row.ingredients) ? (row.ingredients as string[]) : [],
    available: row.available,
    promo: (row.promo as MenuProduct["promo"]) ?? null,
  };
}

export function mapDbOfferToCafeOffer(row: Record<string, unknown>): CafeOffer {
  const promo = (row.promo_payload as Record<string, unknown>) ?? {};
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? "",
    type: row.offer_type as CafeOffer["type"],
    status: row.status as CafeOffer["status"],
    placement: row.placement as CafeOffer["placement"],
    visibleInCafe: row.visible_in_cafe as boolean,
    discountPercent: row.discount_percent as number | undefined,
    code: row.code as string | undefined,
    startDate: row.start_date as string | undefined,
    endDate: row.end_date as string | undefined,
    linkedProductId: row.linked_product_id as string | undefined,
    bannerImageUrl: row.banner_url as string | undefined,
    bannerAssetId: row.banner_storage_path as string | undefined,
    ctaText: row.cta_text as string | undefined,
    promoProductName: promo.promoProductName as string | undefined,
    promoProductPrice: promo.promoProductPrice as number | undefined,
    promoProductCategory: promo.promoProductCategory as string | undefined,
    promoProductDescription: promo.promoProductDescription as string | undefined,
  };
}

export function mapDbCustomIdentity(row: Record<string, unknown>): CustomIdentityTheme {
  const now = new Date().toISOString();
  return {
    logoAssetId: row.logo_storage_path as string | undefined,
    backgroundAssetId: row.background_storage_path as string | undefined,
    palette: (row.palette as CustomIdentityTheme["palette"]) ?? {
      primary: "#6B3A25",
      secondary: "#4A281D",
      button: "#6B3A25",
      background: "#FCF8F3",
      text: "#311912",
      accent: "#D9A33F",
    },
    backgroundScope: (row.background_scope as CustomIdentityTheme["backgroundScope"]) ?? "home-only",
    backgroundFit: (row.background_fit as CustomIdentityTheme["backgroundFit"]) ?? "cover",
    overlayStrength: (row.overlay_strength as CustomIdentityTheme["overlayStrength"]) ?? "medium",
    featuredSectionMode:
      (row.featured_section_mode as CustomIdentityTheme["featuredSectionMode"]) ?? "latest",
    featuredCategoryId: row.featured_category_id as string | undefined,
    createdAt: (row.created_at as string) ?? now,
    updatedAt: (row.updated_at as string) ?? now,
  };
}

export function mapThemeIdFromDb(themeId: string): CafeThemeId {
  return themeId as CafeThemeId;
}

export function mapDbOrderToCafeOrder(
  slug: string,
  order: Record<string, unknown>,
  items: Record<string, unknown>[]
): CafeOrder {
  return {
    id: order.id as string,
    cafeSlug: slug,
    customerId: (order.customer_id as string) ?? "",
    customerName: order.customer_name as string,
    customerPhone: order.customer_phone as string,
    customerEmail: order.customer_email as string | undefined,
    branchName: order.branch_name as string | undefined,
    type: "استلام",
    status: mapOrderStatusFromDb(order.status as string),
    paymentStatus: "الدفع عند الاستلام",
    pickupAt: order.pickup_at as string | undefined,
    rejectionReason: order.rejection_reason as string | undefined,
    cafeResponseAt: order.responded_at as string | undefined,
    items: items.map((item) => ({
      id: item.id as string,
      productId: (item.product_id as string) ?? "",
      name: item.name as string,
      quantity: item.quantity as number,
      unitPrice: Number(item.unit_price),
      notes: item.notes as string | undefined,
    })),
    subtotal: Number(order.subtotal),
    discountAmount: Number(order.discount_amount),
    taxAmount: Number(order.tax_amount),
    total: Number(order.total),
    loyaltyPointsEarned: order.loyalty_points_earned as number,
    createdAt: order.created_at as string,
    notes: order.notes as string | undefined,
  };
}

export function mapDbReservationToCafeReservation(row: Record<string, unknown>): CafeReservation {
  return {
    id: row.id as string,
    customerId: row.customer_id as string | undefined,
    customerName: row.customer_name as string,
    phone: row.phone as string,
    type: row.event_type as CafeReservation["type"],
    guests: row.guests as number,
    date: row.reservation_date as string,
    time: row.reservation_time as string,
    durationMinutes: row.duration_minutes as number | undefined,
    branchName: row.branch_name as string | undefined,
    spaceType: row.space_type as string | undefined,
    eventTitle: row.event_title as string | undefined,
    needsDecoration: row.needs_decoration as boolean | undefined,
    needsCatering: row.needs_catering as boolean | undefined,
    budgetEstimate: row.budget_estimate as number | undefined,
    notes: row.notes as string | undefined,
    status: mapReservationStatusFromDb(row.status as string),
    rejectionReason: row.rejection_reason as string | undefined,
    cafeMessage: row.cafe_message as string | undefined,
    createdAt: row.created_at as string,
  };
}

```

# File: lib/data/marketing.ts

```typescript
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import type { MarketingCampaign } from "@/lib/mock/marketing";

function mapDbMarketing(row: Record<string, unknown>): MarketingCampaign {
  const payload = (row.payload as Record<string, unknown>) ?? {};
  return {
    id: row.id as string,
    title: row.title as string,
    channel: row.channel as MarketingCampaign["channel"],
    audience: (payload.audience as string) ?? "",
    message: (payload.message as string) ?? "",
    code: payload.code as string | undefined,
    discountPercent: payload.discountPercent as number | undefined,
    influencerName: payload.influencerName as string | undefined,
    influencerPhone: payload.influencerPhone as string | undefined,
    commissionPercent: payload.commissionPercent as number | undefined,
    status: row.status as MarketingCampaign["status"],
    startDate: payload.startDate as string | undefined,
    endDate: payload.endDate as string | undefined,
    visits: Number(payload.visits ?? 0),
    conversions: Number(payload.conversions ?? 0),
    createdAt: (row.created_at as string).slice(0, 10),
    imageAssetId: row.image_storage_path as string | undefined,
  };
}

export async function getOwnerMarketingCampaigns(): Promise<MarketingCampaign[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .select("*")
    .eq("cafe_id", cafe.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapDbMarketing);
}

const campaignSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1),
  channel: z.string(),
  status: z.string(),
  payload: z.record(z.string(), z.unknown()),
  imageStoragePath: z.string().optional().nullable(),
});

export async function upsertMarketingCampaign(input: z.infer<typeof campaignSchema>) {
  const parsed = campaignSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const payload = {
    cafe_id: cafe.id,
    title: parsed.title,
    channel: parsed.channel,
    status: parsed.status,
    payload: parsed.payload,
    image_storage_path: parsed.imageStoragePath ?? null,
  };

  if (parsed.id) {
    const { data, error } = await supabase
      .from("marketing_campaigns")
      .update(payload)
      .eq("id", parsed.id)
      .eq("cafe_id", cafe.id)
      .select("*")
      .single();
    if (error) throw error;
    return mapDbMarketing(data);
  }

  const { data, error } = await supabase
    .from("marketing_campaigns")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return mapDbMarketing(data);
}

export async function softDeleteMarketingCampaign(campaignId: string) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("marketing_campaigns")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("cafe_id", cafe.id);
  if (error) throw error;
}

```

# File: lib/data/menu.ts

```typescript
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerCafeContext, getCafeBySlug } from "@/lib/data/cafes";
import {
  mapDbCategoryToRecord,
  mapDbProductToMenuProduct,
  type DbMenuCategory,
  type DbMenuProduct,
} from "@/lib/data/mappers";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { MenuProduct } from "@/lib/mock/menu";

export async function getPublicMenuBySlug(slug: string) {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return { categories: [] as MenuCategoryRecord[], products: [] as MenuProduct[] };

  const supabase = await createClient();

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("*")
      .eq("cafe_id", cafe.id)
      .eq("visible", true)
      .is("deleted_at", null)
      .order("sort_order"),
    supabase
      .from("menu_products")
      .select("*")
      .eq("cafe_id", cafe.id)
      .eq("available", true)
      .is("deleted_at", null)
      .order("sort_order"),
  ]);

  const categoryRows = (categories ?? []) as DbMenuCategory[];
  const categoryMap = new Map(categoryRows.map((c) => [c.id, c.name]));

  return {
    categories: categoryRows.map((c) => mapDbCategoryToRecord(slug, c)),
    products: ((products ?? []) as DbMenuProduct[]).map((p) =>
      mapDbProductToMenuProduct(p, p.category_id ? categoryMap.get(p.category_id) : undefined)
    ),
  };
}

export async function getOwnerMenu() {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("*")
      .eq("cafe_id", cafe.id)
      .is("deleted_at", null)
      .order("sort_order"),
    supabase
      .from("menu_products")
      .select("*")
      .eq("cafe_id", cafe.id)
      .is("deleted_at", null)
      .order("sort_order"),
  ]);

  const categoryRows = (categories ?? []) as DbMenuCategory[];
  const categoryMap = new Map(categoryRows.map((c) => [c.id, c.name]));

  return {
    cafe,
    categories: categoryRows.map((c) => mapDbCategoryToRecord(cafe.slug, c)),
    products: ((products ?? []) as DbMenuProduct[]).map((p) =>
      mapDbProductToMenuProduct(p, p.category_id ? categoryMap.get(p.category_id) : undefined)
    ),
  };
}

const productSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  categoryId: z.string().uuid().optional().nullable(),
  category: z.string().optional(),
  description: z.string(),
  price: z.number().min(0),
  calories: z.number().optional().nullable(),
  loyaltyPoints: z.number().int().min(0),
  preparationTimeMinutes: z.number().optional().nullable(),
  redeemableWithPoints: z.boolean(),
  redemptionPoints: z.number().optional().nullable(),
  availableForPickup: z.boolean(),
  pickupLeadTimeMinutes: z.number().optional().nullable(),
  ingredients: z.array(z.string()),
  available: z.boolean(),
  imageVariant: z.string(),
  imageStoragePath: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  promo: z.unknown().optional().nullable(),
});

export async function upsertMenuProduct(input: z.infer<typeof productSchema>) {
  const parsed = productSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const payload = {
    cafe_id: cafe.id,
    category_id: parsed.categoryId ?? null,
    legacy_category: parsed.category ?? null,
    name: parsed.name,
    description: parsed.description,
    price: parsed.price,
    calories: parsed.calories ?? null,
    loyalty_points: parsed.loyaltyPoints,
    preparation_time_minutes: parsed.preparationTimeMinutes ?? null,
    redeemable_with_points: parsed.redeemableWithPoints,
    redemption_points: parsed.redemptionPoints ?? null,
    available_for_pickup: parsed.availableForPickup,
    pickup_lead_minutes: parsed.pickupLeadTimeMinutes ?? null,
    ingredients: parsed.ingredients,
    available: parsed.available,
    image_variant: parsed.imageVariant,
    image_storage_path: parsed.imageStoragePath ?? null,
    image_url: null,
    promo: parsed.promo ?? null,
  };

  if (parsed.id) {
    const { data, error } = await supabase
      .from("menu_products")
      .update(payload)
      .eq("id", parsed.id)
      .eq("cafe_id", cafe.id)
      .select("*")
      .single();
    if (error) throw error;
    return data as DbMenuProduct;
  }

  const { data, error } = await supabase
    .from("menu_products")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data as DbMenuProduct;
}

export async function softDeleteMenuProduct(productId: string) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_products")
    .update({ deleted_at: new Date().toISOString(), available: false })
    .eq("id", productId)
    .eq("cafe_id", cafe.id);
  if (error) throw error;
}

const categorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  sortOrder: z.number().int(),
  visible: z.boolean(),
  featured: z.boolean(),
  icon: z.string().optional(),
  imageStoragePath: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
});

export async function upsertMenuCategory(input: z.infer<typeof categorySchema>) {
  const parsed = categorySchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const payload = {
    cafe_id: cafe.id,
    name: parsed.name,
    description: parsed.description ?? null,
    sort_order: parsed.sortOrder,
    visible: parsed.visible,
    featured: parsed.featured,
    icon: parsed.icon ?? null,
    image_storage_path: parsed.imageStoragePath ?? null,
    image_url: null,
  };

  if (parsed.id) {
    const { data, error } = await supabase
      .from("menu_categories")
      .update(payload)
      .eq("id", parsed.id)
      .eq("cafe_id", cafe.id)
      .select("*")
      .single();
    if (error) throw error;
    return mapDbCategoryToRecord(cafe.slug, data as DbMenuCategory);
  }

  const { data, error } = await supabase
    .from("menu_categories")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return mapDbCategoryToRecord(cafe.slug, data as DbMenuCategory);
}

export async function saveAllMenuCategories(categories: MenuCategoryRecord[]) {
  const results: MenuCategoryRecord[] = [];
  for (const cat of categories) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(cat.id);
    const saved = await upsertMenuCategory({
      id: isUuid ? cat.id : undefined,
      name: cat.name,
      description: cat.description,
      sortOrder: cat.sortOrder,
      visible: cat.visible,
      featured: cat.featured,
      icon: cat.icon,
      imageStoragePath: cat.imageAssetId ?? null,
    });
    results.push(saved);
  }
  return results;
}

```

# File: lib/data/notifications.ts

```typescript
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import { requireCustomerProfileForSession } from "@/lib/data/customers";
import type { AppNotification, NotificationAudience } from "@/lib/mock/notifications";

function mapDbNotification(slug: string, row: Record<string, unknown>): AppNotification {
  return {
    id: row.id as string,
    cafeSlug: slug,
    audience: row.audience as NotificationAudience,
    customerId: (row.customer_id as string) ?? undefined,
    title: row.title as string,
    body: row.body as string,
    type: row.type as AppNotification["type"],
    read: row.read as boolean,
    createdAt: row.created_at as string,
    meta: (row.meta as Record<string, string>) ?? undefined,
  };
}

export async function createNotification(input: {
  cafeSlug: string;
  audience: NotificationAudience;
  customerId?: string;
  title: string;
  body: string;
  type: AppNotification["type"];
  meta?: Record<string, string>;
}) {
  const cafe = await getCafeBySlug(input.cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  const supabase = await createClient();

  if (input.audience === "customer") {
    if (!input.customerId) throw new Error("customerId required");
    const { data: id, error } = await supabase.rpc("create_customer_notification", {
      p_cafe_id: cafe.id,
      p_customer_id: input.customerId,
      p_title: input.title,
      p_body: input.body,
      p_type: input.type,
      p_meta: input.meta ?? {},
    });
    if (error) throw error;
    return {
      id: id as string,
      cafeSlug: input.cafeSlug,
      audience: input.audience,
      customerId: input.customerId,
      title: input.title,
      body: input.body,
      type: input.type,
      read: false,
      createdAt: new Date().toISOString(),
      meta: input.meta,
    } satisfies AppNotification;
  }

  const { data: id, error } = await supabase.rpc("create_cafe_notification", {
    p_cafe_id: cafe.id,
    p_title: input.title,
    p_body: input.body,
    p_type: input.type,
    p_meta: input.meta ?? {},
  });
  if (error) throw error;

  return {
    id: id as string,
    cafeSlug: input.cafeSlug,
    audience: input.audience,
    title: input.title,
    body: input.body,
    type: input.type,
    read: false,
    createdAt: new Date().toISOString(),
    meta: input.meta,
  } satisfies AppNotification;
}

export async function getNotificationsForAudience(
  audience: NotificationAudience,
  cafeSlug: string,
  customerId?: string
): Promise<AppNotification[]> {
  const cafe = await getCafeBySlug(cafeSlug);
  if (!cafe) return [];

  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .select("*")
    .eq("cafe_id", cafe.id)
    .eq("audience", audience)
    .order("created_at", { ascending: false });

  if (audience === "customer" && customerId) {
    query = query.eq("customer_id", customerId);
  }

  const { data } = await query;
  return (data ?? []).map((row) => mapDbNotification(cafeSlug, row));
}

export async function getOwnerCafeNotifications(): Promise<AppNotification[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("cafe_id", cafe.id)
    .eq("audience", "cafe")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []).map((row) => mapDbNotification(cafe.slug, row));
}

export async function markNotificationRead(notificationId: string) {
  await requireOwnerCafeContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_cafe_notification_read", {
    p_notification_id: notificationId,
  });
  if (error) throw error;
}

export async function markCustomerNotificationRead(cafeSlug: string, notificationId: string) {
  await requireCustomerProfileForSession(cafeSlug);
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_customer_notification_read", {
    p_notification_id: notificationId,
  });
  if (error) throw error;
}

```

# File: lib/data/offers.ts

```typescript
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import { mapDbOfferToCafeOffer } from "@/lib/data/mappers";
import type { CafeOffer } from "@/lib/mock/offers";

export async function getPublicOffersBySlug(slug: string): Promise<CafeOffer[]> {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("offers")
    .select("*")
    .eq("cafe_id", cafe.id)
    .eq("visible_in_cafe", true)
    .eq("status", "active")
    .is("deleted_at", null)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });

  return (data ?? []).map(mapDbOfferToCafeOffer);
}

export async function getOwnerOffers(): Promise<CafeOffer[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("offers")
    .select("*")
    .eq("cafe_id", cafe.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapDbOfferToCafeOffer);
}

const offerSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string(),
  type: z.string(),
  status: z.string(),
  placement: z.string(),
  visibleInCafe: z.boolean(),
  discountPercent: z.number().optional().nullable(),
  code: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  linkedProductId: z.string().uuid().optional().nullable(),
  bannerUrl: z.string().optional().nullable(),
  bannerStoragePath: z.string().optional().nullable(),
  ctaText: z.string().optional().nullable(),
  promoPayload: z.record(z.string(), z.unknown()).optional(),
});

export async function upsertOffer(input: z.infer<typeof offerSchema>) {
  const parsed = offerSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const payload = {
    cafe_id: cafe.id,
    title: parsed.title,
    description: parsed.description,
    offer_type: parsed.type,
    status: parsed.status,
    placement: parsed.placement,
    visible_in_cafe: parsed.visibleInCafe,
    discount_percent: parsed.discountPercent ?? null,
    code: parsed.code ?? null,
    start_date: parsed.startDate ?? null,
    end_date: parsed.endDate ?? null,
    linked_product_id: parsed.linkedProductId ?? null,
    banner_storage_path: parsed.bannerStoragePath ?? null,
    banner_url: null,
    cta_text: parsed.ctaText ?? null,
    promo_payload: parsed.promoPayload ?? {},
  };

  if (parsed.id) {
    const { data, error } = await supabase
      .from("offers")
      .update(payload)
      .eq("id", parsed.id)
      .eq("cafe_id", cafe.id)
      .select("*")
      .single();
    if (error) throw error;
    return mapDbOfferToCafeOffer(data);
  }

  const { data, error } = await supabase.from("offers").insert(payload).select("*").single();
  if (error) throw error;
  return mapDbOfferToCafeOffer(data);
}

export async function softDeleteOffer(offerId: string) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("offers")
    .update({ deleted_at: new Date().toISOString(), is_archived: true })
    .eq("id", offerId)
    .eq("cafe_id", cafe.id);
  if (error) throw error;
}

```

# File: lib/data/orders.ts

```typescript
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import { assertCustomerIdMatchesSession } from "@/lib/data/customers";
import { mapDbOrderToCafeOrder, mapOrderStatusToDb } from "@/lib/data/mappers";
import type { CafeOrder, OrderStatus } from "@/lib/mock/orders";

export async function getOwnerOrders(): Promise<CafeOrder[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .eq("cafe_id", cafe.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!orders?.length) return [];

  const orderIds = orders.map((o) => o.id);
  const { data: items } = await supabase.from("order_items").select("*").in("order_id", orderIds);

  const itemsByOrder = new Map<string, Record<string, unknown>[]>();
  for (const item of items ?? []) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  }

  return orders.map((o) =>
    mapDbOrderToCafeOrder(cafe.slug, o, itemsByOrder.get(o.id) ?? [])
  );
}

export async function updateOrderStatus(orderId: string, status: OrderStatus, rejectionReason?: string) {
  await requireOwnerCafeContext();
  const dbStatus = mapOrderStatusToDb(status);
  if (dbStatus !== "accepted" && dbStatus !== "rejected") {
    throw new Error("Invalid status for pickup response");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_pickup_order", {
    p_order_id: orderId,
    p_status: dbStatus,
    p_rejection_reason: rejectionReason ?? null,
  });

  if (error) throw error;
}

const createOrderSchema = z.object({
  cafeSlug: z.string(),
  customerId: z.string().uuid(),
  branchName: z.string().optional(),
  pickupAt: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive(),
      notes: z.string().optional(),
    })
  ),
});

/** Creates order via secure RPC — prices and status computed in database only */
export async function createPickupOrder(input: z.infer<typeof createOrderSchema>) {
  const parsed = createOrderSchema.parse(input);
  await assertCustomerIdMatchesSession(parsed.cafeSlug, parsed.customerId);
  const cafe = await getCafeBySlug(parsed.cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  const supabase = await createClient();
  const rpcItems = parsed.items.map((item) => ({
    product_id: item.productId,
    quantity: item.quantity,
    notes: item.notes ?? null,
  }));

  const { data: orderId, error } = await supabase.rpc("create_pickup_order", {
    p_cafe_id: cafe.id,
    p_branch_name: parsed.branchName ?? null,
    p_pickup_at: parsed.pickupAt ?? null,
    p_notes: parsed.notes ?? null,
    p_items: rpcItems,
  });

  if (error) throw error;
  return orderId as string;
}

```

# File: lib/data/pages.ts

```typescript
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import type { CafeInfoPage } from "@/lib/mock/cafe-pages";

function mapDbPage(row: Record<string, unknown>): CafeInfoPage {
  return {
    id: row.id as string,
    title: row.title as string,
    slug: row.slug as string,
    description: (row.description as string) ?? "",
    content: row.content as string,
    visible: row.published as boolean,
    updatedAt: (row.updated_at as string).slice(0, 10),
  };
}

export async function getOwnerPages(): Promise<CafeInfoPage[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cafe_pages")
    .select("*")
    .eq("cafe_id", cafe.id)
    .order("sort_order");

  if (error) throw error;
  return (data ?? []).map(mapDbPage);
}

export async function getPublicPagesBySlug(slug: string): Promise<CafeInfoPage[]> {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("cafe_pages")
    .select("*")
    .eq("cafe_id", cafe.id)
    .eq("published", true)
    .order("sort_order");

  return (data ?? []).map(mapDbPage);
}

const pageSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  content: z.string(),
  visible: z.boolean(),
  sortOrder: z.number().int().optional(),
});

export async function upsertPage(input: z.infer<typeof pageSchema>) {
  const parsed = pageSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const payload = {
    cafe_id: cafe.id,
    title: parsed.title,
    slug: parsed.slug,
    description: parsed.description ?? null,
    content: parsed.content,
    published: parsed.visible,
    sort_order: parsed.sortOrder ?? 0,
  };

  if (parsed.id) {
    const { data, error } = await supabase
      .from("cafe_pages")
      .update(payload)
      .eq("id", parsed.id)
      .eq("cafe_id", cafe.id)
      .select("*")
      .single();
    if (error) throw error;
    return mapDbPage(data);
  }

  const { data, error } = await supabase.from("cafe_pages").insert(payload).select("*").single();
  if (error) throw error;
  return mapDbPage(data);
}

export async function deletePage(pageId: string) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { error } = await supabase.from("cafe_pages").delete().eq("id", pageId).eq("cafe_id", cafe.id);
  if (error) throw error;
}

```

# File: lib/data/platform-settings.ts

```typescript
import { createClient } from "@/lib/supabase/server";

import { requirePlatformAdmin } from "@/lib/data/cafes";

import type { mockPlatformOptions } from "@/lib/platform/admin-data";



export type PlatformSettings = typeof mockPlatformOptions;



function mapRow(row: Record<string, unknown>): PlatformSettings {

  return {

    allowCafeSignup: row.allow_cafe_signup as boolean,

    requireCafeApproval: row.require_cafe_approval as boolean,

    platformCommissionPercent: Number(row.platform_commission_percent),

    supportEmail: row.support_email as string,

    defaultPlanId: row.default_plan_id as string,

  };

}



export async function getPlatformSettings(): Promise<PlatformSettings | null> {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase

    .from("platform_settings")

    .select("*")

    .eq("id", "default")

    .maybeSingle();



  if (error) throw error;

  return data ? mapRow(data) : null;

}



export async function savePlatformSettings(settings: PlatformSettings) {

  await requirePlatformAdmin();

  const supabase = await createClient();

  const { error } = await supabase

    .from("platform_settings")

    .update({

      allow_cafe_signup: settings.allowCafeSignup,

      require_cafe_approval: settings.requireCafeApproval,

      platform_commission_percent: settings.platformCommissionPercent,

      support_email: settings.supportEmail,

      default_plan_id: settings.defaultPlanId,

    })

    .eq("id", "default");



  if (error) throw error;

}


```

# File: lib/data/reservations.ts

```typescript
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import { assertCustomerIdMatchesSession } from "@/lib/data/customers";
import {
  mapDbReservationToCafeReservation,
  mapReservationStatusToDb,
} from "@/lib/data/mappers";
import type { CafeReservation, ReservationStatus } from "@/lib/mock/reservations";

export async function getOwnerReservations(): Promise<CafeReservation[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("cafe_id", cafe.id)
    .is("deleted_at", null)
    .order("reservation_date", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapDbReservationToCafeReservation);
}

export async function updateReservationStatus(
  reservationId: string,
  status: ReservationStatus,
  cafeMessage?: string,
  rejectionReason?: string
) {
  await requireOwnerCafeContext();
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
}

const createReservationSchema = z.object({
  cafeSlug: z.string(),
  customerId: z.string().uuid(),
  type: z.string(),
  guests: z.number().int().positive(),
  date: z.string(),
  time: z.string(),
  durationMinutes: z.number().optional(),
  branchName: z.string().optional(),
  spaceType: z.string().optional(),
  eventTitle: z.string().optional(),
  needsDecoration: z.boolean().optional(),
  needsCatering: z.boolean().optional(),
  budgetEstimate: z.number().optional(),
  notes: z.string().optional(),
});

export async function createReservation(input: z.infer<typeof createReservationSchema>) {
  const parsed = createReservationSchema.parse(input);
  await assertCustomerIdMatchesSession(parsed.cafeSlug, parsed.customerId);
  const cafe = await getCafeBySlug(parsed.cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  const supabase = await createClient();
  const { data: reservationId, error } = await supabase.rpc("create_customer_reservation", {
    p_cafe_id: cafe.id,
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
  });

  if (error) throw error;
  return reservationId as string;
}

```

# File: lib/data/reviews.ts

```typescript
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import { assertCustomerIdMatchesSession } from "@/lib/data/customers";
import type { CafeReview } from "@/lib/mock/reviews";

function mapDbReview(slug: string, row: Record<string, unknown>): CafeReview {
  return {
    id: row.id as string,
    cafeSlug: slug,
    productId: (row.product_id as string) ?? "",
    productName: (row.product_name as string) ?? "منتج",
    customerId: (row.customer_id as string) ?? "",
    customerName: row.customer_name as string,
    rating: row.rating as number,
    comment: (row.comment as string) ?? "",
    answer: (row.owner_reply as string) ?? undefined,
    status: row.owner_reply ? "ظاهر" : "بانتظار الرد",
    createdAt: (row.created_at as string).slice(0, 10),
  };
}

export async function getOwnerReviews(): Promise<CafeReview[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select("*, menu_products(name)")
    .eq("cafe_id", cafe.id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const product = row.menu_products as { name: string } | null;
    return mapDbReview(cafe.slug, {
      ...row,
      product_name: product?.name,
    });
  });
}

export async function getPublicReviewsByProduct(
  slug: string,
  productId: string
): Promise<CafeReview[]> {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select("*")
    .eq("cafe_id", cafe.id)
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => mapDbReview(slug, row));
}

const reviewSchema = z.object({
  cafeSlug: z.string(),
  productId: z.string().uuid(),
  customerId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string(),
});

export async function createReview(input: z.infer<typeof reviewSchema>) {
  const parsed = reviewSchema.parse(input);
  await assertCustomerIdMatchesSession(parsed.cafeSlug, parsed.customerId);
  const cafe = await getCafeBySlug(parsed.cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  const supabase = await createClient();
  const { data: reviewId, error } = await supabase.rpc("create_customer_review", {
    p_cafe_id: cafe.id,
    p_product_id: parsed.productId,
    p_rating: parsed.rating,
    p_comment: parsed.comment.trim() || null,
  });

  if (error) throw error;

  const { data } = await supabase
    .from("reviews")
    .select("*, menu_products(name)")
    .eq("id", reviewId)
    .single();

  if (!data) throw new Error("Review not found after create");
  const product = data.menu_products as { name: string } | null;
  return mapDbReview(parsed.cafeSlug, {
    ...data,
    product_name: product?.name,
  });
}

export async function replyToReview(reviewId: string, ownerReply: string) {
  await requireOwnerCafeContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_review_owner_reply", {
    p_review_id: reviewId,
    p_owner_reply: ownerReply,
  });
  if (error) throw error;
}

```

# File: lib/data/settings.ts

```typescript
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import { mapDbSettingsToCafeSettings } from "@/lib/data/mappers";
import {
  resolvePublishedStoragePathToUrl,
  storageBucketForLogo,
} from "@/lib/storage/resolve-storage-url";
import type { CafeSettings } from "@/lib/mock/cafe-settings";

type PublicSettingsRow = {
  cafe_id: string;
  description: string | null;
  logo_url: string | null;
  logo_storage_path: string | null;
  instagram: string | null;
  whatsapp: string | null;
  theme_id: string;
};

export async function getPublicCafeSettings(slug: string): Promise<CafeSettings | null> {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_cafe_public_settings", {
    p_cafe_id: cafe.id,
  });

  if (error) throw error;
  if (!data) {
    return {
      cafeSlug: slug,
      cafeName: cafe.name,
      ownerName: "",
      ownerEmail: "",
      ownerPhone: "",
      description: "",
      domainStatus: "غير مربوط",
    };
  }

  const row = data as PublicSettingsRow;
  const logoFromPath = row.logo_storage_path
    ? await resolvePublishedStoragePathToUrl(storageBucketForLogo(), row.logo_storage_path)
    : undefined;

  return {
    cafeSlug: slug,
    cafeName: cafe.name,
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    description: row.description ?? "",
    instagram: row.instagram ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    logoAssetId: row.logo_storage_path ?? undefined,
    logoDataUrl: logoFromPath ?? row.logo_url ?? undefined,
    domainStatus: "غير مربوط",
  };
}

export async function getOwnerCafeSettings(): Promise<CafeSettings> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cafe_settings")
    .select("*")
    .eq("cafe_id", cafe.id)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return {
      cafeSlug: cafe.slug,
      cafeName: cafe.name,
      ownerName: "",
      ownerEmail: "",
      ownerPhone: "",
      description: "",
      domainStatus: "غير مربوط",
    };
  }

  const settings = mapDbSettingsToCafeSettings(cafe.slug, data);
  settings.cafeName = cafe.name;
  if (data.logo_storage_path) {
    settings.logoAssetId = data.logo_storage_path as string;
    settings.logoDataUrl = await resolvePublishedStoragePathToUrl(
      storageBucketForLogo(),
      data.logo_storage_path as string
    );
  }
  return settings;
}

const settingsSchema = z.object({
  ownerName: z.string().optional(),
  ownerEmail: z.string().email().optional().or(z.literal("")),
  ownerPhone: z.string().optional(),
  taxNumber: z.string().optional(),
  commercialRegister: z.string().optional(),
  maroofCertificate: z.string().optional(),
  instagram: z.string().optional(),
  whatsapp: z.string().optional(),
  description: z.string().optional(),
  customDomain: z.string().optional(),
  domainStatus: z.string().optional(),
  purchasedDomain: z.string().optional(),
  purchasedDomainStatus: z.string().optional(),
  logoStoragePath: z.string().optional().nullable(),
  themeId: z.string().optional(),
});

export async function updateCafeSettings(input: z.infer<typeof settingsSchema>) {
  const parsed = settingsSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const payload = {
    cafe_id: cafe.id,
    owner_name: parsed.ownerName ?? null,
    owner_email: parsed.ownerEmail || null,
    owner_phone: parsed.ownerPhone ?? null,
    tax_number: parsed.taxNumber ?? null,
    commercial_register: parsed.commercialRegister ?? null,
    maroof_certificate: parsed.maroofCertificate ?? null,
    instagram: parsed.instagram ?? null,
    whatsapp: parsed.whatsapp ?? null,
    description: parsed.description ?? null,
    custom_domain: parsed.customDomain ?? null,
    domain_status: parsed.domainStatus ?? null,
    purchased_domain: parsed.purchasedDomain ?? null,
    purchased_domain_status: parsed.purchasedDomainStatus ?? null,
    logo_url: null,
    logo_storage_path: parsed.logoStoragePath ?? null,
    theme_id: parsed.themeId,
  };

  const { error } = await supabase.from("cafe_settings").upsert(payload, { onConflict: "cafe_id" });
  if (error) throw error;
}


```

# File: lib/data/subscription.ts

```typescript
import { createClient } from "@/lib/supabase/server";

import { requireOwnerCafeContext } from "@/lib/data/cafes";

import { getPlatformPlans } from "@/lib/data/admin";

import type {

  PendingSubscription,

  SubscriptionRecord,

} from "@/lib/platform/subscription";



function mapDbStatusToPaymentStatus(

  status: string

): SubscriptionRecord["paymentStatus"] {

  if (status === "active" || status === "trialing") return "paid";

  if (status === "past_due") return "pending";

  return "failed";

}



function mapDbRowToRecord(row: Record<string, unknown>): SubscriptionRecord {

  const plan = row.platform_plans as { name: string } | null;

  const status = row.status as string;

  return {

    id: row.id as string,

    planId: row.plan_id as string,

    planName: plan?.name ?? (row.plan_id as string),

    amount: Number(row.amount_sar),

    paymentStatus: mapDbStatusToPaymentStatus(status),

    createdAt: row.created_at as string,

    paidAt:

      status === "active" || status === "trialing"

        ? ((row.started_at as string) ?? (row.created_at as string))

        : undefined,

  };

}



export async function getOwnerSubscriptionHistory(): Promise<SubscriptionRecord[]> {

  const cafe = await requireOwnerCafeContext();

  const supabase = await createClient();

  const { data, error } = await supabase

    .from("subscriptions")

    .select("*, platform_plans(name)")

    .eq("cafe_id", cafe.id)

    .order("created_at", { ascending: false });



  if (error) throw error;

  return (data ?? []).map(mapDbRowToRecord);

}



export async function getOwnerPendingSubscription(): Promise<PendingSubscription | null> {

  const cafe = await requireOwnerCafeContext();

  const supabase = await createClient();

  const { data, error } = await supabase

    .from("subscriptions")

    .select("*, platform_plans(name)")

    .eq("cafe_id", cafe.id)

    .eq("status", "past_due")

    .order("created_at", { ascending: false })

    .limit(1)

    .maybeSingle();



  if (error) throw error;

  if (!data) return null;



  const plan = data.platform_plans as { name: string } | null;

  return {

    planId: data.plan_id as string,

    planName: plan?.name ?? (data.plan_id as string),

    amount: Number(data.amount_sar),

    paymentStatus: "pending",

    createdAt: data.created_at as string,

  };

}



export async function startOwnerPlanCheckout(planId: string): Promise<string> {

  const cafe = await requireOwnerCafeContext();

  const plans = await getPlatformPlans();

  const plan = plans.find((item) => item.id === planId);

  if (!plan) throw new Error("الباقة غير موجودة");



  const supabase = await createClient();

  const { data, error } = await supabase

    .from("subscriptions")

    .insert({

      cafe_id: cafe.id,

      plan_id: planId,

      status: "past_due",

      amount_sar: plan.priceMonthly,

    })

    .select("id")

    .single();



  if (error) throw error;

  return data.id as string;

}



export async function completeOwnerPlanPayment(subscriptionId?: string): Promise<boolean> {

  const cafe = await requireOwnerCafeContext();

  const supabase = await createClient();



  let targetId = subscriptionId;

  if (!targetId) {

    const { data: pending } = await supabase

      .from("subscriptions")

      .select("id")

      .eq("cafe_id", cafe.id)

      .eq("status", "past_due")

      .order("created_at", { ascending: false })

      .limit(1)

      .maybeSingle();

    if (!pending) return false;

    targetId = pending.id as string;

  }



  const paidAt = new Date().toISOString();



  await supabase

    .from("subscriptions")

    .update({ status: "cancelled", cancelled_at: paidAt })

    .eq("cafe_id", cafe.id)

    .in("status", ["active", "trialing"]);



  const { error } = await supabase

    .from("subscriptions")

    .update({ status: "active", started_at: paidAt })

    .eq("id", targetId)

    .eq("cafe_id", cafe.id);



  if (error) throw error;

  return true;

}



export async function failOwnerPlanPayment(): Promise<void> {

  const cafe = await requireOwnerCafeContext();

  const supabase = await createClient();

  const { error } = await supabase

    .from("subscriptions")

    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })

    .eq("cafe_id", cafe.id)

    .eq("status", "past_due");



  if (error) throw error;

}


```

# File: lib/data/theme.ts

```typescript
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import { mapDbCustomIdentity } from "@/lib/data/mappers";
import {
  resolvePublishedStoragePathToUrl,
  storageBucketForBackground,
  storageBucketForLogo,
} from "@/lib/storage/resolve-storage-url";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";
import type { CafeThemeId } from "@/lib/mock/cafe-theme";

export async function getPublicThemeId(slug: string): Promise<CafeThemeId> {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return "soft-cream-3d";

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_cafe_public_settings", { p_cafe_id: cafe.id });
  const row = data as { theme_id?: string } | null;
  return (row?.theme_id as CafeThemeId) ?? "soft-cream-3d";
}

export async function getPublicCustomIdentity(slug: string): Promise<CustomIdentityTheme | null> {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("cafe_custom_identity")
    .select("*")
    .eq("cafe_id", cafe.id)
    .maybeSingle();

  if (!data) return null;
  const identity = mapDbCustomIdentity(data);

  if (data.logo_storage_path) {
    identity.logoAssetId = data.logo_storage_path as string;
    identity.legacyLogoDataUrl = await resolvePublishedStoragePathToUrl(
      storageBucketForLogo(),
      data.logo_storage_path as string
    );
  }
  if (data.background_storage_path) {
    identity.backgroundAssetId = data.background_storage_path as string;
    identity.legacyBackgroundImageDataUrl = await resolvePublishedStoragePathToUrl(
      storageBucketForBackground(),
      data.background_storage_path as string
    );
  }

  return identity;
}

export async function updateOwnerThemeId(themeId: CafeThemeId) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("cafe_settings")
    .upsert({ cafe_id: cafe.id, theme_id: themeId }, { onConflict: "cafe_id" });
  if (error) throw error;
}

const identitySchema = z.object({
  palette: z.record(z.string(), z.string()),
  backgroundScope: z.string(),
  backgroundFit: z.string(),
  overlayStrength: z.string(),
  featuredSectionMode: z.string(),
  featuredCategoryId: z.string().uuid().optional().nullable(),
  logoStoragePath: z.string().optional().nullable(),
  backgroundStoragePath: z.string().optional().nullable(),
});

export async function upsertCustomIdentity(input: z.infer<typeof identitySchema>) {
  const parsed = identitySchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const { error } = await supabase.from("cafe_custom_identity").upsert(
    {
      cafe_id: cafe.id,
      palette: parsed.palette,
      background_scope: parsed.backgroundScope,
      background_fit: parsed.backgroundFit,
      overlay_strength: parsed.overlayStrength,
      featured_section_mode: parsed.featuredSectionMode,
      featured_category_id: parsed.featuredCategoryId ?? null,
      logo_storage_path: parsed.logoStoragePath ?? null,
      logo_url: null,
      background_storage_path: parsed.backgroundStoragePath ?? null,
      background_url: null,
    },
    { onConflict: "cafe_id" }
  );
  if (error) throw error;
}

export async function getOwnerCustomIdentity(): Promise<CustomIdentityTheme | null> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("cafe_custom_identity")
    .select("*")
    .eq("cafe_id", cafe.id)
    .maybeSingle();

  if (!data) return null;
  const identity = mapDbCustomIdentity(data);
  if (data.logo_storage_path) {
    identity.logoAssetId = data.logo_storage_path as string;
    identity.legacyLogoDataUrl = await resolvePublishedStoragePathToUrl(
      storageBucketForLogo(),
      data.logo_storage_path as string
    );
  }
  if (data.background_storage_path) {
    identity.backgroundAssetId = data.background_storage_path as string;
    identity.legacyBackgroundImageDataUrl = await resolvePublishedStoragePathToUrl(
      storageBucketForBackground(),
      data.background_storage_path as string
    );
  }
  return identity;
}

export async function getOwnerThemeId(): Promise<CafeThemeId> {
  const cafe = await requireOwnerCafeContext();
  return getPublicThemeId(cafe.slug);
}

```

# File: lib/platform/admin-data.ts

```typescript
export type PlatformFeature =
  | "menu"
  | "offers"
  | "reservations"
  | "loyalty"
  | "customers"
  | "branches"
  | "reports"
  | "reviews"
  | "orders"
  | "pages"
  | "marketing"
  | "theme"
  | "settings";

export type PlatformPlan = {
  id: string;
  name: string;
  priceMonthly: number;
  description: string;
  active: boolean;
  features: PlatformFeature[];
};

export type PlatformCafe = {
  id: string;
  slug: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  planId: string;
  status: "نشط" | "موقوف";
  totalRevenue: number;
  totalOrders: number;
  customersCount: number;
  createdAt: string;
  customDomain?: string;
  customDomainStatus?: "غير مربوط" | "بانتظار التحقق" | "مربوط";
  purchasedDomain?: string;
  purchasedDomainStatus?: "غير مربوط" | "بانتظار التحقق" | "مربوط";
  purchasedDomainCreatedAt?: string;
  purchasedDomainConnectedAt?: string;
};

export type PlatformCustomer = {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  cafeId: string;
  cafeName: string;
  status: "نشط" | "موقوف";
  totalSpent: number;
  loyaltyPoints: number;
  createdAt: string;
};

export type PlatformOperation = {
  id: string;
  cafeId: string;
  cafeName: string;
  customerName?: string;
  type:
    | "طلب"
    | "حجز"
    | "دفع"
    | "تقييم"
    | "تسجيل كوفي"
    | "تغيير باقة"
    | "شراء دومين"
    | "ربط دومين";
  title: string;
  amount?: number;
  status: string;
  createdAt: string;
};

export const PLATFORM_PLANS_KEY = "branda_platform_plans";
export const PLATFORM_CAFES_KEY = "branda_platform_cafes";
export const PLATFORM_CUSTOMERS_KEY = "branda_platform_customers";
export const PLATFORM_OPERATIONS_KEY = "branda_platform_operations";
export const PLATFORM_OPTIONS_KEY = "branda_platform_options";
export const ACTIVE_CAFE_PLAN_KEY = "branda_qatrah_active_plan";

export const allPlatformFeatures: { id: PlatformFeature; title: string }[] = [
  { id: "menu", title: "المنيو" },
  { id: "offers", title: "العروض" },
  { id: "reservations", title: "الحجوزات" },
  { id: "loyalty", title: "الولاء" },
  { id: "customers", title: "العملاء" },
  { id: "branches", title: "الفروع" },
  { id: "reports", title: "التقارير" },
  { id: "reviews", title: "التقييمات والأسئلة" },
  { id: "orders", title: "الطلبات" },
  { id: "pages", title: "الصفحات التعريفية" },
  { id: "marketing", title: "التسويق" },
  { id: "theme", title: "ثيم الكوفي" },
  { id: "settings", title: "الإعدادات" },
];

export const mockPlatformPlans: PlatformPlan[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 99,
    description: "مناسبة لكوفي صغير يبدأ بمنيو وحجوزات أساسية.",
    active: true,
    features: ["menu", "offers", "reservations", "customers", "settings"],
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthly: 199,
    description: "تشمل الولاء والفروع والتقييمات والطلبات.",
    active: true,
    features: [
      "menu",
      "offers",
      "reservations",
      "loyalty",
      "customers",
      "branches",
      "reviews",
      "orders",
      "settings",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 399,
    description: "كل أدوات برندة للكوفيهات الاحترافية.",
    active: true,
    features: [
      "menu",
      "offers",
      "reservations",
      "loyalty",
      "customers",
      "branches",
      "reports",
      "reviews",
      "orders",
      "pages",
      "marketing",
      "theme",
      "settings",
    ],
  },
];

export const mockPlatformCafes: PlatformCafe[] = [
  {
    id: "cafe_qatrah",
    slug: "qatrah",
    name: "كوفي قطرة",
    ownerName: "مالك قطرة",
    ownerEmail: "owner@qatrah.com",
    ownerPhone: "0550000000",
    planId: "pro",
    status: "نشط",
    totalRevenue: 12450,
    totalOrders: 286,
    customersCount: 92,
    createdAt: "2026-05-22",
    customDomain: "",
    customDomainStatus: "غير مربوط",
    purchasedDomain: "",
    purchasedDomainStatus: "غير مربوط",
  },
];

export const mockPlatformCustomers: PlatformCustomer[] = [
  {
    id: "mock_customer_1",
    fullName: "عبدالله",
    phone: "0550000001",
    email: "customer@email.com",
    cafeId: "cafe_qatrah",
    cafeName: "كوفي قطرة",
    status: "نشط",
    totalSpent: 520,
    loyaltyPoints: 180,
    createdAt: "2026-05-22",
  },
];

export const mockPlatformOperations: PlatformOperation[] = [
  {
    id: "op_1",
    cafeId: "cafe_qatrah",
    cafeName: "كوفي قطرة",
    customerName: "عبدالله",
    type: "طلب",
    title: "طلب جديد داخل الكوفي",
    amount: 49.45,
    status: "مكتمل",
    createdAt: "2026-05-22",
  },
  {
    id: "op_2",
    cafeId: "cafe_qatrah",
    cafeName: "كوفي قطرة",
    customerName: "محمد",
    type: "حجز",
    title: "طلب حجز طاولة",
    status: "بانتظار الرد",
    createdAt: "2026-05-22",
  },
];

export const mockPlatformOptions = {
  allowCafeSignup: true,
  requireCafeApproval: true,
  platformCommissionPercent: 3,
  supportEmail: "support@branda.com",
  defaultPlanId: "starter",
};
```

# File: lib/platform/auth.ts

```typescript
export type BrandaUserRole = "admin" | "cafe_owner";

/** @deprecated Use Supabase Auth via loginOwnerAction */
export type BrandaAuthUser = {
  id: string;
  fullName: string;
  email: string;
  role: BrandaUserRole;
  cafeSlug?: string;
  cafeId?: string;
  status: "نشط" | "موقوف";
};

export const BRANDA_AUTH_SESSION_KEY = "branda_auth_session";

/** Mock users removed — use Supabase Auth + development seed */
export const mockAuthUsers: BrandaAuthUser[] = [];

export async function loginWithRole(email: string, password: string) {
  const { loginOwnerAction } = await import("@/app/actions/auth");
  return loginOwnerAction(email, password);
}

export async function getBrandaAuthSession() {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return null;

  return {
    id: user.id,
    fullName: profile.full_name,
    email: profile.email ?? user.email,
    role: profile.role === "platform_admin" ? "admin" : "cafe_owner",
    loginAt: user.last_sign_in_at ?? new Date().toISOString(),
  };
}

export async function logoutBrandaAuth() {
  const { logoutAction } = await import("@/app/actions/auth");
  await logoutAction();
}

```

# File: lib/platform/cafe-domain.ts

```typescript
import type { CafeSettings } from "@/lib/mock/cafe-settings";

export type CafeDomainLinkStatus = "غير مربوط" | "بانتظار التحقق" | "مربوط";

export type CafeDomainSettings = {
  customDomain?: string;
  domainStatus: CafeDomainLinkStatus;
  purchasedDomain?: string;
  purchasedDomainStatus?: CafeDomainLinkStatus;
};

export type CafeDomainSource =
  | "platform_subdomain"
  | "external_custom_domain"
  | "purchased_domain";

export const CAFE_DOMAIN_SETTINGS_KEY = "branda_qatrah_domain_settings";

const DEFAULT_PLATFORM_DOMAIN =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_BRANDA_PUBLIC_DOMAIN) ||
  "branda.local";

export function getPlatformPublicDomain() {
  return DEFAULT_PLATFORM_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function normalizeCafeDomainInput(domain: string) {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/^www\./, "");
}

export function getCafeSubdomainHost(slug: string) {
  return `${slug}.${getPlatformPublicDomain()}`;
}

export function getCafeDisplayDomain(
  slug: string,
  settings?: Pick<
    CafeSettings,
    "customDomain" | "domainStatus" | "purchasedDomain" | "purchasedDomainStatus"
  > | null
) {
  const purchased = settings?.purchasedDomain?.trim();
  if (purchased && settings?.purchasedDomainStatus === "مربوط") {
    return normalizeCafeDomainInput(purchased);
  }
  const custom = settings?.customDomain?.trim();
  if (custom && settings?.domainStatus === "مربوط") {
    return normalizeCafeDomainInput(custom);
  }
  return getCafeSubdomainHost(slug);
}

export function resolveCafeDomainSource(
  settings?: Pick<
    CafeSettings,
    "customDomain" | "domainStatus" | "purchasedDomain" | "purchasedDomainStatus"
  > | null
): CafeDomainSource {
  if (settings?.purchasedDomain && settings.purchasedDomainStatus === "مربوط") {
    return "purchased_domain";
  }
  if (settings?.customDomain && settings.domainStatus === "مربوط") {
    return "external_custom_domain";
  }
  return "platform_subdomain";
}

type PublicUrlOptions = {
  path?: string;
  previewTheme?: string;
  origin?: string;
  settings?: Pick<
    CafeSettings,
    "customDomain" | "domainStatus" | "purchasedDomain" | "purchasedDomainStatus"
  > | null;
};

export function getCafePublicUrl(slug: string, options?: PublicUrlOptions) {
  const path = options?.path ?? "";
  const normalizedPath = path.startsWith("/") ? path : path ? `/${path}` : "";

  const previewTheme = options?.previewTheme;
  const query = previewTheme
    ? `?previewTheme=${encodeURIComponent(previewTheme)}`
    : "";
  const selectedDomain = getCafeDisplayDomain(slug, options?.settings);
  const source = resolveCafeDomainSource(options?.settings);
  const routePath = `/c/${slug}${normalizedPath}`;

  if (options?.origin) {
    const base = options.origin.replace(/\/$/, "");
    const isLocalOrigin = /localhost|127\.0\.0\.1/.test(base);
    if (!isLocalOrigin && source !== "platform_subdomain") {
      const onRoot = normalizedPath === "";
      return `https://${selectedDomain}${onRoot ? "" : normalizedPath}${query}`;
    }
    return `${base}${routePath}${query}`;
  }

  if (typeof window !== "undefined") {
    const base = window.location.origin;
    const isLocalWindow = /localhost|127\.0\.0\.1/.test(window.location.hostname);
    if (!isLocalWindow && source !== "platform_subdomain") {
      const onRoot = normalizedPath === "";
      return `https://${selectedDomain}${onRoot ? "" : normalizedPath}${query}`;
    }
    return `${base}${routePath}${query}`;
  }

  if (process.env.NODE_ENV === "production" && source !== "platform_subdomain") {
    const onRoot = normalizedPath === "";
    return `https://${selectedDomain}${onRoot ? "" : normalizedPath}${query}`;
  }
  return `https://${getPlatformPublicDomain()}${routePath}${query}`;
}

/** يحل slug من hostname (مستقبلي) أو pathname الحالي */
export function resolveCafeSlugFromHost(hostname: string, pathname: string) {
  const platformDomain = getPlatformPublicDomain();
  const host = hostname.toLowerCase().split(":")[0];

  if (host.endsWith(`.${platformDomain}`) && host !== platformDomain) {
    const sub = host.replace(`.${platformDomain}`, "");
    if (sub && !sub.includes(".")) return sub;
  }

  const match = pathname.match(/^\/c\/([^/]+)/);
  return match?.[1] ?? null;
}

export const VERCEL_CNAME_TARGET = "cname.vercel-dns.com";

export function getDomainSetupInstructions(slug: string) {
  return {
    cname: VERCEL_CNAME_TARGET,
    subdomain: getCafeSubdomainHost(slug),
    note:
      "لتفعيل دومين خاص: أضف سجل CNAME يشير إلى cname.vercel-dns.com ثم انتظر التحقق من لوحة برندة.",
  };
}

```

# File: lib/platform/domain-purchase-server.ts

```typescript
import {
  createMockOrderId,
  extractTld,
  isLiveDomainPurchaseEnabled,
  isSupportedDirectPurchaseTld,
  isValidDomain,
  normalizeDomain,
  type CafePurchasedDomain,
  type DomainAvailabilityResult,
  type DomainPriceResult,
} from "@/lib/platform/domain-purchase";

type VercelConfig = {
  token: string;
  teamId?: string;
  projectId?: string;
};

function getVercelConfig(): VercelConfig {
  const token = process.env.VERCEL_TOKEN || "";
  return {
    token,
    teamId: process.env.VERCEL_TEAM_ID,
    projectId: process.env.VERCEL_PROJECT_ID,
  };
}

function withTeamQuery(path: string, teamId?: string) {
  if (!teamId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}teamId=${encodeURIComponent(teamId)}`;
}

async function vercelFetch(path: string, init?: RequestInit) {
  const cfg = getVercelConfig();
  if (!cfg.token) throw new Error("VERCEL_TOKEN is missing");
  const url = `https://api.vercel.com${withTeamQuery(path, cfg.teamId)}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      typeof payload.error?.toString === "function"
        ? payload.error.toString()
        : `Vercel API failed (${res.status})`;
    throw new Error(msg);
  }
  return payload;
}

export function validateDomainInput(domainInput: string) {
  const domain = normalizeDomain(domainInput);
  if (!isValidDomain(domain)) {
    throw new Error("صيغة الدومين غير صحيحة.");
  }
  const tld = extractTld(domain);
  return { domain, tld, supportedTld: isSupportedDirectPurchaseTld(tld) };
}

export async function resolveAvailability(domainInput: string): Promise<DomainAvailabilityResult> {
  const { domain, tld, supportedTld } = validateDomainInput(domainInput);
  if (!supportedTld) {
    return {
      domain,
      tld,
      available: false,
      supportedTld: false,
      status: "unavailable",
      message:
        "هذا الامتداد غير مدعوم للشراء المباشر حاليًا، يمكنك ربطه يدويًا من خيار الدومين الخارجي.",
    };
  }

  if (!isLiveDomainPurchaseEnabled()) {
    const unavailableSeeds = ["taken", "google", "apple", "amazon", "vercel", "branda"];
    const firstLabel = domain.split(".")[0] || "";
    const available = !unavailableSeeds.some((seed) => firstLabel.includes(seed));
    return {
      domain,
      tld,
      available,
      supportedTld: true,
      status: available ? "available" : "unavailable",
    };
  }

  const payload = await vercelFetch(`/v1/registrar/domains/${encodeURIComponent(domain)}/availability`);
  const available = Boolean(payload.available);
  return {
    domain,
    tld,
    available,
    supportedTld: true,
    status: available ? "available" : "unavailable",
  };
}

export async function resolvePrice(domainInput: string, years = 1): Promise<DomainPriceResult> {
  const { domain, tld, supportedTld } = validateDomainInput(domainInput);
  if (!supportedTld) {
    return {
      domain,
      tld,
      supportedTld: false,
      years,
      price: 0,
      currency: "SAR",
      status: "failed",
      message:
        "هذا الامتداد غير مدعوم للشراء المباشر حاليًا، يمكنك ربطه يدويًا من خيار الدومين الخارجي.",
    };
  }

  if (!isLiveDomainPurchaseEnabled()) {
    const basePriceMap: Record<string, number> = {
      ".com": 55,
      ".net": 60,
      ".org": 58,
      ".io": 140,
      ".co": 120,
      ".app": 75,
      ".store": 110,
      ".sa": 180,
    };
    const base = basePriceMap[tld] ?? 95;
    return {
      domain,
      tld,
      supportedTld: true,
      years,
      price: base * years,
      currency: "SAR",
      status: "available",
    };
  }

  const payload = await vercelFetch(`/v1/registrar/domains/${encodeURIComponent(domain)}/price?years=${years}`);
  return {
    domain,
    tld,
    supportedTld: true,
    years,
    price: Number(payload.price ?? 0),
    currency: String(payload.currency ?? "USD"),
    status: "available",
  };
}

export async function purchaseDomain(input: {
  cafeSlug: string;
  domain: string;
  years: number;
  autoRenew: boolean;
  price?: number;
  currency?: string;
}): Promise<CafePurchasedDomain> {
  const { domain, tld } = validateDomainInput(input.domain);
  const { createDomainOrderRequest } = await import("@/lib/data/domain-orders");

  if (!isLiveDomainPurchaseEnabled()) {
    return createDomainOrderRequest({
      cafeSlug: input.cafeSlug,
      domain,
      tld,
      years: input.years,
      autoRenew: input.autoRenew,
    });
  }

  const processing = await createDomainOrderRequest({
    cafeSlug: input.cafeSlug,
    domain,
    tld,
    years: input.years,
    autoRenew: input.autoRenew,
  });

  try {
    const payload = await vercelFetch(`/v1/registrar/domains/${encodeURIComponent(domain)}/buy`, {
      method: "POST",
      body: JSON.stringify({
        years: input.years,
        autoRenew: input.autoRenew,
      }),
    });

    return {
      ...processing,
      status: "purchased",
      vercelOrderId: String(payload.orderId ?? payload.id ?? ""),
      vercelDomainId: typeof payload.domainId === "string" ? payload.domainId : undefined,
      paidAt: new Date().toISOString(),
      purchasedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw error;
  }
}

export async function connectDomainToProject(domainInput: string) {
  const { domain } = validateDomainInput(domainInput);
  const cfg = getVercelConfig();
  if (!isLiveDomainPurchaseEnabled()) {
    return { domain, connected: true, projectDomainId: `mock_project_domain_${Date.now()}` };
  }
  if (!cfg.projectId) {
    throw new Error("VERCEL_PROJECT_ID is missing");
  }
  const payload = await vercelFetch(`/v10/projects/${encodeURIComponent(cfg.projectId)}/domains`, {
    method: "POST",
    body: JSON.stringify({ name: domain }),
  });
  return {
    domain,
    connected: true,
    projectDomainId: String(payload.id ?? payload.name ?? ""),
  };
}

export async function resolveDomainStatus(domainInput: string) {
  const { domain } = validateDomainInput(domainInput);
  if (!isLiveDomainPurchaseEnabled()) {
    return { domain, status: "purchased" as const, connected: false };
  }

  const cfg = getVercelConfig();
  if (!cfg.projectId) {
    throw new Error("VERCEL_PROJECT_ID is missing");
  }

  const payload = await vercelFetch(
    `/v10/projects/${encodeURIComponent(cfg.projectId)}/domains/${encodeURIComponent(domain)}`
  );
  const verified = Boolean(payload.verified ?? payload.apexName);
  return {
    domain,
    status: verified ? ("connected" as const) : ("purchased" as const),
    connected: verified,
  };
}

```

# File: lib/platform/domain-purchase.ts

```typescript
import type { PlatformOperation } from "@/lib/platform/admin-data";

export type DomainPurchaseStatus =
  | "searching"
  | "available"
  | "unavailable"
  | "pending_payment"
  | "payment_required"
  | "mock_paid"
  | "purchase_pending"
  | "purchased"
  | "connected"
  | "failed";

export type CafePurchasedDomain = {
  id: string;
  cafeSlug: string;
  domain: string;
  tld: string;
  price?: number;
  currency?: string;
  years: number;
  autoRenew: boolean;
  status: DomainPurchaseStatus;
  vercelOrderId?: string;
  vercelDomainId?: string;
  createdAt: string;
  paidAt?: string;
  purchasedAt?: string;
  errorMessage?: string;
};

export type DomainAvailabilityResult = {
  domain: string;
  tld: string;
  available: boolean;
  supportedTld: boolean;
  status: DomainPurchaseStatus;
  message?: string;
};

export type DomainPriceResult = {
  domain: string;
  tld: string;
  supportedTld: boolean;
  years: number;
  price: number;
  currency: string;
  status: DomainPurchaseStatus;
  message?: string;
};

export const DOMAIN_SEARCHES_KEY = "branda_qatrah_domain_searches";
export const DOMAIN_PURCHASES_KEY = "branda_qatrah_domain_purchases";
export const DOMAIN_PURCHASE_ACTIVE_KEY = "branda_qatrah_purchased_domain_active";

const SUPPORTED_TLDS = [".com", ".net", ".org", ".io", ".co", ".app", ".store", ".sa"] as const;

export function normalizeDomain(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

export function extractTld(domain: string) {
  const idx = domain.lastIndexOf(".");
  return idx === -1 ? "" : domain.slice(idx);
}

export function isValidDomain(domain: string) {
  const normalized = normalizeDomain(domain);
  return /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i.test(normalized);
}

export function isSupportedDirectPurchaseTld(tld: string) {
  return SUPPORTED_TLDS.includes(tld as (typeof SUPPORTED_TLDS)[number]);
}

export function isLiveDomainPurchaseEnabled() {
  return process.env.VERCEL_DOMAIN_PURCHASE_LIVE === "true";
}

export function createMockOrderId(domain: string) {
  return `mock_order_${domain.replace(/\W+/g, "_")}_${Date.now()}`;
}

export function buildDomainOperation(input: {
  cafeId: string;
  cafeName: string;
  type: "شراء دومين" | "ربط دومين";
  title: string;
  amount?: number;
  status: string;
}): PlatformOperation {
  return {
    id: `op_domain_${Date.now()}`,
    cafeId: input.cafeId,
    cafeName: input.cafeName,
    type: input.type,
    title: input.title,
    amount: input.amount,
    status: input.status,
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

```

# File: lib/platform/experience-flow.ts

```typescript
import type { BrandaCustomerSession } from "@/lib/customer/session";
import type { ExperienceCampaign, ExperiencePlatform } from "@/lib/mock/experience-campaigns";
import {
  approveExperienceSubmission as approveSubmissionDb,
  createExperienceSubmission,
  rejectExperienceSubmission as rejectSubmissionDb,
  updateExperienceMetrics as updateMetricsDb,
  upsertExperienceCampaign,
} from "@/lib/data/experience";
import { createNotification } from "@/lib/data/notifications";

export async function submitExperienceCampaign(input: {
  slug: string;
  customer: BrandaCustomerSession;
  campaignId: string;
  platform: ExperiencePlatform;
  videoUrl: string;
  platformUsername?: string;
  note?: string;
}) {
  const submission = await createExperienceSubmission({
    cafeSlug: input.slug,
    customerId: input.customer.id,
    campaignId: input.campaignId,
    platform: input.platform,
    videoUrl: input.videoUrl,
    platformUsername: input.platformUsername,
    note: input.note,
  });

  await createNotification({
    cafeSlug: input.slug,
    audience: "customer",
    customerId: input.customer.id,
    title: "تم إرسال مشاركتك",
    body: "مشاركتك بانتظار مراجعة الكوفي. سنبلغك عند الموافقة وإضافة النقاط.",
    type: "experience_submission",
    meta: { submissionId: submission.id },
  });

  return { ok: true as const, submission };
}

export async function updateExperienceMetrics(
  submissionId: string,
  metrics: { views?: number; likes?: number; comments?: number; shares?: number }
) {
  try {
    const submission = await updateMetricsDb(submissionId, metrics);
    return { ok: true as const, submission };
  } catch {
    return { ok: false as const, error: "المشاركة غير موجودة" };
  }
}

export async function approveExperienceSubmission(
  submissionId: string,
  awardedPoints: number,
  cafeSlug = "qatrah"
) {
  try {
    const submission = await approveSubmissionDb(submissionId, awardedPoints);

    await createNotification({
      cafeSlug,
      audience: "customer",
      customerId: submission.customerId,
      title: "تمت الموافقة على مشاركتك",
      body: `حصلت على ${awardedPoints} نقطة ولاء من حملة وثّق تجربتك.`,
      type: "experience_approved",
      meta: { submissionId, points: String(awardedPoints) },
    });

    return { ok: true as const, submission };
  } catch {
    return { ok: false as const, error: "المشاركة غير متاحة للموافقة" };
  }
}

export async function rejectExperienceSubmission(
  submissionId: string,
  reason: string,
  cafeSlug = "qatrah"
) {
  try {
    const submission = await rejectSubmissionDb(submissionId, reason);

    await createNotification({
      cafeSlug,
      audience: "customer",
      customerId: submission.customerId,
      title: "تم رفض مشاركتك",
      body: reason.trim() || "لم تستوفِ شروط حملة وثّق تجربتك.",
      type: "experience_approved",
      meta: { submissionId },
    });

    return { ok: true as const, submission };
  } catch {
    return { ok: false as const, error: "المشاركة غير متاحة للرفض" };
  }
}

export async function saveExperienceCampaign(campaign: ExperienceCampaign) {
  await upsertExperienceCampaign({
    id: /^[0-9a-f-]{36}$/i.test(campaign.id) ? campaign.id : undefined,
    title: campaign.title,
    description: campaign.description,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    terms: campaign.terms,
    platforms: campaign.platforms,
    minFollowers: campaign.minFollowers ?? null,
    basePoints: campaign.basePoints,
    pointsPerView: campaign.pointsPerView,
    pointsPerLike: campaign.pointsPerLike,
    pointsPerComment: campaign.pointsPerComment,
    maxPointsPerSubmission: campaign.maxPointsPerSubmission,
    requiresManualApproval: campaign.requiresManualApproval,
    status: campaign.status,
  });
}

```

# File: lib/platform/notification-flow.ts

```typescript
import type { AppNotification, NotificationAudience } from "@/lib/mock/notifications";
import {
  createNotification,
  getNotificationsForAudience as getNotificationsForAudienceDb,
  markCustomerNotificationRead,
  markNotificationRead as markNotificationReadDb,
} from "@/lib/data/notifications";

export async function notifyCustomer(input: {
  cafeSlug: string;
  customerId: string;
  title: string;
  body: string;
  type: AppNotification["type"];
  meta?: Record<string, string>;
}) {
  return createNotification({ ...input, audience: "customer" });
}

export async function notifyCafe(input: {
  cafeSlug: string;
  title: string;
  body: string;
  type: AppNotification["type"];
  meta?: Record<string, string>;
}) {
  return createNotification({ ...input, audience: "cafe" });
}

export async function getNotificationsForAudience(
  audience: NotificationAudience,
  cafeSlug: string,
  customerId?: string
) {
  return getNotificationsForAudienceDb(audience, cafeSlug, customerId);
}

export async function markNotificationRead(id: string) {
  await markNotificationReadDb(id);
}

export async function markCustomerNotificationReadById(cafeSlug: string, id: string) {
  await markCustomerNotificationRead(cafeSlug, id);
}

```

# File: lib/platform/order-flow.ts

```typescript
import type { MenuProduct } from "@/lib/mock/menu";
import type { BrandaCustomerSession } from "@/lib/customer/session";
import { createPickupOrder, updateOrderStatus } from "@/lib/data/orders";
import { createNotification } from "@/lib/data/notifications";

export type CreateOrderInput = {
  slug: string;
  cafeId?: string;
  cafeName?: string;
  customer: BrandaCustomerSession;
  product: MenuProduct;
  quantity: number;
  branchName?: string;
  pickupAt?: string;
  notes?: string;
};

export type CreateOrderResult = {
  orderId: string;
  total: number;
  loyaltyPointsEarned: number;
};

export async function createCafeOrderFromProduct(
  input: CreateOrderInput
): Promise<CreateOrderResult> {
  const { slug, customer, product, quantity } = input;

  const orderId = await createPickupOrder({
    cafeSlug: slug,
    customerId: customer.id,
    branchName: input.branchName,
    pickupAt: input.pickupAt,
    notes: input.notes,
    items: [
      {
        productId: product.id,
        quantity,
        notes: input.notes,
      },
    ],
  });

  const subtotal = product.price * quantity;
  const taxAmount = Math.round(subtotal * 0.15 * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  const loyaltyPointsEarned = Math.floor(total);

  return { orderId, total, loyaltyPointsEarned };
}

export async function acceptPickupOrder(orderId: string, cafeSlug = "qatrah") {
  await updateOrderStatus(orderId, "مقبول");

  const { getOwnerOrders } = await import("@/lib/data/orders");
  const orders = await getOwnerOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order) {
    return { ok: false as const, error: "الطلب غير متاح للقبول" };
  }

  if (order.customerId) {
    await createNotification({
      cafeSlug,
      audience: "customer",
      customerId: order.customerId,
      title: "تم قبول طلبك",
      body: `طلبك ${orderId} مقبول. الدفع عند الاستلام في ${order.branchName || "الفرع"}.`,
      type: "order_accepted",
      meta: { orderId },
    });
  }

  return { ok: true as const, order: { ...order, status: "مقبول" as const } };
}

export async function rejectPickupOrder(orderId: string, reason: string, cafeSlug = "qatrah") {
  await updateOrderStatus(orderId, "مرفوض", reason.trim() || "تم الرفض من الكوفي");

  const { getOwnerOrders } = await import("@/lib/data/orders");
  const orders = await getOwnerOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order) {
    return { ok: false as const, error: "الطلب غير متاح للرفض" };
  }

  if (order.customerId) {
    await createNotification({
      cafeSlug,
      audience: "customer",
      customerId: order.customerId,
      title: "تم رفض طلبك",
      body: `طلبك ${orderId} مرفوض. السبب: ${reason.trim() || "غير محدد"}`,
      type: "order_rejected",
      meta: { orderId },
    });
  }

  return { ok: true as const, order: { ...order, status: "مرفوض" as const } };
}

```

# File: lib/platform/permissions.ts

```typescript
import {
  mockPlatformPlans,
  type PlatformFeature,
  type PlatformPlan,
} from "@/lib/platform/admin-data";

export function getPlatformPlans(): PlatformPlan[] {
  return mockPlatformPlans;
}

export function getActiveCafePlanId() {
  return "pro";
}

export function setActiveCafePlanId(_planId: string) {
  throw new Error("Use Supabase subscription actions");
}

export function cafeHasFeature(
  feature: PlatformFeature,
  options?: { planId?: string; plans?: PlatformPlan[] }
) {
  const plans = options?.plans ?? mockPlatformPlans;
  const activePlanId = options?.planId ?? "pro";
  const plan = plans.find((item) => item.id === activePlanId);
  if (!plan) return true;
  return plan.features.includes(feature);
}

export function getEnabledCafeFeatures(options?: { planId?: string; plans?: PlatformPlan[] }) {
  const plans = options?.plans ?? mockPlatformPlans;
  const activePlanId = options?.planId ?? "pro";
  const plan = plans.find((item) => item.id === activePlanId);
  return plan?.features || [];
}

```

# File: lib/platform/reservation-flow.ts

```typescript
import type { BrandaCustomerSession } from "@/lib/customer/session";
import type { CafeBranch } from "@/lib/mock/branches";
import type { ReservationEventType, ReservationStatus } from "@/lib/mock/reservations";
import { createReservation, updateReservationStatus as updateReservationStatusDb } from "@/lib/data/reservations";

export type CreateReservationInput = {
  slug: string;
  customer: BrandaCustomerSession;
  branch: CafeBranch;
  reservationType: ReservationEventType;
  guests: number;
  date: string;
  time: string;
  durationMinutes?: number;
  spaceType?: string;
  eventTitle?: string;
  needsDecoration?: boolean;
  needsCatering?: boolean;
  budgetEstimate?: number;
  notes?: string;
};

export async function createReservationFlow(input: CreateReservationInput) {
  const {
    slug,
    customer,
    branch,
    reservationType,
    guests,
    date,
    time,
    durationMinutes,
    spaceType,
    eventTitle,
    needsDecoration,
    needsCatering,
    budgetEstimate,
    notes,
  } = input;

  const reservationId = await createReservation({
    cafeSlug: slug,
    customerId: customer.id,
    type: reservationType,
    guests,
    date,
    time,
    durationMinutes,
    branchName: branch.name,
    spaceType: spaceType?.trim() || undefined,
    eventTitle: eventTitle?.trim() || undefined,
    needsDecoration,
    needsCatering,
    budgetEstimate,
    notes: notes?.trim() || undefined,
  });

  return {
    id: reservationId,
    customerId: customer.id,
    customerName: customer.fullName,
    phone: customer.phone,
    type: reservationType,
    guests,
    date,
    time,
    durationMinutes,
    branchName: branch.name,
    spaceType: spaceType?.trim() || undefined,
    eventTitle: eventTitle?.trim() || undefined,
    needsDecoration,
    needsCatering,
    budgetEstimate,
    notes: notes?.trim() || undefined,
    status: "بانتظار الرد" as const,
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

export async function updateReservationStatus(
  reservationId: string,
  status: ReservationStatus,
  options?: {
    cafeMessage?: string;
    rejectionReason?: string;
  }
) {
  await updateReservationStatusDb(
    reservationId,
    status,
    options?.cafeMessage,
    options?.rejectionReason
  );

  const { getOwnerReservations } = await import("@/lib/data/reservations");
  const reservations = await getOwnerReservations();
  const reservation = reservations.find((r) => r.id === reservationId);
  if (!reservation) {
    return { ok: false as const, error: "الحجز غير موجود" };
  }

  return {
    ok: true as const,
    reservation: { ...reservation, status },
  };
}

```

# File: lib/platform/subscription.ts

```typescript
export type SubscriptionPaymentStatus = "pending" | "paid" | "failed";

export type SubscriptionRecord = {
  id: string;
  planId: string;
  planName: string;
  amount: number;
  paymentStatus: SubscriptionPaymentStatus;
  createdAt: string;
  paidAt?: string;
};

export type PendingSubscription = {
  planId: string;
  planName: string;
  amount: number;
  paymentStatus: SubscriptionPaymentStatus;
  createdAt: string;
};

export const SUBSCRIPTION_HISTORY_KEY = "branda_qatrah_subscription_history";
export const PENDING_SUBSCRIPTION_KEY = "branda_qatrah_pending_subscription";

export function getSubscriptionHistory(): SubscriptionRecord[] {
  throw new Error("Use fetchOwnerSubscriptionHistoryAction");
}

export function saveSubscriptionHistory(_records: SubscriptionRecord[]) {
  throw new Error("Use Supabase subscription actions");
}

export function getPendingSubscription(): PendingSubscription | null {
  throw new Error("Use fetchOwnerPendingSubscriptionAction");
}

export function setPendingSubscription(_pending: PendingSubscription | null) {
  throw new Error("Use Supabase subscription actions");
}

export function startPlanCheckout(_planId: string, _planName: string, _amount: number) {
  throw new Error("Use startPlanCheckoutAction");
}

export function completePlanPayment(_recordId?: string): boolean {
  throw new Error("Use completePlanPaymentAction");
}

export function failPlanPayment() {
  throw new Error("Use failPlanPaymentAction");
}

export function getActivePlanIdFromStorage() {
  throw new Error("Use fetchOwnerPlanIdAction");
}

```

# File: lib/supabase/admin.ts

```typescript
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/branda/env";

/** Service role — SERVER ONLY. Never import in Client Components. */
export function createAdminClient() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

```

# File: lib/supabase/client.ts

```typescript
import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseAnonKey, requireSupabaseUrl } from "@/lib/branda/env";

export function createClient() {
  return createBrowserClient(requireSupabaseUrl(), requireSupabaseAnonKey());
}

```

# File: lib/supabase/middleware.ts

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  await supabase.auth.getUser();
  return supabaseResponse;
}

```

# File: lib/supabase/server.ts

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireSupabaseAnonKey, requireSupabaseUrl } from "@/lib/branda/env";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(requireSupabaseUrl(), requireSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          /* set from Server Component — middleware handles refresh */
        }
      },
    },
  });
}

export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return data;
}

```

