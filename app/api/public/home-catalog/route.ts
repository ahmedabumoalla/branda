import { getPublicHomeCatalog } from "@/lib/data/public-home-catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = await getPublicHomeCatalog();
  return Response.json(catalog, {
    status: catalog.errors.plans && catalog.errors.partners ? 503 : 200,
    headers: { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" },
  });
}
