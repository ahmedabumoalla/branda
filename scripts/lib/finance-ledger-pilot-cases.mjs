import crypto from 'node:crypto';

export async function pilotContracts({db,check,fail,scalar,login,gl,change,owner,reviewer,outsider,cafe,other,data,account}) {
  await login(owner);
  for(const kind of ['cash','bank','pos','inventory','fixed_asset','accumulated_depreciation']) {
    await fail(()=>gl('account_save',{name:'Restricted '+kind,code:'RESTRICTED-'+kind,kind}),e=>e.code==='23514',kind+' creation cannot bypass original unit');
  }
  await fail(()=>gl('account_save',{id:account('4000'),revision:1,name:'Core revenue',code:'4000',kind:'revenue',isGroup:true}),/رقابي/,'empty core revenue cannot become group');
  await fail(()=>scalar('SELECT brand_finance_execute($1,$2,$3,$4)',[cafe,'journal',data,crypto.randomUUID()]),e=>e.code==='42501','legacy manual journal cannot bypass approval');
  for(const code of ['1000','1010','1020']) {
    await fail(()=>gl('save',{...data,lines:[{...data.lines[0],accountId:account(code)},data.lines[1]]}),/حسابات الرقابة/,'manual posting preserves treasury restriction '+code);
  }
  let draft=await gl('save',{...data,title:'Maker editor separation'});
  await login(reviewer);
  draft=await change(draft,'save',{...data,title:'Edited by reviewer'});
  check(draft.last_edited_by,reviewer,'last editor retained');
  draft=await change(draft,'submit');
  await fail(()=>change(draft,'approve'),e=>e.code==='42501','last editor cannot approve');
  await login(owner);
  await fail(()=>change(draft,'approve'),e=>e.code==='42501','creator cannot approve after another editor');
  await db.query("INSERT INTO bf_staff(cafe_id,user_id,name,role) VALUES($1,$2,'Independent reviewer','manager')",[cafe,outsider]);
  await login(outsider);draft=await change(draft,'approve');
  check(draft.approved_by,outsider,'independent third reviewer can approve');
  await login(owner);
  const today=await scalar("SELECT (now() AT TIME ZONE 'Asia/Riyadh')::date::text");
  await fail(()=>gl('period_close',{from:today,to:today,reason:'Do not close today'}),/يوم مكتمل/,'current Saudi day cannot close');
  const future=await scalar("SELECT ((now() AT TIME ZONE 'Asia/Riyadh')::date+1)::text");
  await fail(()=>gl('period_close',{from:future,to:future,reason:'Do not close future'}),/يوم مكتمل/,'future cannot close');
  const period={from:'2026-03-01',to:'2026-03-31',reason:'Synthetic closure checks'};
  const shift=crypto.randomUUID();
  await db.query("INSERT INTO bf_shifts(id,cafe_id,user_id,account_id,opening_cash,opened_at) VALUES($1,$2,$3,$4,0,'2026-03-01T10:00:00Z')",[shift,cafe,owner,account('1000')]);
  await fail(()=>gl('period_close',period),/الورديات/,'open shift blocks closure');
  await db.query("UPDATE bf_shifts SET status='handover' WHERE id=$1",[shift]);
  await fail(()=>gl('period_close',period),/الورديات/,'handover shift blocks closure');
  await db.query("UPDATE bf_shifts SET status='closed' WHERE id=$1",[shift]);
  const handover=crypto.randomUUID();
  await db.query('INSERT INTO bf_cash_handovers(id,cafe_id,shift_id) VALUES($1,$2,$3)',[handover,cafe,shift]);
  await fail(()=>gl('period_close',period),/استلام/,'unreceived cash blocks closure');
  await db.query('INSERT INTO bf_cash_handover_receipts(id,cafe_id,handover_id) VALUES($1,$2,$3)',[crypto.randomUUID(),cafe,handover]);
  const closed=await gl('period_close',period);
  check(closed.closed,true,'received cash permits past closure');
  await db.query("UPDATE bf_settings SET closed_through='2026-03-31' WHERE cafe_id=$1",[cafe]);
  await fail(()=>gl('period_reopen',{...period,revision:closed.revision}),/إقفال قديم/,'cannot reopen baseline closed period');
  await db.query('UPDATE bf_settings SET closed_through=NULL WHERE cafe_id=$1',[cafe]);
  await fail(()=>db.query("INSERT INTO bf_documents(cafe_id,kind,created_by,created_at) VALUES($1,'journal',$2,'2026-03-03T10:00:00Z')",[cafe,owner]),/مقفلة/,'legacy document insert honors pilot closed period');
  await db.query('UPDATE brand_finance_private.gl_rollout SET enabled=false WHERE cafe_id=$1',[other]);
  await db.query("UPDATE bf_settings SET closed_through='2026-03-31' WHERE cafe_id=$1",[other]);
  const legacy=await db.query("INSERT INTO bf_documents(cafe_id,kind,created_by,created_at) VALUES($1,'journal',$2,'2026-03-03T10:00:00Z') RETURNING id",[other,outsider]);
  check(legacy.rowCount,1,'new document guard does not change nonpilot behavior');
  const foreignAccount=await scalar("SELECT id FROM bf_accounts WHERE cafe_id=$1 AND code='1010'",[other]);
  const line=await db.query("INSERT INTO bf_journal(cafe_id,document_id,account_id,debit,credit,created_at) VALUES($1,$2,$3,1,0,'2026-04-01T10:00:00Z'),($1,$2,$3,0,1,'2026-04-01T10:00:00Z') RETURNING created_at::text",[other,legacy.rows[0].id,foreignAccount]);
  check(line.rows[0].created_at.startsWith('2026-04-01'),true,'new journal guard leaves nonpilot accounting dates unchanged');
  for(const signature of ['brand_finance_private.gl_enabled(uuid)','brand_finance_private.assert_gl_enabled(uuid)','brand_finance_private.gl_lines(uuid,jsonb)','brand_finance_private.gl_document_guard()']) {
    for(const role of ['anon','authenticated','service_role'])check(await scalar('SELECT has_function_privilege($1,$2,\'EXECUTE\')',[role,signature]),false,role+' cannot invoke '+signature);
  }
  check(await scalar("SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('brand_finance_private.gl_rollout'::regclass,'bf_gl_drafts'::regclass,'bf_gl_events'::regclass)"),true,'private pilot and ledger tables RLS enabled');
  if(db.connectIndependent) {
    const first=await db.connectIndependent(),second=await db.connectIndependent();
    try {
      for(const client of [first,second]) {
        await client.query('SET ROLE authenticated');
        await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[owner]);
      }
      await first.query('BEGIN');
      await first.query('SELECT brand_finance_gl_execute($1,$2,$3,$4)',[cafe,'period_close',{from:'2026-04-01',to:'2026-04-30',reason:'Concurrent period closure'},crypto.randomUUID()]);
      const pid=(await second.query('SELECT pg_backend_pid() pid')).rows[0].pid;
      const pending=second.query('SELECT brand_finance_gl_execute($1,$2,$3,$4)',[cafe,'save',{...data,date:'2026-04-15',title:'Racing period closure'},crypto.randomUUID()]).then(()=>({ok:true}),error=>({error}));
      let blocked=false;
      for(let i=0;i<100;i++) {blocked=await scalar('SELECT cardinality(pg_blocking_pids($1))>0',[pid]);if(blocked)break;await new Promise(resolve=>setTimeout(resolve,10));}
      check(blocked,true,'independent new posting waits for concurrent period close');
      await first.query('COMMIT');
      const result=await pending;
      check(!!result.error&&/مقفلة/.test(result.error.message),true,'racing posting rejects after committed period close');
      check(await scalar("SELECT count(*) FROM bf_gl_drafts WHERE cafe_id=$1 AND title='Racing period closure'",[cafe]),0,'period race leaves no draft');
    }finally {await first.query('ROLLBACK');await first.end();await second.end();}
  }
}
