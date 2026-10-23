import { MapPin } from "lucide-react";
import s from "./french-corner-hero.module.css";

function SnapchatMark() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2.5c-3.2 0-5 2.3-5 5.3l.1 2.6c-.6.3-1.2-.4-1.8-.2-.9.3-.8 1.2.1 1.7l1.5.6c-.4 2-1.8 3.4-3.9 4.2-.4.2-.4.7.1.9l2.1.6.5 1.4c.1.3.5.4.8.3 1.8-.5 2.4.2 3.6 1 .6.4 1.2.6 1.9.6s1.3-.2 1.9-.6c1.2-.8 1.8-1.5 3.6-1 .3.1.7 0 .8-.3l.5-1.4 2.1-.6c.5-.2.5-.7.1-.9-2.1-.8-3.5-2.2-3.9-4.2l1.5-.6c.9-.5 1-1.4.1-1.7-.6-.2-1.2.5-1.8.2l.1-2.6c0-3-1.8-5.3-5-5.3Z" /></svg>;
}

export function FrenchSocialIcons() {
  return <div className={s.social} role="group" aria-label="التواصل الاجتماعي والموقع">
    <a href="https://www.snapchat.com/add/frenchcorner26" target="_blank" rel="noopener noreferrer" aria-label="سناب شات الركن الفرنسي يفتح في نافذة جديدة"><SnapchatMark /><span>سناب شات</span></a>
    <a href="https://maps.app.goo.gl/ZA1JH1LjR72skeEo7" target="_blank" rel="noopener noreferrer" aria-label="موقع الركن الفرنسي يفتح في نافذة جديدة"><MapPin aria-hidden="true" /><span>موقعنا</span></a>
  </div>;
}
