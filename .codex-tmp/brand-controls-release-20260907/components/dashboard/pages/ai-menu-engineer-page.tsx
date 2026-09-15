import { FeatureV1Page } from "@/components/dashboard/pages/feature-v1-page";
import type { V1FeatureDashboardData } from "@/lib/data/feature-v1-readiness";

type Props = {
  data: V1FeatureDashboardData | null;
  configError?: string;
};

export function AiMenuEngineerPage({ data, configError }: Props) {
  return <FeatureV1Page data={data} title="AI Menu Engineer" configError={configError} />;
}
