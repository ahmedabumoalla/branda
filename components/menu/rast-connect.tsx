import { MapPin } from "lucide-react";
import s from "./rast-connect.module.css";

function InstagramMark() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>;
}

function SnapchatMark() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2.5c-3.2 0-5 2.3-5 5.3l.1 2.6c-.6.3-1.2-.4-1.8-.2-.9.3-.8 1.2.1 1.7l1.5.6c-.4 2-1.8 3.4-3.9 4.2-.4.2-.4.7.1.9l2.1.6.5 1.4c.1.3.5.4.8.3 1.8-.5 2.4.2 3.6 1 .6.4 1.2.6 1.9.6s1.3-.2 1.9-.6c1.2-.8 1.8-1.5 3.6-1 .3.1.7 0 .8-.3l.5-1.4 2.1-.6c.5-.2.5-.7.1-.9-2.1-.8-3.5-2.2-3.9-4.2l1.5-.6c.9-.5 1-1.4.1-1.7-.6-.2-1.2.5-1.8.2l.1-2.6c0-3-1.8-5.3-5-5.3Z" />
  </svg>;
}

function TiktokMark() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.5 2h-3.3v13.6a3 3 0 1 1-2.6-3V9.2a6.4 6.4 0 1 0 5.9 6.4V8.8a9 9 0 0 0 5 1.5V7a5.7 5.7 0 0 1-5-5Z" />
  </svg>;
}

function WhatsappMark() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20.5 12a8.5 8.5 0 0 1-12.8 7.3L3 20.5l1.2-4.6A8.5 8.5 0 1 1 20.5 12Z" />
    <path d="m8.2 7.5 1.2-.2 1.1 2.5-.9 1c.7 1.5 1.8 2.6 3.4 3.3l1-1 2.5 1.1-.2 1.3c-.2 1-1.1 1.5-2 1.3-3.8-.8-6.5-3.5-7.4-7.2-.2-.9.3-1.8 1.3-2.1Z" />
  </svg>;
}

// Only owner-supplied destinations are active; remaining accounts stay as previews.
export function RastConnect() {
  const accounts = [
    { name: "سناب شات", Icon: SnapchatMark },
    { name: "تيك توك", Icon: TiktokMark },
    { name: "إنستقرام", Icon: InstagramMark },
    { name: "واتساب", Icon: WhatsappMark, featured: true, href: "https://wa.me/966532751005" },
  ];

  return <section className={s.connect} aria-label="راست على منصات التواصل وموقع الفرع">
    <div className={s.inner}>
      <div className={s.intro}>
        <span className={s.overline} dir="ltr">THE RAST CONNECTION</span>
        <h2>لحظتنا تكمل <span>معك</span></h2>
      </div>
      <ul className={s.accounts} aria-label="منصات التواصل">
        {accounts.map(({ name, Icon, featured, href }) => {
          const content = <><span className={s.icon}><Icon aria-hidden="true" /></span><span className={s.label}>{name}</span></>;
          return <li key={name} className={featured ? s.whatsapp : undefined}>
            {href ? <a className={s.account} href={href} target="_blank" rel="noopener noreferrer" aria-label="محادثة راست على واتساب">{content}</a>
              : <span className={s.account}>{content}</span>}
          </li>;
        })}
      </ul>
      <a className={s.location} href="https://maps.app.goo.gl/pr6HtT5qx37rW5ZQ8?g_st=ic" target="_blank" rel="noopener noreferrer" aria-label="موقع فرع راست على خرائط قوقل">
        <span className={s.pin}><MapPin aria-hidden="true" /></span>
        <span><span className={s.locationTitle}>نلقاك في راست</span><span className={s.locationCaption}>موقع الفرع</span></span>
      </a>
    </div>
  </section>;
}
