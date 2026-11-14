/** Categories supported by the shared catalog, orders and financial settlement. */
export function isCommerceBusinessCategory(category: string | null | undefined) {
  return category === "gifts_flowers" || category === "clothing_stores" || category === "retail_stores";
}
