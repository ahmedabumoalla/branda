'use client';
import {createContext,useContext,type ReactNode} from 'react';
import {defaultSystemGeneral} from '@/lib/erp/settings';
import {systemDate,systemDateTime,systemMoney,systemNumber,type SystemDisplayPreferences} from '@/lib/erp/settings-format';

const PreferencesContext=createContext<SystemDisplayPreferences>(defaultSystemGeneral);
export function SystemPreferencesProvider({value,children}:{value:SystemDisplayPreferences;children:ReactNode}){
 return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
export function useSystemPreferences(){return useContext(PreferencesContext);}
export function useSystemFormat(){const preferences=useSystemPreferences();return {
 date:(value:string)=>systemDate(value,preferences),
 dateTime:(value:string)=>systemDateTime(value,preferences),
 number:(value:unknown,digits=3)=>systemNumber(value,preferences,digits),
 money:(value:number,currency=preferences.currency)=>systemMoney(value,preferences,currency),
 amount:<T,>(value:T,render:(value:T)=>string)=>{const formatted=render(value);return preferences.negativeFormat==='parentheses'&&Number(value)<0?'('+formatted.replace(/[-\u2212]/,'')+')':formatted;},
};}
