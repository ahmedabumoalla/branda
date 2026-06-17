const fs = require("fs");
const path = require("path");

const root = process.cwd();
const patchName = "BARNDAKSA_CAFE_BROWSER_ICON_FINAL_PATCH";
const backupRoot = path.join(root, ".barndaksa-patch-backups", `${patchName}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const files = [{"path": "components/cafe/cafe-favicon-controller.tsx", "content": "\"use client\";\n\nimport { useEffect } from \"react\";\n\ntype CafeFaviconControllerProps = {\n  slug: string;\n};\n\nfunction upsertFaviconLink(rel: string, href: string) {\n  const existingLinks = Array.from(\n    document.head.querySelectorAll<HTMLLinkElement>(`link[rel=\"${rel}\"]`),\n  );\n\n  const links = existingLinks.length > 0 ? existingLinks : [document.createElement(\"link\")];\n\n  for (const link of links) {\n    link.setAttribute(\"rel\", rel);\n    link.setAttribute(\"href\", href);\n    link.setAttribute(\"data-barndaksa-cafe-icon\", \"true\");\n    if (!link.parentElement) {\n      document.head.appendChild(link);\n    }\n  }\n}\n\nexport function CafeFaviconController({ slug }: CafeFaviconControllerProps) {\n  useEffect(() => {\n    if (!slug) return;\n\n    const encodedSlug = encodeURIComponent(slug);\n    const version = Date.now().toString();\n    const href = `/api/public/cafe/${encodedSlug}/favicon?source=client&v=${version}`;\n\n    upsertFaviconLink(\"icon\", href);\n    upsertFaviconLink(\"shortcut icon\", href);\n    upsertFaviconLink(\"apple-touch-icon\", href);\n  }, [slug]);\n\n  return null;\n}\n"}, {"path": "app/api/public/cafe/[slug]/favicon/route.ts", "content": "import { NextResponse } from \"next/server\";\nimport { getPreferredCafeDisplayLogoUrl } from \"@/lib/cafe/cafe-display-logo\";\nimport { getPublicCafeSettings } from \"@/lib/data/settings\";\nimport { getPublicCustomIdentity } from \"@/lib/data/theme\";\n\ntype Props = {\n  params: Promise<{ slug: string }>;\n};\n\nexport const dynamic = \"force-dynamic\";\nexport const revalidate = 0;\n\nexport async function GET(request: Request, { params }: Props) {\n  const { slug } = await params;\n\n  const [settings, identity] = await Promise.all([\n    getPublicCafeSettings(slug).catch(() => null),\n    getPublicCustomIdentity(slug).catch(() => null),\n  ]);\n\n  const iconUrl = getPreferredCafeDisplayLogoUrl(\n    settings?.logoDataUrl,\n    identity?.legacyLogoDataUrl,\n  );\n\n  const redirectUrl = new URL(iconUrl, request.url);\n  const response = NextResponse.redirect(redirectUrl, 307);\n  response.headers.set(\"Cache-Control\", \"no-store, max-age=0, must-revalidate\");\n  response.headers.set(\"Pragma\", \"no-cache\");\n  response.headers.set(\"Expires\", \"0\");\n\n  return response;\n}\n"}, {"path": "app/c/[slug]/layout.tsx", "content": "import type { Metadata } from \"next\";\nimport type { ReactNode } from \"react\";\nimport { CafeFaviconController } from \"@/components/cafe/cafe-favicon-controller\";\nimport { getPreferredCafeDisplayLogoUrl } from \"@/lib/cafe/cafe-display-logo\";\nimport { getCafeBySlug } from \"@/lib/data/cafes\";\nimport { getPublicCafeSettings } from \"@/lib/data/settings\";\nimport { getPublicCustomIdentity } from \"@/lib/data/theme\";\n\ntype Props = {\n  children: ReactNode;\n  params: Promise<{ slug: string }>;\n};\n\nexport const dynamic = \"force-dynamic\";\nexport const revalidate = 0;\n\nfunction getCafeIconRoute(slug: string) {\n  return `/api/public/cafe/${encodeURIComponent(slug)}/favicon`;\n}\n\nexport async function generateMetadata({ params }: Props): Promise<Metadata> {\n  const { slug } = await params;\n  const [cafe, settings, identity] = await Promise.all([\n    getCafeBySlug(slug).catch(() => null),\n    getPublicCafeSettings(slug).catch(() => null),\n    getPublicCustomIdentity(slug).catch(() => null),\n  ]);\n\n  const name = settings?.cafeName || cafe?.name || \"برندة\";\n  const iconRoute = getCafeIconRoute(slug);\n  const displayLogoUrl = getPreferredCafeDisplayLogoUrl(\n    settings?.logoDataUrl,\n    identity?.legacyLogoDataUrl,\n  );\n\n  return {\n    title: `${name} | برندة`,\n    description: `الفرع الإلكتروني لـ ${name} على منصة برندة`,\n    manifest: `/api/pwa/${encodeURIComponent(slug)}/manifest`,\n    icons: {\n      icon: [\n        { url: iconRoute },\n        { url: `${iconRoute}?shortcut=1` },\n      ],\n      shortcut: [{ url: `${iconRoute}?shortcut=1` }],\n      apple: [{ url: `${iconRoute}?apple=1` }],\n    },\n    openGraph: {\n      title: `${name} | برندة`,\n      description: `الفرع الإلكتروني لـ ${name} على منصة برندة`,\n      images: [{ url: displayLogoUrl }],\n    },\n  };\n}\n\nexport default async function CafeSlugLayout({ children, params }: Props) {\n  const { slug } = await params;\n\n  return (\n    <>\n      <CafeFaviconController slug={slug} />\n      {children}\n    </>\n  );\n}\n"}, {"path": "app/api/pwa/[slug]/manifest/route.ts", "content": "import { NextResponse } from \"next/server\";\nimport { getCafeBySlug } from \"@/lib/data/cafes\";\nimport { getPublicCafeSettings } from \"@/lib/data/settings\";\n\ntype Props = {\n  params: Promise<{ slug: string }>;\n};\n\nexport async function GET(_request: Request, { params }: Props) {\n  const { slug } = await params;\n  const cafe = await getCafeBySlug(slug);\n  const settings = await getPublicCafeSettings(slug).catch(() => null);\n\n  const name = settings?.cafeName || cafe?.name || \"Barndaksa\";\n  const startUrl = `/c/${encodeURIComponent(slug)}`;\n  const iconUrl = `/api/public/cafe/${encodeURIComponent(slug)}/favicon`;\n\n  return NextResponse.json({\n    name,\n    short_name: name.slice(0, 12),\n    description: `تطبيق ${name} على منصة برندة`,\n    start_url: startUrl,\n    scope: `/c/${encodeURIComponent(slug)}`,\n    display: \"standalone\",\n    dir: \"rtl\",\n    lang: \"ar\",\n    background_color: \"#F8F4EF\",\n    theme_color: \"#4A281D\",\n    icons: [\n      {\n        src: `${iconUrl}?size=192`,\n        sizes: \"192x192\",\n        purpose: \"any maskable\",\n      },\n      {\n        src: `${iconUrl}?size=512`,\n        sizes: \"512x512\",\n        purpose: \"any maskable\",\n      },\n    ],\n  }, {\n    headers: {\n      \"Cache-Control\": \"no-store, max-age=0\",\n    },\n  });\n}\n"}];

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function backupFile(relativePath) {
  const source = path.join(root, relativePath);
  if (!fs.existsSync(source)) return;
  const destination = path.join(backupRoot, relativePath);
  ensureDir(destination);
  fs.copyFileSync(source, destination);
}

function writeFile(relativePath, content) {
  const destination = path.join(root, relativePath);
  ensureDir(destination);
  backupFile(relativePath);
  fs.writeFileSync(destination, content, "utf8");
  console.log(`✓ updated ${relativePath}`);
}

try {
  for (const file of files) {
    writeFile(file.path, file.content);
  }

  console.log("\nتم تطبيق إصلاح أيقونة متصفح الفرع الإلكتروني بنجاح.");
  console.log("النسخ الاحتياطية إن وجدت محفوظة في:");
  console.log(backupRoot);
  console.log("\nالخطوة التالية:");
  console.log("npm exec tsc -- --noEmit");
  console.log("npm run build");
} catch (error) {
  console.error("\nفشل تطبيق الباتش:");
  console.error(error);
  process.exit(1);
}
