import s from "./fawasel-store.module.css";

export function FawaselLoading() {
  return <main className={s.store} dir="rtl" aria-busy="true" aria-label="جارٍ تحميل متجر فواصل"><div className={s.announcement}><span>ستايلك كل يوم</span><span dir="ltr">FAWASEL</span></div><div className={s.loading}><strong>فواصل</strong><span role="status">نجهّز لك إطلالتك القادمة</span><div className={s.loadingBar} /></div></main>;
}
