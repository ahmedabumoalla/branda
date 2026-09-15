import { redirect } from "next/navigation";

type Params = {
  params: Promise<{ slug: string }>;
};

export default async function CafeOffersPage({ params }: Params) {
  const { slug } = await params;
  redirect(`/c/${encodeURIComponent(slug)}/products/offers`);
}
