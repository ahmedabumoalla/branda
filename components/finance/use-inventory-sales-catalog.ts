"use client";
import {useEffect,useState} from "react";
import {getInventorySalesCatalog} from "@/app/actions/finance-inventory-sales";
import type {InventorySaleProduct} from "@/lib/finance/inventory-sales";
export function useInventorySalesCatalog(slug:string){const[attempt,setAttempt]=useState(0),[state,setState]=useState<{key:string;products:InventorySaleProduct[];error:string}|null>(null);const key=slug+':'+attempt;useEffect(()=>{let active=true;getInventorySalesCatalog(slug).then(r=>{if(active)setState({key,products:r.ok?r.data:[],error:r.ok?'':r.message});}).catch(()=>{if(active)setState({key,products:[],error:'تعذر تحميل أصناف المخزون أعد المحاولة'});});return()=>{active=false;};},[slug,key]);const current=state?.key===key?state:null;return{products:current?.products??[],ready:!!current&&!current.error,error:current?.error??'',retry:()=>setAttempt(a=>a+1)};}
