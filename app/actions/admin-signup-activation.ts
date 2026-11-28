"use server";

import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { createClient } from "@/lib/supabase/server";

export async function signupActivationAction(cafeId: string, activate: boolean) {
  await requirePlatformAdmin();
  if (!z.uuid().safeParse(cafeId).success || typeof activate !== "boolean") throw new Error("تعذر تحديد العلامة");
  const client = await createClient();
  const { data, error } = await client.rpc("owner_signup_activation", { p_cafe_id: cafeId, p_activate: activate });
  if (error || (data !== "active" && data !== "pending" && data !== "existing")) throw new Error("تعذر التحقق من تفعيل الحساب");
  return data as "active" | "pending" | "existing";
}
