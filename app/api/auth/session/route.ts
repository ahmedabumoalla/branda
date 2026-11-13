import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { transientAuthError } from "@/lib/auth/session-policy";

export const dynamic = "force-dynamic";

export async function GET() {
  const reply = (status: string, code: number) => NextResponse.json({ status }, { status: code, headers: { "Cache-Control": "private, no-store" } });
  try {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (transientAuthError(error)) return reply("unavailable", 503);
    if (error || !user) return reply("signed_out", 401);
    const result = await client.rpc("current_account_active");
    if (result.error) return reply("unavailable", 503);
    return result.data === true ? reply("valid", 200) : reply("blocked", 403);
  } catch { return reply("unavailable", 503); }
}
