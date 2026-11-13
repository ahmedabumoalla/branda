'use client';
import type {ReactNode} from 'react';
import s from './inventory.module.css';
export function Field({label,children,wide=false}:{label:string;children:ReactNode;wide?:boolean}){return <label className={`${s.field} ${wide?s.wide:''}`}><span>{label}</span>{children}</label>;}
export function Panel({title,children}:{title:string;children:ReactNode}){return <section className={s.panel}><h2>{title}</h2>{children}</section>;}
export const numberText=(v:unknown)=>Number(v??0).toLocaleString('ar-SA',{maximumFractionDigits:3});
export function Select({value,onChange,options,empty='اختر',required=false,disabled=false}:{value:string;onChange:(v:string)=>void;options:{id:string;name:string}[];empty?:string;required?:boolean;disabled?:boolean}){return <select disabled={disabled} value={value} onChange={e=>onChange(e.target.value)} required={required}><option value="">{empty}</option>{options.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>;}
export type SaveInventory=(action:string,payload:Record<string,unknown>,id?:string,revision?:number)=>Promise<boolean>;
