import { CakeSlice } from "lucide-react";
import s from "./aldeem-store.module.css";

export function AldeemLoading() {
  return <main className={s.store} dir="rtl" aria-busy="true" aria-label="جارٍ تحميل متجر خيال الديم"><div className={s.announcement}><span>للحظات اللي تستاهل الحلا</span><span dir="ltr">KHAYAL ALDEEM</span></div><div className={s.loading}><CakeSlice aria-hidden="true" /><h1>خيال الديم</h1><p role="status">نجهّز لك لحظة حلوة</p></div></main>;
}
