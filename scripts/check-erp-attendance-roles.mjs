import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {spawnSync} from 'node:child_process';
const target='output/attendance-verification';mkdirSync(target,{recursive:true});
let source=readFileSync('scripts/check-erp-attendance-db.mjs','utf8');const marker=" await db.exec((await readFile('supabase/migrations/20261113093203_erp_attendance.sql','utf8'))+'\\nCOMMIT;');";
if(!source.includes(marker))throw new Error('Attendance fixture migration anchor changed');
source=source.replace(marker," await db.exec(await readFile('supabase/migrations/20261113093906_erp_roles.sql','utf8'));\n"+marker);
const tests=`
 await login(manager);let restricted=await scalar('SELECT erp_attendance_read($1,$2,$3)',[cafe,'leaves',{}]);eq(restricted.canWrite,false,'self never gains management write');eq(restricted.canCreate,true,'self own create remains enabled without custom role');
 const customRole=crypto.randomUUID();await db.query("INSERT INTO erp_roles(cafe_id,id,name,kind,active,permissions,blocked) VALUES($1,$2,'Attendance read only','employee',true,$3,'[]')",[cafe,customRole,{attendance:{read:true,create:false,update:false,delete:false,approve:false,files:false,settings:false}}]);await db.query('INSERT INTO erp_role_assignments(cafe_id,id,role_id,employee_id) VALUES($1,$2,$3,$4)',[cafe,crypto.randomUUID(),customRole,selfEmployee]);
 restricted=await scalar('SELECT erp_attendance_read($1,$2,$3)',[cafe,'leaves',{}]);eq(restricted.canCreate,false,'custom role removes own create capability');eq(restricted.canUpdate,false,'custom role removes own update capability');eq(restricted.canFiles,false,'custom role removes own file capability');
 await reject(()=>write('save_leave',{revision:0,payload:{...leavePayload,employeeId:selfEmployee}}),'custom role denies self create at real RPC');
 await reject(()=>scalar('SELECT erp_file_private.assert_record($1,$2,$3,$4)',[cafe,'attendance_session',selfSession.id,false]),'custom file denial enforced at preserved attachment dispatcher');
 await login(owner);eq((await scalar('SELECT erp_attendance_read($1,$2,$3)',[cafe,'shifts',{}])).canCreate,true,'tenant owner remains unrestricted');
`;
source=source.replace(" console.log(JSON.stringify({suite:'erp-attendance-db'",tests+" console.log(JSON.stringify({suite:'erp-attendance-real-roles'");
const file=target+'/roles-fixture.mjs';writeFileSync(file,source);const result=spawnSync(process.execPath,[file],{encoding:'utf8',maxBuffer:10*1024*1024});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.status!==0)process.exitCode=1;
