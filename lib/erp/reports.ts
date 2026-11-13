import {z} from 'zod';
import {reportFields,reportSources,type ReportField,type ReportSource,type ReportDefinition} from './report-catalog';
import {columnLabel,isNumericReportColumn,reportColumnSchema,reportRelationPathsSchema,resolveReportFields,validReportRelationPaths,type ReportColumnKey,type ReportRelationEdge} from './report-relations';
export const reportFieldSchema=reportColumnSchema;
export const reportSourceSchema=z.enum(reportSources.map(s=>s[0]) as [ReportSource,...ReportSource[]]);
export const reportConditionSchema=z.object({field:reportFieldSchema,operator:z.enum(['eq','neq','contains','starts','ends','gte','lte','empty','not_empty']),value:z.string().max(1000)}).strict();
export type ReportCondition=z.infer<typeof reportConditionSchema>;
export const reportQuerySchema=z.object({source:reportSourceSchema,from:z.iso.date(),to:z.iso.date(),columns:z.array(reportFieldSchema).min(1).max(40),groupBy:z.array(reportFieldSchema).max(4),summary:z.boolean(),filters:z.record(z.string().max(180),z.string().max(1000)),conditions:z.array(reportConditionSchema).max(30),conditionMode:z.enum(['all','any']),sortBy:reportFieldSchema,descending:z.boolean(),offset:z.number().int().min(0).max(1e7),limit:z.number().int().min(1).max(500),relationPaths:reportRelationPathsSchema.optional()}).strict().superRefine((q,c)=>{
 if(q.from>q.to||Date.parse(q.to)-Date.parse(q.from)>3660*86400000)c.addIssue({code:'custom',message:'راجع فترة التقرير بحيث لا تتجاوز عشر سنوات'});
 if(new Set(q.columns).size!==q.columns.length||new Set(q.groupBy).size!==q.groupBy.length||q.groupBy.some(isNumericReportColumn))c.addIssue({code:'custom',message:'اختر الأعمدة والتجميع دون تكرار'});
 const paths=q.relationPaths??[],allowed=new Set<string>([...Object.keys(reportFields),...resolveReportFields(q.source,[],paths).map(f=>f.key)]);
 if(!validReportRelationPaths(q.source,paths)||[...q.columns,...q.groupBy,q.sortBy,...q.conditions.map(v=>v.field),...Object.keys(q.filters)].some(key=>!allowed.has(key)))c.addIssue({code:'custom',message:'اختر العلاقات وحقولها من مصادر التقرير المتاحة'});
});
export type ReportQuery=z.infer<typeof reportQuerySchema>;
export const savedReportSchema=z.object({id:z.uuid().nullable(),revision:z.number().int().nonnegative(),name:z.string().trim().min(1).max(150),family:z.string().min(1).max(40),query:reportQuerySchema,chart:z.object({kind:z.enum(['none','bar','line','area','pie']),label:reportFieldSchema,value:reportFieldSchema,stacked:z.boolean(),showLegend:z.boolean()}).strict()}).strict();
export type SavedReportInput=z.infer<typeof savedReportSchema>;
export type SavedReport=SavedReportInput&{id:string;createdAt:string;updatedAt:string};
export type ReportRow=Record<string,string|number|boolean|null>;
export type ReportResult={rows:ReportRow[];total:number;totals:Record<string,number|null>;options:Record<string,string[]>;generatedAt:string;from:string;to:string;basis:string;hasMore:boolean};
export type ReportsSnapshot={slug:string;brand:string;catalog:ReportDefinition[];sources:{id:ReportSource;title:string;columns:ReportField[]}[];relations?:{version:1;edges:Pick<ReportRelationEdge,'source'|'key'|'target'|'label'|'cardinality'>[];maxDepth:number;maxPaths:number};saved:SavedReport[];canCreate:boolean;canUpdate:boolean;canDelete:boolean};
export function initialReportQuery(report:Pick<ReportDefinition,'source'|'columns'|'groupBy'|'filters'>,today:string):ReportQuery{const start=today.slice(0,8)+'01';return {source:report.source,from:start,to:today,columns:[...report.columns],groupBy:[report.groupBy],summary:false,filters:{...report.filters},conditions:[],conditionMode:'all',sortBy:report.columns.includes('date')?'date':report.columns[0],descending:false,offset:0,limit:100};}
export function reportCsv(columns:ReportColumnKey[],rows:ReportRow[],source?:string){const escape=(v:unknown)=>{let value=v===null||v===undefined?'':String(v);if(/^[\s]*[=+@\-]/.test(value)&&typeof v!=='number')value="'"+value;return '"'+value.replaceAll('"','""')+'"';};return '\uFEFF'+[columns.map(c=>escape(columnLabel(c,source))).join(','),...rows.map(r=>columns.map(c=>escape(r[c])).join(','))].join('\r\n');}
