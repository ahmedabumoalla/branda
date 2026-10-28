import { IBM_Plex_Sans_Arabic } from "next/font/google";
const salonFont = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700"], display: "swap", fallback: ["Tahoma", "Arial", "sans-serif"] });
export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className={salonFont.className} dir="rtl">{children}</div>;
}
