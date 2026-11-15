'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const buckets=new Set(['bf-inventory-images','branda-finance-shift-files','branda-finance-treasury-files','menu-products','menu-categories','cafe-logos','bf-invoice-custom-fields']);
const publicImages=new Set(['menu-products','menu-categories','cafe-logos']);
const failure=message=>Object.assign(new Error(message),{status:403});
function createStorage({dataDir,engine,getOrigin}){
 const tickets=new Map(),root=path.join(dataDir,'files');
 function location(bucket,name,cafeId){if(!buckets.has(bucket)||typeof name!=='string'||!name.startsWith(cafeId+'/')||name.includes('\\')||name.includes('\0'))throw failure('مسار الملف غير مسموح');const target=path.resolve(root,bucket,name),relative=path.relative(path.join(root,bucket),target);if(relative.startsWith('..')||path.isAbsolute(relative))throw failure('مسار الملف غير مسموح');return target;}
 function ticket(user,cafe,bucket,name,mode){location(bucket,name,cafe.id);const token=crypto.randomBytes(32).toString('hex');tickets.set(token,{userId:user.id,version:user.version,cafeId:cafe.id,bucket,name,mode,expires:Date.now()+10*60000});return token;}
 async function upload(bucket,name,bytes,options,user,cafe){const file=location(bucket,name,cafe.id);if(bytes.byteLength>10*1024*1024)throw failure('حجم الملف أكبر من المسموح');await fs.mkdir(path.dirname(file),{recursive:true});const flag=options?.upsert?'w':'wx';await fs.writeFile(file,bytes,{flag});const mime=options?.contentType||'application/octet-stream';await engine.querySystem(`insert into storage.buckets(id,name,public) values($1,$1,false) on conflict(id) do nothing`,[bucket]);try{await engine.querySystem(`insert into storage.objects(id,bucket_id,name,owner,metadata) values($1,$2,$3,$4,$5) on conflict(bucket_id,name) do update set metadata=excluded.metadata`,[crypto.randomUUID(),bucket,name,user.id,{mimetype:mime,size:bytes.byteLength,cacheControl:'0'}]);}catch(error){await fs.rm(file,{force:true});throw error;}return{path:name};}
 function forActor(user,cafe){return{
  upload:(bucket,name,bytes,options)=>upload(bucket,name,bytes,options,user,cafe),
  download:async(bucket,name)=>{const file=location(bucket,name,cafe.id),data=await fs.readFile(file),meta=await engine.queryAs(user.id,'select metadata from storage.objects where bucket_id=$1 and name=$2',[bucket,name]);if(!meta.rows.length)throw failure('الملف غير متاح');return new Blob([data],{type:meta.rows[0].metadata?.mimetype||'application/octet-stream'});},
  remove:async(bucket,names)=>{for(const name of names){await fs.rm(location(bucket,name,cafe.id),{force:true});await engine.querySystem('delete from storage.objects where bucket_id=$1 and name=$2',[bucket,name]);}return[];},
  signUpload:async(bucket,name)=>{const token=ticket(user,cafe,bucket,name,'upload');return{signedUrl:getOrigin()+'/api/storage/upload?token='+token,token,path:name};},
  signRead:async(bucket,name)=>getOrigin()+'/api/storage/file?token='+ticket(user,cafe,bucket,name,'read'),
 };}
 function validate(token,user,mode){const t=tickets.get(token);if(!t||t.mode!==mode||t.expires<Date.now()||t.userId!==user.id||t.version!==user.version)throw failure('انتهت صلاحية الملف أعد المحاولة من الصفحة');return t;}
 return{forActor,
  readPublic:async(user,bucket,name)=>{if(!publicImages.has(bucket))throw failure('الملف غير متاح');const actor=await engine.actorInfo(user.id);if(!actor)throw failure('الملف غير متاح');const file=location(bucket,name,actor.cafeId||actor.cafe.id),meta=await engine.queryAs(user.id,'select metadata from storage.objects where bucket_id=$1 and name=$2',[bucket,name]);if(!meta.rows.length)throw failure('الملف غير متاح');return{bytes:await fs.readFile(file),mime:meta.rows[0].metadata?.mimetype||'application/octet-stream',name:path.basename(name)};},
  acceptUpload:async(user,{token,bucket,name,file})=>{const t=validate(token,user,'upload');if(t.bucket!==bucket||t.name!==name||!(file instanceof File))throw failure('بيانات الملف غير صالحة');const result=await upload(bucket,name,Buffer.from(await file.arrayBuffer()),{contentType:file.type,upsert:false},user,{id:t.cafeId});tickets.delete(token);return result;},
  read:async(user,token)=>{const t=validate(token,user,'read'),file=location(t.bucket,t.name,t.cafeId);const meta=await engine.querySystem('select metadata from storage.objects where bucket_id=$1 and name=$2',[t.bucket,t.name]);return{bytes:await fs.readFile(file),mime:meta.rows[0]?.metadata?.mimetype||'application/octet-stream',name:path.basename(t.name)};},
 };
}
module.exports={createStorage};
