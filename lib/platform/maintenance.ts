import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getActiveUser } from "@/lib/auth/active-user";
import { decodeSession, encodeSession, maintenanceSessionCookieName, maintenanceSessionMaxAgeSeconds, type MaintenanceSession } from "./maintenance-token";
export { maintenanceSessionCookieName, maintenanceSessionMaxAgeSeconds, type MaintenanceSession } from "./maintenance-token";

export function makeMaintenanceAccountNumber(cafeId: string, slug: string) {
  const idPart = cafeId.replaceAll("-", "").slice(0, 8).toUpperCase();
  const slugPart = slug.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "BRND";
  return `BR-${slugPart}-${idPart}`;
}

export async function setMaintenanceSessionCookie(session: MaintenanceSession) {
  const cookieStore = await cookies();
  cookieStore.set({
    name: maintenanceSessionCookieName,
    value: encodeSession(session),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maintenanceSessionMaxAgeSeconds,
  });
}

export async function clearMaintenanceSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: maintenanceSessionCookieName,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function readMaintenanceSessionCookie() {
  const cookieStore = await cookies();
  return decodeSession(cookieStore.get(maintenanceSessionCookieName)?.value);
}

export async function getCurrentMaintenanceSession() {
  const session = await readMaintenanceSessionCookie();
  if (!session) return null;

  const supabase = await createClient();
  const user = await getActiveUser(supabase);
  if (!user || user.id !== session.adminUserId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "platform_admin") return null;

  return session;
}
