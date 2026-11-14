"use client";

import { useState } from "react";
import { ArrowUpLeft, ChevronDown, MapPin, Navigation, MessageCircle } from "lucide-react";
import styles from "./fawasel-branches.module.css";

const branches = [
  { city: "خميس مشيط", place: "طريق المدينة العسكرية", account: "fawasell1", name: "فواصل" },
  { city: "أبها", place: "المنسك · إشارة الأربعين", account: "fawasell2", name: "فواصل" },
  { city: "خميس مشيط", place: "طريق الميه", account: "fawasell3", name: "فواصل" },
  { city: "جازان", place: "مخطط 5", account: "fawasell4", name: "فواصل" },
  { city: "الرياض", place: "طريق الإمام سعود", account: "fawasell5", name: "فواصل" },
  { city: "تبوك", place: "الفيصلية الشمالية", account: "fawasell6", name: "فواصل", tag: "أوتليت" },
  { city: "نجران", place: "حي الأثايبة", account: "vamos_sa1", name: "فاموس", tag: "فاموس" },
];
const cities = [...new Set(branches.map(branch => branch.city))];

export function FawaselBranches() {
  const [city, setCity] = useState("");
  const [opened, setOpened] = useState<string | null>(branches[0].account);
  const visible = branches.filter(branch => !city || branch.city === city);
  function choose(value: string) { setCity(value); setOpened(branches.find(branch => !value || branch.city === value)?.account ?? null); }

  return <section className={styles.section} id="fawasel-branches" aria-labelledby="fawasel-branches-title">
    <div className={styles.intro}>
      <div className={styles.topline}><span><MapPin size={15} aria-hidden="true" /> تلقانا حولك</span><bdi>FAWASEL / LOCATIONS</bdi></div>
      <div className={styles.headline}><h2 id="fawasel-branches-title">ستايلك هنا<br /><span>وأقرب لك</span></h2><div className={styles.counter} aria-label="سبعة فروع"><bdi>07</bdi><span>فروع على طريقك</span></div></div>
      <div className={styles.introBottom}><p>مرّنا وخلّ إطلالتك تختار لك</p><span>٧ فروع <i /> ٦ مدن <ArrowUpLeft aria-hidden="true" /></span></div>
    </div>
    <div className={styles.finder}>
      <div className={styles.filterHeading}><strong>وين نلقاك؟</strong><span>اختر مدينتك</span></div>
      <div className={styles.filters} role="group" aria-label="تصفية الفروع حسب المدينة"><button type="button" aria-pressed={!city} onClick={() => choose("")}>كل الفروع</button>{cities.map(value => <button type="button" key={value} aria-pressed={city === value} onClick={() => choose(value)}>{value}</button>)}</div>
      <div className={styles.list}>
        {visible.map(branch => {
          const number = branches.indexOf(branch) + 1, active = opened === branch.account, panelId = `branch-${branch.account}`;
          return <article key={branch.account} className={`${styles.branch} ${active ? styles.active : ""}`}>
            <button className={styles.branchToggle} type="button" onClick={() => setOpened(active ? null : branch.account)} aria-expanded={active} aria-controls={panelId}>
              <bdi className={styles.number}>{String(number).padStart(2, "0")}</bdi>
              <span className={styles.branchIdentity}><span><strong>{branch.city}</strong>{branch.tag && <em>{branch.tag}</em>}</span><small>{branch.place}</small></span>
              <ChevronDown className={styles.chevron} aria-hidden="true" />
            </button>
            <div id={panelId} hidden={!active} className={styles.details}>
              <div className={styles.actions}>
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${branch.name} ${branch.city} ${branch.place}`)}`} target="_blank" rel="noopener noreferrer"><Navigation size={17} aria-hidden="true" />ابحث في الخرائط<ArrowUpLeft size={15} aria-hidden="true" /></a>
                <a href={`https://www.snapchat.com/add/${branch.account}`} target="_blank" rel="noopener noreferrer" aria-label={`سناب فرع ${branch.city} ${branch.place}`}><MessageCircle size={17} aria-hidden="true" />سناب الفرع<ArrowUpLeft size={15} aria-hidden="true" /></a>
              </div>
              <div className={styles.branchFoot}><span>نخدمك أينما كنت</span><bdi>@{branch.account}</bdi></div>
            </div>
          </article>;
        })}
      </div>
      <div className={styles.bottomline}><MapPin aria-hidden="true" /><span>من أول زيارة<br /><strong>تصير من أهل فواصل</strong></span><bdi>SEE YOU<br />IN STORE ↗</bdi></div>
    </div>
  </section>;
}
