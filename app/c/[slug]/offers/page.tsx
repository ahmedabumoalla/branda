import { CafePageClient } from "@/components/cafe/cafe-page-client";

type Params = {
  params: Promise<{ slug: string }>;
};

export default async function CafeOffersPage({ params }: Params) {
  const { slug } = await params;
  return <CafePageClient slug={slug} />;
}
