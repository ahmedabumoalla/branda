import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicCustomIdentity, getPublicThemeId } from "@/lib/data/theme";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { slug } = await params;

  try {
    const [settings, themeId, customIdentity] = await Promise.all([
      getPublicCafeSettings(slug),
      getPublicThemeId(slug),
      getPublicCustomIdentity(slug),
    ]);

    if (!settings) {
      return NextResponse.json({ error: "Cafe not found" }, { status: 404 });
    }

    return NextResponse.json({ settings, themeId, customIdentity });
  } catch (err) {
    console.error("[public/cafe]", err);
    return NextResponse.json({ error: "Failed to load cafe" }, { status: 500 });
  }
}
