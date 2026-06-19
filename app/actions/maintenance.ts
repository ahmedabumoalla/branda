"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import {
  clearMaintenanceSessionCookie,
  getCurrentMaintenanceSession,
  maintenanceSessionMaxAgeSeconds,
  makeMaintenanceAccountNumber,
  setMaintenanceSessionCookie,
} from "@/lib/platform/maintenance";

const maintenanceCodeSchema = z.string().trim().min(4).max(80);

async function writeMaintenanceAudit(
  action: "maintenance_mode_started" | "maintenance_mode_ended",
  input: {
    actorId: string;
    cafeId: string;
    cafeSlug: string;
    maintenanceAccountNumber: string;
    expiresAt?: number;
  }
) {
  try {
    const admin = createAdminClient();
    await admin.from("audit_logs").insert({
      actor_id: input.actorId,
      cafe_id: input.cafeId,
      action,
      entity_table: "cafes",
      entity_id: input.cafeId,
      new_data: {
        cafe_slug: input.cafeSlug,
        maintenance_account_number: input.maintenanceAccountNumber,
        expires_at: input.expiresAt ? new Date(input.expiresAt).toISOString() : null,
      },
    });
  } catch (error) {
    console.warn("[maintenance:audit]", error);
  }
}

export async function enterMaintenanceModeAction(input: string) {
  const code = maintenanceCodeSchema.parse(input).toUpperCase();
  const adminUser = await requirePlatformAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("cafes")
    .select("id, slug, name")
    .is("deleted_at", null);

  if (error) throw error;

  const cafe = (data ?? []).find((item) => {
    return makeMaintenanceAccountNumber(String(item.id), String(item.slug)) === code;
  });

  if (!cafe) {
    return {
      ok: false as const,
      message: "رقم الصيانة غير صحيح أو غير موجود",
      redirectTo: null,
    };
  }

  const maintenanceAccountNumber = makeMaintenanceAccountNumber(
    String(cafe.id),
    String(cafe.slug)
  );
  const expiresAt = Date.now() + maintenanceSessionMaxAgeSeconds * 1000;

  await setMaintenanceSessionCookie({
    adminUserId: adminUser.id,
    cafeId: String(cafe.id),
    cafeSlug: String(cafe.slug),
    cafeName: String(cafe.name),
    maintenanceAccountNumber,
    expiresAt,
  });

  await writeMaintenanceAudit("maintenance_mode_started", {
    actorId: adminUser.id,
    cafeId: String(cafe.id),
    cafeSlug: String(cafe.slug),
    maintenanceAccountNumber,
    expiresAt,
  });

  return {
    ok: true as const,
    message: "تم تفعيل دخول الصيانة مؤقتًا",
    redirectTo: "/dashboard",
  };
}

export async function exitMaintenanceModeAction() {
  const adminUser = await requirePlatformAdmin();
  const session = await getCurrentMaintenanceSession();
  await clearMaintenanceSessionCookie();

  if (session) {
    await writeMaintenanceAudit("maintenance_mode_ended", {
      actorId: adminUser.id,
      cafeId: session.cafeId,
      cafeSlug: session.cafeSlug,
      maintenanceAccountNumber: session.maintenanceAccountNumber,
    });
  }

  return { ok: true as const };
}
