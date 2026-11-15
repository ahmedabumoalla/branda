import {createEngine} from './index.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
process.on('uncaughtException',e=>{console.error(JSON.stringify({error:e.message,where:e.where,code:e.code}));process.exitCode=1;});
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'branda-finance-engine-'));
const engine=await createEngine({dataDir:dir});
try{const user=await engine.setupOwner({email:'owner@local.invalid',name:'مالك الاختبار',company:'ملحمة اختبار'});const snapshot=await engine.snapshot(user.id);console.log(JSON.stringify({directory:dir,user,accounts:snapshot.accounts.length,warehouses:snapshot.warehouses.length,role:snapshot.role,keys:Object.keys(snapshot)}));}finally{await engine.close();}
