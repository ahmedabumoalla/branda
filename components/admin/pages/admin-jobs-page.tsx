"use client";

import { BriefcaseBusiness, FileText } from "lucide-react";
import { useState } from "react";
import { updateJobApplicationStatusAction } from "@/app/actions/jobs";
import { AdminPageShell, BentoCard, StatusBadge } from "@/components/ui/design-system";
import type { JobApplication } from "@/lib/data/jobs";

export function AdminJobsPage({
  initialApplications,
  configError,
}: {
  initialApplications: JobApplication[];
  configError?: string;
}) {
  const [applications, setApplications] = useState(initialApplications);

  async function updateStatus(id: string, status: string) {
    await updateJobApplicationStatusAction(id, status);
    setApplications((current) => current.map((item) => item.id === id ? { ...item, status } : item));
  }

  return (
    <AdminPageShell title="طلبات التوظيف" subtitle="استعراض الطلبات والسير الذاتية المرفوعة">
      {configError ? <p className="mb-5 font-black text-red-300">{configError}</p> : null}
      <BentoCard variant="dark">
        <div className="mb-6 flex items-center gap-3">
          <BriefcaseBusiness className="h-7 w-7 text-[#F6C35B]" />
          <h2 className="text-xl font-black text-white">الطلبات الواردة</h2>
        </div>
        <div className="space-y-4">
          {applications.map((application) => (
            <article key={application.id} className="rounded-2xl border border-white/10 p-5">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-white">{application.fullName}</h3>
                  <p className="mt-1 text-sm font-bold text-[#CBB29C]">{application.email} • {application.phone} • {application.region}</p>
                </div>
                <StatusBadge tone="gold">{application.status}</StatusBadge>
              </div>
              <div className="mt-4 grid gap-3 text-sm font-bold text-[#CBB29C] sm:grid-cols-3">
                <p>تاريخ الميلاد {application.birthDate}</p>
                <p>الجنس {application.gender === "male" ? "ذكر" : "أنثى"}</p>
                <p>تاريخ الرفع {new Date(application.createdAt).toLocaleString("ar-SA")}</p>
              </div>
              <p className="mt-4 rounded-xl bg-white/5 p-3 text-sm font-bold text-[#CBB29C]">{application.experience || "لا توجد خبرات مدخلة"}</p>
              <p className="mt-3 text-sm font-bold text-[#CBB29C]">اللغات {application.languages}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {application.cvUrl ? <a href={application.cvUrl} target="_blank" className="inline-flex items-center gap-2 rounded-xl bg-[#D9A33F]/15 px-4 py-2 font-black text-[#F6C35B]"><FileText className="h-4 w-4" />عرض السيرة</a> : null}
                {["reviewing", "accepted", "rejected"].map((status) => (
                  <button key={status} onClick={() => updateStatus(application.id, status)} className="rounded-xl border border-white/10 px-4 py-2 font-black text-white">
                    {status === "reviewing" ? "قيد المراجعة" : status === "accepted" ? "قبول" : "رفض"}
                  </button>
                ))}
              </div>
            </article>
          ))}
          {!applications.length ? <p className="text-center font-bold text-[#CBB29C]">لا توجد طلبات توظيف</p> : null}
        </div>
      </BentoCard>
    </AdminPageShell>
  );
}
