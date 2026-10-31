"use client";

import { Check, SaudiRiyal } from "lucide-react";
import type { CSSProperties } from "react";
import type { PublicHomePlan } from "@/lib/platform/public-home-catalog";
import { platformFeatureRegistry } from "@/lib/platform/feature-registry";
import s from "./branda-home.module.css";

type Translate = (ar: string, en: string) => string;
const labels = new Map(platformFeatureRegistry.map(feature => [feature.id as string, feature.titleEn]));
const visible = (plan: PublicHomePlan) => plan.features.filter(feature => !["home", "subscription", "settings", "theme"].includes(feature.id));
const money = (amount: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(amount);

export function BrandaHomePricing({ plans, error, t, choosePlan }: { plans: PublicHomePlan[]; error: boolean; t: Translate; choosePlan: (name: string) => void }) {
  const features = [...new Map(plans.flatMap(plan => visible(plan).map(feature => [feature.id, feature] as const))).values()];
  return <section id="pricing" className={`${s.section} ${s.pricing}`}><div className={`${s.container} ${s.pricingContainer}`}>
    <header className={s.sectionHeading}><span className={s.eyebrow}>{t("الباقات والأسعار", "Plans and pricing")}</span><h2>{t("اختر الباقة المناسبة لطريقة عملك", "Choose the plan that works for you")}</h2><p>{t("باقات برندة تجمع أدوات الإدارة والتشغيل وفق احتياجات نشاطك وطريقة عملك", "Branda plans bring together the tools your business needs")}</p></header>
    <p className={s.pricingNote}>{t("اشتراك شهر أو ثلاثة أشهر · الأسعار شاملة ضريبة القيمة المضافة", "One or three months · prices include VAT")}</p>
    {error || !plans.length ? <p role="status" className={s.helpChoosing}>{t("الباقات غير متاحة حاليًا", "Plans are currently unavailable")} <a href="#contact">{t("تواصل معنا لتفاصيل الباقات", "Contact us for plan details")}</a></p> : <>
      <div className={s.plans} style={{ "--plan-count": plans.length } as CSSProperties}>{plans.map(plan => {
        const quarter = plan.durations.find(duration => duration.months === 3);
        return <article key={plan.id} className={s.plan} data-plan-id={plan.id}><small>{t("باقات برندة", "Branda plans")}</small><h3>{plan.name}</h3><p>{plan.description || t("أدوات تناسب نشاطك في باقة واحدة", "Tools for your business in one plan")}</p>
          <div className={s.price}><strong dir="ltr">{money(plan.priceMonthly)}</strong><SaudiRiyal className={s.riyal} aria-label={t("ريال سعودي", "Saudi riyal")} /><span>{t("/ شهر", "/ month")}</span></div>
          <p className={s.annual}>{quarter && quarter.discountPercent > 0 ? t(`خصم ${quarter.discountPercent}% لثلاثة أشهر`, `${quarter.discountPercent}% off three months`) : t("اشتراك شهر أو ثلاثة أشهر", "One or three months")}{quarter && <span className={s.quarterTotal}>{t("إجمالي ثلاثة أشهر", "Three-month total")} <bdi>{money(quarter.totalAmount)}</bdi> <SaudiRiyal className={s.riyal} aria-label={t("ريال سعودي", "Saudi riyal")} /></span>}</p>
          <a href="#contact" onClick={() => choosePlan(plan.name)} className={s.primary}>{t("اختر", "Choose")} {plan.name}</a>
          <div className={s.planList}><b>{t("تشمل:", "Includes:")}</b><ul>{visible(plan).map(feature => <li key={feature.id}><Check size={15} aria-hidden="true" />{t(feature.label, labels.get(feature.id) ?? feature.label)}</li>)}<li><Check size={15} aria-hidden="true" />{t("منتجات غير محدودة", "Unlimited products")}</li>{Boolean(plan.trialDays) && <li><Check size={15} aria-hidden="true" />{t(`تجربة ${plan.trialDays} أيام`, `${plan.trialDays}-day trial`)}</li>}</ul></div>
        </article>;
      })}</div>
      <div className={s.comparison}><h3>{t("قارن بين الباقات", "Compare plans")}</h3><div className={s.tableScroll} tabIndex={0} role="region" aria-label={t("مقارنة مزايا الباقات", "Plan features comparison")}><table><thead><tr><th scope="col">{t("الميزة", "Feature")}</th>{plans.map(plan => <th scope="col" key={plan.id}><b>{plan.name}</b><small>{money(plan.priceMonthly)} <SaudiRiyal className={s.riyal} aria-label={t("ريال سعودي", "Saudi riyal")} /> {t("/ شهر", "/ month")}</small></th>)}</tr></thead><tbody>{features.map(feature => <tr key={feature.id}><th scope="row">{t(feature.label, labels.get(feature.id) ?? feature.label)}</th>{plans.map(plan => <td key={plan.id}>{plan.features.some(item => item.id === feature.id) ? <><Check aria-hidden="true" size={17} /><span className={s.srOnly}>{t("مشمول", "Included")}</span></> : <><span aria-hidden="true">—</span><span className={s.srOnly}>{t("غير مشمول", "Not included")}</span></>}</td>)}</tr>)}<tr><th scope="row">{t("المنتجات", "Products")}</th>{plans.map(plan => <td key={plan.id}>{t("بلا حد", "Unlimited")}</td>)}</tr></tbody><tfoot><tr><td />{plans.map(plan => <td key={plan.id}><a href="#contact" onClick={() => choosePlan(plan.name)} className={s.primary}>{t("اختر", "Choose")}</a></td>)}</tr></tfoot></table></div><p>{t("راجع تفاصيل الأدوات في كل باقة، واختر ما يناسب احتياجات نشاطك اليوم", "Compare the tools in each plan and choose what your business needs today")}</p></div>
    </>}
    <p className={s.helpChoosing}>{t("تحتاج مساعدة في الاختيار؟", "Need help choosing?")} <a href="#contact">{t("تواصل معنا", "Contact us")}</a> {t("وفريقنا يساعدك على تحديد الباقة المناسبة لنشاطك", "and our team will help you find the right fit")}</p>
  </div></section>;
}
