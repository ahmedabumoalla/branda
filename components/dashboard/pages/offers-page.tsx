"use client";

import { useState } from "react";
import { Gift, Trash2 } from "lucide-react";
import { deleteOfferAction } from "@/app/actions/offers";
import { BentoCard, DashboardPageShell } from "@/components/ui/design-system";
import type { CafeOffer } from "@/lib/mock/offers";
import type { MenuProduct } from "@/lib/mock/menu";

type Props = {
  initialOffers: CafeOffer[];
  initialProducts: MenuProduct[];
  businessCategory?: string | null;
  configError?: string;
};

export function OffersPageClient({ initialOffers, configError }: Props) {
  const [offers, setOffers] = useState(initialOffers);

  async function removeOffer(id: string) {
    await deleteOfferAction(id);
    setOffers((current) => current.filter((offer) => offer.id !== id));
  }

  return (
    <DashboardPageShell title="العروض" subtitle="إدارة عروض المنتجات والخصومات الظاهرة للعملاء.">
      {configError ? <BentoCard variant="white" className="mb-6">{configError}</BentoCard> : null}
      <div className="grid gap-4">
        {offers.map((offer) => (
          <BentoCard key={offer.id} variant="white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Gift className="mb-2 h-6 w-6 text-[#6B3A25]" />
                <h2 className="text-xl font-black">{offer.title}</h2>
                <p className="mt-2 font-bold text-[#806A5E]">{offer.description}</p>
              </div>
              <button type="button" onClick={() => void removeOffer(offer.id)} className="rounded-xl p-3 text-red-700" aria-label="حذف العرض">
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          </BentoCard>
        ))}
        {!offers.length ? <BentoCard variant="white">لا توجد عروض حاليًا.</BentoCard> : null}
      </div>
    </DashboardPageShell>
  );
}
