'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn,execFile}=require('node:child_process'),{promisify}=require('node:util');
const execFileAsync=promisify(execFile),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const input=process.argv[2];
if(!input){console.error('Usage: node offline-finance/verify-package.cjs <zip-or-extracted-directory> [expected-zip-sha256]');process.exit(2);}
const source=path.resolve(input),expected=process.argv[3],checks=[];
const result={startedAt:new Date().toISOString(),source,checks,runtime:process.version};
let child,runDir,cookie='',csrf='',origin='';
function check(name,value){assert.ok(value,name);checks.push(name);}
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function files(dir,prefix=''){let list=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const name=prefix+entry.name;if(entry.isSymbolicLink())throw Error('Unexpected symbolic link: '+name);if(entry.isDirectory())list.push(...await files(path.join(dir,entry.name),name+'/'));else if(entry.isFile())list.push(name);}return list;}
async function request(route,body){const response=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf})},body:body===undefined?undefined:JSON.stringify(body)});const payload=await response.json();if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];if(response.status>=400)throw Error(route+' '+response.status+': '+JSON.stringify(payload));return payload;}
const action=(module,name,args=[])=>request('/api/action',{module:'@/app/actions/'+module,name,args});
const command=(operation,payload)=>action('brand-finance','executeBrandFinanceAction',[{operation,payload,requestId:crypto.randomUUID()}]);
async function stop(){if(!child||child.exitCode!==null)return;try{if(origin&&cookie)await request('/api/quit',{});}catch{}for(let i=0;i<40&&child.exitCode===null;i++)await pause(100);if(child.exitCode===null){child.kill();await pause(300);}}
(async()=>{try{
 const output=path.resolve('output/offline-finance-package-verification');await fs.mkdir(output,{recursive:true});runDir=await fs.mkdtemp(path.join(output,'run-'));result.evidenceDirectory=runDir;
 const stat=await fs.stat(source);let packageRoot;
 if(stat.isFile()){
  const bytes=await fs.readFile(source);result.archiveSha256=sha(bytes);if(expected)check('Archive matches expected SHA256',result.archiveSha256===expected.toLowerCase());
  const extraction=path.join(runDir,'extracted');await fs.mkdir(extraction);
  await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath $env:BRANDA_VERIFY_ARCHIVE -DestinationPath $env:BRANDA_VERIFY_EXTRACT"],{windowsHide:true,env:{...process.env,BRANDA_VERIFY_ARCHIVE:source,BRANDA_VERIFY_EXTRACT:extraction},timeout:120000,maxBuffer:1024*1024});
  packageRoot=path.join(extraction,'Branda-Finance-Offline');
 }else packageRoot=source;
 const manifest=JSON.parse(await fs.readFile(path.join(packageRoot,'manifest.json'),'utf8'));check('Package has versioned file manifest',['3.0.0','3.0.1'].includes(manifest.version)&&Array.isArray(manifest.files)&&manifest.files.length>0);result.manifestSha256=sha(await fs.readFile(path.join(packageRoot,'manifest.json')));
 const listed=new Set();for(const entry of manifest.files){assert.equal(typeof entry.file,'string');const destination=path.resolve(packageRoot,entry.file),relative=path.relative(packageRoot,destination);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Manifest path stays inside package');assert.ok(!listed.has(entry.file),'No duplicate manifest entries');listed.add(entry.file);const bytes=await fs.readFile(destination);assert.equal(bytes.length,entry.bytes,'Size: '+entry.file);assert.equal(sha(bytes),entry.sha256,'SHA256: '+entry.file);}
 check('Every manifest file matches size and SHA256',listed.size===manifest.files.length);const actual=(await files(packageRoot)).filter(file=>file!=='manifest.json');check('No unlisted package files',actual.length===listed.size&&actual.every(file=>listed.has(file)));check('Package contains no environment files or database directories',actual.every(file=>!/(^|\/)(?:\.env(?:\.[^/]*)?|\.git|database|running\.json|application\.lock)(\/|$)/i.test(file)));
 const executable=path.join(packageRoot,'node.exe');const version=await execFileAsync(executable,['--version'],{cwd:packageRoot,windowsHide:true});result.packagedRuntime=version.stdout.trim();check('Packaged runtime is Node 24',/^v24\./.test(result.packagedRuntime));
 const dataDir=path.join(runDir,'test-data');await fs.mkdir(dataDir);let log='';child=spawn(executable,[path.join(packageRoot,'server.cjs'),'--data',dataDir,'--no-browser'],{cwd:packageRoot,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',chunk=>{log=(log+chunk.toString()).slice(-100000);});child.stderr.on('data',chunk=>{log=(log+chunk.toString()).slice(-100000);});child.on('error',error=>{log+='\n'+error.message;});
 for(let i=0;i<240;i++){if(child.exitCode!==null)throw Error('Packaged server exited: '+log);try{origin=JSON.parse(await fs.readFile(path.join(dataDir,'running.json'),'utf8')).url;if(origin)break;}catch{}await pause(250);}
 check('Packaged server starts on fresh disposable database',/^http:\/\/127\.0\.0\.1:\d+$/.test(origin));
 const auth=await execFileAsync(executable,[path.resolve(__dirname,'check-auth.cjs'),dataDir],{cwd:runDir,windowsHide:true,timeout:60000,maxBuffer:1024*1024});await fs.writeFile(path.join(runDir,'auth-check.stdout.log'),auth.stdout+auth.stderr);const authResult=JSON.parse(auth.stdout.trim().split(/\r?\n/).at(-1));check('Packaged runtime passes all existing auth checks',authResult.passed&&authResult.checks.length>=18);result.authChecks=authResult.checks.length;
 let session=await request('/api/session');csrf=session.csrf;await request('/api/login',{username:'owner',password:'owner-test-password'});session=await request('/api/session');csrf=session.csrf;const snapshot=session.snapshot;
 const unit=await action('finance-inventory-catalog','saveFinanceInventoryUnitAction',[{requestId:crypto.randomUUID(),name:'كيلو'}]);check('HTTP original inventory unit creation',unit.ok&&unit.unit.id);
 const productId=await action('menu','saveMenuProductAction',[{id:'new',name:'صنف اختبار الحزمة',price:50,description:'',ingredients:[],available:true,imageVariant:'warm',butcherDetails:{meatType:'sheep',origin:null,units:[{id:'kg',label:'كيلو',price:50}]}}]);check('HTTP original selling product creation',typeof productId==='string');
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3n0AAAAASUVORK5CYII=';
 const uploaded=await action('upload','uploadImageAction',['menu-products',{$type:'FormData',entries:[['file',{$type:'File',name:'product.png',type:'image/png',data:png}]]},'product',productId]);check('Packaged image upload uses original action',typeof uploaded.storagePath==='string');
 const menu=await action('menu','fetchOwnerMenuAction');await action('menu','saveMenuProductAction',[{...menu.products.find(product=>product.id===productId),imageAssetId:uploaded.storagePath}]);
 const mediaSession=await request('/api/session');const imageUrl=mediaSession.snapshot.products.find(product=>product.id===productId)?.imageUrl;check('Initial session snapshot contains original DAL product media',typeof imageUrl==='string'&&imageUrl.length>0);
 const photo=await fetch(new URL(imageUrl,origin),{headers:{Cookie:cookie}});check('Initial cashier product image loads from packaged local server',photo.ok&&Buffer.from(await photo.arrayBuffer()).equals(Buffer.from(png,'base64')));
 const item=await action('finance-inventory-catalog','saveFinanceInventoryItemAction',[{requestId:crypto.randomUUID(),payload:{name:'مخزون اختبار الحزمة',unitId:unit.unit.id,sku:'PACKAGE-TEST',barcode:'PKG001',minQuantity:1,costMode:'full',productLinks:[{productId,quantity:1}]}}]);check('HTTP original item linked to cashier product',item.ok&&item.item.id);
 const supplier=await command('party',{kind:'supplier',name:'مورد اختبار الحزمة',phone:'0500000000',active:true});check('HTTP original supplier creation',supplier.ok);
 const purchase=await command('purchase',{partyId:supplier.data.id,warehouseId:snapshot.warehouses[0].id,lines:[{itemId:item.item.id,quantity:10,unitPrice:30}],discount:0,paid:0,note:'شراء اختبار الحزمة'});check('HTTP original purchase posts successfully',purchase.ok);
 const drawer=snapshot.accounts.find(account=>account.is_cashier_drawer);const shift=await command('shift_open',{accountId:drawer.id,openingCash:0,note:'وردية اختبار الحزمة'});check('HTTP original cashier shift opens',shift.ok);
 const sale=await command('sale',{warehouseId:snapshot.warehouses[0].id,shiftId:shift.data.id,accountId:drawer.id,lines:[{productId,quantity:2,expectedUnitPrice:50,unitId:'kg'}],discount:0,vatRate:0,taxInclusive:true,expectedTotal:100,note:'بيع اختبار الحزمة'});check('HTTP original cashier sale posts successfully',sale.ok);
 const final=await action('brand-finance','fetchBrandFinanceAction');check('HTTP snapshot reflects purchase and stock deduction',final.ok&&final.data.stock.some(stock=>stock.item_id===item.item.id&&stock.quantity===8));check('HTTP snapshot reflects actual cash sale',final.data.documents.some(document=>document.id===sale.data.id&&document.total===100&&document.paid===100));
 const report=await action('finance-control-report','fetchFinanceJournalExportAction',[{from:'',to:'',query:''}]);check('Packaged original journal export works',report.ok);
 const home=await fetch(origin,{headers:{Cookie:cookie}});check('Packaged application HTML is served',home.ok&&(await home.text()).includes('<html'));
 await fs.writeFile(path.join(runDir,'server.log'),log);result.pass=true;
 }catch(error){result.pass=false;result.error=error.stack||error.message;process.exitCode=1;}finally{await stop();result.finishedAt=new Date().toISOString();if(runDir)await fs.writeFile(path.join(runDir,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));}
})();
