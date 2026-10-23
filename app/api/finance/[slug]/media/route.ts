import { NextResponse } from "next/server";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { isOwnedMenuAsset } from "@/lib/menu/standalone-menu";
import { createAdminClient } from "@/lib/supabase/admin";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const path = new URL(request.url).searchParams.get("path");
  if (!path || path.length > 1024) return NextResponse.json({ error: "Invalid image" }, { status: 400, headers });
  const { slug } = await params;
  const context = await getBrandFinanceContext(slug).catch(() => null);
  if (!context) return NextResponse.json({ error: "Finance access required" }, { status: 403, headers });
  if (!isOwnedMenuAsset(path, context.cafe.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  const { data, error } = await createAdminClient().storage.from("menu-products").createSignedUrl(path, 600);
  if (error || !data?.signedUrl) return NextResponse.json({ error: "Image not found" }, { status: 404, headers });
  return NextResponse.redirect(data.signedUrl, { status: 307, headers });
}
