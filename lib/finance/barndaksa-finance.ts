export const BARNDAKSA_OWNERS = [
  { name: "احمد ابومعلا", ownershipPercent: 30 },
  { name: "عبدالله ابومعلا", ownershipPercent: 30 },
  { name: "ماهر الشريف", ownershipPercent: 10 },
  { name: "ماجد مجرشي", ownershipPercent: 30 },
] as const;

export const VAT_PERCENT = 15;

export function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function netOfVat(grossAmount: number) {
  return roundMoney((Number(grossAmount) || 0) / 1.15);
}

export function vatFromInclusive(grossAmount: number) {
  return roundMoney((Number(grossAmount) || 0) - netOfVat(grossAmount));
}

export function representativeRateByPaidAge(monthsFromFirstPaid: number | null) {
  if (monthsFromFirstPaid == null) return 0;
  if (monthsFromFirstPaid < 6) return 40;
  if (monthsFromFirstPaid < 12) return 20;
  return 0;
}

export function ownerRateByPaidAge(monthsFromFirstPaid: number | null) {
  if (monthsFromFirstPaid == null) return 0;
  if (monthsFromFirstPaid < 12) return 5;
  return 10;
}

export function platformCapitalReserveRateByPaidAge(monthsFromFirstPaid: number | null) {
  if (monthsFromFirstPaid == null) return 100;
  if (monthsFromFirstPaid < 6) return 40;
  return 60;
}

export function calculateSubscriptionSplit(input: {
  grossAmount: number;
  hasRepresentativeCoupon: boolean;
  monthsFromFirstPaid: number | null;
}) {
  const netAmount = netOfVat(input.grossAmount);
  const vatAmount = vatFromInclusive(input.grossAmount);
  const representativeRate = input.hasRepresentativeCoupon
    ? representativeRateByPaidAge(input.monthsFromFirstPaid)
    : 0;
  const ownerRateEach = ownerRateByPaidAge(input.monthsFromFirstPaid);
  const ownersTotalRate = ownerRateEach * 4;
  const platformRate = input.hasRepresentativeCoupon
    ? platformCapitalReserveRateByPaidAge(input.monthsFromFirstPaid)
    : Math.max(0, 100 - ownersTotalRate);
  const representativeAmount = roundMoney(netAmount * representativeRate / 100);
  const ownerAmountEach = roundMoney(netAmount * ownerRateEach / 100);
  const platformCapitalReserveAmount = roundMoney(netAmount * platformRate / 100);

  return {
    grossAmount: input.grossAmount,
    netAmount,
    vatAmount,
    representativeRate,
    representativeAmount,
    platformRate,
    platformCapitalReserveAmount,
    ownerRateEach,
    ownerAmountEach,
    ownersTotalRate,
    ownersTotalAmount: roundMoney(ownerAmountEach * 4),
  };
}

export const VALUATION_METHODS = [
  {
    key: "arr",
    title: "مضاعف الإيراد السنوي المتكرر ARR",
    weight: 35,
    description:
      "يعتمد على الاشتراكات المدفوعة والمتكررة في المنصة ويحوّلها إلى إيراد سنوي ثم يطبق مضاعف SaaS مناسب لمرحلة مبكرة.",
  },
  {
    key: "growth",
    title: "معدل النمو والاحتفاظ",
    weight: 20,
    description:
      "يركز على سرعة نمو العلامات المدفوعة وتجديد الاشتراكات وتراجع الاعتماد على التشغيل اليدوي.",
  },
  {
    key: "market",
    title: "حجم السوق وقابلية التوسع",
    weight: 20,
    description:
      "يقيس قابلية برندة للتوسع خارج المقاهي إلى قطاعات التجزئة والخدمات مع نفس بنية الولاء والحجوزات والعروض.",
  },
  {
    key: "product",
    title: "نضج المنتج والبنية التقنية",
    weight: 15,
    description:
      "يشمل قوة النظام، Supabase RLS، الدفع، الولاء، الحجوزات، الكاشير، المناديب، وتجربة العميل النهائية.",
  },
  {
    key: "risk",
    title: "خصم مخاطر المرحلة المبكرة",
    weight: 10,
    description:
      "يخفض التقييم بحسب مخاطر الاعتماد على العملاء الأوائل، الدفع، التحقق من الدومين، وسرعة التحصيل.",
  },
] as const;
