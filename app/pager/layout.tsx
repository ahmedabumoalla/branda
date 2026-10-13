import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { CashierLanguageProvider } from "@/components/cashier/cashier-language";
import { getCashierLocale } from "@/lib/cashier/server-language";

const pagerFont = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700"], display: "swap", fallback: ["Tahoma", "Arial", "sans-serif"] });

export default async function PagerLayout({ children }: { children: React.ReactNode }) {
  return <div data-pager-font className={pagerFont.className} style={{ minHeight: "100vh", background: "#f7f5ef" }}><CashierLanguageProvider initialLocale={await getCashierLocale()}>{children}</CashierLanguageProvider></div>;
}
