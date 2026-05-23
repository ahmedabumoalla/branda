"use client";

import type { CafeThemeId } from "@/lib/mock/cafe-theme";
import { getThemeDefinition } from "@/lib/mock/cafe-theme";

export function ThemedPreviewBanner({
  themeId,
  visible,
}: {
  themeId: CafeThemeId;
  visible: boolean;
}) {
  if (!visible) return null;
  const def = getThemeDefinition(themeId);
  return (
    <div className="sticky top-0 z-[100] border-b border-amber-600/30 bg-amber-400 px-4 py-2.5 text-center text-sm font-black text-[#241610] shadow-sm">
      وضع معاينة الثيم — {def.name} — لم يُحفظ بعد
    </div>
  );
}
