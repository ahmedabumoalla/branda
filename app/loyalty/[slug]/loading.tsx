import { LoaderCircle } from "lucide-react";
import s from "@/components/menu/loyalty-navigation.module.css";

export default function Loading() {
  return <main className={s.loading} dir="rtl" role="status" aria-live="polite">
    <LoaderCircle className={s.spinner} aria-hidden="true" />
    <p>جار فتح بطاقتك</p>
    <small>لحظات وتكون بطاقتك بين يديك</small>
  </main>;
}
