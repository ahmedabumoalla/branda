import Link from "next/link";
import {
  Bell,
  CalendarDays,
  ClipboardList,
  Gift,
  MessageCircle,
  ArrowRight,
  QrCode,
} from "lucide-react";
import { ThemedCafeShell } from "@/components/cafe/themes/themed-cafe-shell";
import { getCafePath } from "@/lib/cafe/theme-links";
import { getCustomerExperienceRewardNotifications } from "@/lib/data/experience-rewards";
import { SecureQrCode } from "@/components/loyalty/secure-qr-code";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export default async function CustomerNotificationsPage({ params }: Params) {
  const { slug } = await params;
  const rewards = await getCustomerExperienceRewardNotifications(slug);

  const items = [
    { title: "حالة الطلبات", desc: "تظهر هنا تحديثات قبول الطلب أو جاهزيته", icon: ClipboardList },
    { title: "حالة الحجوزات", desc: "تظهر هنا موافقة العلامة أو طلب التعديل", icon: CalendarDays },
    { title: "بطاقة الولاء", desc: "تظهر هنا الأختام والمكافآت الجديدة", icon: Gift },
    { title: "ردود العلامة", desc: "تظهر هنا ردود التقييمات والأسئلة والتوثيقات", icon: MessageCircle },
  ];

  const approvedRewards = rewards.filter((reward) => reward.status === "approved" || reward.status === "redeemed");

  return (
    <ThemedCafeShell slug={slug} maxWidth="max-w-md">
      <Link href={getCafePath(slug, "")} className="mb-4 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#6B3A25] shadow-sm">
        <ArrowRight className="h-4 w-4" />
        الرجوع للرئيسية
      </Link>

      {approvedRewards.length ? (
        <section className="mb-5 rounded-[32px] border border-[#E7D7C6] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#D9A33F] text-[#311912]">
              <Gift className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-black text-[#9B6A34]">مكافآت توثيق التجربة</p>
              <h1 className="text-2xl font-black text-[#311912]">لديك مكافآت جديدة</h1>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {approvedRewards.map((reward) => (
              <article key={reward.id} className="rounded-3xl border border-[#E7D7C6] bg-[#FCF8F3] p-4">
                <p className="text-xs font-black text-[#9B6A34]">
                  {reward.status === "redeemed" ? "تم صرف المكافأة" : "مكافأة جاهزة للصرف"}
                </p>
                <h2 className="mt-2 font-black text-[#311912]">
                  {reward.items.length
                    ? reward.items.map((item) => `${item.productName} × ${item.quantity}`).join("، ")
                    : "مكافأة من العلامة"}
                </h2>
                <p className="mt-2 text-sm font-bold leading-6 text-[#806A5E]">
                  مقابل توثيق التجربة رقم {reward.id.slice(0, 8)} · صالحة حتى {reward.rewardExpiresAt || "-"}
                </p>
                <a
                  href={reward.experienceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block truncate text-xs font-black text-[#6B3A25]"
                >
                  {reward.experienceUrl}
                </a>

                <div className="mt-4 rounded-3xl bg-white p-4 text-center">
                  <p className="flex items-center justify-center gap-2 text-xs font-black text-[#806A5E]">
                    <QrCode className="h-4 w-4" />
                    QR المكافأة
                  </p>
                  <p className="mt-2 font-mono text-xl font-black tracking-[0.18em] text-[#311912]">
                    {reward.rewardCode || "بانتظار الإصدار"}
                  </p>
                  {reward.rewardCode ? (
                    <SecureQrCode
                      kind="experience-reward"
                      value={reward.rewardCode}
                      title={`QR مكافأة ${reward.rewardCode}`}
                      size={168}
                      className="mt-3"
                    />
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-[32px] border border-[#E7D7C6] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#6B3A25] text-white">
            <Bell className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-black text-[#9B6A34]">التنبيهات</p>
            <h1 className="text-2xl font-black text-[#311912]">كل جديد من العلامة</h1>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {items.map(({ title, desc, icon: Icon }) => (
            <article key={title} className="rounded-3xl border border-[#E7D7C6] bg-[#FCF8F3] p-4">
              <div className="flex items-start gap-3">
                <Icon className="mt-1 h-5 w-5 text-[#6B3A25]" />
                <div>
                  <h2 className="font-black text-[#311912]">{title}</h2>
                  <p className="mt-1 text-sm font-bold leading-6 text-[#806A5E]">{desc}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </ThemedCafeShell>
  );
}
