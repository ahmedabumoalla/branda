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
  if (cafeId === "83b37bcd-353a-43e2-aa1a-735ba21d65ed" && sourceHash === "eb956eed75ca3171143ce1f8fc41001388f755b43f3c585593d913e21780e45c") {
    return "/menu-logos/shahi-transparent-v2.webp";
  }
  if (cafeId === "6d01bd09-c7e0-4307-8cfb-93171d69d9db" && sourceHash === "0074baecad475041f15575dabcc9d4b91098fadde96dbeeaabcb8487de5b5e03") {
    return "/menu-art/four-brands/black-drop-logo-transparent-v1.webp";
  }
  if (cafeId === "a3c65c66-d5de-41e2-a2c7-0cc451a92bf3" && sourceHash === "c650dbcf146aa2114bc95be03f601ca7f84bb83dd15df683b7e7c92eb590fbc7") {
    return "/menu-art/four-brands/once-logo-transparent-v1.webp";
  }
  return null;
}
