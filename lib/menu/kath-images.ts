export const KATH_IMAGE_ORIGIN = "https://kpguwjfkkylrdlvzeezz.supabase.co";
export const KATH_IMAGE_PATH = "/storage/v1/object/sign/menu-products/fbd92cd0-c4b6-41b5-81dd-1d45a01d01e8/";
export const SHAHI_IMAGE_PATH = "/storage/v1/object/sign/menu-products/83b37bcd-353a-43e2-aa1a-735ba21d65ed/";
export const TAZA_IMAGE_PATH = "/storage/v1/object/sign/menu-products/95c159fc-7ef5-4892-baef-1f1bfec1972f/";
export const DELI_IMAGE_PATH = "/storage/v1/object/sign/menu-products/21b99cd2-69b3-4099-a462-25e4fd91ce0c/";

export function kathResponsiveImage(src: string, sizes: string) {
  try {
    const url = new URL(src);
    if (url.origin !== KATH_IMAGE_ORIGIN || ![KATH_IMAGE_PATH, SHAHI_IMAGE_PATH, TAZA_IMAGE_PATH, DELI_IMAGE_PATH].some(path => url.pathname.startsWith(path)) || !url.searchParams.has("token")) return null;
    const image = (width: number) => `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
    return { src: image(640), srcSet: [256, 384, 640, 828, 1080, 1200].map(width => `${image(width)} ${width}w`).join(", "), sizes };
  } catch { return null; }
}
