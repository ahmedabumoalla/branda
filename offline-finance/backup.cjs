const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const MAX_TOTAL=256*1024*1024,MAX_DATABASE=128*1024*1024,MAX_FILE=10*1024*1024,MAX_FILES=10000;
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
function relativeName(name){
 if(typeof name!=='string'||!name||name.length>512||name.includes('\\')||name.includes(':')||/[\x00-\x1f]/.test(name)||name.startsWith('/')||name.split('/').some(part=>!part||part==='.'||part==='..'||/[. ]$/.test(part)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))throw Error('Invalid backup file path');
 return name;
}
function decode(entry,limit){
 if(!entry||typeof entry.data!=='string'||!Number.isSafeInteger(entry.size)||entry.size<0||entry.size>limit||entry.data.length>Math.ceil(limit/3)*4||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Invalid backup entry');
 const data=Buffer.from(entry.data,'base64');
 if(data.length!==entry.size||data.toString('base64')!==entry.data||sha(data)!==entry.sha256)throw Error('Backup checksum mismatch');
 return data;
}
const encode=data=>({size:data.length,sha256:sha(data),data:data.toString('base64')});
async function listFiles(root,relative='',result=[],budget={bytes:0}){
 const directory=path.join(root,relative);try{if((await fs.lstat(directory)).isSymbolicLink())throw Error('Backup cannot include symbolic links');}catch(error){if(error.code==='ENOENT'&&!relative)return result;throw error;}
 let entries;try{entries=await fs.readdir(path.join(root,relative),{withFileTypes:true});}catch(error){if(error.code==='ENOENT'&&!relative)return result;throw error;}
 for(const entry of entries){
  const name=relativeName(relative?relative+'/'+entry.name:entry.name);
  if(entry.isSymbolicLink())throw Error('Backup cannot include symbolic links');
  if(entry.isDirectory())await listFiles(root,name,result,budget);
  else if(entry.isFile()){if(result.length>=MAX_FILES)throw Error('Backup has too many files');const file=path.join(root,...name.split('/'));const stat=await fs.lstat(file);if(stat.isSymbolicLink()||stat.size>MAX_FILE)throw Error('Backup file is too large');budget.bytes+=stat.size;if(budget.bytes>MAX_TOTAL)throw Error('Backup is too large');const data=await fs.readFile(file);if(data.length!==stat.size)throw Error('File changed during backup');result.push({name,data});}
  else throw Error('Unsupported backup file type');
 }
 return result;
}
function validateDatabase(data){
 // PGlite's exporter emits regular ustar files/directories only. Reject links and
 // path escapes before handing an uploaded tar archive to the database loader.
 const tar=zlib.gunzipSync(data,{maxOutputLength:512*1024*1024});
 let offset=0,files=0;
 while(offset+512<=tar.length){
  const header=tar.subarray(offset,offset+512);if(header.every(byte=>byte===0))break;
  const string=(start,end)=>header.subarray(start,end).toString('utf8').split('\0')[0];
  const checksum=string(148,156).trim();const expected=header.reduce((total,byte,index)=>total+(index>=148&&index<156?32:byte),0);if(!/^[0-7]+$/.test(checksum)||parseInt(checksum,8)!==expected)throw Error('Invalid database archive checksum');
  const base=string(0,100),prefix=string(345,500);const name=(prefix?prefix+'/':'')+base;
  relativeName(name.replace(/^\//,'').replace(/\/$/,''));
  const type=header[156];if(type!==0&&type!==48&&type!==53)throw Error('Unsupported database archive entry');
  const sizeText=string(124,136).trim();if(!/^[0-7]+$/.test(sizeText))throw Error('Invalid database archive');
  const size=parseInt(sizeText,8);if(!Number.isSafeInteger(size)||offset+512+size>tar.length)throw Error('Truncated database archive');
  files++;offset+=512+Math.ceil(size/512)*512;
 }
 if(!files)throw Error('Empty database archive');
}
async function exportBackup({engine,dataDir}){
 const database=Buffer.from(await (await engine.exportArchive()).arrayBuffer());
 if(database.length>MAX_DATABASE)throw Error('Database backup is too large');
 const files=await listFiles(path.join(dataDir,'files'),'',[],{bytes:database.length});let total=database.length;
 for(const file of files){total+=file.data.length;if(total>MAX_TOTAL)throw Error('Backup is too large');}
 const envelope={format:'branda-finance-offline',version:1,createdAt:new Date().toISOString(),database:encode(database),files:files.map(file=>({name:file.name,...encode(file.data)}))};
 return zlib.gzipSync(Buffer.from(JSON.stringify(envelope)),{level:6});
}
async function restoreBackup({archive,dataDir}){
 if(!Buffer.isBuffer(archive)||archive.length>MAX_TOTAL)throw Error('Invalid backup size');
 const envelope=JSON.parse(zlib.gunzipSync(archive,{maxOutputLength:Math.ceil(MAX_TOTAL*1.4)}).toString('utf8'));
 if(envelope.format!=='branda-finance-offline'||envelope.version!==1||!Array.isArray(envelope.files)||envelope.files.length>MAX_FILES)throw Error('Unsupported backup format');
 const database=decode(envelope.database,MAX_DATABASE);validateDatabase(database);
 const seen=new Set();let total=database.length;
 const files=envelope.files.map(entry=>{const name=relativeName(entry.name),key=name.toLowerCase();if(seen.has(key))throw Error('Duplicate backup path');seen.add(key);const data=decode(entry,MAX_FILE);total+=data.length;if(total>MAX_TOTAL)throw Error('Backup is too large');return{name,data};});
 let entries;try{if((await fs.lstat(dataDir)).isSymbolicLink())throw Error('Restore cannot target a symbolic link');entries=await fs.readdir(dataDir);}catch(error){if(error.code!=='ENOENT')throw error;entries=[];}
 if(entries.length)throw Error('Restore requires a new or empty directory');
 const {createEngine}=await import('./engine/index.mjs');
 const engine=await createEngine({dataDir:path.join(dataDir,'database'),loadDataDir:new Blob([database])});
 try{
  if(!engine.identity()?.ownerId)throw Error('Backup contains no initialized company');
  const owner=(await engine.querySystem("SELECT id FROM public.local_auth_users WHERE id=$1 AND role='owner' AND active AND length(password_hash)>0",[engine.identity().ownerId])).rows[0];
  if(!owner)throw Error('Backup contains no active owner login');
  for(const file of files){const target=path.join(dataDir,'files',...file.name.split('/'));await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,file.data,{flag:'wx'});}
  return engine;
 }catch(error){await engine.close();throw error;}
}
module.exports={exportBackup,restoreBackup};
