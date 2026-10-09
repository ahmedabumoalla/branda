"use client";

import { AnimatePresence, motion, useInView, useMotionValue, useSpring } from "motion/react";
import { ArrowUpLeft, Check, Coffee, Gift, LayoutGrid, Megaphone, Plus, Sparkles } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import { homeMotion, homeSprings } from "./home-motion";
import styles from "./platform-home-page.module.css";

const previews = [
  { id: "menu", title: "المنيو", icon: LayoutGrid, description: "منتجاتك بصور واضحة وتفاصيل تحمل هوية علامتك" },
  { id: "loyalty", title: "الولاء", icon: Gift, description: "كل زيارة تقرّب عميلك من مكافأة تستحق العودة" },
  { id: "offers", title: "العروض", icon: Megaphone, description: "مساحة لعروضك ومناسباتك تتجدد مع علامتك" },
] as const;

export function HomeProductPreview({ animate }: { animate: boolean }) {
  const [selected, setSelected] = useState(0);
  const scene = useRef<HTMLDivElement>(null);
  const inView = useInView(scene);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(x, homeSprings.perspective);
  const rotateY = useSpring(y, homeSprings.perspective);
  const moving = animate && inView;
  const preview = previews[selected];

  function move(event: PointerEvent<HTMLDivElement>) {
    if (!moving || event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    x.set((.5 - (event.clientY - bounds.top) / bounds.height) * homeMotion.tilt);
    y.set(((event.clientX - bounds.left) / bounds.width - .5) * homeMotion.tilt);
  }

  function changeByKey(event: KeyboardEvent<HTMLButtonElement>) {
    let next: number;
    if (event.key === "ArrowLeft") next = (selected + 1) % previews.length;
    else if (event.key === "ArrowRight") next = (selected + previews.length - 1) % previews.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = previews.length - 1;
    else return;
    event.preventDefault();
    setSelected(next);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#preview-tab-${previews[next].id}`)?.focus();
  }

  return (
    <div className={styles.productPreview}>
      <div ref={scene} className={styles.scene} data-moving={moving} onPointerMove={move} onPointerLeave={() => { x.set(0); y.set(0); }}>
        <div className={styles.sceneOrbit} aria-hidden="true" />
        <span className={styles.sceneLabel}>هويتك في كل تجربة</span>
        <motion.div className={styles.sceneObjects} style={{ rotateX: moving ? rotateX : 0, rotateY: moving ? rotateY : 0 }}>
          <div className={styles.phone}>
            <div className={styles.phoneNotch} aria-hidden="true" />
            <div className={styles.phoneTop}><BarndaksaLogo variant="brown" width={68} height={28} /><span>مساحة علامتك</span></div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={preview.id} id={`preview-panel-${preview.id}`} role="tabpanel" aria-labelledby={`preview-tab-${preview.id}`} tabIndex={0} className={styles.phoneScreen}
                initial={false} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: animate ? -homeMotion.distance : 0 }} transition={{ duration: animate ? homeMotion.duration.fast : 0 }}>
                {selected === 0 ? <>
                  <div className={styles.coffeePhoto}><img src="/menu-art/rast-coffee-editorial-v1.webp" width={1536} height={1024} alt="قهوة في معاينة توضيحية للمنيو" fetchPriority="high" /><span>على ذوقك</span></div>
                  <div className={styles.phoneCopy}><small>لحظتك تستاهل</small><h3>قهوة وتفاصيل تحبها</h3><p>منتجات مختارة بطابع علامتك</p><div className={styles.sampleProduct}><Coffee size={24} aria-hidden="true" /><span>قهوة اليوم<small>طازجة في كل مرة</small></span><Plus size={17} aria-hidden="true" /></div></div>
                </> : selected === 1 ? <div className={styles.loyaltyScreen}><Gift size={32} aria-hidden="true" /><small>لأهل علامتك</small><h3>كل زيارة لها مكافأة</h3><div className={styles.stamps} aria-label="معاينة أختام الولاء">{[0, 1, 2, 3, 4, 5].map(index => <span key={index} data-filled={index < 4}>{index < 4 ? <Coffee size={20} aria-hidden="true" /> : <Gift size={19} aria-hidden="true" />}</span>)}</div><p>بطاقة يحملها عميلك<br />وتجربة يرجع لها</p></div>
                  : <div className={styles.offerScreen}><img src="/menu-art/rast-coffee-editorial-v1.webp" width={1536} height={1024} alt="معاينة عرض للقهوة" /><div><small>شيء جديد يستاهل</small><h3>لحظتك المفضلة<br />لها عرض خاص</h3><p>قدّم عروضك بطريقتك</p><span>اكتشف تفاصيل العرض <ArrowUpLeft size={15} aria-hidden="true" /></span></div></div>}
              </motion.div>
            </AnimatePresence>
            <div className={styles.phoneBottom} aria-hidden="true"><span /></div>
          </div>
          <div className={styles.floatingCard} aria-hidden="true"><div><Sparkles size={20} /><span>علاقة تكبر مع كل زيارة</span></div><strong>ولاء يحمل هويتك</strong><div className={styles.miniStamps}>{[0, 1, 2, 3, 4].map(index => <span key={index}>{index < 3 ? <Coffee size={16} /> : <Gift size={16} />}</span>)}</div><span className={styles.cardSignature}>BARNDA</span></div>
          <div className={styles.sceneBadge} aria-hidden="true"><span><Check size={17} /></span><div>علامتك أقرب<small>تجربة واحدة بتفاصيل متكاملة</small></div></div>
        </motion.div>
        <span className={styles.sceneCaption}>معاينة توضيحية لتجربة علامتك</span>
      </div>
      <div className={styles.previewTabs} role="tablist" aria-label="استكشف خدمات برندة">
        {previews.map((item, index) => <button key={item.id} id={`preview-tab-${item.id}`} type="button" role="tab" aria-selected={selected === index} aria-controls={`preview-panel-${item.id}`} tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={changeByKey}><item.icon size={18} aria-hidden="true" />{item.title}</button>)}
      </div>
      <p className={styles.previewDescription} aria-live="polite">{preview.description}</p>
    </div>
  );
}
