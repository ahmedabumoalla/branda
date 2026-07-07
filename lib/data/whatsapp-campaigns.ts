import {
  buildReadiness,
  getOwnerV1FeatureDashboard,
  metricValue,
  type V1Facts,
  type V1FeatureDashboardData,
} from "@/lib/data/feature-v1-readiness";

function missing(facts: V1Facts, table: string) {
  return facts.missingSources.includes(table);
}

export async function getOwnerWhatsappCampaignsDashboard(): Promise<V1FeatureDashboardData> {
  return getOwnerV1FeatureDashboard({
    featureId: "whatsapp_campaigns",
    title: "حملات واتساب",
    badge: "WhatsApp Campaigns v1",
    summary: "تجهيز وتحليل فقط، بدون إرسال رسائل أو Meta API أو تخزين حملات.",
    disabledActionLabel: "إنشاء حملة واتساب — قريبًا",
    alert: "الإرسال الفعلي غير مفعّل في هذه النسخة.",
    tableTitle: "شرائح مقترحة للحملات",
    sourceTables: ["customer_profiles", "orders", "loyalty_cards", "loyalty_card_events", "customer_reward_redemptions"],
    build: (facts) => ({
      metrics: [
        {
          label: "العملاء المتكررون",
          value: missing(facts, "orders") ? null : metricValue(facts.repeatCustomers),
          hint: "لا يتم استخدام الأرقام للإرسال",
        },
        {
          label: "عملاء معرضون للفقد",
          value: missing(facts, "orders") ? null : metricValue(facts.atRiskCustomers),
          hint: "حسب نشاط سابق دون نشاط آخر 30 يومًا",
        },
        {
          label: "عملاء الولاء",
          value: missing(facts, "loyalty_cards") ? null : metricValue(facts.loyaltyCustomerCount),
          hint: "قراءة فقط من بطاقات الولاء",
        },
        {
          label: "مكافآت مصروفة",
          value: missing(facts, "customer_reward_redemptions") ? null : metricValue(facts.rewardRedemptions.length),
          hint: "مؤشر للتفاعل مع المزايا",
        },
      ],
      readiness: buildReadiness([
        {
          ok: facts.repeatCustomers > 0,
          yes: "يوجد عملاء متكررون يمكن تحليلهم لحملات مستقبلية.",
          no: "لا يظهر تكرار كاف للعملاء.",
        },
        {
          ok: facts.atRiskCustomers > 0,
          yes: "توجد شريحة استرجاع محتملة.",
          no: "لا توجد شريحة فقد واضحة من البيانات الحالية.",
        },
        {
          ok: facts.loyaltyCustomerCount > 0,
          yes: "عملاء الولاء متاحون كجمهور تحليلي.",
          no: "لا توجد بيانات ولاء كافية.",
        },
        {
          ok: facts.orders.length > 0,
          yes: "توجد طلبات يمكن استخدامها لتقدير الشرائح.",
          no: "تحتاج العلامة إلى طلبات أكثر قبل تجهيز الحملات.",
        },
      ]),
      suggestions: [
        {
          title: "استرجاع العملاء",
          description: "اقتراح حملة مستقبلية للعملاء غير النشطين.",
          reason: facts.atRiskCustomers > 0 ? `يوجد ${facts.atRiskCustomers} عميل معرض للفقد.` : "لا توجد بيانات كافية",
          actionLabel: "إنشاء حملة واتساب — قريبًا",
        },
        {
          title: "عرض نهاية الأسبوع",
          description: "اقتراح حملة عامة دون إرسال فعلي.",
          reason: facts.ordersLast30 > 0 ? "توجد طلبات حديثة يمكن تحليلها." : "لا توجد بيانات كافية",
          actionLabel: "تجهيز حملة — قريبًا",
        },
        {
          title: "مكافأة الولاء",
          description: "اقتراح مكافأة لعملاء الولاء مستقبلًا.",
          reason: facts.loyaltyCustomerCount > 0 ? `يوجد ${facts.loyaltyCustomerCount} عميل ولاء.` : "لا توجد بيانات كافية",
          actionLabel: "تجهيز حملة — قريبًا",
        },
        {
          title: "كوبون العملاء الجدد",
          description: "اقتراح فقط دون إنشاء كوبون أو رسالة.",
          reason: facts.orders.length > 0 ? "توجد طلبات يمكن مراقبة عملائها." : "لا توجد بيانات كافية",
          actionLabel: "تجهيز حملة — قريبًا",
        },
      ],
      tableRows: [
        {
          id: "repeat",
          name: "العملاء المتكررون",
          metric: String(facts.repeatCustomers),
          detail: "تحليل فقط دون إرسال أو استخدام أرقام.",
        },
        {
          id: "risk",
          name: "عملاء معرضون للفقد",
          metric: String(facts.atRiskCustomers),
          detail: "شريحة استرجاع مستقبلية.",
        },
        {
          id: "loyalty",
          name: "عملاء الولاء",
          metric: String(facts.loyaltyCustomerCount),
          detail: "مناسبة لمكافأة الولاء مستقبلًا.",
        },
      ],
    }),
  });
}
