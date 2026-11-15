import { notFound } from "next/navigation";
import { getPublicCafeFeatureCodesBySlug } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { HospitalDoctorLogin } from "@/components/hospital/doctor-login";

export const dynamic = "force-dynamic";

export default async function HospitalDoctorLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug !== "mind-hospital" || !featureCodesAllow(await getPublicCafeFeatureCodesBySlug(slug), "finance")) notFound();
  return <HospitalDoctorLogin />;
}
