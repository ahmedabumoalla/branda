import type { CustomIdentityPalette } from "@/lib/mock/custom-identity-theme";

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function luminance(r: number, g: number, b: number) {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Deterministic palette extraction from logo image (client-side mock, no external AI). */
export async function extractPaletteFromImage(src: string): Promise<CustomIdentityPalette> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 64;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();

      for (let i = 0; i < data.length; i += 16) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a < 128) continue;
        const lum = luminance(r, g, b);
        if (lum > 0.92 || lum < 0.08) continue;
        const key = `${Math.round(r / 32)}-${Math.round(g / 32)}-${Math.round(b / 32)}`;
        const prev = buckets.get(key);
        if (prev) {
          prev.r += r;
          prev.g += g;
          prev.b += b;
          prev.count += 1;
        } else {
          buckets.set(key, { r, g, b, count: 1 });
        }
      }

      const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);
      const primary = sorted[0]
        ? rgbToHex(
            Math.round(sorted[0].r / sorted[0].count),
            Math.round(sorted[0].g / sorted[0].count),
            Math.round(sorted[0].b / sorted[0].count)
          )
        : "#6B3A25";
      const secondary = sorted[1]
        ? rgbToHex(
            Math.round(sorted[1].r / sorted[1].count),
            Math.round(sorted[1].g / sorted[1].count),
            Math.round(sorted[1].b / sorted[1].count)
          )
        : "#4A281D";
      const accent = sorted[2]
        ? rgbToHex(
            Math.round(sorted[2].r / sorted[2].count),
            Math.round(sorted[2].g / sorted[2].count),
            Math.round(sorted[2].b / sorted[2].count)
          )
        : "#D9A33F";

      resolve({
        primary,
        secondary,
        button: primary,
        background: "#FCF8F3",
        text: luminance(
          parseInt(primary.slice(1, 3), 16),
          parseInt(primary.slice(3, 5), 16),
          parseInt(primary.slice(5, 7), 16)
        ) > 0.5
          ? "#311912"
          : "#FCF8F3",
        accent,
      });
    };
    img.onerror = () => reject(new Error("failed to load image"));
    img.src = src;
  });
}
