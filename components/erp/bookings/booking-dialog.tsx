"use client";
import { useEffect,useRef,type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./bookings.module.css";
export function BookingDialog({title,pending,onClose,children}:{title:string;pending:boolean;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close()},[]);
 return <dialog ref={ref} className={styles.dialog} dir="rtl" aria-label={title} onCancel={event=>{event.preventDefault();if(!pending)onClose()}}><header><h2>{title}</h2><button type="button" aria-label="إغلاق" disabled={pending} onClick={onClose}><X size={20}/></button></header>{children}</dialog>;
}
