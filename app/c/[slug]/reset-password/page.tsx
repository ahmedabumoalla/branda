import { requireStorefrontEnabled } from "@/lib/platform/storefront-availability";

import { redirect } from "next/navigation";

export default async function CustomerResetPasswordPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  requireStorefrontEnabled();
  const { slug } = await params;
  redirect(`/c/${encodeURIComponent(slug)}/login`);
}
