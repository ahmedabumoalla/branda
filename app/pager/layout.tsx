import { IBM_Plex_Sans_Arabic } from "next/font/google";

const pagerFont = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700"], display: "swap", fallback: ["Tahoma", "Arial", "sans-serif"] });

export default function PagerLayout({ children }: { children: React.ReactNode }) {
  return <div data-pager-font dir="rtl" className={pagerFont.className} style={{ minHeight: "100vh", background: "#f7f5ef" }}>{children}</div>;
}
