import { createHash } from "node:crypto";

/** Only substitute the reviewed source asset, never a subsequently uploaded logo */
export function standaloneLogoVariant(cafeId: string, source: string | null | undefined) {
  if (cafeId !== "fbd92cd0-c4b6-41b5-81dd-1d45a01d01e8" || !source) return null;
  const sourceHash = createHash("sha256").update(source).digest("hex");
  return sourceHash === "573f1cd1972f9a0b065deacf22b58cb0e140bcac19c83628566178e2c57c6d15"
    ? "/menu-logos/kath-transparent-v1.webp" : null;
}
