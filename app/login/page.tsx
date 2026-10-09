"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpLeft, Eye, EyeOff, Fingerprint, Gift, LayoutGrid, LoaderCircle, LockKeyhole, Mail, ShieldCheck, Store, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { loginOwnerAction, requestPasswordResetAction } from "@/app/actions/auth";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const resetDialog = useRef<HTMLDialogElement>(null);
  const resetTrigger = useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginMessage, setLoginMessage] = useState("");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setLoginMessage("");
    try {
      const result = await loginOwnerAction(email, password);
      if (!result.ok || !result.redirectTo) {
        setLoginMessage(result.message);
        setLoading(false);
        return;
      }
      router.replace(result.redirectTo);
    } catch {
      setLoginMessage("تعذر تسجيل الدخول حاول مجددًا");
      setLoading(false);
    }
  }

  function openReset() {
    setResetEmail(email.includes("@") ? email : "");
    setResetMessage("");
    resetDialog.current?.showModal();
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resetLoading) return;
    setResetLoading(true);
    setResetMessage("");
    try {
      const result = await requestPasswordResetAction(resetEmail);
      setResetMessage(result.message);
    } catch {
      setResetMessage("تعذر إرسال رابط الاستعادة حاول مجددًا");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <main dir="rtl" className={styles.page}>
      <aside className={styles.story} aria-labelledby="login-story-title">
        <Link href="/" aria-label="برندة الرئيسية" className={styles.storyLogo}>
          <BarndaksaLogo variant="dark" width={144} height={60} priority />
        </Link>
        <div className={styles.storyContent}>
          <span className={styles.eyebrow}>مساحتك في برندة</span>
          <h2 id="login-story-title">علامتك في الواجهة<br /><em>وأنت خلف كل تفصيلة</em></h2>
          <p className={styles.storyDescription}>من أول منتج إلى عميل يعود إليك<br />كل ما تحتاجه لإدارة علامتك في مكان واحد</p>
          <div className={styles.brandScene} aria-hidden="true">
            <div className={styles.backSheet} />
            <div className={styles.brandBoard}>
              <div className={styles.boardHeading}>
                <span className={styles.boardIcon}><Store size={22} /></span>
                <div><span className={styles.boardCaption}>مساحة علامتك</span><strong>تفاصيل تصنع الفرق</strong></div>
                <ArrowUpLeft size={20} className={styles.boardArrow} />
              </div>
              <div className={styles.boardRow}><LayoutGrid size={20} /><span>منيو يعكس هويتك<small>منتجاتك كما تحب أن يراها عملاؤك</small></span><span className={styles.rowMark} /></div>
              <div className={styles.boardRow}><Gift size={20} /><span>علاقة تكبر مع كل زيارة<small>عروض وولاء وتجارب تستحق العودة</small></span><span className={styles.rowMark} /></div>
              <div className={styles.boardFooter}><Fingerprint size={18} /><span>هويتك حاضرة في كل تفصيلة</span></div>
            </div>
          </div>
        </div>
        <div className={styles.storyFooter}><span>صُنعت لعلامتك</span><span lang="en" dir="ltr">YOUR BRAND COMES FIRST</span></div>
      </aside>

      <section className={styles.content} aria-labelledby="login-title">
        <header className={styles.topbar}>
          <Link href="/" aria-label="برندة الرئيسية" className={styles.mobileLogo}><BarndaksaLogo variant="brown" width={100} height={42} priority /></Link>
          <span className={styles.desktopLabel}>لوحة تحكم برندة</span>
          <Link href="/" className={styles.homeLink}>الصفحة الرئيسية <ArrowUpLeft size={17} aria-hidden="true" /></Link>
        </header>
        <div className={styles.formArea}>
          <div className={styles.welcomeIcon}><LockKeyhole size={24} strokeWidth={1.6} aria-hidden="true" /></div>
          <header className={styles.formHeading}>
            <span className={styles.kicker}>أهلًا بعودتك</span>
            <h1 id="login-title">تسجيل الدخول</h1>
            <p>علامتك تنتظرك أكمل من حيث بدأت</p>
          </header>
          <form onSubmit={handleLogin} aria-busy={loading}>
            <fieldset disabled={loading} className={styles.fields}>
              <div className={styles.field}>
                <label htmlFor="login-identity">البريد الإلكتروني أو رقم الجوال</label>
                <div className={styles.inputWrap}>
                  <Mail size={20} strokeWidth={1.6} aria-hidden="true" />
                  <input id="login-identity" name="username" type="text" dir="ltr" required autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="name@example.com / 05xxxxxxxx" value={email} onChange={event => setEmail(event.target.value)} aria-describedby={loginMessage ? "login-message" : undefined} />
                </div>
              </div>
              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <label htmlFor="login-password">كلمة المرور</label>
                  <button ref={resetTrigger} type="button" onClick={openReset} className={styles.textButton} aria-haspopup="dialog">نسيت كلمة المرور؟</button>
                </div>
                <div className={`${styles.inputWrap} ${styles.passwordWrap}`}>
                  <LockKeyhole size={20} strokeWidth={1.6} aria-hidden="true" />
                  <input id="login-password" name="password" dir="ltr" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} type={visible ? "text" : "password"} placeholder="أدخل كلمة المرور" aria-describedby={loginMessage ? "login-message" : undefined} />
                  <button type="button" onClick={() => setVisible(current => !current)} className={styles.reveal} aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} aria-pressed={visible} aria-controls="login-password">
                    {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                  </button>
                </div>
              </div>
              {loginMessage ? <p id="login-message" role="alert" className={styles.error}>{loginMessage}</p> : null}
              <button type="submit" className={styles.submit} disabled={loading}>
                <span>{loading ? "جارٍ تسجيل الدخول" : "الدخول إلى حسابك"}</span>
                {loading ? <LoaderCircle size={20} className={styles.spinner} aria-hidden="true" /> : <ArrowLeft size={20} aria-hidden="true" />}
              </button>
            </fieldset>
            <span className={styles.loadingStatus} role="status">{loading ? "جارٍ تسجيل الدخول" : ""}</span>
          </form>
          <div className={styles.signup}><span>جديد على برندة؟</span><Link href="/register">أنشئ حساب علامتك <ArrowLeft size={16} aria-hidden="true" /></Link></div>
        </div>
        <footer className={styles.contentFooter}><ShieldCheck size={17} aria-hidden="true" /><span>مساحتك لإدارة علامتك بثقة</span></footer>
      </section>

      <dialog ref={resetDialog} className={styles.resetDialog} aria-labelledby="reset-title" aria-describedby="reset-description" onClose={() => resetTrigger.current?.focus()}>
        <button type="button" className={styles.closeDialog} onClick={() => resetDialog.current?.close()} aria-label="إغلاق استعادة كلمة المرور"><X size={20} aria-hidden="true" /></button>
        <div className={styles.welcomeIcon}><Mail size={24} aria-hidden="true" /></div>
        <h2 id="reset-title">استعادة كلمة المرور</h2>
        <p id="reset-description">أدخل البريد المرتبط بحسابك وسنرسل لك رابط الاستعادة</p>
        <form onSubmit={submitReset} aria-busy={resetLoading}>
          <fieldset disabled={resetLoading} className={styles.fields}>
            <div className={styles.field}>
              <label htmlFor="reset-email">البريد الإلكتروني</label>
              <div className={styles.inputWrap}><Mail size={20} aria-hidden="true" /><input id="reset-email" name="email" type="email" dir="ltr" required autoComplete="email" autoCapitalize="none" spellCheck={false} value={resetEmail} onChange={event => setResetEmail(event.target.value)} placeholder="name@example.com" /></div>
            </div>
            <button type="submit" className={styles.submit} disabled={resetLoading}><span>{resetLoading ? "جارٍ إرسال الرابط" : "إرسال رابط الاستعادة"}</span>{resetLoading ? <LoaderCircle size={20} className={styles.spinner} aria-hidden="true" /> : <ArrowLeft size={20} aria-hidden="true" />}</button>
          </fieldset>
          <p className={styles.resetMessage} role="status">{resetLoading ? "جارٍ إرسال رابط الاستعادة" : resetMessage}</p>
        </form>
      </dialog>
    </main>
  );
}
