import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { z } from "zod";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unavailable = () => new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  try {
    const id = z.uuid().parse((await params).id), cafe = await requireOwnerCafeContext();
    const client = await createClient();
    const result = await client.rpc("gift_attachment_owner_read", { p_cafe: cafe.id, p_id: id });
    if (result.error || !result.data) return unavailable();
    const asset = z.object({ path: z.string(), name: z.string(), mime: z.enum(["image/png", "image/jpeg", "image/webp"]), bytes: z.number().int().positive().max(3 * 1024 * 1024) }).parse(result.data);
    if (!asset.path.startsWith(`${cafe.id}/`) || asset.path.includes("..")) return unavailable();
    const file = await createAdminClient().storage.from("commerce-attachments").download(asset.path);
    if (file.error || !file.data) return unavailable();
    return new Response(file.data, { headers: { "Content-Type": asset.mime, "Content-Disposition": `attachment; filename="${asset.mime === "image/png" ? "design.png" : asset.mime === "image/jpeg" ? "design.jpg" : "design.webp"}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch { return unavailable(); }
}
