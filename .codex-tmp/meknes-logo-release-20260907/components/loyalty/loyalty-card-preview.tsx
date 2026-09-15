"use client";

import {
  LoyaltyBarcode,
  SharedLoyaltyCard,
  type LoyaltyGraphicLayer,
  type LoyaltyDesignerLayer,
} from "@/components/loyalty/shared-loyalty-card";
import type { LoyaltyCardDesign } from "@/lib/loyalty/types";

type Props = {
  card: LoyaltyCardDesign;
  pointsBalance?: number;
  pointValueSar?: number;
  pointsEnabled?: boolean;
  compact?: boolean;
  editable?: boolean;
  activeLayer?: LoyaltyDesignerLayer | null;
  onActiveLayerChange?: (layer: LoyaltyDesignerLayer) => void;
  onCardChange?: (card: LoyaltyCardDesign) => void;
};

export type { LoyaltyDesignerLayer };
export type { LoyaltyGraphicLayer };
export { LoyaltyBarcode };

export function LoyaltyCardPreview(props: Props) {
  return <SharedLoyaltyCard {...props} />;
}
