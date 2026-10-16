import { NextResponse } from "next/server";
import { getOwnerCafeContext } from "@/lib/data/cafes";
import { assertOwnerServiceEnabled } from "@/lib/data/owner-service-access";
import { isOwnedMenuAsset } from "@/lib/menu/standalone-menu";
import { createAdminClient } from "@/lib/supabase/admin";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

/** Resolve at image/video request time, including lazy images after a long editing session. */
export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path");
  if (!path || path.length > 1024) return NextResponse.json({ error: "Invalid path" }, { status: 400, headers });
  const cafe = await getOwnerCafeContext();
  if (!cafe) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers });
  if (!isOwnedMenuAsset(path, cafe.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  try {
    await assertOwnerServiceEnabled("menu");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  }
  // The admin signer is only reached after the session, entitlement and tenant-path checks.
  // The bucket is fixed; no customer/private-bucket paths can be supplied by the caller.
  const { data, error } = await createAdminClient().storage.from("menu-products").createSignedUrl(path, 600);
  if (error || !data?.signedUrl) return NextResponse.json({ error: "Media not found" }, { status: 404, headers });
  return NextResponse.redirect(data.signedUrl, { status: 307, headers });
}
