import "server-only";
import ExcelJS from "exceljs";
import {readAssetSpreadsheet} from "@/lib/data/erp-assets-import";
/** Reuse the ZIP/size/formula gate, then preserve Excel wall-clock times for tenant-zone conversion */
export async function readAttendanceSpreadsheet(file:File,delimiter:string){let rows:string[][];try{rows=await readAssetSpreadsheet(file,delimiter);}catch(error){if(error instanceof Error)throw new Error(error.message.replaceAll("مائة أصل","مائة سجل"));throw error;}if(!/\.xlsx$/i.test(file.name))return rows;const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0]);const sheet=workbook.worksheets[0];rows=[];sheet.eachRow(row=>{const cells:string[]=[];for(let i=1;i<=sheet.columnCount;i++){const cell=row.getCell(i);cells.push(cell.value instanceof Date?cell.value.toISOString().slice(0,19):cell.text);}if(cells.some(Boolean))rows.push(cells);});return rows;}
