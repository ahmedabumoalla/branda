import { IBM_Plex_Sans_Arabic } from "next/font/google";
const font = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700"], display: "swap" });
export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <div className={font.className} dir="rtl">{children}</div>;
}
