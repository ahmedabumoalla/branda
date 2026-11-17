import "server-only";

type Welcome = { id: string; claimToken: string; cafeId: string; brandName: string; phone: string; stamps: number; reward: string };
const line = (value: string) => value.replace(/[\r\n\u0000-\u001f]/g, " ").trim().slice(0, 180);

export function walletWelcomeMessage(job: Welcome) {
  return [
    `يا هلا فيك في ${line(job.brandName)} 🌿`,
    "سعداء بانضمامك لبرنامج الولاء وبطاقتك جاهزة معك",
    `اجمع ${job.stamps} أختام واستمتع بمكافأتك: ${line(job.reward)}`,
    "في زيارتك القادمة اعرض بطاقة الولاء للكاشير لتسجيل ختمك",
    "نورتنا ونتشرف بزيارتك 🤍",
  ].join("\n\n");
}

/** Standalone welcome messages are disabled; card-link delivery is independent. */
export async function dispatchWalletWelcomes(_cardId?: string, _limit = 1) {
  return { processed: 0, queued: 0, rejected: 0, unknown: 0, deferred: false, disabled: true };
}

export async function welcomeAfterWalletDownload(_cardId: string) {
  // Downloading a card must not send a separate welcome message.
}
