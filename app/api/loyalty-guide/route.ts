import { readFile } from "node:fs/promises";
import path from "node:path";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const features = await getOwnerFeatureCodes().catch(() => []);
  if (!featureCodesAllow(features, "loyalty")) {
    return new Response("هذه الخدمة غير مفعلة في اشتراك العلامة الحالي", { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
  try {
    const file = await readFile(path.join(process.cwd(), "assets/guides/branda-loyalty-guide.pdf"));
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(file.length),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="branda-loyalty-guide.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return new Response("تعذر تحميل دليل الولاء حاول مرة أخرى", { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
