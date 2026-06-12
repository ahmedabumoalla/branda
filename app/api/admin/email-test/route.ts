import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { isBarndaksaEmailConfigured, sendBarndaksaEmail } from "@/lib/email/resend";

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

export async function GET() {
  try {
    await requirePlatformAdmin();

    return NextResponse.json({
      ok: true,
      configured: isBarndaksaEmailConfigured(),
      hasApiKey: Boolean(process.env.RESEND_API_KEY?.trim()),
      from: process.env.RESEND_FROM_EMAIL?.trim() || null,
      replyTo: process.env.RESEND_REPLY_TO?.trim() || null,
      message: "Resend diagnostics are reachable",
    });
  } catch (error) {
    console.error("[email-test:GET]", error);
    return NextResponse.json(
      {
        ok: false,
        stage: "auth",
        message: "غير مصرح أو جلسة الأدمن غير فعالة",
        error: errorMessage(error),
      },
      { status: 401 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requirePlatformAdmin();

    const body = (await request.json().catch(() => ({}))) as { to?: string };
    const to = body.to?.trim() || process.env.RESEND_REPLY_TO?.trim();

    if (!to) {
      return NextResponse.json(
        {
          ok: false,
          stage: "input",
          message: "RESEND_REPLY_TO أو to مطلوب للاختبار",
        },
        { status: 400 }
      );
    }

    if (!isBarndaksaEmailConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          stage: "env",
          message: "متغيرات Resend غير مكتملة",
          hasApiKey: Boolean(process.env.RESEND_API_KEY?.trim()),
          hasFrom: Boolean(process.env.RESEND_FROM_EMAIL?.trim()),
          hasReplyTo: Boolean(process.env.RESEND_REPLY_TO?.trim()),
        },
        { status: 500 }
      );
    }

    const result = await sendBarndaksaEmail({
      to,
      subject: "اختبار Resend من بارنداكسا",
      html: `
        <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8">
          <h2>تم ربط Resend بنجاح</h2>
          <p>هذه رسالة اختبار من منصة بارنداكسا.</p>
          <p>وقت الإرسال: ${new Date().toISOString()}</p>
        </div>
      `,
      text: `تم ربط Resend بنجاح - ${new Date().toISOString()}`,
    });

    return NextResponse.json({
      ok: true,
      stage: "sent",
      id: result.id ?? null,
      to,
    });
  } catch (error) {
    console.error("[email-test:POST]", error);
    return NextResponse.json(
      {
        ok: false,
        stage: "send",
        message: "فشل اختبار إرسال Resend",
        error: errorMessage(error),
        hasApiKey: Boolean(process.env.RESEND_API_KEY?.trim()),
        from: process.env.RESEND_FROM_EMAIL?.trim() || null,
        replyTo: process.env.RESEND_REPLY_TO?.trim() || null,
      },
      { status: 500 }
    );
  }
}
