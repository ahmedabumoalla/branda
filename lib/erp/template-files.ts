import {inflateRawSync} from "node:zlib";
export function templateTextMime(bytes:Uint8Array,extension:string){if(!['csv','txt'].includes(extension))return null;let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error("اختر ملف نص أو CSV بترميز UTF-8");}if(!text.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw new Error("الملف لا يحتوي على نص صالح");return extension==='csv'?'text/csv':'text/plain';}
export function isTemplateXlsx(bytes:Uint8Array){try{
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(bytes.length<22||view.getUint32(0,true)!==0x04034b50)return false;let offset=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){offset=i;break;}if(offset<0||view.getUint16(offset+4,true)||view.getUint16(offset+6,true))return false;
 const count=view.getUint16(offset+10,true),central=view.getUint32(offset+16,true);if(count<1||count>2000||central>=offset||view.getUint16(offset+8,true)!==count||central+view.getUint32(offset+12,true)!==offset)return false;let cursor=central,total=0;const names=new Set<string>(),required=new Map<string,string>();
 for(let i=0;i<count;i++){
  if(cursor+46>offset||view.getUint32(cursor,true)!==0x02014b50)return false;const flags=view.getUint16(cursor+8,true),method=view.getUint16(cursor+10,true),compressed=view.getUint32(cursor+20,true),size=view.getUint32(cursor+24,true),length=view.getUint16(cursor+28,true),extra=view.getUint16(cursor+30,true),comment=view.getUint16(cursor+32,true),local=view.getUint32(cursor+42,true);total+=size;
  if(flags&1||![0,8].includes(method)||size>20_000_000||total>40_000_000||cursor+46+length+extra+comment>offset||local+30>central||view.getUint32(local,true)!==0x04034b50)return false;
  const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(cursor+46,cursor+46+length)),localLength=view.getUint16(local+26,true),localExtra=view.getUint16(local+28,true),start=local+30+localLength+localExtra;
  if(name.includes('..')||/[\\:]/.test(name)||name.startsWith('/')||/vbaProject\.bin$/i.test(name)||names.has(name)||start+compressed>central||view.getUint16(local+8,true)!==method)return false;names.add(name);
  if(new TextDecoder().decode(bytes.subarray(local+30,local+30+localLength))!==name)return false;
  if(name==='[Content_Types].xml'||name==='xl/workbook.xml'){
   if(size>1_000_000)return false;const raw=bytes.subarray(start,start+compressed),data=method===8?inflateRawSync(raw,{maxOutputLength:1_000_000}):raw;if(data.length!==size)return false;const xml=new TextDecoder('utf-8',{fatal:true}).decode(data);if(/<!DOCTYPE|<!ENTITY/i.test(xml))return false;required.set(name,xml);
  }
  cursor+=46+length+extra+comment;
 }
 return cursor===offset&&/<(?:\w+:)?Types\b/.test(required.get('[Content_Types].xml')??'')&&/spreadsheetml\.sheet\.main\+xml/.test(required.get('[Content_Types].xml')??'')&&/<(?:\w+:)?workbook\b/.test(required.get('xl/workbook.xml')??'');
 }catch{return false;}}
