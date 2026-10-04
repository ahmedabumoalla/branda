import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadWalletMemberByCode } from "@/lib/data/loyalty-experience";
import { appleConfig } from "./config";
import { issueApplePass, verifyAppleAuth } from "./apple";
import { appleUpdateTag, appleUpdateTimestamp } from "./update-tags";

const deviceSchema = z.string().min(16).max(200).regex(/^[a-zA-Z0-9._-]+$/);
const pushSchema = z.object({ pushToken: z.string().regex(/^[a-f0-9]{32,256}$/i) });
const noStore = { "cache-control": "private, no-store" };

async function readRegistrationBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 2048) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return null; } finally { reader.releaseLock(); }
}

export async function registerAppleDevice(request: Request, device: string, passType: string, serial: string) {
  if (!verifyAppleAuth(request, passType, serial)) return new Response(null, { status: 401, headers: noStore });
  if (!deviceSchema.safeParse(device).success || Number(request.headers.get("content-length") ?? 0) > 2048) return new Response(null, { status: 400 });
  const body = pushSchema.safeParse(await readRegistrationBody(request));
  if (!body.success) return new Response(null, { status: 400 });
  const member = await loadWalletMemberByCode(serial);
  if (!member?.program.appleWalletEnabled) return new Response(null, { status: 404 });
  const db = createAdminClient();
  const { data: existing, error: readError } = await db.from("wallet_apple_registrations").select("card_id").eq("device_library_id", device).eq("pass_type_id", passType).eq("card_id", member.card.id).maybeSingle();
  if (readError) throw new Error("wallet_registration_unavailable");
  const { error } = await db.from("wallet_apple_registrations").upsert({ device_library_id: device, pass_type_id: passType, card_id: member.card.id, cafe_id: member.card.cafeId, push_token: body.data.pushToken }, { onConflict: "device_library_id,pass_type_id,card_id" });
  if (error?.code === "P0001" && error.message === "Wallet registration limit reached") return new Response(null, { status: 429, headers: noStore });
  if (error) throw new Error("wallet_registration_unavailable");
  const { error: passError } = await db.from("wallet_passes").upsert({ card_id: member.card.id, cafe_id: member.card.cafeId, provider: "apple" }, { onConflict: "card_id,provider", ignoreDuplicates: true });
  if (passError) throw new Error("wallet_registration_unavailable");
  if (!existing) {
    // Installation may complete after a scan that raced initial pass creation.
    const { error: queueError } = await db.from("wallet_notification_jobs").insert({ cafe_id: member.card.cafeId, card_id: member.card.id, kind: "sync" });
    if (queueError && queueError.code !== "23505") throw new Error("wallet_registration_unavailable");
  }
  return new Response(null, { status: existing ? 200 : 201, headers: noStore });
}

export async function unregisterAppleDevice(request: Request, device: string, passType: string, serial: string) {
  if (!verifyAppleAuth(request, passType, serial)) return new Response(null, { status: 401, headers: noStore });
  if (!deviceSchema.safeParse(device).success) return new Response(null, { status: 400 });
  const member = await loadWalletMemberByCode(serial);
  if (!member) return new Response(null, { status: 200, headers: noStore });
  const { error } = await createAdminClient().from("wallet_apple_registrations").delete().eq("device_library_id", device).eq("pass_type_id", passType).eq("card_id", member.card.id);
  if (error) throw new Error("wallet_registration_unavailable");
  return new Response(null, { status: 200, headers: noStore });
}

export async function listAppleUpdates(request: Request, device: string, passType: string) {
  if (!deviceSchema.safeParse(device).success || passType !== appleConfig().passTypeIdentifier) return new Response(null, { status: 404, headers: noStore });
  // Apple does not send ApplePass authorization for this protocol endpoint. The high-entropy device identifier limits results to prior authenticated registrations.
  const db = createAdminClient();
  const { data: registrations, error } = await db.from("wallet_apple_registrations").select("card_id").eq("device_library_id", device).eq("pass_type_id", passType).limit(1000);
  if (error) throw new Error("wallet_updates_unavailable");
  if (!registrations?.length) return new Response(null, { status: 204, headers: noStore });
  const since = new URL(request.url).searchParams.get("passesUpdatedSince");
  const sinceTimestamp = since ? appleUpdateTimestamp(since) : null;
  if (since && !sinceTimestamp) return new Response(null, { status: 400, headers: noStore });
  let query = db.from("wallet_passes").select("card_id,updated_at").eq("provider", "apple").in("card_id", registrations.map(row => row.card_id)).order("updated_at", { ascending: false });
  if (sinceTimestamp) query = query.gt("updated_at", sinceTimestamp);
  const { data: updated, error: updateError } = await query;
  if (updateError) throw new Error("wallet_updates_unavailable");
  if (!updated?.length) return new Response(null, { status: 204, headers: noStore });
  const { data: cards, error: cardsError } = await db.from("loyalty_cards").select("card_code").in("id", updated.map(row => row.card_id));
  if (cardsError) throw new Error("wallet_updates_unavailable");
  return Response.json({ serialNumbers: (cards ?? []).map(row => row.card_code), lastUpdated: appleUpdateTag(updated[0].updated_at) }, { headers: noStore });
}

export async function downloadUpdatedApplePass(request: Request, passType: string, serial: string) {
  if (!verifyAppleAuth(request, passType, serial)) return new Response(null, { status: 401, headers: noStore });
  const db = createAdminClient();
  // Observe the update tag before loading the pass contents. A concurrent scan
  // must never label an older snapshot with the newer version's timestamp.
  const { data: pass, error } = await db.from("wallet_passes").select("card_id,updated_at,loyalty_cards!inner(card_code)").eq("loyalty_cards.card_code", serial).eq("provider", "apple").maybeSingle();
  if (error) throw new Error("wallet_updates_unavailable");
  const member = await loadWalletMemberByCode(serial);
  if (!member?.program.enabled || !member.program.appleWalletEnabled) return new Response(null, { status: 404, headers: noStore });
  const updatedAt = pass?.updated_at || member.card.updatedAt;
  const since = request.headers.get("if-modified-since");
  // Never truncate subsecond update tags: If-Modified-Since is second-resolution and would lose rapid scans.
  if (since && Number.isFinite(Date.parse(since)) && Date.parse(updatedAt) < Date.parse(since)) return new Response(null, { status: 304, headers: noStore });
  const buffer = await issueApplePass(member);
  if (pass) {
    // Evidence that an authenticated device requested this version; it is not
    // a guarantee that every registered phone displayed the response.
    const { error: servedError } = await db.from("wallet_passes").update({ apple_last_served_update: updatedAt }).eq("card_id", member.card.id).eq("provider", "apple")
      .or(`apple_last_served_update.is.null,apple_last_served_update.lt.${updatedAt}`);
    if (servedError) throw new Error("wallet_updates_unavailable");
  }
  return new Response(new Uint8Array(buffer), { headers: { ...noStore, "content-type": "application/vnd.apple.pkpass", "last-modified": new Date(updatedAt).toUTCString(), "content-disposition": `attachment; filename="loyalty.pkpass"` } });
}

export function walletServiceUnavailable() {
  return Response.json({ error: "wallet_service_unavailable" }, { status: 503, headers: noStore });
}
