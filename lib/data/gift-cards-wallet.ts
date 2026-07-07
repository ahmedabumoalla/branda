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

export async function getOwnerGiftCardsWalletDashboard(): Promise<V1FeatureDashboardData> {
  return getOwnerV1FeatureDashboard({
    featureId: "gift_cards_wallet",
    title: "بطاقات الهدايا والرصيد",
    badge: "Gift Cards Wallet v1",
    summary: "تحليل جاهزية العلامة لبطاقات الهدايا والرصيد دون بيع أو إنشاء رصيد فعلي.",
    disabledActionLabel: "إنشاء بطاقة هدية — قريبًا",
    tableTitle: "مؤشرات الولاء والمكافآت",
    sourceTables: [
      "orders",
      "customer_profiles",
      "loyalty_cards",
      "loyalty_card_events",
      "customer_reward_redemptions",
      "customer_reward_instances",
    ],
    build: (facts) => ({
      metrics: [
        {
          label: "عملاء الولاء",
          value: missing(facts, "loyalty_cards") ? null : metricValue(facts.loyaltyCustomerCount),
          hint: "من بطاقات الولاء المرتبطة بالعلامة",
        },
        {
          label: "المكافآت المصروفة",
          value: missing(facts, "customer_reward_redemptions") ? null : metricValue(facts.rewardRedemptions.length),
          hint: "قراءة فقط من سجل صرف المكافآت",
        },
        {
          label: "مكافآت متاحة أو منشأة",
          value: missing(facts, "customer_reward_instances") ? null : metricValue(facts.rewardInstances.length),
          hint: "لا يتم إنشاء أي رصيد جديد",
        },
        {
          label: "طلبات آخر 30 يومًا",
          value: missing(facts, "orders") ? null : metricValue(facts.ordersLast30),
          hint: "مؤشر نشاط يساعد في تقدير الجاهزية",
        },
      ],
      readiness: buildReadiness([
        {
          ok: facts.ordersLast30 > 0,
          yes: "توجد طلبات حديثة يمكن استخدامها لقياس الطلب على بطاقات الهدايا.",
          no: "تحتاج العلامة إلى طلبات حديثة أكثر قبل إطلاق بطاقات الهدايا.",
        },
        {
          ok: facts.loyaltyCustomerCount > 0,
          yes: "وجود عملاء ولاء يساعد على اختبار الرصيد مستقبلًا.",
          no: "غياب عملاء الولاء يقلل وضوح جمهور بطاقات الهدايا.",
        },
        {
          ok: facts.rewardRedemptions.length > 0,
          yes: "توجد مكافآت مصروفة، وهذا يشير إلى تقبل العملاء للمزايا.",
          no: "لا توجد مكافآت مصروفة كافية لقياس سلوك الاستفادة.",
        },
        {
          ok: facts.repeatCustomers > 0,
          yes: "يوجد عملاء متكررون يمكن التفكير في رصيد مسبق لهم لاحقًا.",
          no: "لا يظهر تكرار كاف للعملاء حتى الآن.",
        },
      ]),
      suggestions: [
        {
          title: "بطاقة هدية 50 ريال",
          description: "اقتراح قيمة خفيفة مناسبة للتجربة الأولى.",
          reason: facts.ordersLast30 > 0 ? `يوجد ${facts.ordersLast30} طلب خلال آخر 30 يومًا.` : "لا توجد بيانات كافية",
          actionLabel: "إنشاء بطاقة هدية — قريبًا",
        },
        {
          title: "بطاقة هدية 100 ريال",
          description: "اقتراح قيمة أعلى للهدايا المتكررة.",
          reason: facts.repeatCustomers > 0 ? `يوجد ${facts.repeatCustomers} عميل متكرر.` : "لا توجد بيانات كافية",
          actionLabel: "إنشاء بطاقة هدية — قريبًا",
        },
        {
          title: "رصيد مسبق للعميل",
          description: "تصور مستقبلي لرصيد قابل للاستخدام داخل العلامة.",
          reason: facts.loyaltyCustomerCount > 0 ? `يوجد ${facts.loyaltyCustomerCount} عميل ولاء.` : "لا توجد بيانات كافية",
          actionLabel: "إنشاء رصيد — قريبًا",
        },
        {
          title: "باقة هدايا للشركات",
          description: "تجهيز تصور مبدئي لهدايا فرق العمل.",
          reason: facts.orders.length > 0 ? "توجد طلبات يمكن تحليلها قبل إطلاق الباقة." : "لا توجد بيانات كافية",
          actionLabel: "تجهيز باقة — قريبًا",
        },
      ],
      tableRows: [
        {
          id: "loyalty",
          name: "عملاء الولاء",
          metric: String(facts.loyaltyCustomerCount),
          detail: "أساس جيد لتجربة الرصيد مستقبلًا.",
        },
        {
          id: "redemptions",
          name: "المكافآت المصروفة",
          metric: String(facts.rewardRedemptions.length),
          detail: "مؤشر على تقبل العملاء للمزايا.",
        },
        {
          id: "orders",
          name: "طلبات آخر 30 يومًا",
          metric: String(facts.ordersLast30),
          detail: "لا يتم احتساب أي رصيد فعلي من هذه البيانات.",
        },
      ],
    }),
  });
}
