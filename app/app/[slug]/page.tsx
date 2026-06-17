import type { Metadata } from "next";
import { CustomerFastAppClient } from "@/components/customer-app/customer-fast-app-client";
import { getPublicCafeSettings } from "@/lib/data/settings";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const settings = await getPublicCafeSettings(slug).catch(() => null);
  const cafeName = settings?.cafeName || slug;

  return {
    title: `${cafeName} | تطبيق العميل`,
    description: `تطبيق ${cafeName} السريع للمنيو والعروض والولاء عبر برندة`,
    appleWebApp: {
      capable: true,
      title: cafeName,
      statusBarStyle: "black-translucent",
    },
    other: {
      "mobile-web-app-capable": "yes",
      "theme-color": "#4A281D",
    },
  };
}

export default async function CustomerFastAppPage({ params }: Props) {
  const { slug } = await params;
  return <CustomerFastAppClient slug={slug} />;
}
