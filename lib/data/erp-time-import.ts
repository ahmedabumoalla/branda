import 'server-only';
import * as XLSX from 'xlsx';
import {readAssetSpreadsheet} from './erp-assets-import';
export async function readTimeSpreadsheet(file:File,delimiter:string):Promise<string[][]>{
 if(!/\.xls$/i.test(file.name)){const input=/\.txt$/i.test(file.name)?new File([file],file.name.replace(/\.txt$/i,'.csv'),{type:'text/csv'}):file;return readAssetSpreadsheet(input,delimiter);}
 if(file.size<=0||file.size>5*1024*1024)throw new Error('الحد الأقصى للملف خمسة ميجابايت');const data=Buffer.from(await file.arrayBuffer());if(data.length<512||data.subarray(0,8).toString('hex')!=='d0cf11e0a1b11ae1')throw new Error('ملف XLS غير صالح أو ليس ملف Excel ثنائيًا');
 const workbook=XLSX.read(data,{type:'buffer',cellFormula:true,cellHTML:false,cellDates:true,cellStyles:false,bookVBA:false,sheetRows:102,sheets:0});const sheet=workbook.Sheets[workbook.SheetNames[0]];if(!sheet?.['!ref'])throw new Error('الملف فارغ');const full=XLSX.utils.decode_range(sheet['!fullref']??sheet['!ref']);if(full.e.r>=101||full.e.c>=60)throw new Error('الحد الأقصى مائة سجل وستون عمودًا');
 const rows:string[][]=[];for(let r=full.s.r;r<=full.e.r;r++){const row:string[]=[];for(let c=0;c<=full.e.c;c++){const cell=sheet[XLSX.utils.encode_cell({r,c})];if(cell?.f||cell?.F)throw new Error('استبدل المعادلات بقيم قبل الاستيراد');let value='';if(cell?.v instanceof Date)value=cell.v.getUTCFullYear()<1901?cell.v.toISOString().slice(11,16):cell.v.toISOString().slice(0,10);else if(cell?.v!==null&&cell?.v!==undefined)value=String(cell.v);if(value.length>4000)throw new Error('إحدى الخلايا طويلة');row.push(value);}if(row.some(v=>v.trim()))rows.push(row);}if(!rows.length)throw new Error('الملف فارغ');return rows;
}
