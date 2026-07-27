type OfferArtworkPromptInput = {
  cafeName: string;
  businessCategory?: string | null;
  title: string;
  description: string;
  type: string;
  discountPercent?: number | null;
  productName?: string | null;
  productDescription?: string | null;
  productCategory?: string | null;
  productPrice?: number | null;
};

export function buildOfferArtworkPrompt(input: OfferArtworkPromptInput) {
  return [
    "Create a premium commercial offer artwork for a Saudi brand.",
    "No text, no letters, no numbers, no logos, no watermarks.",
    "Leave clean negative space for an Arabic text overlay.",
    "Use an elegant warm Saudi hospitality visual language.",
    "Keep the linked product visually dominant when product reference is available.",
    "High-end editorial advertising photography.",
    "Suitable for a responsive landscape offer card.",
    `Brand: ${input.cafeName}.`,
    input.businessCategory ? `Business category: ${input.businessCategory}.` : "",
    `Offer concept: ${input.title}. ${input.description}.`,
    `Offer type: ${input.type}.`,
    input.discountPercent ? `Discount context: ${input.discountPercent} percent.` : "",
    input.productName ? `Linked product: ${input.productName}.` : "",
    input.productDescription ? `Product description: ${input.productDescription}.` : "",
    input.productCategory ? `Product category: ${input.productCategory}.` : "",
    input.productPrice != null ? `Product price context: ${input.productPrice} SAR.` : "",
  ].filter(Boolean).join("\n");
}

export async function requestOpenAiOfferArtwork(
  prompt: string,
  reference?: { bytes: ArrayBuffer; mime: string; name: string },
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

  let response: Response;
  if (reference) {
    const form = new FormData();
    form.set("model", model);
    form.set("prompt", prompt);
    form.set("size", "1536x1024");
    form.set("quality", "medium");
    form.set("output_format", "webp");
    form.set("moderation", "auto");
    form.set("image", new File([reference.bytes], reference.name, { type: reference.mime }));
    response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!response.ok) {
      response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
          size: "1536x1024",
          quality: "medium",
          output_format: "webp",
          moderation: "auto",
        }),
      });
    }
  } else {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        size: "1536x1024",
        quality: "medium",
        output_format: "webp",
        moderation: "auto",
      }),
    });
  }

  if (!response.ok) throw new Error(`OpenAI image request failed: ${response.status}`);
  const payload = await response.json() as { data?: Array<{ b64_json?: string }> };
  const encoded = payload.data?.[0]?.b64_json;
  if (!encoded) throw new Error("OpenAI image response is missing image data");
  return Uint8Array.from(Buffer.from(encoded, "base64"));
}
