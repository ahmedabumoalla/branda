import { notFound } from "next/navigation";
import { PagerPreview } from "@/components/pager/pager-preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "تجربة لوحة النداء", robots: { index: false, follow: false } };

export default function PagerPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PagerPreview />;
}
