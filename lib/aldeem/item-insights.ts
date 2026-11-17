import type { AldeemItemCard } from "./item-card";

export type AldeemItemInsights = {
  dailyDemand: number | null;
  monthlyForecast: number | null;
  remainingDemand: number | null;
  suggestedOrder: number | null;
  availableToPlan: number;
  incoming: number | null;
  remainingDays: number;
  turnoverRatio: number | null;
  turnoverDays: number | null;
  stockCoverDays: number | null;
  confidence: "baseline" | "limited" | "insufficient";
  notes: string[];
  discount: { decision: "review" | "keep" | "insufficient" | "quarantine"; title: string; reason: string; atRiskQuantity: number };
};

const round = (n: number) => Math.round(n * 1000) / 1000;
const orderRound = (n: number) => Math.max(0, Math.ceil(n * 1000 - 1e-8) / 1000);

/** Transparent last-calendar-month baseline, never a purchase or price mutation. */
export function deriveAldeemItemInsights(card: AldeemItemCard): AldeemItemInsights {
  const { previousMonth: previous, currentMonth: current, stock } = card.analyticsRaw;
  const netUnits = Math.max(0, previous.sold - previous.returned);
  const remainingDays = Math.max(0, current.days - current.elapsedDays + 1);
  const dailyDemand = previous.days > 0 && netUnits > 0 ? netUnits / previous.days : null;
  const complete = previous.historyComplete && previous.historyDays >= previous.days && previous.days > 0;
  const confidence = dailyDemand === null ? "insufficient" : complete ? "baseline" : "limited";
  const availableToPlan = Math.max(0, stock.usable - stock.reserved);
  const monthlyForecast = dailyDemand === null ? null : round(dailyDemand * current.days);
  const remainingDemand = dailyDemand === null ? null : round(dailyDemand * remainingDays);
  const incoming = stock.onOrder;
  // Unknown inbound commitments or expiry must be resolved before recommending a buy quantity.
  const suggestedOrder = confidence === "baseline" && dailyDemand !== null && incoming !== null && stock.expiryUnknown <= 0 && stock.onHand >= 0
    ? orderRound(dailyDemand * remainingDays - availableToPlan - Math.max(0, incoming)) : null;
  const turnoverRatio = complete && previous.averageDailyStock !== null && previous.averageDailyStock > 0 && netUnits > 0
    ? netUnits / previous.averageDailyStock : null;
  const turnoverDays = turnoverRatio === null ? null : previous.days / turnoverRatio;
  const stockCoverDays = dailyDemand === null ? null : availableToPlan / dailyDemand;
  const notes = [
    "التقدير يفترض استمرار متوسط مبيعات الشهر الماضي بعد المرتجعات دون أثر موسمي أو ترويجي",
    "الكمية المقترحة لبقية الشهر تشمل اليوم وتخصم الرصيد القابل للبيع بعد الحجوزات والكميات المؤكدة المنتظرة",
    "راجع مدة التوريد وصلاحية الدفعة القادمة وحجم عبوة المورد قبل اعتماد الطلب",
  ];
  if (!complete) notes.push("سجل المخزون لا يغطي الشهر الماضي كاملًا لذلك لا نعتمد كمية طلب نهائية");
  if (dailyDemand === null) notes.push("لا توجد مبيعات صافية موجبة كافية في الشهر الماضي لتقدير الطلب");
  if (previous.returned > previous.sold) notes.push("مرتجعات الشهر تجاوزت مبيعاته وقد تخص فواتير أقدم لذلك تحتاج الحركة مراجعة");
  if (incoming === null) notes.push("تعذر تحديد الكميات المنتظرة من أوامر الشراء بدقة ويجب تأكيدها قبل تحديد الطلب");
  if (stock.expiryUnknown > 0) notes.push("يوجد رصيد بلا تاريخ صلاحية موثق راجع دفعاته قبل اعتماد الكمية المقترحة أو الخصم");
  if (stock.onHand < 0) notes.push("الرصيد سالب ويحتاج تسوية موثقة قبل الاعتماد على التوصية");

  const expiring = card.lots.filter(lot => lot.quantity > 0 && lot.daysRemaining !== null && lot.daysRemaining >= 0)
    .sort((a, b) => a.daysRemaining! - b.daysRemaining!);
  let cumulative = 0, atRiskQuantity = 0;
  if (dailyDemand !== null) for (const lot of expiring) {
    cumulative += lot.quantity;
    atRiskQuantity = Math.max(atRiskQuantity, cumulative - dailyDemand * (lot.daysRemaining! + 1));
  }
  atRiskQuantity = round(Math.max(0, atRiskQuantity));
  let discount: AldeemItemInsights["discount"];
  if (stock.expired > 0) {
    discount = { decision: "quarantine", title: "اعزل الكميات المنتهية", reason: "الكميات المنتهية مستبعدة من خطة البيع ولا يعالجها تخفيض السعر راجع بقية الدفعات الصالحة منفصلة", atRiskQuantity };
  } else if (confidence !== "baseline" || stock.expiryUnknown > 0) {
    discount = { decision: "insufficient", title: "يلزم استكمال البيانات قبل قرار الخصم", reason: "نحتاج سجل مبيعات كافيًا وصلاحية موثقة للرصيد لتقدير خطر بقاء المنتج", atRiskQuantity };
  } else if (atRiskQuantity > 0) {
    discount = { decision: "review", title: "راجع خصمًا للدفعات القريبة من الانتهاء", reason: "المبيعات بالمعدل السابق قد لا تصرّف الكمية قبل انتهاء صلاحيتها راجع التكلفة والهامش وحد السعر قبل تحديد النسبة", atRiskQuantity };
  } else if (stockCoverDays !== null && stockCoverDays > current.days * 2) {
    discount = { decision: "review", title: "راجع تنشيط المبيعات قبل زيادة الطلب", reason: "الرصيد يغطي أكثر من شهرين بالمعدل السابق جرّب التحويل لفرع أسرع أو عرضًا مدروسًا بعد مراجعة الهامش", atRiskQuantity };
  } else {
    discount = { decision: "keep", title: "لا يظهر احتياج واضح للخصم حاليًا", reason: "لا تشير المبيعات والصلاحية المسجلة إلى فائض قريب من الانتهاء هذا تقدير للمراجعة وليس ضمانًا للمبيعات", atRiskQuantity };
  }
  return { dailyDemand, monthlyForecast, remainingDemand, suggestedOrder, availableToPlan, incoming, remainingDays,
    turnoverRatio, turnoverDays, stockCoverDays, confidence, notes, discount };
}
