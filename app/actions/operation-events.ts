"use server";

import { requireStorefrontEnabled } from "@/lib/platform/storefront-availability";

import { headers } from "next/headers";
import { recordPublicAppInstallClick } from "@/lib/data/operation-events";

export async function recordPwaInstallClickAction(input: {
  cafeSlug: string;
  path?: string;
  hasPrompt?: boolean;
}) {
  requireStorefrontEnabled();
  const headerStore = await headers();
  await recordPublicAppInstallClick({
    cafeSlug: input.cafeSlug,
    path: input.path,
    hasPrompt: input.hasPrompt,
    userAgent: headerStore.get("user-agent") ?? "",
  });
}
