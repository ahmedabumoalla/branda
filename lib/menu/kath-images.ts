export const KATH_IMAGE_ORIGIN = "https://kpguwjfkkylrdlvzeezz.supabase.co";
export const KATH_IMAGE_PATH = "/storage/v1/object/sign/menu-products/fbd92cd0-c4b6-41b5-81dd-1d45a01d01e8/";

export function kathResponsiveImage(src: string, sizes: string) {
  try {
    const url = new URL(src);
    if (url.origin !== KATH_IMAGE_ORIGIN || !url.pathname.startsWith(KATH_IMAGE_PATH) || !url.searchParams.has("token")) return null;
    const image = (width: number) => `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
    return { src: image(640), srcSet: [256, 384, 640, 828, 1080, 1200].map(width => `${image(width)} ${width}w`).join(", "), sizes };
  } catch { return null; }
}
