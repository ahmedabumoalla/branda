import type {ReportsSnapshot,ReportQuery,SavedReportInput} from './reports';
import {availableReportRelations,isNumericReportColumn,resolveReportFields,type ReportColumnKey} from './report-relations';

export function reportChartForColumns(chart:SavedReportInput['chart'],columns:ReportColumnKey[]):SavedReportInput['chart']{
 const labels=columns.filter(c=>!isNumericReportColumn(c)),values=columns.filter(isNumericReportColumn);
 const label=labels.includes(chart.label)?chart.label:labels[0],value=values.includes(chart.value)?chart.value:values[0];
 return {...chart,kind:label&&value?chart.kind:'none',label:label??'date',value:value??'count'};
}

export function reportRelationAllowed(data:ReportsSnapshot,source:string,path:string){
 let current=source;
 for(const key of path.split('.')){
  const edge=data.relations?.edges.find(e=>e.source===current&&e.key===key);
  if(!edge||!data.sources.some(s=>s.id===edge.target))return false;
  current=edge.target;
 }
 return true;
}
export function reportBuilderFields(data:ReportsSnapshot,query:ReportQuery){
 return resolveReportFields(query.source,data.sources.find(s=>s.id===query.source)?.columns??[],(query.relationPaths??[]).filter(p=>reportRelationAllowed(data,query.source,p)),Object.fromEntries(data.sources.map(s=>[s.id,s.columns])));
}
export function reportRelationOptions(data:ReportsSnapshot,query:ReportQuery){
 return availableReportRelations(query.source,query.relationPaths??[]).filter(r=>reportRelationAllowed(data,query.source,r.path));
}
export function updateReportRelations(data:ReportsSnapshot,query:ReportQuery,paths:string[]):ReportQuery{
 const next={...query,relationPaths:paths,offset:0},fields=reportBuilderFields(data,next),allowed=new Set<string>(fields.map(f=>f.key));
 const columns=query.columns.filter(c=>allowed.has(c));
 if(!columns.length&&fields[0])columns.push(fields[0].key);
 return {...next,columns,groupBy:query.groupBy.filter(c=>allowed.has(c)),conditions:query.conditions.filter(c=>allowed.has(c.field)),filters:Object.fromEntries(Object.entries(query.filters).filter(([key])=>allowed.has(key))),sortBy:columns.includes(query.sortBy)?query.sortBy:columns[0]??'date'};
}
export function removeReportRelation(data:ReportsSnapshot,query:ReportQuery,path:string){
 return updateReportRelations(data,query,(query.relationPaths??[]).filter(p=>p!==path&&!p.startsWith(path+'.')));
}
export function baseReportColumn(field:ReportColumnKey){return field.split('.').at(-1)??field;}
