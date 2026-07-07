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

export async function getOwnerCompanyAccountsDashboard(): Promise<V1FeatureDashboardData> {
  return getOwnerV1FeatureDashboard({
    featureId: "company_accounts",
    title: "حسابات الشركات",
    badge: "Company Accounts v1",
    summary: "تحليل وتجهيز فقط، بدون إنشاء شركات أو أرصدة موظفين أو عمليات مالية.",
    disabledActionLabel: "إنشاء حساب شركة — قريبًا",
    tableTitle: "منتجات مناسبة للشركات",
    sourceTables: ["orders", "order_items", "menu_products", "customer_profiles", "loyalty_cards"],
    build: (facts) => ({
      metrics: [
        {
          label: "طلبات آخر 30 يومًا",
          value: missing(facts, "orders") ? null : metricValue(facts.ordersLast30),
          hint: "مؤشر نشاط قبل استقبال طلبات شركات",
        },
        {
          label: "العملاء المتكررون",
          value: missing(facts, "orders") ? null : metricValue(facts.repeatCustomers),
          hint: "يساعد في تقدير الطلب المتكرر",
        },
        {
          label: "منتجات مناسبة للشركات",
          value: missing(facts, "order_items") || missing(facts, "menu_products") ? null : metricValue(facts.productSignals.length),
          hint: "من المنتجات الأكثر ظهورًا في الطلبات",
        },
        {
          label: "عملاء الولاء",
          value: missing(facts, "loyalty_cards") ? null : metricValue(facts.loyaltyCustomerCount),
          hint: "مؤشر جمهور متكرر محتمل",
        },
      ],
      readiness: buildReadiness([
        {
          ok: facts.ordersLast30 > 0,
          yes: "توجد طلبات حديثة تدعم اختبار طلبات الشركات لاحقًا.",
          no: "تحتاج العلامة إلى طلبات حديثة أكثر.",
        },
        {
          ok: facts.repeatCustomers > 0,
          yes: "يوجد تكرار عملاء يمكن الاستفادة منه في باقات الشركات.",
          no: "لا يظهر تكرار كاف للعملاء.",
        },
        {
          ok: facts.productSignals.length > 0,
          yes: "توجد منتجات مباعة يمكن اقتراحها للشركات.",
          no: "لا توجد منتجات مباعة كافية للتحليل.",
        },
        {
          ok: facts.loyaltyCustomerCount > 0,
          yes: "وجود الولاء يساعد في قياس الاستخدام المتكرر.",
          no: "لا توجد بيانات ولاء كافية.",
        },
      ]),
      suggestions: [
        {
          title: "باقة موظفين صباحية",
          description: "اقتراح باقة موجهة للفرق الصغيرة.",
          reason: facts.productSignals[0] ? `منتج مرشح: ${facts.productSignals[0].name}.` : "لا توجد بيانات كافية",
          actionLabel: "إنشاء حساب شركة — قريبًا",
        },
        {
          title: "رصيد شهري للشركات",
          description: "تصور مستقبلي لرصيد شهري دون تفعيل رصيد فعلي.",
          reason: facts.repeatCustomers > 0 ? `يوجد ${facts.repeatCustomers} عميل متكرر.` : "لا توجد بيانات كافية",
          actionLabel: "إعداد رصيد — قريبًا",
        },
        {
          title: "كوبونات فرق العمل",
          description: "اقتراح فقط لكوبونات داخلية مستقبلية.",
          reason: facts.ordersLast30 > 0 ? "توجد طلبات حديثة يمكن البناء عليها." : "لا توجد بيانات كافية",
          actionLabel: "تجهيز كوبونات — قريبًا",
        },
        {
          title: "تقرير استخدام شهري",
          description: "تقرير مستقبلي للاستخدام دون إنشاء عمليات مالية.",
          reason: facts.orders.length > 0 ? "توجد طلبات يمكن تحليلها." : "لا توجد بيانات كافية",
          actionLabel: "تجهيز التقرير — قريبًا",
        },
      ],
      tableRows: facts.productSignals.slice(0, 10).map((product) => ({
        id: product.id,
        name: product.name,
        metric: `${product.quantity} وحدة`,
        detail: "منتج متكرر يمكن اختباره للشركات مستقبلًا.",
      })),
    }),
  });
}
