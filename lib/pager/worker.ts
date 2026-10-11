import "server-only";
import { authorizePagerDispatch, claimPagerMessages, finishPagerMessage } from "@/lib/data/pager";
import { isGreenApiConfigured, sendGreenApiPagerMessage } from "@/lib/whatsapp/green-api";
import type { PagerMessageJob } from "./types";

export function pagerMessageText(job: PagerMessageJob) {
  if (job.kind === "rating") {
    if (!job.feedbackToken || !/^[0-9a-f]{64}$/.test(job.feedbackToken)) throw new Error("PAGER_FEEDBACK_TOKEN_MISSING");
    return `شكرًا لزيارتك ${job.brandName}\nتم استلام الطلب رقم ${job.invoiceNumber}\nيسعدنا تقييمك للخدمة وملاحظاتك\nhttps://barndaksa.com/pager/feedback/${job.feedbackToken}\n\nأُرسلت عبر برندة نيابة عن ${job.brandName}`;
  }
  return `${job.brandName}\nطلبك رقم ${job.invoiceNumber} جاهز للاستلام\nتفضل إلى نقطة الاستلام\nيتوقف التذكير عند تسجيل الموظف استلام الطلب\n\nأُرسلت عبر برندة نيابة عن ${job.brandName}`;
}

/** Durable SQL leases handle overlapping cron/action invocations */
export async function runPagerMessageJobs(limit = 100) {
  if (!isGreenApiConfigured()) throw new Error("PAGER_PROVIDER_NOT_CONFIGURED");
  const maximum = Number.isFinite(limit) ? Math.max(1, Math.min(Math.trunc(limit), 100)) : 100;
  const startedAt = Date.now();
  const result = { claimed: 0, queued: 0, skipped: 0, failed: 0 };
  // Only start a new batch within fifteen seconds Each claimed batch has four
  // waves of at most ten provider seconds and stays within its ninety-second lease
  while (result.claimed < maximum && Date.now() - startedAt < 15_000) {
    const jobs = await claimPagerMessages(Math.min(20, maximum - result.claimed));
    if (!jobs.length) break;
    result.claimed += jobs.length;
    for (let offset = 0; offset < jobs.length; offset += 5) {
      await Promise.all(jobs.slice(offset, offset + 5).map(async job => {
        try {
          const message = pagerMessageText(job);
          if (!await authorizePagerDispatch(job.id, job.leaseToken)) { result.skipped++; return; }
          let providerId: string;
          try { providerId = (await sendGreenApiPagerMessage({ phone: job.phone, message })).providerMessageId; }
          catch {
            await finishPagerMessage(job.id, job.leaseToken, { error: "provider_send_failed" });
            result.failed++;
            return;
          }
          // Do not mark a successful external send as failed if persistence fails
          await finishPagerMessage(job.id, job.leaseToken, { providerId });
          result.queued++;
        } catch { result.failed++; }
      }));
    }
  }
  return result;
}
