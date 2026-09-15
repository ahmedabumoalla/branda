import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { getStandaloneMenu } from "@/lib/data/standalone-menu";
import { BistroMenu } from "@/components/menu/bistro-menu";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export function generateViewport(): Viewport {
  return { themeColor: "#102019", width: "device-width", initialScale: 1 };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const menu = await getStandaloneMenu(slug);
  if (!menu) return { title: "المنيو غير متاح", robots: { index: false, follow: false } };
  return {
    title: `${menu.name} | المنيو`,
    description: `اكتشف منيو ${menu.name}، الأصناف والأسعار والمكونات والتفاصيل.`,
  };
}

export default async function StandaloneMenuPage({ params }: Props) {
  const { slug } = await params;
  const menu = await getStandaloneMenu(slug);
  if (!menu) notFound();
  return <BistroMenu menu={slug === "basilico" ? { ...menu, logoUrl: "/menu-logos/basilico-transparent-v1.png" } : menu} />;
}
