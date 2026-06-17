"use server";

import { revalidatePath } from "next/cache";
import {
  createPlatformSocialPost,
  disablePlatformMediaAsset,
  recordPlatformPublicEvent,
  savePlatformContactSettings,
  savePlatformHomeSettings,
  type PlatformContactSettings,
  type PlatformHomeSettings,
  type PlatformMediaPlacement,
} from "@/lib/data/platform-content";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadPlatformMedia, uploadSocialPostMedia } from "@/lib/storage/platform-content-upload";
import { escapeEmailHtml, isBarndaksaEmailConfigured, sendBarndaksaEmail } from "@/lib/email/resend";

const CONTACT_NOTIFY_EMAIL_FALLBACK = "cto.branda@gmail.com";

function getContactNotifyEmail() {
  return (
    process.env.BARNDAKSA_CONTACT_NOTIFY_EMAIL?.trim() ||
    process.env.RESEND_REPLY_TO?.trim() ||
    CONTACT_NOTIFY_EMAIL_FALLBACK
  );
}

function normalizeContactRequestInput(input: { fullName: string; email: string; message: string }) {
  const fullName = String(input.fullName ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const message = String(input.message ?? "").trim();

  if (fullName.length < 2 || fullName.length > 120) {
    throw new Error("اكتب الاسم بشكل صحيح");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("اكتب البريد الإلكتروني بشكل صحيح");
  }
  if (message.length < 5 || message.length > 2000) {
    throw new Error("اكتب رسالة بين 5 و 2000 حرف");
  }

  return { fullName, email, message };
}


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
  const parsed = normalizeContactRequestInput(input);
  const admin = createAdminClient();

  const { error } = await admin.from("platform_contact_requests").insert({
    full_name: parsed.fullName,
    email: parsed.email,
    message: parsed.message,
    status: "new",
  });

  if (error) {
    console.error("[submitContactRequestAction:insert]", error);
    throw new Error(`تعذر إرسال طلب التواصل: ${error.message}`);
  }

  revalidatePath("/admin/content");

  if (isBarndaksaEmailConfigured()) {
    const to = getContactNotifyEmail();
    await sendBarndaksaEmail({
      to,
      replyTo: parsed.email,
      subject: `طلب تواصل جديد من ${parsed.fullName}`,
      html: `
        <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#241610">
          <h2>طلب تواصل جديد من منصة بارنداكسا</h2>
          <p><strong>الاسم:</strong> ${escapeEmailHtml(parsed.fullName)}</p>
          <p><strong>البريد:</strong> ${escapeEmailHtml(parsed.email)}</p>
          <p><strong>الرسالة:</strong></p>
          <div style="white-space:pre-wrap;border:1px solid #eee;padding:12px;border-radius:12px;background:#fcf8f3">${escapeEmailHtml(parsed.message)}</div>
          <p style="margin-top:16px;color:#806A5E">تظهر هذه الرسالة أيضًا في لوحة الأدمن: إدارة محتوى المنصة ← طلبات التواصل الواردة.</p>
        </div>
      `,
      text: `طلب تواصل جديد\nالاسم: ${parsed.fullName}\nالبريد: ${parsed.email}\nالرسالة: ${parsed.message}\n\nتظهر الرسالة في لوحة الأدمن: إدارة محتوى المنصة ← طلبات التواصل الواردة.`,
    }).catch((mailError) => {
      console.error("[submitContactRequestAction:email]", mailError);
    });
  } else {
    console.warn("[submitContactRequestAction:email] Resend is not configured; saved contact request without email notification.");
  }
}

export async function recordIntroVideoEventAction(eventType: "intro_video_click" | "intro_video_view") {
  await recordPlatformPublicEvent(eventType);
}
