"use client";

import { useEffect, useId, useState } from "react";
import { History, RefreshCw } from "lucide-react";
import { campaignHistoryPageSchema, campaignHistoryPageSize, marketingCampaignStatusLabels, type CampaignHistoryPage } from "@/lib/analytics/marketing-report";
import styles from "./marketing-campaign-history.module.css";

const number = (value: number) => value.toLocaleString("ar-SA");
const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value)) : "غير محدد";

export function MarketingCampaignHistoryList({ data }: { data: CampaignHistoryPage }) {
  if (!data.campaigns.length) return <p className={styles.empty}>{data.total ? "لا توجد حملات في هذه الصفحة ارجع إلى الصفحة السابقة" : "لا توجد حملات أنشئت خلال الفترة المحمّلة"}</p>;
  return <ol className={styles.list}>{data.campaigns.map(campaign => <li className={styles.campaign} key={campaign.id}>
    <div className={styles.meta}><time dateTime={campaign.createdAt}>{date(campaign.createdAt)}</time><span className={styles.status} data-status={campaign.status}>{marketingCampaignStatusLabels[campaign.status]}</span></div>
    <h3 dir="auto">{campaign.title}</h3>
    {campaign.mediaKind && <span className={styles.attachment}>{campaign.mediaKind === "image" ? "صورة مرفقة" : "فيديو مرفق"}</span>}
    <p className={styles.body} dir="auto">{campaign.body}</p>
    <p className={styles.schedule}>موعد بدء الإرسال <time dateTime={campaign.scheduledAt}>{date(campaign.scheduledAt)}</time></p>
    <dl className={styles.metrics}>{([
      ["العملاء المستهدفون", campaign.total], ["إرسال مقبول", campaign.sent], ["بانتظار الإرسال", campaign.pending], ["تعذر الإرسال", campaign.failed],
    ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{number(value)}</dd></div>)}</dl>
    <dl className={styles.otherStates}><div><dt>لم يتأكد الإرسال</dt><dd>{number(campaign.uncertain)}</dd></div><div><dt>ملغاة</dt><dd>{number(campaign.cancelled)}</dd></div><div><dt>مستبعدة</dt><dd>{number(campaign.suppressed)}</dd></div></dl>
  </li>)}</ol>;
}

type Props = { brandId: string; brandName: string; from: string | null; to: string | null };

export function MarketingCampaignHistory({ brandId, brandName, from, to }: Props) {
  const headingId = useId();
  const identity = JSON.stringify([brandId, from, to]);
  const [cursor, setCursor] = useState({ identity, page: 0 });
  const [revision, setRevision] = useState(0);
  const page = cursor.identity === identity ? cursor.page : 0;
  const requestKey = JSON.stringify([identity, page, revision]);
  const [result, setResult] = useState<{ key: string; data: CampaignHistoryPage | null; error: string } | null>(null);
  const busy = result?.key !== requestKey;
  const data = !busy ? result?.data : null;
  const error = !busy ? result?.error : "";

  useEffect(() => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
    async function load() {
      try {
        const params = new URLSearchParams({ brandId, page: String(page) });
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const response = await fetch(`/api/admin/marketing-campaigns/history?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("History unavailable");
        const next = campaignHistoryPageSchema.parse(await response.json());
        if (next.page !== page) throw new Error("Unexpected history page");
        if (!controller.signal.aborted) setResult({ key: requestKey, data: next, error: "" });
      } catch {
        if (!controller.signal.aborted || timedOut) setResult({ key: requestKey, data: null, error: "تعذر تحميل الحملات تحقق من اتصالك وصلاحية دخولك ثم أعد المحاولة" });
      } finally { window.clearTimeout(timer); }
    }
    void load();
    return () => { timedOut = false; window.clearTimeout(timer); controller.abort(); };
  }, [brandId, from, to, page, requestKey]);

  function navigate(next: number) {
    setCursor({ identity, page: next });
    setRevision(value => value + 1);
  }

  return <section className={styles.history} aria-labelledby={headingId} dir="rtl">
    <header className={styles.heading}><div><h2 id={headingId}><History size={20} aria-hidden="true" />سجل الحملات التسويقية</h2><p>{brandName}</p></div><button type="button" disabled={busy} onClick={() => navigate(0)}><RefreshCw size={16} aria-hidden="true" />تحديث السجل</button></header>
    <p className={styles.period}>الفترة المحمّلة <bdi>{from || "بداية السجل"}</bdi> — <bdi>{to || "حتى الآن"}</bdi></p>
    <p className={styles.note}>الحملات حسب تاريخ إنشائها بتوقيت السعودية والحالات تعكس آخر وضع مسجّل يشمل السجل الحملات المجدولة التي لم يحن موعدها</p>
    <div aria-live="polite" aria-busy={busy}>
      {busy && <p className={styles.feedback} role="status">جارٍ تحميل سجل الحملات</p>}
      {error && <div className={styles.feedback} role="alert"><p>{error}</p><button type="button" onClick={() => navigate(page)}>إعادة المحاولة</button></div>}
      {data && <><p className={styles.total}>عدد الحملات <strong>{number(data.total)}</strong></p><MarketingCampaignHistoryList data={data} /></>}
    </div>
    {data && <nav className={styles.pagination} aria-label="صفحات سجل الحملات"><button type="button" disabled={data.page === 0} onClick={() => navigate(data.page - 1)}>السابق</button><span>صفحة {number(data.page + 1)} من {number(Math.max(1, Math.ceil(data.total / campaignHistoryPageSize)))}</span><button type="button" disabled={(data.page + 1) * campaignHistoryPageSize >= data.total} onClick={() => navigate(data.page + 1)}>التالي</button></nav>}
    <p className={styles.note}>الإرسال المقبول يعني قبول مزوّد الخدمة للرسالة ولا يثبت وصولها أو قراءتها الرسائل غير المؤكدة والملغاة والمستبعدة حالات مستقلة عن تعذر الإرسال</p>
  </section>;
}
