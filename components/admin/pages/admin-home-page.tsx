"use client";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Boxes,
  Building2,
  CircleDollarSign,
  Clock3,
  FileImage,
  ShieldCheck,
  TicketCheck,
  Users,
} from "lucide-react";
import { BrandaLogo } from "@/components/ui/branda-logo";
import {
  AdminPageShell,
  AdminStatPill,
  BentoCard,
  BentoGrid,
  StatusBadge,
} from "@/components/ui/design-system";
import { formatSar } from "@/lib/format";
import type {
  AdminDashboardOverview,
  AdminMonthlyRevenuePoint,
} from "@/lib/data/admin-dashboard";

type Props = {
  overview: AdminDashboardOverview;
  configError?: string;
};

function GrowthIndicator({
  growthPercent,
}: {
  growthPercent: number | null;
}) {
  if (growthPercent === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-[#CBB29C]">
        لا توجد مقارنة
      </span>
    );
  }

  const positive = growthPercent >= 0;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1 text-xs font-black ${
        positive
          ? "border-emerald-500/25 bg-emerald-500/15 text-emerald-300"
          : "border-red-500/25 bg-red-500/15 text-red-300"
      }`}
    >
      {positive ? (
        <ArrowUpRight className="h-4 w-4" />
      ) : (
        <ArrowDownRight className="h-4 w-4" />
      )}
      {Math.abs(growthPercent)}%
    </span>
  );
}

function RevenueChart({
  months,
}: {
  months: AdminMonthlyRevenuePoint[];
}) {
  const maxRevenue = Math.max(...months.map((month) => month.revenue), 1);

  return (
    <div className="mt-8">
      <div className="flex h-64 items-end gap-2 sm:gap-3">
        {months.map((month) => {
          const height =
            month.revenue > 0
              ? Math.max((month.revenue / maxRevenue) * 100, 10)
              : 3;

          return (
            <div
              key={month.monthKey}
              className="group flex h-full min-w-0 flex-1 flex-col justify-end"
            >
              <div className="mb-2 hidden rounded-xl border border-[#D9A33F]/25 bg-[#211711] px-2 py-1 text-center text-[10px] font-black text-[#F8F4EF] group-hover:block">
                {formatSar(month.revenue)}
              </div>

              <div
                className="rounded-t-xl bg-gradient-to-t from-[#D9A33F]/30 via-[#D9A33F]/60 to-[#F6C35B] transition group-hover:from-[#D9A33F]/60 group-hover:to-[#FFD77D]"
                style={{ height: `${height}%` }}
              />

              <p className="mt-3 truncate text-center text-[10px] font-black text-[#CBB29C] sm:text-xs">
                {month.monthLabel}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AdminHomePage({
  overview,
  configError,
}: Props) {
  const cards = [
    {
      title: "الكوفيهات المسجلة",
      value: overview.totalCafes,
      hint: `${overview.activeCafes} كوفي نشط`,
      icon: Building2,
    },
    {
      title: "المنتجات المعروضة",
      value: overview.totalProducts,
      hint: "عبر جميع الكوفيهات",
      icon: Boxes,
    },
    {
      title: "العملاء المسجلون",
      value: overview.totalCustomers,
      hint: "عبر جميع الكوفيهات",
      icon: Users,
    },
    {
      title: "الباقات المفعلة",
      value: overview.activeSubscriptions,
      hint: "اشتراكات نشطة",
      icon: TicketCheck,
    },
  ];

  return (
    <AdminPageShell
      title="مركز قيادة منصة برندة"
      subtitle="مؤشرات المنصة والإيرادات وسجل العمليات من قاعدة البيانات الفعلية."
      action={<BrandaLogo variant="dark" width={140} height={56} />}
    >
      {configError ? (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center font-black text-amber-200">
          {configError}
        </div>
      ) : null}

      <BentoGrid className="mb-5">
        <BentoCard variant="gold" span="2" className="md:row-span-2">
          <div className="flex h-full flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black text-[#F6C35B]/90">
                    إيرادات الاشتراكات لهذا الشهر
                  </p>

                  <p className="mt-3 text-4xl font-black text-[#F8F4EF] sm:text-5xl">
                    {formatSar(overview.currentMonthRevenue)}
                  </p>
                </div>

                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#F6C35B]/20 text-[#F6C35B] shadow-[0_0_24px_rgba(246,195,91,0.25)]">
                  <CircleDollarSign className="h-8 w-8" />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <GrowthIndicator
                  growthPercent={overview.currentMonthGrowthPercent}
                />
                <p className="text-sm font-bold text-[#CBB29C]">
                  مقارنة بالشهر السابق
                </p>
              </div>
            </div>

            <div className="mt-10 rounded-2xl border border-white/10 bg-black/15 p-4">
              <p className="text-xs font-black text-[#CBB29C]">
                إجمالي الإيرادات خلال آخر 12 شهرًا
              </p>

              <p className="mt-2 text-2xl font-black text-[#F8F4EF]">
                {formatSar(overview.totalRevenueLast12Months)}
              </p>
            </div>
          </div>
        </BentoCard>

        {cards.map((card) => {
          const Icon = card.icon;

          return (
            <BentoCard key={card.title} variant="cyber">
              <Icon className="mb-4 h-7 w-7 text-[#F6C35B]" />
              <AdminStatPill
                label={card.title}
                value={card.value}
                hint={card.hint}
              />
            </BentoCard>
          );
        })}
      </BentoGrid>

      <BentoGrid className="mb-5">
        <BentoCard variant="cyber">
          <FileImage className="mb-4 h-7 w-7 text-[#F6C35B]" />
          <AdminStatPill
            label="مشاركات التجربة"
            value={overview.totalExperienceSubmissions}
            hint="منشورات العملاء المصورة"
          />
        </BentoCard>

        <BentoCard variant="dark" span="3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <Activity className="h-7 w-7 text-[#F6C35B]" />
                <h2 className="text-xl font-black text-[#F8F4EF]">
                  أداء إيرادات الاشتراكات
                </h2>
              </div>

              <p className="mt-2 text-sm font-bold text-[#CBB29C]">
                القيمة الشهرية للاشتراكات المفعلة لدى جميع الكوفيهات
              </p>
            </div>

            <StatusBadge tone="gold">آخر 12 شهرًا</StatusBadge>
          </div>

          <RevenueChart months={overview.monthlyRevenue} />
        </BentoCard>
      </BentoGrid>

      <BentoGrid>
        <BentoCard variant="dark" span="3">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-7 w-7 text-[#F6C35B]" />
                <h2 className="text-xl font-black text-[#F8F4EF]">
                  سجل العمليات والتغييرات
                </h2>
              </div>

              <p className="mt-2 text-sm font-bold text-[#CBB29C]">
                الإجراءات المسجلة بالتاريخ والوقت والمنفذ.
              </p>
            </div>

            <StatusBadge tone="success">من قاعدة البيانات</StatusBadge>
          </div>

          <div className="space-y-3">
            {overview.auditItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0f0c0a]/70 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black text-[#F8F4EF]">{item.title}</p>
                    <StatusBadge tone="gold">{item.entityLabel}</StatusBadge>
                  </div>

                  <p className="mt-2 text-sm font-bold text-[#CBB29C]">
                    {item.actorName}
                    {item.actorEmail ? ` • ${item.actorEmail}` : ""}
                    {" • "}
                    {item.cafeName}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2 text-xs font-black text-[#CBB29C]">
                  <Clock3 className="h-4 w-4 text-[#F6C35B]" />
                  <span>{item.dateLabel}</span>
                  <span>•</span>
                  <span>{item.timeLabel}</span>
                </div>
              </div>
            ))}

            {!overview.auditItems.length ? (
              <div className="rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center font-bold text-[#CBB29C]">
                لا توجد عمليات مسجلة حتى الآن.
              </div>
            ) : null}
          </div>
        </BentoCard>

        <div className="space-y-5">
          <BentoCard variant="cyber">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F6C35B]/15 text-[#F6C35B]">
              <Bot className="h-8 w-8" />
            </div>

            <h2 className="text-xl font-black text-[#F8F4EF]">
              مساعد برندة الذكي
            </h2>

            <p className="mt-3 text-sm font-bold leading-7 text-[#CBB29C]">
              مساحة جاهزة لنموذج الذكاء الاصطناعي لتحليل المنصة واقتراح
              القرارات التشغيلية.
            </p>

            <div className="mt-5 rounded-xl border border-[#D9A33F]/25 bg-[#D9A33F]/10 px-4 py-3 text-center text-sm font-black text-[#F6C35B]">
              سيتم البناء لاحقًا
            </div>
          </BentoCard>

          <BentoCard variant="cyber">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F6C35B]/15 text-[#F6C35B]">
              <Users className="h-8 w-8" />
            </div>

            <h2 className="text-xl font-black text-[#F8F4EF]">
              أداء المناديب والموظفين
            </h2>

            <p className="mt-3 text-sm font-bold leading-7 text-[#CBB29C]">
              إدارة أكواد الإحالة واحتساب الكوفيهات المرتبطة بكل مندوب لمدة
              ستة أشهر من تاريخ الانضمام.
            </p>

            <div className="mt-5 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-black text-[#CBB29C]">
              قسم مستقل قيد البناء
            </div>
          </BentoCard>
        </div>
      </BentoGrid>
    </AdminPageShell>
  );
}