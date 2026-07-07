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

export async function getOwnerAiMenuEngineerDashboard(): Promise<V1FeatureDashboardData> {
  return getOwnerV1FeatureDashboard({
    featureId: "ai_menu_engineer",
    title: "AI Menu Engineer",
    badge: "Rule-based v1",
    summary: "توصيات مبنية على قواعد فقط، بدون OpenAI أو API خارجي أو تعديل للمنيو.",
    disabledActionLabel: "تشغيل التحليل الذكي المتقدم — قريبًا",
    tableTitle: "منتجات حسب الطلب",
    sourceTables: ["orders", "order_items", "menu_products", "offers"],
    build: (facts) => {
      const top = facts.productSignals[0];
      const weak = facts.productSignals.length > 1 ? facts.productSignals[facts.productSignals.length - 1] : null;
      return {
        metrics: [
          {
            label: "منتجات أعلى طلبًا",
            value: missing(facts, "order_items") ? null : metricValue(facts.productSignals.length ? 1 : 0),
            hint: top ? top.name : "لا توجد بيانات كافية",
          },
          {
            label: "منتجات ضعيفة",
            value: missing(facts, "order_items") ? null : metricValue(weak ? 1 : 0),
            hint: weak ? weak.name : "لا توجد بيانات كافية",
          },
          {
            label: "طلبات آخر 30 يومًا",
            value: missing(facts, "orders") ? null : metricValue(facts.ordersLast30),
            hint: "مؤشر نشاط المنيو",
          },
          {
            label: "عدد المنتجات",
            value: missing(facts, "menu_products") ? null : metricValue(facts.products.length),
            hint: "لا يتم تعديل المنيو",
          },
        ],
        readiness: buildReadiness([
          {
            ok: facts.productSignals.length > 0,
            yes: "توجد بيانات طلبات منتجات تكفي لتوصيات قاعدية.",
            no: "لا توجد بيانات منتجات مباعة كافية.",
          },
          {
            ok: facts.ordersLast30 > 0,
            yes: "توجد طلبات حديثة تساعد على قراءة الأداء.",
            no: "تحتاج العلامة إلى طلبات حديثة أكثر.",
          },
          {
            ok: facts.products.length > 0,
            yes: "توجد منتجات يمكن تحليل تنظيمها.",
            no: "لا توجد منتجات كافية للتحليل.",
          },
          {
            ok: facts.offers.length > 0,
            yes: "توجد عروض يمكن ربطها بتحسين أداء المنيو لاحقًا.",
            no: "لا توجد عروض كافية لدعم المنتجات الضعيفة.",
          },
        ]),
        suggestions: [
          {
            title: "منتج عالي الطلب يستحق الإبراز",
            description: "توصية قاعدية لإبراز المنتج الأعلى طلبًا.",
            reason: top ? `${top.name} لديه ${top.quantity} وحدة مباعة.` : "لا توجد بيانات كافية",
            actionLabel: "تشغيل التحليل الذكي المتقدم — قريبًا",
          },
          {
            title: "منتج ضعيف يحتاج صورة أو عرض",
            description: "توصية قاعدية لتحسين منتج منخفض الطلب.",
            reason: weak ? `${weak.name} هو الأقل ظهورًا بين المنتجات المباعة.` : "لا توجد بيانات كافية",
            actionLabel: "اقتراح تحسين — قريبًا",
          },
          {
            title: "تنظيم المنيو",
            description: "إذا كثرت المنتجات، قد يحتاج المنيو إلى ترتيب أو تصنيف أوضح.",
            reason: facts.products.length > 20 ? `يوجد ${facts.products.length} منتج.` : "لا تظهر كثافة عالية في المنتجات.",
            actionLabel: "تنظيم المنيو — قريبًا",
          },
          {
            title: "الطلبات منخفضة، جرّب عرضًا محدودًا",
            description: "اقتراح قاعدي فقط عند انخفاض الطلبات الحديثة.",
            reason: facts.ordersLast30 < 5 ? "طلبات آخر 30 يومًا منخفضة." : "الطلبات الحديثة موجودة.",
            actionLabel: "تجهيز عرض — قريبًا",
          },
        ],
        tableRows: facts.productSignals.slice(0, 10).map((product) => ({
          id: product.id,
          name: product.name,
          metric: `${product.quantity} وحدة`,
          detail: product.hasImage && product.hasDescription ? "بيانات المنتج تبدو مكتملة." : "قد يحتاج صورة أو وصف أوضح.",
        })),
      };
    },
  });
}
