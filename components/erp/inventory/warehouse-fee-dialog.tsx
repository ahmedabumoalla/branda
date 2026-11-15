'use client';
import {useEffect,useRef} from 'react';
import {MessageCircle,Warehouse,X} from 'lucide-react';
import d from './warehouse-fee-dialog.module.css';

const WHATSAPP_DISPLAY='0508424401';
const WHATSAPP_INTERNATIONAL='966508424401';

// Adding a warehouse is a paid extra, so the add button explains the fee and hands off to the Branda technical team.
export function WarehouseFeeDialog({open,onClose,brand}:{open:boolean;onClose:()=>void;brand:string}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current;if(!dialog)return;if(open&&!dialog.open)dialog.showModal();if(!open&&dialog.open)dialog.close();},[open]);
 const message=`مرحبا فريق برندة التقني أرغب في إضافة مستودع جديد للعلامة ${brand}`;
 return <dialog ref={ref} dir="rtl" className={d.dialog} aria-labelledby="warehouse-fee-title" onClose={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
  <div className={d.card}>
   <button type="button" className={d.close} onClick={onClose} aria-label="إغلاق"><X size={18} aria-hidden="true"/></button>
   <span className={d.icon}><Warehouse size={26} aria-hidden="true"/></span>
   <h2 id="warehouse-fee-title" className={d.title}>إضافة مستودع جديد</h2>
   <p className={d.text}>إضافة مستودع جديد خدمة برسوم إضافية على باقتك الحالية</p>
   <div className={d.price}><span>سعر إضافة المستودع الجديد</span><strong>12 <small>ريال شهريا</small></strong></div>
   <p className={d.text}>تطبق الرسوم على الباقة وتحتسب من المدة المتبقية فيها</p>
   <p className={d.text}>لتفعيل المستودع تواصل مع فريق برندة التقني عبر واتساب على الرقم <bdi dir="ltr" className={d.phone}>{WHATSAPP_DISPLAY}</bdi></p>
   <a className={d.whatsapp} href={`https://wa.me/${WHATSAPP_INTERNATIONAL}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true"/>تواصل عبر واتساب</a>
   <button type="button" className={d.later} onClick={onClose}>إغلاق</button>
  </div>
 </dialog>;
}
