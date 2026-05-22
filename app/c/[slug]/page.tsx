import { CafePageClient } from "@/components/cafe/cafe-page-client";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function CafePage({ params }: Props) {
  const { slug } = await params;

  return <CafePageClient slug={slug} />;
}