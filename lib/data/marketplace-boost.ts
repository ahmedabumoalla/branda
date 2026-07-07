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

export async function getOwnerMarketplaceBoostDashboard(): Promise<V1FeatureDashboardData> {
  return getOwnerV1FeatureDashboard({
    featureId: "marketplace_boost",
    title: "إبراز العروض",
    badge: "Marketplace Boost v1",
    summary: "تحليل جاهزية الظهور في Marketplace فقط، بدون إعلانات أو دفع.",
    disabledActionLabel: "طلب إبراز العلامة — قريبًا",
    tableTitle: "عناصر الظهور المرشحة",
    sourceTables: ["cafes", "offers", "menu_products", "orders", "cafe_visit_events"],
    build: (facts) => ({
      metrics: [
        {
          label: "العروض النشطة",
          value: missing(facts, "offers") ? null : metricValue(facts.activeOffers),
          hint: "عروض ظاهرة وغير منتهية حسب البيانات الحالية",
        },
        {
          label: "عدد المنتجات",
          value: missing(facts, "menu_products") ? null : metricValue(facts.products.length),
          hint: "من منتجات العلامة الحالية",
        },
        {
          label: "الزيارات",
          value: missing(facts, "cafe_visit_events") ? null : metricValue(facts.visits.length),
          hint: "تعرض فقط إذا كان جدول الزيارات متاحًا",
        },
        {
          label: "طلبات آخر 30 يومًا",
          value: missing(facts, "orders") ? null : metricValue(facts.ordersLast30),
          hint: "مؤشر نشاط قبل الإبراز",
        },
        {
          label: "اكتمال المنتجات",
          value: missing(facts, "menu_products")
            ? null
            : metricValue(facts.products.filter((product) => product.description && product.imageUrl).length),
          hint: "منتجات لديها وصف وصورة",
        },
      ],
      readiness: buildReadiness([
        {
          ok: facts.activeOffers > 0,
          yes: "توجد عروض نشطة يمكن إبرازها مستقبلًا.",
          no: "لا توجد عروض نشطة كافية للإبراز.",
        },
        {
          ok: facts.products.length > 0,
          yes: "توجد منتجات يمكن عرضها ضمن الظهور.",
          no: "تحتاج العلامة إلى منتجات واضحة قبل الظهور.",
        },
        {
          ok: facts.ordersLast30 > 0,
          yes: "توجد طلبات حديثة تدعم جاهزية الظهور.",
          no: "تحتاج العلامة إلى نشاط طلبات أحدث.",
        },
        {
          ok: facts.products.some((product) => product.description && product.imageUrl),
          yes: "بعض المنتجات مكتملة بالوصف والصورة.",
          no: "تحسين الصور والأوصاف مطلوب قبل الإبراز.",
        },
      ]),
      suggestions: [
        {
          title: "إبراز عرض نشط",
          description: "اقتراح لاختيار عرض حالي للظهور مستقبلًا.",
          reason: facts.activeOffers > 0 ? `يوجد ${facts.activeOffers} عرض نشط.` : "لا توجد بيانات كافية",
          actionLabel: "طلب إبراز العلامة — قريبًا",
        },
        {
          title: "تحسين صور المنتجات",
          description: "تحسين صور المنتجات قبل الظهور الخارجي.",
          reason: facts.products.some((product) => !product.imageUrl) ? "توجد منتجات بدون صورة." : "الصور المتاحة تبدو أفضل للجاهزية.",
          actionLabel: "تحسين الصور — قريبًا",
        },
        {
          title: "إضافة وصف واضح",
          description: "الوصف الواضح يساعد في جذب الطلبات.",
          reason: facts.products.some((product) => !product.description) ? "توجد منتجات بدون وصف." : "أوصاف المنتجات تبدو متوفرة.",
          actionLabel: "تحسين الوصف — قريبًا",
        },
        {
          title: "تفعيل كوبون خاص",
          description: "اقتراح فقط لعرض خاص عند الإبراز.",
          reason: facts.ordersLast30 > 0 ? "يوجد نشاط طلبات يمكن دعمه بعرض." : "لا توجد بيانات كافية",
          actionLabel: "تجهيز كوبون — قريبًا",
        },
      ],
      tableRows: facts.offers.slice(0, 10).map((offer) => ({
        id: offer.id,
        name: offer.title,
        metric: offer.status,
        detail: offer.visible ? "ظاهر في العلامة" : "غير ظاهر",
      })),
    }),
  });
}
