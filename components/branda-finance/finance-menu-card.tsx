import Link from "next/link";
import type { ElementType, ReactNode } from "react";
import {
  BadgeDollarSign,
  BadgeHelp,
  Banknote,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CircleDollarSign,
  Code2,
  FileStack,
  Handshake,
  Landmark,
  PlugZap,
  ReceiptText,
  ShoppingCart,
  SquareLibrary,
  UserCog,
  UsersRound,
} from "lucide-react";
import type { BrandaFinanceIconKey, BrandaFinanceMenuItem } from "@/lib/branda-finance/menu";

const iconMap: Record<BrandaFinanceIconKey, ElementType> = {
  reports: ReceiptText,
  invoices: FileStack,
  sales: CircleDollarSign,
  purchases: ShoppingCart,
  contacts: UsersRound,
  payroll: BadgeDollarSign,
  inventory: Boxes,
  accountant: UserCog,
  banking: Landmark,
  assets: Banknote,
  costCenters: SquareLibrary,
  projects: BriefcaseBusiness,
  branches: Building2,
  developers: Code2,
  integrations: PlugZap,
  templates: FileStack,
  hireAccountant: Handshake,
  help: BadgeHelp,
};

type FinanceMenuCardProps = {
  item: BrandaFinanceMenuItem;
};

const cardClassName =
  "group flex min-h-[132px] min-w-0 flex-col justify-between rounded-[8px] border border-[#E8D7BE] bg-[linear-gradient(135deg,#FFFDF8_0%,#F7EAD6_100%)] p-3 text-right shadow-[0_12px_26px_rgba(86,52,31,0.10),inset_0_1px_0_rgba(255,255,255,0.85)] transition duration-200 hover:border-[#C99A4D] hover:shadow-[0_18px_36px_rgba(86,52,31,0.14)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B88334] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7EFE4]";

function CardContent({ item, icon: Icon }: { item: BrandaFinanceMenuItem; icon: ElementType }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-[#E7D1AE] bg-white text-[#6B3F22] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition duration-200 group-hover:bg-[#FFF8EA]">
          <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <span className="rounded-[8px] border border-[#E6D5BD] bg-[#FBF5EC] px-2 py-1 text-[10px] font-extrabold text-[#8A5B24]">
          {item.badge ?? "قريبًا"}
        </span>
      </div>

      <div className="mt-3 min-w-0">
        <h2 className="truncate text-[14px] font-black leading-6 text-[#3D2418]">{item.title}</h2>
        <p className="mt-1 line-clamp-2 text-[11px] font-bold leading-5 text-[#8F765F]">{item.description}</p>
      </div>
    </>
  );
}

export function FinanceMenuCard({ item }: FinanceMenuCardProps) {
  const Icon = iconMap[item.icon];
  const content: ReactNode = <CardContent item={item} icon={Icon} />;

  if (item.href) {
    return (
      <Link href={item.href} className={cardClassName}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" disabled className={cardClassName}>
      {content}
    </button>
  );
}
