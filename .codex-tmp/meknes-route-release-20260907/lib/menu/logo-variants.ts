import { createHash } from "node:crypto";

/** Only substitute the reviewed source asset, never a subsequently uploaded logo */
export function standaloneLogoVariant(cafeId: string, source: string | null | undefined) {
  if (!source) return null;
  const sourceHash = createHash("sha256").update(source).digest("hex");
  if (cafeId === "fbd92cd0-c4b6-41b5-81dd-1d45a01d01e8" && sourceHash === "573f1cd1972f9a0b065deacf22b58cb0e140bcac19c83628566178e2c57c6d15") {
    return "/menu-logos/kath-transparent-v1.webp";
  }
  if (cafeId === "e426ea06-d2cb-4a64-9537-5575f52196ba" && sourceHash === "70c5b5c563a7889d132195035d6c426e6848b09b27c9aa019af00aa723ba1df5") {
    return "/menu-logos/meknes-transparent-v1.webp";
  }
  return null;
}
