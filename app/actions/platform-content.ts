"use server";

import { revalidatePath } from "next/cache";
import {
  createPlatformSocialPost,
  disablePlatformMediaAsset,
  savePlatformContactSettings,
  savePlatformHomeSettings,
  type PlatformContactSettings,
  type PlatformHomeSettings,
  type PlatformMediaPlacement,
} from "@/lib/data/platform-content";
import { createClient } from "@/lib/supabase/server";
import { uploadPlatformMedia, uploadSocialPostMedia } from "@/lib/storage/platform-content-upload";
import { escapeEmailHtml, isBarndaksaEmailConfigured, sendBarndaksaEmail } from "@/lib/email/resend";

export async function savePlatformHomeSettingsAction(input: PlatformHomeSettings) {
  await savePlatformHomeSettings(input);
  revalidatePath("/");
  revalidatePath("/admin/content");
}

export async function savePlatformContactSettingsAction(input: PlatformContactSettings) {
  await savePlatformContactSettings(input);
  revalidatePath("/");
  revalidatePath("/admin/content");
}

export async function uploadPlatformMediaAction(formData: FormData) {
  const file = formData.get("file");
  const placement = String(formData.get("placement") ?? "") as PlatformMediaPlacement;
  const altText = String(formData.get("altText") ?? "");
  if (!(file instanceof File) || !file.size) {
    throw new Error("اختر ملفًا للرفع");
  }
  if (!["hero", "intro_video", "loyalty_cards"].includes(placement)) {
    throw new Error("موضع الملف غير صحيح");
  }
  await uploadPlatformMedia({ placement, file, altText });
  revalidatePath("/");
  revalidatePath("/admin/content");
}

export async function disablePlatformMediaAction(id: string) {
  await disablePlatformMediaAsset(id);
  revalidatePath("/");
  revalidatePath("/admin/content");
}

export async function createPlatformSocialPostAction(formData: FormData) {
  const channels = formData.getAll("channels").map((item) => String(item));
  const postId = await createPlatformSocialPost({
    description: String(formData.get("description") ?? ""),
    channels,
    scheduledAt: String(formData.get("scheduledAt") ?? ""),
  });
  const files = formData.getAll("media").filter(
    (item): item is File => item instanceof File && item.size > 0
  );
  if (files.length) {
    await uploadSocialPostMedia(postId, files);
  }
  revalidatePath("/admin/content");
}

export async function removePlatformSocialPostAction(id: string) {
  const { removePlatformSocialPost } = await import("@/lib/data/platform-content");
  await removePlatformSocialPost(id);
  revalidatePath("/admin/content");
}

export async function submitContactRequestAction(input: {
  fullName: string;
  email: string;
  message: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_platform_contact_request", {
    p_full_name: input.fullName,
    p_email: input.email,
    p_message: input.message,
  });
  if (error) throw error;

  if (isBarndaksaEmailConfigured()) {
    const to = process.env.RESEND_REPLY_TO?.trim();
    if (to) {
      await sendBarndaksaEmail({
        to,
        replyTo: input.email,
        subject: `طلب تواصل جديد من ${input.fullName}`,
        html: `
          <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8">
            <h2>طلب تواصل جديد من منصة برندة</h2>
            <p><strong>الاسم:</strong> ${escapeEmailHtml(input.fullName)}</p>
            <p><strong>البريد:</strong> ${escapeEmailHtml(input.email)}</p>
            <p><strong>الرسالة:</strong></p>
            <div style="white-space:pre-wrap;border:1px solid #eee;padding:12px;border-radius:12px">${escapeEmailHtml(input.message)}</div>
          </div>
        `,
        text: `طلب تواصل جديد
الاسم: ${input.fullName}
البريد: ${input.email}
الرسالة: ${input.message}`,
      }).catch((mailError) => console.error("[submitContactRequestAction:email]", mailError));
    }
  }
}

export async function recordIntroVideoEventAction(eventType: "intro_video_click" | "intro_video_view") {
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_platform_public_event", {
    p_event_type: eventType,
  });
  if (error) console.error("[recordIntroVideoEventAction]", error);
}
