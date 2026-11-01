import type { StandaloneMenuProduct } from "@/lib/menu/standalone-menu";

export type GiftSelection = { groupId: string; choiceIds?: string[]; text?: string };
export type GiftCartLine = { key: string; productId: string; optionId?: string; quantity: number; selections: GiftSelection[] };

/** Match checkout stock semantics without removing sold-out listings from the catalog. */
export function giftProductAvailable(product: Pick<StandaloneMenuProduct, "available" | "commerceDetails">) {
  if (!product.available) return false;
  const details = product.commerceDetails;
  return details?.options?.length
    ? details.options.some(option => option.available && option.stock !== 0)
    : details?.stock !== 0;
}

export function productMinimumPrice(product: StandaloneMenuProduct) {
  const options = product.commerceDetails?.options?.filter(o => o.available && o.stock !== 0);
  let value = options?.length ? Math.min(...options.map(o => o.price)) : product.price;
  for (const group of product.commerceDetails?.optionGroups ?? []) {
    if (!group.required || group.type === "text") continue;
    const count = Math.max(1, group.minChoices ?? 1);
    value += (group.choices ?? []).map(c => c.priceDelta).sort((a, b) => a - b).slice(0, count).reduce((a, b) => a + b, 0);
  }
  return Math.round(value * 100) / 100;
}

export function selectedProductPrice(product: StandaloneMenuProduct, selections: GiftSelection[], optionId?: string) {
  let value = product.commerceDetails?.options?.find(o => o.id === optionId)?.price ?? product.price;
  for (const selection of selections) {
    const group = product.commerceDetails?.optionGroups?.find(g => g.id === selection.groupId);
    for (const choice of group?.choices ?? []) if (selection.choiceIds?.includes(choice.id)) value += choice.priceDelta;
  }
  return Math.round(value * 100) / 100;
}

export function selectionError(product: StandaloneMenuProduct, selections: GiftSelection[], optionId?: string) {
  if (!giftProductAvailable(product)) return "هذا الصنف غير متاح حاليًا";
  if (new Set(selections.map(s => s.groupId)).size !== selections.length || selections.some(s => !product.commerceDetails?.optionGroups?.some(g => g.id === s.groupId))) return "تغيّرت الخيارات راجع اختياراتك";
  if (product.commerceDetails?.options?.length) {
    const option = product.commerceDetails.options.find(o => o.id === optionId);
    if (!option || !option.available || option.stock === 0) return "اختر أحد الخيارات المتاحة";
  }
  for (const group of product.commerceDetails?.optionGroups ?? []) {
    const value = selections.find(s => s.groupId === group.id);
    if (group.type === "text") {
      if (group.required && !value?.text?.trim()) return `أكمل ${group.label}`;
      continue;
    }
    const count = value?.choiceIds?.length ?? 0;
    if (new Set(value?.choiceIds ?? []).size !== count || value?.choiceIds?.some(id => !group.choices?.some(c => c.id === id))) return `تغيّرت خيارات ${group.label}`;
    if ((group.required || count > 0) && count < Math.max(group.required ? 1 : 0, group.minChoices ?? 0)) return `أكمل ${group.label}`;
    if (count > (group.type === "select" ? 1 : group.maxChoices ?? group.choices?.length ?? 0)) return `راجع عدد الخيارات في ${group.label}`;
  }
  return null;
}

export function selectionSummary(product: StandaloneMenuProduct, selections: GiftSelection[], optionId?: string) {
  const labels: string[] = [];
  const option = product.commerceDetails?.options?.find(o => o.id === optionId);
  if (option) labels.push(option.label);
  for (const selection of selections) {
    const group = product.commerceDetails?.optionGroups?.find(g => g.id === selection.groupId);
    if (!group) continue;
    if (selection.text?.trim()) labels.push(`${group.label}: ${selection.text.trim()}`);
    for (const choice of group.choices ?? []) if (selection.choiceIds?.includes(choice.id)) labels.push(choice.label);
  }
  return labels.join(" · ");
}
