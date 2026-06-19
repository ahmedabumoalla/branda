import { buildAnalysis, parseMenuItemsFromText } from "@/lib/menu-import/text-extractor";
import type { MenuImportAnalysis } from "@/lib/menu-import/types";

const maxPdfBytes = 20 * 1024 * 1024;

function decodePdfString(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function decodeHexPdfString(hex: string) {
  const cleaned = hex.replace(/[^0-9a-f]/gi, "");
  if (cleaned.length < 4 || cleaned.length % 2 !== 0) return "";

  const bytes = new Uint8Array(cleaned.length / 2);
  for (let index = 0; index < cleaned.length; index += 2) {
    bytes[index / 2] = Number.parseInt(cleaned.slice(index, index + 2), 16);
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = "";
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      text += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
    }
    return text;
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function extractTextFromPdfBytes(bytes: Uint8Array) {
  const latin = new TextDecoder("latin1", { fatal: false }).decode(bytes);
  const chunks: string[] = [];

  for (const match of latin.matchAll(/\((?:\\.|[^\\)]){2,}\)/g)) {
    chunks.push(decodePdfString(match[0].slice(1, -1)));
  }

  for (const match of latin.matchAll(/<([0-9a-fA-F\s]{8,})>/g)) {
    const decoded = decodeHexPdfString(match[1]);
    if (decoded) chunks.push(decoded);
  }

  const visibleAscii = latin
    .replace(/[^\x20-\x7E\u0600-\u06FF]+/g, "\n")
    .split(/\n+/)
    .filter((line) => line.trim().length > 3)
    .join("\n");
  chunks.push(visibleAscii);

  return chunks.join("\n");
}

export async function analyzeMenuPdf(file: File): Promise<{ analysis: MenuImportAnalysis; bytes: ArrayBuffer }> {
  if (file.size <= 0) throw new Error("ملف PDF فارغ");
  if (file.size > maxPdfBytes) throw new Error("حجم ملف PDF أكبر من 20MB");

  const mimeType = (file.type || "").toLowerCase();
  if (mimeType && mimeType !== "application/pdf") {
    throw new Error("ارفع ملف PDF فقط");
  }
  if (!file.name.toLowerCase().endsWith(".pdf") && mimeType !== "application/pdf") {
    throw new Error("ارفع ملف PDF فقط");
  }

  const bytes = await file.arrayBuffer();
  const text = extractTextFromPdfBytes(new Uint8Array(bytes));
  const items = parseMenuItemsFromText(text, null);
  const notes = items.length
    ? ["تم استخراج نص من PDF وتحويله إلى مسودة مراجعة."]
    : ["تم رفع الملف لكن يحتاج معالجة يدوية أو تفعيل تحليل ذكي للصور."];

  return {
    bytes,
    analysis: buildAnalysis(
      items,
      {
        fileName: file.name,
        byteSize: file.size,
        extractedTextLength: text.trim().length,
      },
      notes
    ),
  };
}
