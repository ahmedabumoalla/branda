import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readFamilyPortal } from "@/lib/data/erp-family-portal";
import { FamilyPortal } from "@/components/erp/families/portal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "لوحة الأسر المنتجة", robots: { index: false, follow: false }, referrer: "same-origin" };

export default async function FamilyPortalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await readFamilyPortal(slug);
  if (result.state === "missing") notFound();
  return <FamilyPortal slug={slug} result={result} />;
}
