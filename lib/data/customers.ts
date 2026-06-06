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

