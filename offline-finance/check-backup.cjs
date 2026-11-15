const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {exportBackup,restoreBackup}=require('./backup.cjs');
(async()=>{
 const {createEngine}=await import('./engine/index.mjs');const base=await fs.mkdtemp(path.join(os.tmpdir(),'branda-backup-check-'));let engine,restored;let passed=0;
 try{
  engine=await createEngine({dataDir:path.join(base,'source/database')});
  const owner=await engine.setupOwner({name:'Owner',email:'backup@local.invalid',company:'Backup verification'});
  await engine.querySystem("CREATE TABLE public.local_auth_users(id uuid PRIMARY KEY,password_hash text NOT NULL,role text NOT NULL,active boolean NOT NULL)");
  await engine.querySystem("INSERT INTO public.local_auth_users VALUES($1,$2,'owner',true)",[owner.id,'synthetic-password-hash']);
  const fileName='menu-products/'+owner.cafeId+'/logo.webp',bytes=Buffer.from('synthetic-local-image');
  await fs.mkdir(path.dirname(path.join(base,'source/files',fileName)),{recursive:true});await fs.writeFile(path.join(base,'source/files',fileName),bytes);
  const archive=await exportBackup({engine,dataDir:path.join(base,'source')});assert(archive.length>10000);passed++;
  restored=await restoreBackup({archive,dataDir:path.join(base,'restored')});assert.equal(restored.identity().ownerId,owner.id);passed++;
  assert.equal((await restored.querySystem('SELECT password_hash FROM local_auth_users')).rows[0].password_hash,'synthetic-password-hash');passed++;
  assert.deepEqual(await fs.readFile(path.join(base,'restored/files',fileName)),bytes);passed++;
  assert.equal((await restored.snapshot(owner.id)).accounts.length,16);passed++;
  await assert.rejects(()=>restoreBackup({archive,dataDir:path.join(base,'restored')}),/empty directory/);passed++;
  const envelope=JSON.parse(zlib.gunzipSync(archive));envelope.files[0].name='../escape';
  await assert.rejects(()=>restoreBackup({archive:zlib.gzipSync(JSON.stringify(envelope)),dataDir:path.join(base,'invalid-path')}),/Invalid backup file path/);passed++;
  envelope.files[0].name=fileName;envelope.files[0].sha256='0'.repeat(64);
  await assert.rejects(()=>restoreBackup({archive:zlib.gzipSync(JSON.stringify(envelope)),dataDir:path.join(base,'invalid-hash')}),/checksum/);passed++;
  await assert.rejects(()=>restoreBackup({archive:Buffer.from('not a backup'),dataDir:path.join(base,'invalid-file')}));passed++;
  assert.equal(await fs.stat(path.join(base,'escape')).then(()=>true,()=>false),false);passed++;
  const hashes={};for(const name of ['backup.cjs','check-backup.cjs','engine/index.mjs'])hashes[name]=crypto.createHash('sha256').update(await fs.readFile(path.join(__dirname,name))).digest('hex');
  const evidence={passed,base,archiveBytes:archive.length,checkedAt:new Date().toISOString(),node:process.version,hashes};await fs.writeFile(path.join(__dirname,'backup-verification.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }catch(error){console.error(JSON.stringify({passed,error:error.message,code:error.code}));process.exitCode=1;}finally{if(engine)await engine.close();if(restored)await restored.close();}
})();
