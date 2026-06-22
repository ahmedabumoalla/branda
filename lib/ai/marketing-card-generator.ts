import { uploadGeneratedImageBytes } from "@/lib/storage/upload-server";
import type { MenuProduct } from "@/lib/mock/menu";
import type { ReservationService } from "@/lib/data/platform-upgrade";

type BrandInput = {
  cafeName: string;
  primaryColor?: string | null;
  accentColor?: string | null;
  logoUrl?: string | null;
};

type GenerateCardInput = {
  entityId: string;
  kind: "offer" | "experience_campaign";
  title: string;
  description: string;
  brand: BrandInput;
  products?: Pick<MenuProduct, "name" | "price" | "category" | "description">[];
  reservationService?: Pick<ReservationService, "name" | "price" | "description"> | null;
};

export type GeneratedMarketingCardResult =
  | { ok: true; storagePath: string; status: "ready" }
  | { ok: false; status: "failed"; error: string };

function compact(value: string | null | undefined, fallback = "") {
  return String(value ?? fallback).trim();
}

function buildPrompt(input: GenerateCardInput) {
  const productVisualCues = (input.products ?? [])
    .slice(0, 4)
    .map((product) => {
      const parts = [
        product.category ? `category: ${product.category}` : "",
        product.description ? `mood: ${product.description}` : "",
      ].filter(Boolean);
      return parts.length ? `- ${parts.join(", ")}` : "";
    })
    .filter(Boolean)
    .join("\n");

  const reservation = input.reservationService
    ? `Reservation mood inspiration only: ${input.reservationService.description ?? "premium cafe booking atmosphere"}`
    : "";

  return [
    "Create one premium cafe promo background for a Saudi cafe mobile app card.",
    "This is a visual background only. The app will add all real text later as HTML/CSS overlay.",
    "Do not render any text, Arabic text, English text, letters, numerals, prices, discount numbers, badges, labels, QR codes, fake logos, or fake brand marks.",
    "Use a refined modern cafe atmosphere, product-inspired visual mood, warm lighting, clean composition, and generous negative space for readable overlay text.",
    "Avoid clutter and avoid placing important objects where the app overlay text will sit.",
    `Brand colors: primary ${compact(input.brand.primaryColor, "#6B3A25")}, accent ${compact(input.brand.accentColor, "#D9A33F")}`,
    input.brand.logoUrl ? "Use the logo colors and mood as abstract inspiration only; do not recreate or distort the logo." : "",
    `Background type: ${input.kind === "offer" ? "offer promo ambience" : "experience documentation reward ambience"}`,
    productVisualCues ? `Product-inspired visual cues only, not labels:\n${productVisualCues}` : "",
    reservation,
    "Output a single square background image, no mockup frame, no extra explanation.",
  ]
    .filter(Boolean)
    .join("\n");
}

function base64ToBytes(value: string) {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

async function requestOpenAiImage(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      size: "1024x1024",
      quality: "high",
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI image generation failed with ${response.status}`);
  }

  const json = (await response.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const b64 = json.data?.find((item) => item.b64_json)?.b64_json;
  if (!b64) {
    throw new Error("OpenAI image generation returned no image data");
  }

  return base64ToBytes(b64);
}

export async function generateMarketingCard(input: GenerateCardInput): Promise<GeneratedMarketingCardResult> {
  try {
    const prompt = buildPrompt(input);
    const bytes = await requestOpenAiImage(prompt);
    const uploaded = await uploadGeneratedImageBytes(
      "offer-banners",
      bytes,
      "image/png",
      `ai-cards/${input.kind}/${input.entityId}`
    );

    return { ok: true, status: "ready", storagePath: uploaded.storagePath };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      error: error instanceof Error ? error.message : "تعذر توليد البطاقة",
    };
  }
}
