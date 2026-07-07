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

export async function getOwnerPosIntegrationsDashboard(): Promise<V1FeatureDashboardData> {
  return getOwnerV1FeatureDashboard({
    featureId: "pos_integrations",
    title: "تكاملات POS",
    badge: "POS Integrations v1",
    summary: "صفحة جاهزية وتوثيق فقط، بدون مفاتيح API أو Webhooks أو ربط فعلي.",
    disabledActionLabel: "طلب ربط POS — قريبًا",
    tableTitle: "أنظمة مستقبلية للربط",
    sourceTables: ["orders", "menu_products", "branches", "cafes"],
    build: (facts) => ({
      metrics: [
        {
          label: "عدد الطلبات",
          value: missing(facts, "orders") ? null : metricValue(facts.orders.length),
          hint: "يستخدم لتقدير حجم الربط مستقبلًا",
        },
        {
          label: "عدد المنتجات",
          value: missing(facts, "menu_products") ? null : metricValue(facts.products.length),
          hint: "منتجات تحتاج مطابقة مع نظام POS لاحقًا",
        },
        {
          label: "عدد الفروع",
          value: missing(facts, "branches") ? null : metricValue(facts.branches.length),
          hint: "قراءة فقط من الفروع الحالية",
        },
        {
          label: "حالات الطلبات المستخدمة",
          value: missing(facts, "orders") ? null : metricValue(new Set(facts.orders.map((order) => order.status)).size),
          hint: "تجهيز لتوحيد الحالات قبل الربط",
        },
      ],
      readiness: buildReadiness([
        {
          ok: facts.products.length > 0,
          yes: "توجد منتجات يمكن مطابقتها مع POS مستقبلًا.",
          no: "تحتاج العلامة إلى منتجات قبل الربط.",
        },
        {
          ok: facts.orders.length > 0,
          yes: "توجد طلبات يمكن فهم حالات تدفقها.",
          no: "تحتاج العلامة إلى طلبات لفهم التدفق.",
        },
        {
          ok: facts.branches.length > 0,
          yes: "توجد فروع يمكن تجهيزها للربط.",
          no: "لا توجد فروع كافية أو جدول الفروع غير متاح.",
        },
        {
          ok: new Set(facts.orders.map((order) => order.status)).size > 0,
          yes: "حالات الطلبات متاحة للمراجعة قبل الربط.",
          no: "لا توجد حالات طلبات كافية للمراجعة.",
        },
      ]),
      suggestions: [
        {
          title: "توحيد أسماء المنتجات",
          description: "مراجعة أسماء المنتجات قبل مطابقتها مع POS.",
          reason: facts.products.length > 0 ? `يوجد ${facts.products.length} منتج للمراجعة.` : "لا توجد بيانات كافية",
          actionLabel: "طلب ربط POS — قريبًا",
        },
        {
          title: "التأكد من الفروع",
          description: "تجهيز الفروع قبل أي ربط خارجي.",
          reason: facts.branches.length > 0 ? `يوجد ${facts.branches.length} فرع.` : "لا توجد بيانات كافية",
          actionLabel: "مراجعة الفروع — قريبًا",
        },
        {
          title: "تجهيز حالات الطلب",
          description: "مراجعة الحالات الحالية قبل بناء أي تكامل.",
          reason: facts.orders.length > 0 ? "توجد حالات طلبات يمكن تحليلها." : "لا توجد بيانات كافية",
          actionLabel: "مراجعة الحالات — قريبًا",
        },
        {
          title: "تجهيز صلاحيات الربط",
          description: "توثيق فقط لصلاحيات مستقبلية دون إنشاء مفاتيح.",
          reason: "لا توجد مفاتيح API أو Webhooks في هذه النسخة.",
          actionLabel: "تجهيز الصلاحيات — قريبًا",
        },
      ],
      tableRows: [
        { id: "foodics", name: "Foodics", metric: "مستقبلي", detail: "لا يوجد ربط فعلي في v1." },
        { id: "marn", name: "Marn", metric: "مستقبلي", detail: "لا يوجد إرسال بيانات خارجي." },
        { id: "pos-api", name: "POS API", metric: "مستقبلي", detail: "لا توجد مفاتيح API أو Webhooks." },
      ],
    }),
  });
}
