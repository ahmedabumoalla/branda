import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { CashierLanguageProvider } from "@/components/cashier/cashier-language";
import { getCashierLocale } from "@/lib/cashier/server-language";
const cashierFont = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700"], display: "swap" });
export default async function CashierLayout({ children }: { children: React.ReactNode }) {
  return <div className={cashierFont.className}><CashierLanguageProvider initialLocale={await getCashierLocale()}>{children}</CashierLanguageProvider></div>;
}
