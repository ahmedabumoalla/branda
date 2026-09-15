"use client";

import { CafeFooter } from "@/components/cafe/cafe-footer";
import type { CafeThemeId } from "@/lib/mock/cafe-theme";

export function ThemedCafeFooter({
  slug,
  cafeName,
  themeId,
}: {
  slug: string;
  cafeName: string;
  themeId: CafeThemeId;
}) {
  return <CafeFooter slug={slug} cafeName={cafeName} themeId={themeId} />;
}
