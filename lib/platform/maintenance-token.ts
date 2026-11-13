import { createHmac, timingSafeEqual } from "node:crypto";
import { SESSION_COOKIE_SECONDS } from "@/lib/auth/session-policy";
export const maintenanceSessionCookieName = "barndaksa_maintenance_session";
export const maintenanceSessionMaxAgeSeconds = SESSION_COOKIE_SECONDS;

export type MaintenanceSession = {
  adminUserId: string;
  cafeId: string;
  cafeSlug: string;
  cafeName: string;
  maintenanceAccountNumber: string;
  expiresAt: number;
};


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

export function encodeSession(session: MaintenanceSession) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = sign(payload);
  if (!signature) throw new Error("Maintenance session secret is not configured");
  return `${payload}.${signature}`;
}

export function decodeSession(value?: string): MaintenanceSession | null {
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
