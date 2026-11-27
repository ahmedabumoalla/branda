"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { giftOrderInputSchema, type GiftOrderReceipt, type GiftStoreSettings } from "@/lib/commerce/gift-orders";
import { type GiftCartLine } from "@/lib/commerce/storefront-cart";
import { isVelvetStore } from "@/lib/commerce/velvet-profile";
import { matchesMenuSearch, type StandaloneMenu, type StandaloneMenuProduct } from "@/lib/menu/standalone-menu";

export type FlowerStoreProps = { menu: StandaloneMenu; settings: GiftStoreSettings | null; loyaltyEnabled: boolean; initialTracking?: string };
const storageEvent = "meram-cart-change";
const memory = new Map<string, string>();

function subscribe(listener: () => void) {
  const changed = (event: StorageEvent) => { if (event.key) memory.delete(event.key); else memory.clear(); listener(); };
  window.addEventListener("storage", changed);
  window.addEventListener(storageEvent, listener);
  return () => { window.removeEventListener("storage", changed); window.removeEventListener(storageEvent, listener); };
}

function useStored(key: string) {
  const value = useSyncExternalStore(subscribe, () => {
    try { return memory.get(key) ?? localStorage.getItem(key) ?? ""; } catch { return memory.get(key) ?? ""; }
  }, () => "");
  return [value, (next: string) => {
    try { localStorage.setItem(key, next); memory.delete(key); } catch { memory.set(key, next); }
    window.dispatchEvent(new Event(storageEvent));
  }] as const;
}

function readLines(stored: string): GiftCartLine[] {
  try {
    const parsed = giftOrderInputSchema.shape.items.safeParse(JSON.parse(stored || "[]"));
    return parsed.success ? parsed.data.map((line, index) => ({ ...line, key: String(index) })) : [];
  } catch { return []; }
}

export function useFlowerStore({ menu, settings, initialTracking = "" }: FlowerStoreProps) {
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(12);
  const [selected, setSelected] = useState<StandaloneMenuProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [stored, writeCart] = useStored(`gift-cart:${menu.slug}`);
  const [lastToken, writeToken] = useStored(`gift-last-order:${menu.slug}`);
  const [tracking, setTracking] = useState(initialTracking);
  useEffect(() => {
    function openTrackedOrder() {
      const token = new URLSearchParams(window.location.hash.slice(1)).get("order");
      if (token && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(token)) setTracking(token);
    }
    openTrackedOrder();
    window.addEventListener("hashchange", openTrackedOrder);
    return () => window.removeEventListener("hashchange", openTrackedOrder);
  }, []);
  const [receipt, setReceipt] = useState<GiftOrderReceipt | null>(null);
  const [notice, setNotice] = useState("");
  const productSearch = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const lines = readLines(stored);
  const setLines = (next: GiftCartLine[]) => writeCart(JSON.stringify(next));
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const [asOf, setAsOf] = useState(menu.highlights?.asOf ?? 0);
  const activePromotions = (menu.highlights?.items ?? []).filter(item => (!item.expiresAt || item.expiresAt > asOf) && (!item.productId || menu.products.some(product => product.id === item.productId)));
  const offers = activePromotions.filter(item => item.showInSpotlight !== false);
  const saleOffers = offers.filter(item => item.kind !== "announcement" && item.kind !== "event" && (item.kind === "general" || item.kind === "products" || item.productId || item.discountPercent || item.code || item.offerType));
  const announcements = offers.filter(item => !saleOffers.includes(item));
  const matchesCategory = (product: StandaloneMenuProduct, id: string) => product.categoryId === id || Boolean(product.commerceDetails?.sourceCategoryIds?.includes(id));
  const categories = menu.categories.filter(item => menu.products.some(product => matchesCategory(product, item.id)));
  const products = menu.products.filter(product => (!category || matchesCategory(product, category)) && matchesMenuSearch(product, query));
  const ordering = Boolean(settings?.enabled && settings.deliveryEnabled && (isVelvetStore(menu.slug) ? settings.paymentMethods.length > 0 : settings.paymentMethods.includes("bank_transfer")));

  useEffect(() => {
    const future = (menu.highlights?.items ?? []).map(item => item.expiresAt).filter((value): value is number => Boolean(value && value > asOf));
    if (!future.length) return;
    const timer = setTimeout(() => setAsOf(Date.now()), Math.max(50, Math.min(2147480000, Math.min(...future) - Date.now() + 1)));
    return () => clearTimeout(timer);
  }, [menu.highlights, asOf]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  function add(product: StandaloneMenuProduct, item: Omit<GiftCartLine, "key" | "productId">) {
    if (!ordering) return "استقبال الطلبات متوقف مؤقتًا";
    if (lines.length >= 30) return "يمكن إضافة ٣٠ صنفًا للطلب الواحد";
    if (lines.length && (product.commerceDetails?.quoteOnly || lines.some(line => menu.products.find(p => p.id === line.productId)?.commerceDetails?.quoteOnly))) return "أكمل طلب التصميم بشكل مستقل";
    setLines([...lines, { ...item, key: crypto.randomUUID(), productId: product.id }]);
    setSelected(null);
    setNotice(`أُضيف ${product.name} إلى السلة`);
    return null;
  }
  function received(order: GiftOrderReceipt) {
    writeToken(order.trackingToken); setReceipt(order); setTracking(order.trackingToken); setCartOpen(false); setLines([]);
  }
  function openSearch() {
    setSearchOpen(true);
    requestAnimationFrame(() => productSearch.current?.focus());
  }

  return {
    category, setCategory, query, setQuery, limit, setLimit,
    selected, setSelected, cartOpen, setCartOpen, lastToken, tracking, setTracking, receipt,
    notice, productSearch, searchOpen, setSearchOpen, lines, setLines, count,
    activePromotions, saleOffers, announcements, categories, products, ordering, add, received, openSearch,
  };
}
