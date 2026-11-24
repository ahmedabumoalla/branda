import Image from "next/image";
import { ArrowDownLeft, ArrowUpLeft, ArrowUp, MapPin, Camera } from "lucide-react";
import { AWLAD_ASSETS } from "@/lib/menu/awlad-al-izz";
import type { AwladSection } from "@/lib/menu/awlad-al-izz-catalog";
import type { StandaloneMenu } from "@/lib/menu/standalone-menu";
import s from "./awlad-al-izz.module.css";

const labels = {
  salon: { arabic: "العناية بالرجل", english: "MEN’S GROOMING", anchor: "#services", action: "الخدمات والأسعار" },
  cafe: { arabic: "ضيافة أهل العز", english: "COFFEE & MORE", anchor: "#awlad-content", action: "تصفح المنيو" },
  laser: { arabic: "عناية بتفاصيلك", english: "PERSONAL CARE", anchor: "#awlad-content", action: "خدمات الليزر" },
};

export function AwladBrandHeader({ name, section }: { name: string; section: AwladSection }) {
  const label = labels[section];
  return <header className={s.brandHeader}>
    <div className={s.brandNote}><span>{label.arabic}</span><small dir="ltr">{label.english}</small></div>
    <a href="#awlad-top" className={s.brandMark} aria-label={name}><Image src={`${AWLAD_ASSETS}/logo.jpeg`} width={1080} height={1080} alt="أولاد العز للعناية بالرجل" priority sizes="(max-width: 760px) 142px, 188px" /></a>
    <a className={s.headerAction} href={label.anchor}><span>{label.action}</span><ArrowDownLeft aria-hidden="true" /></a>
  </header>;
}

export function AwladBrandFooter({ name, contacts, section }: { name: string; contacts: StandaloneMenu["contacts"]; section: AwladSection }) {
  return <footer className={s.brandFooter}>
    <div className={s.footerTop}><p>{section === "cafe" ? "حياك في ضيافة" : "لك العناية ولنا التفاصيل"}<strong>{name}</strong></p><a href="#awlad-top" className={s.backTop} aria-label="العودة إلى أعلى الصفحة"><ArrowUp aria-hidden="true" /></a></div>
    <div className={s.footerBottom}><span dir="ltr">AWLAD AL IZZ</span><div>{contacts.location && <a href={contacts.location.googleUrl} target="_blank" rel="noreferrer"><MapPin aria-hidden="true" />موقعنا</a>}{contacts.instagramUrl && <a href={contacts.instagramUrl} target="_blank" rel="noreferrer"><Camera aria-hidden="true" />إنستغرام</a>}<a href="https://barndaksa.com" target="_blank" rel="noreferrer">بواسطة برندة<ArrowUpLeft aria-hidden="true" /></a></div></div>
  </footer>;
}
