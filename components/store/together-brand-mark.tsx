import Image from "next/image";
import styles from "./together-brand-mark.module.css";

/** Only the source image's empty outer margins are hidden; all original lettering remains. */
export function TogetherBrandMark({ className = "" }: { className?: string }) {
  return <span className={`${styles.mark} ${className}`} data-together-mark="complete-original"><Image src="/together/logo.webp" alt="Together Plants — معًا للنباتات" width={1000} height={983} preload unoptimized className={styles.art} /></span>;
}
