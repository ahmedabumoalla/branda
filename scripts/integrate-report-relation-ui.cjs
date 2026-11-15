'use strict';
const fs=require('node:fs');
for(const name of ['builder','grouping','chart','workspace']){
 const file=`components/erp/reports/${name}.tsx`;let s=fs.readFileSync(file,'utf8');
 const replace=(a,b)=>{if(!s.includes(a))throw Error(`${name}: missing ${a}`);s=s.replace(a,b);};
 s=s.replace(/reportFields\[([\w.]+)\]/g,'columnLabel($1)').replace(/reportNumericFields\.includes\(([^)]+)\)/g,'isNumericReportColumn($1)').replaceAll('type ReportField','type ReportColumnKey').replaceAll(':ReportField',':ReportColumnKey').replaceAll('as ReportField','as ReportColumnKey');
 s=s.replace(/import \{[^\n]*\} from ['"]@\/lib\/erp\/report-catalog['"];\r?\n/,name==='builder'?"import {reportFamilies} from '@/lib/erp/report-catalog';\n":name==='workspace'?"import {reportFamilies,type ReportDefinition} from '@/lib/erp/report-catalog';\n":'');
 const imports=`import {columnLabel${name==='chart'?'':',isNumericReportColumn,type ReportColumnKey'}} from '@/lib/erp/report-relations';\n`;
 s=s.replace("'use client';","'use client';\n"+imports);
 if(name==='builder'){
  replace("import {ReportGrouping} from './grouping';","import {ReportGrouping} from './grouping';\nimport {ReportRelations} from './relations';\nimport {reportBuilderFields} from '@/lib/erp/report-builder-state';");
  replace("const source=data.sources.find(x=>x.id===query.source),fields=source?.columns??[];","const fields=reportBuilderFields(data,query).map(f=>f.key);");
  replace("source:next.id,columns,groupBy:[label]","source:next.id,relationPaths:[],columns,groupBy:[label]");
  replace("</select></label></div></section>","</select></label></div><div className={s.body}><ReportRelations data={data} query={query} onChange={next=>{setQuery(next);setDraft(d=>({...d,chart:next.columns.includes(d.chart.label)&&next.columns.includes(d.chart.value)?d.chart:{...d.chart,kind:'none',label:next.columns.find(c=>!isNumericReportColumn(c))??'date',value:next.columns.find(isNumericReportColumn)??'count'}}));}}/></div></section>");
 }
 if(name==='workspace'){
  replace("import {ReportBuilder} from './builder';","import {ReportBuilder} from './builder';\nimport {baseReportColumn,reportBuilderFields} from '@/lib/erp/report-builder-state';");
  replace("source=data.sources.find(x=>x.id===query.source),numeric=source?.columns.filter(x=>isNumericReportColumn(x))??[],dimensions=source?.columns.filter(x=>!isNumericReportColumn(x))??[]","resolvedFields=reportBuilderFields(data,query),numeric=resolvedFields.filter(f=>f.numeric).map(f=>f.key),dimensions=resolvedFields.filter(f=>!f.numeric).map(f=>f.key)");
  replace("export function reportCell(value:ReportRow[string],field?:ReportColumnKey,preferences?:SystemDisplayPreferences){","export function reportCell(value:ReportRow[string],field?:ReportColumnKey,preferences?:SystemDisplayPreferences){field=field&&!field.includes('.list.')?baseReportColumn(field) as ReportColumnKey:field;");
 }
 fs.writeFileSync(file,s);
}
