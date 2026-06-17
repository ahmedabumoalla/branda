import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Props = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}

export async function GET(_request: Request, { params }: Props) {
  const { id } = await params;
  const safeId = id?.trim();

  if (!safeId) {
    return jsonError("Missing media id", 400);
  }

  try {
    const admin = createAdminClient();
    const { data: media, error } = await admin
      .from("platform_media_assets")
      .select("id, placement, media_type, storage_path, active")
      .eq("id", safeId)
      .eq("active", true)
      .maybeSingle();

    if (error) {
      console.error("[platform-media:lookup]", error);
      return jsonError("Failed to load media", 500);
    }

    if (!media || media.placement !== "intro_video" || media.media_type !== "video") {
      return jsonError("Media not found", 404);
    }

    const storagePath = String(media.storage_path ?? "").trim();
    if (!storagePath) {
      return jsonError("Media path is missing", 404);
    }

    const { data: signed, error: signError } = await admin.storage
      .from("platform-media")
      .createSignedUrl(storagePath, 60 * 60);

    if (signError || !signed?.signedUrl) {
      console.error("[platform-media:sign]", signError);
      return jsonError("Failed to prepare media", 500);
    }

    return NextResponse.redirect(signed.signedUrl, {
      status: 307,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("[platform-media]", error);
    return jsonError("Unexpected media error", 500);
  }
}
