import {
  buildReadiness,
  decimalMetric,
  getOwnerV1FeatureDashboard,
  metricValue,
  type V1Facts,
  type V1FeatureDashboardData,
} from "@/lib/data/feature-v1-readiness";

function missing(facts: V1Facts, table: string) {
  return facts.missingSources.includes(table);
}

export async function getOwnerAdvancedDirectOrdersDashboard(): Promise<V1FeatureDashboardData> {
  return getOwnerV1FeatureDashboard({
    featureId: "advanced_direct_orders",
    title: "الطلبات المتقدمة",
    badge: "Advanced Direct Orders v1",
    summary: "تحليل أداء الطلبات فقط، بدون دفع أو تعديل حالات أو إنشاء طلبات.",
    disabledActionLabel: "إعدادات الطلبات المتقدمة — قريبًا",
    tableTitle: "أحدث الطلبات",
    sourceTables: ["orders", "order_items", "menu_products", "customer_profiles"],
    build: (facts) => {
      const dailyAverage = facts.ordersLast30 > 0 ? facts.ordersLast30 / 30 : null;
      return {
        metrics: [
          {
            label: "إجمالي الطلبات",
            value: missing(facts, "orders") ? null : metricValue(facts.orders.length),
            hint: "قراءة فقط من الطلبات الحالية",
          },
          {
            label: "الطلبات المقبولة",
            value: missing(facts, "orders") ? null : metricValue(facts.acceptedOrders),
            hint: "حسب حالات الطلبات الحالية",
          },
          {
            label: "الطلبات المرفوضة",
            value: missing(facts, "orders") ? null : metricValue(facts.rejectedOrders),
            hint: "بدون تعديل أي حالة",
          },
          {
            label: "طلبات آخر 30 يومًا",
            value: missing(facts, "orders") ? null : metricValue(facts.ordersLast30),
            hint: "نشاط الفترة الحالية",
          },
          {
            label: "متوسط الطلبات اليومي",
            value: missing(facts, "orders") ? null : decimalMetric(dailyAverage),
            hint: "محسوب من آخر 30 يومًا إن وجدت بيانات",
          },
        ],
        readiness: buildReadiness([
          {
            ok: facts.orders.length > 0,
            yes: "توجد طلبات فعلية يمكن تحليلها.",
            no: "تحتاج العلامة إلى طلبات قبل تقييم الطلبات المتقدمة.",
          },
          {
            ok: facts.productSignals.length > 0,
            yes: "توجد منتجات مباعة يمكن إبرازها في تجربة الطلب.",
            no: "لا توجد بيانات منتجات مباعة كافية.",
          },
          {
            ok: facts.acceptedOrders > 0,
            yes: "توجد طلبات مقبولة يمكن استخدامها لفهم التدفق.",
            no: "لا توجد طلبات مقبولة كافية للتحليل.",
          },
          {
            ok: facts.repeatCustomers > 0,
            yes: "يوجد عملاء متكررون يمكن تحسين تجربتهم لاحقًا.",
            no: "لا يظهر تكرار كاف للعملاء بعد.",
          },
        ]),
        suggestions: [
          {
            title: "تفعيل كوبون للطلبات المتكررة",
            description: "اقتراح فقط لتحسين تكرار الطلبات مستقبلًا.",
            reason: facts.repeatCustomers > 0 ? `يوجد ${facts.repeatCustomers} عميل متكرر.` : "لا توجد بيانات كافية",
            actionLabel: "إعدادات الطلبات المتقدمة — قريبًا",
          },
          {
            title: "تحسين وصف المنتجات",
            description: "تحسين الوصف قد يساعد العملاء قبل الطلب.",
            reason: facts.products.some((product) => !product.description) ? "توجد منتجات بلا وصف واضح." : "لا توجد فجوة وصف واضحة.",
            actionLabel: "تحسين المنيو — قريبًا",
          },
          {
            title: "إبراز المنتجات الأعلى طلبًا",
            description: "اقتراح إبراز المنتجات ذات الطلب الأعلى.",
            reason: facts.productSignals[0] ? `أعلى منتج طلبًا: ${facts.productSignals[0].name}.` : "لا توجد بيانات كافية",
            actionLabel: "إعداد الإبراز — قريبًا",
          },
          {
            title: "تحسين تجربة الاستلام",
            description: "تحليل فقط لخطوة الاستلام دون تشغيل توصيل فعلي.",
            reason: facts.orders.length > 0 ? "توجد طلبات يمكن مراقبة تدفقها." : "لا توجد بيانات كافية",
            actionLabel: "تحسين الاستلام — قريبًا",
          },
        ],
        tableRows: facts.orders.slice(0, 10).map((order) => ({
          id: order.id,
          name: order.customerName,
          metric: order.status || "غير محدد",
          detail: `قيمة الطلب: ${order.total}`,
        })),
      };
    },
  });
}
