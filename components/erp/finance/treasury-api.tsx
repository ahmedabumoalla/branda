'use client';
import {createContext,useContext,useMemo,type ReactNode} from 'react';
import * as actions from '@/app/actions/erp-treasury';
import * as handovers from '@/app/actions/erp-treasury-handovers';
import type {BranchScope} from '@/lib/erp/branches';
import type {TreasuryStatementOptions} from '@/lib/finance/treasury';
import type {CashHandoverReceipt} from '@/lib/finance/cash-handovers';

function bound(scope:BranchScope|null){return{
 fetchFinanceTreasuryAction:(slug?:string)=>actions.fetchFinanceTreasuryAction(slug,scope),
 fetchFinanceAccountStatementAction:(id:string,options:TreasuryStatementOptions,slug?:string)=>actions.fetchFinanceAccountStatementAction(id,options,slug,scope),
 fetchFinanceTreasuryHistoryAction:(id:string,kind:'audit'|'reconciliations',offset:number,slug?:string)=>actions.fetchFinanceTreasuryHistoryAction(id,kind,offset,slug,scope),
 fetchFinanceTerminalFeeHistoryAction:(id:string|null,offset:number,slug?:string)=>actions.fetchFinanceTerminalFeeHistoryAction(id,offset,slug,scope),
 executeFinanceTreasuryAction:(operation:string,payload:Record<string,unknown>,requestId:string,slug?:string)=>actions.executeFinanceTreasuryAction(operation,payload,requestId,slug,scope),
 executeFinanceTreasuryCorrectionAction:(operation:string,payload:Record<string,unknown>,requestId:string,slug?:string)=>actions.executeFinanceTreasuryCorrectionAction(operation,payload,requestId,slug,scope),
 fetchFinanceCashHandoversAction:(offset:number,slug?:string)=>handovers.fetchFinanceCashHandoversAction(offset,slug,scope),
 receiveFinanceShiftCashAction:(input:CashHandoverReceipt,slug?:string)=>handovers.receiveFinanceShiftCashAction(input,slug,scope),scope,
};}
const TreasuryApiContext=createContext<ReturnType<typeof bound>|null>(null);
export function TreasuryApiProvider({scope,children}:{scope:BranchScope|null;children:ReactNode}){const api=useMemo(()=>bound(scope),[scope]);return <TreasuryApiContext value={api}>{children}</TreasuryApiContext>;}
export function useTreasuryApi(){const api=useContext(TreasuryApiContext);if(!api)throw new Error('سياق فرع الخزينة غير متاح');return api;}
