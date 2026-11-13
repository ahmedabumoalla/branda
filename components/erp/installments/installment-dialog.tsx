"use client";
import {useEffect,useRef,type ReactNode} from "react";
import styles from "./installments.module.css";
export function InstallmentDialog({title,pending,onClose,children}:{title:string;pending:boolean;onClose:()=>void;children:ReactNode}){const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close()},[]);return <dialog ref={ref} className={styles.dialog} dir="rtl" aria-label={title} onCancel={e=>{e.preventDefault();if(!pending)onClose()}}><header className={styles.modalHeading}><h2>{title}</h2><button aria-label="إغلاق" disabled={pending} onClick={onClose}>×</button></header>{children}</dialog>}
