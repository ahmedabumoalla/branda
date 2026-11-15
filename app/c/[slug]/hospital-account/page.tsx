import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hospitalDoctorAccountHref } from "@/lib/commerce/hospital-doctor-portal";
import { readHospitalDoctorPortal } from "@/lib/data/hospital-doctor-portal";
import { HospitalDoctorAccount } from "@/components/hospital/doctor-account";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "حسابك لدى مايند | MIND", robots: { index: false, follow: false }, referrer: "same-origin" };

export default async function HospitalDoctorAccountPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await readHospitalDoctorPortal(slug);
  if (result.state === "missing") notFound();
  return <HospitalDoctorAccount result={result} loginHref={`${hospitalDoctorAccountHref(slug)}/login`} />;
}
