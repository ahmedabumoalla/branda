import type {PayrollRecord,PayrollSnapshot} from './payroll';
export function payrollExportRows(data:PayrollSnapshot,records:PayrollRecord[]) {
 const mapping=data.settings?.mudad||{basic:['basic'],housing:[],transport:[]};
 return records.filter(r=>['approved','paid'].includes(r.status)).map(r=>{
  const employee=data.employees.find(e=>e.id===r.employeeId),c=r.payload.calculation as {basic?:number;lines?:{componentId:string;amount:number;referenceOnly:boolean}[]};
  const amount=(ids:string[])=>ids.reduce((sum,id)=>sum+(id==='basic'?Number(c?.basic||0):Number(c?.lines?.find(l=>l.componentId===id&&!l.referenceOnly)?.amount||0)),0);
  return [employee?.code||'',r.name,r.code||'',String(r.payload.from||''),String(r.payload.to||''),String(r.payload.currency||'SAR'),amount(mapping.basic).toFixed(2),amount(mapping.housing).toFixed(2),amount(mapping.transport).toFixed(2),Number(r.total||0).toFixed(2)];
 });
}
