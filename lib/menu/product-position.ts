/** Restore a card's viewport offset, or its neighbour if it was deleted/filtered out. */
export function captureProductPosition(id: string) {
  const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-menu-product-id]"));
  const card = cards.find((item) => item.dataset.menuProductId === id);
  if (!card) return () => {};
  const index = cards.indexOf(card);
  const candidates = [card, cards[index + 1], cards[index - 1]].filter(Boolean);
  const offsets = candidates.map((item) => ({ item, top: item.getBoundingClientRect().top }));
  let parent = card.parentElement;
  while (parent && !/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) parent = parent.parentElement;
  const scroller = parent;
  return () => {
    const target = offsets.find(({ item }) => item.isConnected);
    if (!target) return;
    const delta = target.item.getBoundingClientRect().top - target.top;
    if (scroller) scroller.scrollTop += delta;
    else window.scrollBy({ top: delta, behavior: "instant" });
  };
}
