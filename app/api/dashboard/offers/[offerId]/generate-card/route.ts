import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { clearServerMemoryCache } from "@/lib/performance/server-memory-cache";
import { uploadGeneratedImageBytes } from "@/lib/storage/upload-server";
import {
  buildOfferArtworkPrompt,
  requestOpenAiOfferArtwork,
} from "@/lib/offers/offer-ai-generation";

export const runtime = "nodejs";

type Params = { params: Promise<{ offerId: string }> };

function safeGenerationError(error: unknown) {
  if (error instanceof Error && error.message.includes("OPENAI_API_KEY")) {
    return "خدمة توليد الصور غير مهيأة حاليًا";
  }
  return "تعذر توليد صورة العرض. حاول مرة أخرى بعد قليل";
}

export async function POST(_request: Request, { params }: Params) {
  const cafe = await requireOwnerCafeContext();
  const { offerId } = await params;
  const admin = createAdminClient();
  const { data: offer } = await admin
    .from("offers")
    .select("*")
    .eq("id", offerId)
    .eq("cafe_id", cafe.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!offer) return NextResponse.json({ error: "العرض غير موجود" }, { status: 404 });
  if (offer.card_generation_status === "generating") {
    return NextResponse.json({ error: "توليد الصورة قيد التنفيذ بالفعل" }, { status: 409 });
  }
  const generatedAt = offer.card_generated_at ? new Date(offer.card_generated_at).getTime() : 0;
  if (generatedAt && Date.now() - generatedAt < 15_000) {
    return NextResponse.json({ error: "انتظر قليلًا قبل إعادة التوليد" }, { status: 429 });
  }

  await admin.from("offers").update({
    card_generation_status: "generating",
    card_generation_error: null,
  }).eq("id", offerId).eq("cafe_id", cafe.id);

  try {
    let product: Record<string, unknown> | null = null;
    if (offer.linked_product_id) {
      const result = await admin
        .from("menu_products")
        .select("id, cafe_id, name, description, price, legacy_category, image_storage_path")
        .eq("id", offer.linked_product_id)
        .eq("cafe_id", cafe.id)
        .is("deleted_at", null)
        .maybeSingle();
      product = result.data as Record<string, unknown> | null;
    }

    let reference: { bytes: ArrayBuffer; mime: string; name: string } | undefined;
    const imagePath = typeof product?.image_storage_path === "string" ? product.image_storage_path : null;
    if (imagePath) {
      const signed = await admin.storage.from("menu-products").createSignedUrl(imagePath, 120);
      if (signed.data?.signedUrl) {
        const imageResponse = await fetch(signed.data.signedUrl);
        const mime = imageResponse.headers.get("content-type") || "image/webp";
        if (imageResponse.ok && mime.startsWith("image/")) {
          reference = { bytes: await imageResponse.arrayBuffer(), mime, name: "product-reference.webp" };
        }
      }
    }

    const prompt = buildOfferArtworkPrompt({
      cafeName: cafe.name,
      businessCategory: cafe.businessCategory,
      title: offer.title,
      description: offer.description ?? "",
      type: offer.offer_type ?? "",
      discountPercent: offer.discount_percent,
      productName: typeof product?.name === "string" ? product.name : null,
      productDescription: typeof product?.description === "string" ? product.description : null,
      productCategory: typeof product?.legacy_category === "string" ? product.legacy_category : null,
      productPrice: typeof product?.price === "number" ? product.price : null,
    });
    const bytes = await requestOpenAiOfferArtwork(prompt, reference);
    const uploaded = await uploadGeneratedImageBytes(
      "offer-banners",
      bytes,
      "image/webp",
      `${offerId}/ai-card-${Date.now()}`,
    );

    const now = new Date().toISOString();
    await admin.from("offers").update({
      card_generation_status: "ready",
      card_storage_path: uploaded.storagePath,
      card_generated_at: now,
      card_generation_error: null,
    }).eq("id", offerId).eq("cafe_id", cafe.id);
    clearServerMemoryCache(`public-offers:${cafe.slug.trim().toLowerCase()}`);
    return NextResponse.json({ status: "ready", cardStoragePath: uploaded.storagePath, generatedAt: now });
  } catch (error) {
    const message = safeGenerationError(error);
    await admin.from("offers").update({
      card_generation_status: "failed",
      card_generation_error: message,
    }).eq("id", offerId).eq("cafe_id", cafe.id);
    return NextResponse.json({ error: message }, { status: error instanceof Error && error.message.includes("OPENAI_API_KEY") ? 503 : 500 });
  }
}
