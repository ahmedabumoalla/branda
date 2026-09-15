# Double B reference design release

## Published result

- Public URL: https://barndaksa.com/menu/double-b-bistro
- Deployment: dpl_CWfJ5c9tgGhds3TabZLH3FcfPLgS
- Production project: ahmedabumoallas-projects/branda-2
- Published from the isolated release snapshot rather than the unrelated dirty worktree
- Reference composition implemented without cart, ordering or account login
- Preserves the 51 actual products and five actual categories rather than inventing the reference artwork's products or counts
- Existing product photos, prices, detail dialogs, feedback, Instagram, location and QR remain intact

## Generated decorative assets

Mode: built-in image generation tool with the user-supplied JPEG as the reference image
The hero and botanical trim are generated decorative artwork, not replacements for product photographs
Images were subsequently resized and encoded as WebP for delivery

Input reference: C:/Users/pc/Downloads/WhatsApp Image 2026-09-06 at 5.52.45 PM.jpeg

### Hero

Final asset: public/menu-art/double-b-hero.webp
Dimensions: 1600 x 926
Size: 123844 bytes

Exact generation prompt:

> Create a production website hero background asset from the TOP HERO ONLY of the supplied reference screenshot. Output a wide landscape image approximately 900:520 aspect ratio. Faithfully preserve the visual scene and composition of that upper photo: moody deep forest green bistro interior, softly blurred warm candlelight, lush realistic glossy green leaves framing upper left and upper right corners and very edges, a large ceramic plate of grilled salmon and microgreens in the lower right occupying the right 60 percent. Left 42 percent should stay dark atmospheric empty background for real HTML text. The top band must stay dark for real logo/navigation overlays. REMOVE ALL TEXT, logos, Arabic, English, menu buttons, icons, cart, badges and UI. Do not include ANY of the cream catalogue or product cards from the lower screenshot. Reconstruct seamless photographic background where text was. The salmon plate, leaves, warm lights and framing should look as close as possible to the screenshot. No writing or watermark anywhere. This is just the photo background layer, not a webpage mockup.

### Botanical trim

Final asset: public/menu-art/double-b-leaves.webp
Dimensions: 240 x 693 with alpha
Size: 40774 bytes

Exact generation prompt:

> Generate a single botanical edge-decoration asset for the website in the reference. Only the realistic glossy deep olive green leaves seen along the outer edges of the reference. A tall narrow loose cascading branch of 7 to 10 pointed basil/laurel style leaves, extending in from the left edge, photorealistic veins with warm cream highlights and subtle natural shadows. Portrait aspect ratio roughly 1:3. Everything except the leaves and delicate stems must be genuinely transparent with alpha. No background, no rectangle, no food, no text, no icons, no website or UI, no logo. The purpose is to place this leaf cluster over a cream webpage margin. Keep leaves mostly on the left side fading into empty transparent space on the right.

## Verification

- Text integrity, TypeScript, scoped ESLint and both standalone menu/feedback checks passed
- Vercel production build passed before promotion
- Browser review at 320, 375, 900 and 1440 pixel widths without horizontal page overflow
- Search, availability filtering, price sorting, reset, grid/list views and native product/service dialogs checked
- Public anonymous response returns HTTP 200, 51 product cards and the reference theme without redirect
- Both new decorative assets and the existing QR PNG return HTTP 200
- Published mobile screenshot confirms first product photos render correctly
- Temporary missing-image rendering during the long-lived local development session cleared after a fresh navigation; the original file also passed HTTP and image-decoding checks
- Existing unrelated security-source findings and Node 20 deprecation warning are unchanged from the earlier release record
- No database, RLS, storage permissions or secret handling changes in this visual release
