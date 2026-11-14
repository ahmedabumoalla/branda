import s from "./fawasel-brand-mark.module.css";

/** Display the supplied original mark in a cropped frame without redrawing it. */
export function FawaselBrandMark({ logoUrl }: { logoUrl?: string | null } = {}) {
  const custom = logoUrl && !logoUrl.includes("/brand/barndaksa-");
  return <span className={custom ? s.custom : s.mark}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={custom ? logoUrl : "/fawasel/brand-reference.jpeg"} alt="فواصل FAWASEL" width={custom ? 144 : 736} height={custom ? 78 : 1600} />
  </span>;
}
