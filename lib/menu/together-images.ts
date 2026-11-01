import { KATH_IMAGE_ORIGIN } from "./kath-images";

export const TOGETHER_IMAGE_PATH = "/storage/v1/object/sign/menu-products/4e5a661a-7029-40ec-a3bc-dc75959a05bb/";
export const STORE_CARD_IMAGE_SIZES = "(max-width: 760px) 46vw, (max-width: 1100px) 30vw, 280px";
export const STORE_DETAIL_IMAGE_SIZES = "(max-width: 760px) calc(100vw - 64px), 560px";

/** Tenant/path allowlist only; getStandaloneMenu validates current publication/entitlement before supplying URLs. */
export function togetherResponsiveImage(src: string, sizes: string) {
  try {
    const url = new URL(src);
    if (url.origin !== KATH_IMAGE_ORIGIN || !url.pathname.startsWith(TOGETHER_IMAGE_PATH) || !url.searchParams.get("token")) return null;
    const image = (width: number) => `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
    return { src: image(640), srcSet: [96, 128, 256, 384, 640, 828, 1080, 1200].map(width => `${image(width)} ${width}w`).join(", "), sizes };
  } catch { return null; }
}
