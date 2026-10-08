import "server-only";
import { sign } from "node:crypto";
import { googleConfig } from "./config";
import { buildGoogleClass, buildGoogleObject, googleClassId } from "./payload";
import type { WalletMember } from "./types";
import { walletArtUrl } from "./art";

let cachedToken: { key: string; email: string; token: string; expires: number } | undefined;

function jwt(payload: Record<string, unknown>, key: string) {
  const input = `${Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), key).toString("base64url")}`;
}

async function accessToken() {
  const config = googleConfig();
  if (cachedToken?.email === config.email && cachedToken.key === config.key && cachedToken.expires > Date.now() + 60000) return cachedToken.token;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt({ iss: config.email, scope: "https://www.googleapis.com/auth/wallet_object.issuer", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }, config.key);
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`google_wallet_auth_${response.status}`);
  const result = await response.json();
  if (typeof result.access_token !== "string") throw new Error("google_wallet_invalid_token");
  cachedToken = { key: config.key, email: config.email, token: result.access_token, expires: Date.now() + Number(result.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

async function request(path: string, method: string, body?: unknown) {
  return fetch(`https://walletobjects.googleapis.com/walletobjects/v1/${path}`, { method, headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", signal: AbortSignal.timeout(15000) });
}

async function upsert(resource: "loyaltyClass" | "loyaltyObject", body: { id: string } & Record<string, unknown>) {
  const path = `${resource}/${encodeURIComponent(body.id)}`;
  const existing = await request(path, "GET");
  if (existing.status === 404) {
    const inserted = await request(resource, "POST", body);
    if (inserted.ok) return;
    if (inserted.status !== 409) throw new Error(`google_wallet_insert_${inserted.status}`);
  } else if (!existing.ok) throw new Error(`google_wallet_read_${existing.status}`);
  // Google requires UNDER_REVIEW on every class write, including approved classes.
  // Omitting it preserves APPROVED in the merged resource and makes PATCH fail.
  const updated = { ...body };
  let response = await request(path, "PATCH", updated);
  // Quotas restrict notifications, not the customer's right to see their latest balance.
  if (response.status === 429 && updated.notifyPreference) {
    delete updated.notifyPreference;
    response = await request(path, "PATCH", updated);
  }
  if (!response.ok) throw new Error(`google_wallet_update_${response.status}`);
}

export async function updateGooglePass(member: WalletMember, notify = false) {
  if (member.cafeSlug !== "rast") throw new Error("wallet_disabled");
  const config = googleConfig();
  await upsert("loyaltyClass", buildGoogleClass(member, config.issuerId, config.baseUrl));
  await upsert("loyaltyObject", { ...buildGoogleObject(member, config.issuerId, walletArtUrl(member)), ...(notify ? { notifyPreference: "NOTIFY_ON_UPDATE" } : {}) });
}

export async function issueGoogleSaveUrl(member: WalletMember) {
  if (member.cafeSlug !== "rast" || !member.program.enabled || !member.program.googleWalletEnabled) throw new Error("wallet_disabled");
  if (process.env.GOOGLE_WALLET_PUBLISHING_APPROVED !== "true") throw new Error("wallet_not_configured");
  await updateGooglePass(member);
  const config = googleConfig();
  const now = Math.floor(Date.now() / 1000);
  const token = jwt({ iss: config.email, aud: "google", typ: "savetowallet", iat: now, exp: now + 3600, origins: [new URL(config.baseUrl).host], payload: { loyaltyObjects: [{ id: buildGoogleObject(member, config.issuerId).id }] } }, config.key);
  return `https://pay.google.com/gp/v/save/${token}`;
}

export async function notifyGoogleBrand(cafeId: string, title: string, body: string, messageId: string) {
  const config = googleConfig();
  const classPath = `loyaltyClass/${encodeURIComponent(googleClassId(config.issuerId, cafeId))}`;
  const current = await request(classPath, "GET");
  if (!current.ok) throw new Error(`google_wallet_read_${current.status}`);
  const existing = await current.json();
  const messages = Array.isArray(existing.messages) ? existing.messages as Array<{ id?: string }> : [];
  // Google explicitly permits duplicate message IDs. Read before retry, rather than treating the ID as API idempotency.
  if (messages.some(message => message.id === messageId)) return;
  if (messages.length >= 10) {
    const trimmed = await request(classPath, "PATCH", { messages: messages.slice(-9) });
    if (!trimmed.ok) throw new Error(`google_wallet_update_${trimmed.status}`);
  }
  const response = await request(`${classPath}/addMessage`, "POST", { message: { id: messageId, header: title, body, messageType: "TEXT_AND_NOTIFY" } });
  if (!response.ok) throw new Error(`google_wallet_message_${response.status}`);
}
