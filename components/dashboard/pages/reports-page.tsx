
"use client";

import { Activity, BarChart3, CalendarDays, Clock, Receipt, Repeat, TrendingUp, Users, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { BentoCard, BentoGrid, DashboardPageShell, SoftCard, StatPill } from "@/components/ui/design-system";
import { formatSar } from "@/lib/format";
import { type CafeOrder } from "@/lib/mock/orders";
import { type CustomerProfile } from "@/lib/mock/customer-activity";
import { type CafeReview } from "@/lib/mock/reviews";
import { type CafeReservation } from "@/lib/mock/reservations";
import type { VisitAnalytics } from "@/lib/data/platform-upgrade";

type Props = { initialOrders: CafeOrder[]; initialCustomers: CustomerProfile[]; initialReviews: CafeReview[]; initialReservations: CafeReservation[]; visitAnalytics?: VisitAnalytics | null; configError?: string };

function monthKey(date: string) { return (date || new Date().toISOString()).slice(0, 7); }

export function ReportsPageClient({ initialOrders, initialCustomers, initialReservations, visitAnalytics, configError }: Props) {
  const [orders] = useState(initialOrders); const [customers] = useState(initialCustomers); const [reservations] = useState(initialReservations);
  const acceptedOrders = useMemo(() => orders.filter((order) => order.status === "مقبول"), [orders]);
  const totalSales = acceptedOrders.reduce((sum, order) => sum + order.total, 0);
  const conversionRate = orders.length ? Math.round((acceptedOrders.length / orders.length) * 100) : 0;
  const avgOrder = acceptedOrders.length ? totalSales / acceptedOrders.length : 0;
  const monthly = useMemo(() => { const map = new Map<string, { revenue: number; orders: number }>(); for (const order of acceptedOrders) { const key = monthKey(order.createdAt); const current = map.get(key) ?? { revenue: 0, orders: 0 }; current.revenue += order.total; current.orders += 1; map.set(key, current); } return [...map.entries()].sort(([a],[b]) => a.localeCompare(b)).slice(-6).map(([month, value]) => ({ month, ...value })); }, [acceptedOrders]);
  const maxRevenue = Math.max(...monthly.map((item) => item.revenue), 1);
  const visits = visitAnalytics ?? { totalVisits: 0, uniqueSessions: 0, repeatedVisits: 0, averageDurationSeconds: 0, orderConversions: 0, reservationConversions: 0, recent: [] };

  return <div dir="rtl"><DashboardPageShell title="التقارير" subtitle="لوحة مؤشرات متقدمة للطلبات والحجوزات وزيارات الفرع الإلكتروني">
    {configError ? <SoftCard className="mb-4 p-4 font-black text-amber-700">{configError}</SoftCard> : null}
    <BentoGrid className="mb-6"><BentoCard variant="gold" span="2"><Receipt className="mb-4 h-7 w-7" /><StatPill label="إيراد الطلبات المقبولة" value={formatSar(totalSales)} hint="لا يشمل المرفوض" /></BentoCard><BentoCard variant="white"><TrendingUp className="mb-4 h-7 w-7 text-[#6B3A25]" /><StatPill label="معدل القبول" value={`${conversionRate}%`} /></BentoCard><BentoCard variant="white"><WalletCards className="mb-4 h-7 w-7 text-[#6B3A25]" /><StatPill label="متوسط الطلب" value={formatSar(avgOrder)} /></BentoCard><BentoCard variant="white"><Users className="mb-4 h-7 w-7 text-[#6B3A25]" /><StatPill label="العملاء" value={customers.length} /></BentoCard><BentoCard variant="white"><CalendarDays className="mb-4 h-7 w-7 text-[#6B3A25]" /><StatPill label="الحجوزات" value={reservations.length} /></BentoCard></BentoGrid>
    <BentoGrid className="mb-6"><BentoCard variant="white"><Activity className="mb-4 h-7 w-7 text-[#6B3A25]" /><StatPill label="زيارات الفرع الإلكتروني" value={visits.totalVisits} /></BentoCard><BentoCard variant="white"><Users className="mb-4 h-7 w-7 text-[#6B3A25]" /><StatPill label="زوار فريدون" value={visits.uniqueSessions} /></BentoCard><BentoCard variant="white"><Repeat className="mb-4 h-7 w-7 text-[#6B3A25]" /><StatPill label="زيارات متكررة" value={visits.repeatedVisits} /></BentoCard><BentoCard variant="white"><Clock className="mb-4 h-7 w-7 text-[#6B3A25]" /><StatPill label="متوسط مدة الزيارة" value={`${visits.averageDurationSeconds} ث`} /></BentoCard></BentoGrid>
    <BentoGrid><BentoCard variant="white" span="2"><h2 className="mb-5 text-xl font-black">إيرادات آخر أشهر</h2><div className="space-y-4">{monthly.map((item) => <div key={item.month}><div className="mb-2 flex justify-between text-sm font-black"><span>{item.month}</span><span>{formatSar(item.revenue)}</span></div><div className="h-4 overflow-hidden rounded-full bg-[#F8F4EF]"><div className="h-full rounded-full bg-[#D9A33F]" style={{ width: `${Math.max(6, (item.revenue / maxRevenue) * 100)}%` }} /></div></div>)}</div></BentoCard><BentoCard variant="white" span="2"><h2 className="mb-5 text-xl font-black">آخر زيارات الفرع الإلكتروني</h2><div className="space-y-3">{visits.recent.slice(0, 8).map((visit) => <div key={visit.id} className="rounded-2xl bg-[#F8F4EF] p-4"><p className="font-black">{visit.path}</p><p className="text-xs font-bold text-[#7A6255]">{visit.createdAt} • {visit.durationSeconds ?? 0} ثانية</p></div>)}</div></BentoCard></BentoGrid>
  </DashboardPageShell></div>;
}
