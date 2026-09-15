import { redirect } from "next/navigation";

type Params = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function queryString(searchParams: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      params.set(key, value);
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        params.append(key, entry);
      }
    }
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export default async function CafePublicPage({ params, searchParams }: Params) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  redirect(`/c/${encodeURIComponent(slug)}/products/popular${queryString(resolvedSearchParams)}`);
}
