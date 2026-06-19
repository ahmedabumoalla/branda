import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const maintenanceSessionCookieName = "barndaksa_maintenance_session";
export const maintenanceSessionMaxAgeSeconds = 30 * 60;

export type MaintenanceSession = {
  adminUserId: string;
  cafeId: string;
  cafeSlug: string;
  cafeName: string;
  maintenanceAccountNumber: string;
  expiresAt: number;
};

export function makeMaintenanceAccountNumber(cafeId: string, slug: string) {
  const idPart = cafeId.replaceAll("-", "").slice(0, 8).toUpperCase();
  const slugPart = slug.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "BRND";
  return `BR-${slugPart}-${idPart}`;
}

function getMaintenanceSecret() {
  return (
    process.env.BARNDAKSA_MAINTENANCE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    ""
  );
}

function sign(value: string) {
  const secret = getMaintenanceSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function encodeSession(session: MaintenanceSession) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = sign(payload);
  if (!signature) throw new Error("Maintenance session secret is not configured");
  return `${payload}.${signature}`;
}

function decodeSession(value?: string): MaintenanceSession | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  if (!expected) return null;

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as MaintenanceSession;
    if (!parsed.adminUserId || !parsed.cafeId || !parsed.expiresAt) return null;
    if (parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== session.adminUserId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "platform_admin") return null;

  return session;
}
