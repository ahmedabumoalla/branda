const supportedTargets = new Set(["en", "ur", "hi", "bn", "tl", "id"]);
const maxTextsPerRequest = 80;
const maxTextLength = 4_000;
const translateBatchSize = 10;

type TranslateRequest = {
  target?: unknown;
  texts?: unknown;
};

function parseTranslationPayload(payload: unknown) {
  if (!Array.isArray(payload)) return "";
  const translatedParts = payload[0];
  if (!Array.isArray(translatedParts)) return "";
  return translatedParts
    .map((part) => (Array.isArray(part) && typeof part[0] === "string" ? part[0] : ""))
    .join("");
}

async function translateText(target: string, text: string) {
  if (!text.trim()) return text;

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
      target,
    )}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return text;
    const payload = await response.json();
    return parseTranslationPayload(payload) || text;
  } catch {
    return text;
  }
}

export async function POST(request: Request) {
  let body: TranslateRequest;
  try {
    body = (await request.json()) as TranslateRequest;
  } catch {
    return Response.json({ translations: [] }, { status: 400 });
  }

  const target = typeof body.target === "string" ? body.target.trim().toLowerCase() : "";
  const rawTexts = Array.isArray(body.texts) ? body.texts : [];
  if (!supportedTargets.has(target)) {
    return Response.json(
      { translations: rawTexts.map((text) => (typeof text === "string" ? text : "")) },
      { status: 400 },
    );
  }

  const texts = rawTexts
    .slice(0, maxTextsPerRequest)
    .map((text) => (typeof text === "string" ? text.slice(0, maxTextLength) : ""));

  const translations: string[] = [];
  for (let index = 0; index < texts.length; index += translateBatchSize) {
    const batch = texts.slice(index, index + translateBatchSize);
    const translatedBatch = await Promise.all(batch.map((text) => translateText(target, text)));
    translations.push(...translatedBatch);
  }

  return Response.json({ translations });
}
