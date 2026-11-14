"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowUpLeft, Shirt } from "lucide-react";
import type { StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { giftProductAvailable, productMinimumPrice } from "@/lib/commerce/storefront-cart";
import { menuMotion, shouldAnimateMenu } from "@/lib/menu/motion-foundations";
import { FAWASEL_CAMPAIGN_PRODUCT_IDS } from "@/lib/commerce/fawasel-profile";
import styles from "./fawasel-campaign-hero.module.css";

type Props = {
  products: StandaloneMenuProduct[];
  onSelect: (product: StandaloneMenuProduct) => void;
  onBrowse: () => void;
};

function campaignProducts(products: StandaloneMenuProduct[]) {
  const available = products.filter(product => giftProductAvailable(product) && product.images[0]?.url);
  const curated = FAWASEL_CAMPAIGN_PRODUCT_IDS.flatMap(id => available.filter(product => product.id === id));
  if (curated.length) return curated;
  const ranked = available
    .map((product, index) => {
      const text = `${product.category} ${product.name}`;
      const rank = /شوز|حذاء|سنيكر/.test(text) ? 3 : /تيشيرت|هودي|قميص/.test(text) ? 2 : /شنط|حقيبة/.test(text) ? 1 : 0;
      return { product, rank, index };
    }).sort((a, b) => b.rank - a.rank || a.index - b.index);
  const chosen: StandaloneMenuProduct[] = [];
  // Prefer a different clothing category after the leading shoe, then fill from real stock.
  for (const { product } of ranked) {
    if (!chosen.some(item => item.category === product.category)) chosen.push(product);
    if (chosen.length === 2) return chosen;
  }
  for (const { product } of ranked) {
    if (!chosen.some(item => item.id === product.id)) chosen.push(product);
    if (chosen.length === 2) break;
  }
  return chosen;
}

function CampaignPhoto({ product, thumbnail = false }: { product: StandaloneMenuProduct; thumbnail?: boolean }) {
  const src = product.images[0]?.url;
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className={styles.imageFallback}><Shirt aria-hidden="true" />{!thumbnail && <span>{product.name}</span>}</span>;
  // Preserve the original catalog photograph and its background without recoloring.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={thumbnail ? "" : product.name} loading={thumbnail ? "lazy" : "eager"} fetchPriority={thumbnail ? "auto" : "high"} decoding="async" onError={() => setFailed(true)} />;
}

export function FawaselCampaignHero({ products, onSelect, onBrowse }: Props) {
  const choices = useMemo(() => campaignProducts(products), [products]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = choices.find(product => product.id === selectedId) ?? choices[0];
  const reduced = useReducedMotion();
  const photoMotion = useAnimationControls(), copyMotion = useAnimationControls();

  useEffect(() => {
    photoMotion.stop();
    if (reduced || !shouldAnimateMenu()) {
      photoMotion.set({ opacity: 1, y: 0, rotate: 0 });
      return;
    }
    void photoMotion.start({ opacity: [0.65, 1], y: [menuMotion.distance.normal, 0], rotate: [-menuMotion.tilt, 0], transition: { duration: menuMotion.duration.normal, ease: menuMotion.easing } });
    return () => photoMotion.stop();
  }, [selected?.id, reduced, photoMotion]);

  useEffect(() => {
    copyMotion.stop();
    if (reduced || !shouldAnimateMenu()) { copyMotion.set({ y: 0, opacity: 1 }); return; }
    void copyMotion.start({ y: [menuMotion.distance.small, 0], opacity: 1, transition: { duration: menuMotion.duration.slow, ease: menuMotion.easing } });
    return () => copyMotion.stop();
  }, [reduced, copyMotion]);

  return <section className={styles.hero} id="fawasel-top" aria-labelledby="fawasel-title">
    <motion.div className={styles.copy} initial={false} animate={copyMotion}>
      <p className={styles.eyebrow}><span />لبسك يقولها قبلك<bdi>WEAR YOUR WAY</bdi></p>
      <h1 id="fawasel-title"><span>ستايلك</span><strong>خارج المألوف</strong></h1>
      <p className={styles.description}>اختَر اللي يشبهك<br />وخَلّ الباقي عليك</p>
    </motion.div>

    <div className={styles.stage}>
      <span className={styles.watermark} aria-hidden="true">FAWASEL</span>
      <span className={styles.diagonal} aria-hidden="true" />
      <span className={styles.stageCaption} aria-hidden="true">YOUR NEXT<br />FAVOURITE</span>
      <div className={styles.surface}>
        <motion.button type="button" className={styles.productVisual} initial={false} animate={photoMotion} onClick={() => selected ? onSelect(selected) : onBrowse()} aria-label={selected ? `اكتشف ${selected.name}` : "اكتشف مجموعة فواصل"}>
          {selected ? <CampaignPhoto key={selected.id} product={selected} /> : <span className={styles.imageFallback}><Shirt aria-hidden="true" /><span>اكتشف أسلوبك</span></span>}
        </motion.button>
      </div>
      {choices.length > 1 && <div className={styles.selector} role="group" aria-label="اختيارات حملة فواصل">{choices.map((product, index) => <button type="button" key={product.id} onClick={() => setSelectedId(product.id)} aria-pressed={selected?.id === product.id} aria-label={`اعرض ${product.name}`}>
        <CampaignPhoto key={product.id} product={product} thumbnail /><bdi aria-hidden="true">{String(index + 1).padStart(2, "0")}</bdi>
      </button>)}</div>}
      <span className={styles.stageFoot} aria-hidden="true">من اختيارات فواصل<ArrowUpLeft size={18} /></span>
    </div>

    {selected && <div className={styles.productInfo} aria-live="polite" aria-atomic="true">
      <div><span className={styles.category}>{selected.category}</span><button type="button" onClick={() => onSelect(selected)} className={styles.productName}>{selected.name}</button></div>
      <p className={styles.price}>{Boolean(selected.commerceDetails?.options?.length) && <small>من</small>}<bdi>{productMinimumPrice(selected).toLocaleString("en-US", { maximumFractionDigits: 2 })}</bdi><span>ريال</span></p>
    </div>}

    <div className={styles.actions}>
      <button type="button" className={styles.browse} onClick={onBrowse}>اكتشف المجموعة<ArrowUpLeft aria-hidden="true" /></button>
      {selected && <button type="button" className={styles.quickView} onClick={() => onSelect(selected)}>تفاصيل القطعة<ArrowUpLeft aria-hidden="true" /></button>}
    </div>
    <div className={styles.footer}><span>أحذية / أزياء / إكسسوارات</span><bdi>FOR YOUR EVERYDAY</bdi><ArrowDown aria-hidden="true" /></div>
  </section>;
}
