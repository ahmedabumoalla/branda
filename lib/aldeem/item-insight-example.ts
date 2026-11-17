import type { AldeemItemCard } from "./item-card";

/** Presentation-only inputs: never passed to a save action or merged into the live card. */
export function itemInsightExample(card: AldeemItemCard): AldeemItemCard {
  const previous = card.analyticsRaw.previousMonth;
  const current = card.analyticsRaw.currentMonth;
  return {
    ...card,
    lots: [
      { id: "example-near", lot: "مثال قريب الانتهاء", serial: "", warehouseId: "example", warehouse: "مستودع توضيحي", quantity: 180, expiresOn: null, daysRemaining: 1 },
      { id: "example-later", lot: "مثال صالح", serial: "", warehouseId: "example", warehouse: "مستودع توضيحي", quantity: 140, expiresOn: null, daysRemaining: 30 },
    ],
    analyticsRaw: {
      previousMonth: { ...previous, sold: previous.days * 60 + 60, returned: 60, netSales: previous.days * 60, averageDailyStock: 900, historyDays: previous.days, historyComplete: true, activeSalesDays: previous.days },
      currentMonth: { ...current, sold: Math.max(0, current.elapsedDays - 1) * 60, returned: 0, netSales: Math.max(0, current.elapsedDays - 1) * 60 },
      stock: { onHand: 320, reserved: 20, expired: 0, expiryUnknown: 0, usable: 320, onOrder: 120 },
    },
  };
}
