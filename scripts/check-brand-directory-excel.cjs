(async () => {
const {default:assert} = await import('node:assert/strict');
const {default:fs} = await import('node:fs');
const {default:path} = await import('node:path');
const {default:ts} = await import('typescript');
const {default:ExcelJS} = await import('exceljs');
const {default:JSZip} = await import('jszip');
const {createRequire} = await import('node:module');
const requireDependency = createRequire(__filename);

const root = path.resolve(__dirname, '..');
function load(relative, stubs = {}) {
  const result = {};
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  new Function('require','exports',compiled)(name => {
    if (name === 'server-only') return {};
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith('@/')) return load(name.slice(2)+'.ts', stubs);
    return requireDependency(name);
  },result);
  return result;
}
const excel = load('lib/export/brand-directory-excel.ts');
const now = Date.parse('2026-11-06T12:00:00Z');
const iso = value => new Date(value).toISOString();
const day = 86400000;
const subscription = overrides => ({id:'subscription-base',created_at:'2026-11-01T00:00:00Z',status:'active',activation_source:null,plan_id:'plan-base',plan_name_snapshot:'PRIVATE_PLAN_SENTINEL',started_at:iso(now-day),expires_at:iso(now+day*5),amount_sar:54321,platform_plans:{active:true},...overrides});
const brand = (id, subscriptions = [], overrides = {}) => ({id,name:`علامة ${id}`,createdAt:'2026-11-05T22:30:00Z',accountStatus:'active',subscriptions,...overrides});
let passed=0;
async function test(label, body) {await body();passed++;console.log(`PASS ${label}`);}
function cells(row) {return excel.exportSubscriptionCells(row,now);}
const date = value => new Date(`${value}T00:00:00Z`);

async function main() {
  await test('subscription status and remaining-day boundaries', () => {
    const same=(state,text)=>[state,text,text,text];
    const cases = [
      [null,same('بدون اشتراك','لا يوجد')],
      [subscription({}),['نشط',date('2026-11-05'),date('2026-11-11'),5]],
      [subscription({expires_at:iso(now+1)}),['نشط',date('2026-11-05'),date('2026-11-06'),1]],
      [subscription({expires_at:iso(now+day+1)}),['نشط',date('2026-11-05'),date('2026-11-07'),2]],
      [subscription({started_at:'2026-10-20T21:00:00Z',expires_at:'2026-11-19T21:00:00Z'}),['نشط',date('2026-10-21'),date('2026-11-20'),14]],
      [subscription({started_at:null}),['نشط','غير محدد',date('2026-11-11'),5]],
      [subscription({status:'trialing'}),['في فترة تجربة',date('2026-11-05'),date('2026-11-11'),5]],
      [subscription({status:'trialing',activation_source:'admin_prepared_trial',started_at:null,expires_at:null}),['جاهز ولم تبدأ التجربة','تبدأ بعد إرسال بيانات الدخول','لم تبدأ بعد','لم تبدأ بعد']],
      [subscription({status:'trialing',activation_source:'admin_prepared_trial'}),['جاهز ولم تبدأ التجربة','تبدأ بعد إرسال بيانات الدخول','لم تبدأ بعد','لم تبدأ بعد']],
      [subscription({status:'expired'}),['اشتراك منتهي',date('2026-11-05'),date('2026-11-11'),0]],
      [subscription({status:'expired',started_at:null,expires_at:null}),['اشتراك منتهي','غير متاح','غير متاح',0]],
      [subscription({expires_at:iso(now)}),['اشتراك منتهي',date('2026-11-05'),date('2026-11-06'),0]],
      [subscription({status:'trialing',expires_at:iso(now-1)}),['فترة تجربة منتهية',date('2026-11-05'),date('2026-11-06'),0]],
      [subscription({status:'cancelled'}),same('اشتراك ملغي','غير متاح')],
      [subscription({started_at:iso(now+day)}),['اشتراك لم يبدأ',date('2026-11-07'),date('2026-11-11'),'لم تبدأ بعد']],
      [subscription({status:'trialing',started_at:iso(now+day)}),['فترة تجربة لم تبدأ',date('2026-11-07'),date('2026-11-11'),'لم تبدأ بعد']],
      [subscription({expires_at:null}),['نشط',date('2026-11-05'),'بدون تاريخ انتهاء','بدون تاريخ انتهاء']],
      [subscription({expires_at:'invalid-date'}),same('اشتراك غير فعال','غير متاح')],
      [subscription({started_at:'invalid-date'}),same('اشتراك غير فعال','غير متاح')],
      [subscription({platform_plans:{active:false}}),same('اشتراك غير فعال','غير متاح')],
      [subscription({platform_plans:null}),same('اشتراك غير فعال','غير متاح')],
      [subscription({status:'pending'}),same('بانتظار التفعيل','لم تبدأ بعد')],
      [subscription({status:'past_due'}),same('بانتظار التفعيل','لم تبدأ بعد')],
      [subscription({status:'unknown'}),same('اشتراك غير فعال','غير متاح')],
    ];
    for(const [input,expected] of cases) assert.deepEqual(cells(input),expected,JSON.stringify(input));
  });
  await test('current active plan outranks newer expired, trial and prepared rows without mutating input', () => {
    const active=subscription({id:'older-active'}),rows=[
      subscription({id:'new-expired',status:'expired',created_at:'2026-11-06T11:30:00Z'}),
      subscription({id:'new-trial',status:'trialing',created_at:'2026-11-06T11:00:00Z'}),
      subscription({id:'new-prepared',status:'trialing',activation_source:'admin_prepared_trial',created_at:'2026-11-06T11:45:00Z'}),active,
    ];
    const before=JSON.stringify(rows);assert.equal(excel.selectExportSubscription(rows,now),active);assert.equal(JSON.stringify(rows),before);
    assert.equal(excel.selectExportSubscription(rows.slice(0,3),now).id,'new-trial');
    assert.equal(excel.selectExportSubscription([],now),null);
  });
  await test('latest eligible active wins; inactive future or malformed plans cannot displace it', () => {
    const rows=[subscription({id:'old'}),subscription({id:'current',created_at:'2026-11-05T00:00:00Z'}),
      subscription({id:'future',created_at:'2026-11-06T01:00:00Z',started_at:iso(now+day)}),
      subscription({id:'inactive-plan',created_at:'2026-11-06T02:00:00Z',platform_plans:{active:false}}),
      subscription({id:'malformed',created_at:'2026-11-06T03:00:00Z',expires_at:'invalid'})];
    assert.equal(excel.selectExportSubscription(rows,now).id,'current');
  });
  await test('no current subscription retains most recent historical state', () => {
    const rows=[subscription({id:'old-expired',status:'expired'}),subscription({id:'new-cancelled',status:'cancelled',created_at:'2026-11-05T00:00:00Z'})];
    assert.equal(excel.selectExportSubscription(rows,now).id,'new-cancelled');
  });
  await test('concurrent current deadlines distinguish mixed, shared and indefinite periods', () => {
    const first=subscription({id:'menu',plan_id:'menu'});
    const second=overrides=>subscription({id:'loyalty',plan_id:'loyalty',...overrides});
    const cases=[
      [[first,second({expires_at:iso(now+day*9)})],'مواعيد مختلفة'],
      [[first,second({status:'trialing',expires_at:iso(now+day*2)})],'مواعيد مختلفة'],
      [[first,second({expires_at:null})],'مواعيد مختلفة'],
      [[first,second({})],5],
      [[first,second({expires_at:'2026-11-11T15:00:00+03:00'})],5],
      [[subscription({expires_at:null}),second({expires_at:null})],'بدون تاريخ انتهاء'],
    ];
    for(const [rows,expected] of cases){
      const before=JSON.stringify(rows),result=excel.brandExportCells(brand('multi',rows),now);
      assert.equal(result.length,8);assert.equal(result[2],'نشط');assert.equal(result[5],expected);
      assert.deepEqual(result[3],date('2026-11-05'));
      assert.deepEqual(result[4],typeof expected==='number'?date('2026-11-11'):expected);
      assert.equal(result[6],null);assert.equal(result[7],null);
      assert.equal(JSON.stringify(rows),before);
    }
    for(const extra of [
      second({status:'cancelled'}),second({status:'expired'}),second({expires_at:iso(now-1)}),
      second({started_at:iso(now+day),expires_at:iso(now+day*9)}),
      second({platform_plans:{active:false},expires_at:iso(now+day*9)}),
      second({expires_at:'invalid'}),
      second({status:'trialing',activation_source:'admin_prepared_trial',started_at:null,expires_at:null}),
    ])assert.equal(excel.brandExportCells(brand('multi',[first,extra]),now)[5],5,'only actually current non-prepared rows can create mixed deadlines');
  });
  await test('real XLSX preserves mixed-deadline text alongside sortable shared remaining days', async () => {
    const first=subscription({id:'menu',plan_id:'menu'});
    const second=subscription({id:'loyalty',plan_id:'loyalty'});
    const book=new ExcelJS.Workbook();
    await book.xlsx.load(await excel.buildBrandDirectoryExcel({exportedAt:iso(now),brands:[
      brand('mixed',[first,{...second,expires_at:iso(now+day*9)}]),brand('shared',[first,second]),
    ]}));
    const result=book.worksheets[0];
    assert.equal(result.columnCount,8);assert.equal(result.getCell('F6').value,'مواعيد مختلفة');
    assert.equal(result.getCell('F6').type,ExcelJS.ValueType.String);assert.equal(result.getCell('E6').value,'مواعيد مختلفة');
    assert.equal(result.getCell('F7').value,5);assert.equal(result.getCell('F7').type,ExcelJS.ValueType.Number);
    assert.equal(result.getCell('E7').value.toISOString(),'2026-11-11T00:00:00.000Z');
  });
  await test('account state is one of active, trial or ready before the trial, and a suspended account says so', () => {
    const prepared=subscription({id:'prepared',status:'trialing',activation_source:'admin_prepared_trial',started_at:null,expires_at:null});
    assert.equal(excel.brandExportCells(brand('a',[subscription({})]),now)[2],'نشط');
    assert.equal(excel.brandExportCells(brand('a',[subscription({status:'trialing'})]),now)[2],'في فترة تجربة');
    assert.deepEqual(excel.brandExportCells(brand('a',[prepared]),now).slice(2),['جاهز ولم تبدأ التجربة','تبدأ بعد إرسال بيانات الدخول','لم تبدأ بعد','لم تبدأ بعد',null,null]);
    assert.equal(excel.brandExportCells(brand('a',[prepared,subscription({id:'paid',created_at:'2026-10-01T00:00:00Z'})]),now)[2],'نشط');
    assert.equal(excel.brandExportCells(brand('a'),now)[2],'بدون اشتراك');
    assert.deepEqual(excel.brandExportCells(brand('a',[subscription({})],{accountStatus:'suspended'}),now).slice(2,6),['موقوف',date('2026-11-05'),date('2026-11-11'),5]);
  });
  await test('Riyadh calendar day and invalid joined date', () => {
    assert.equal(excel.brandExportCells(brand('a'),now)[1].toISOString(),'2026-11-06T00:00:00.000Z');
    assert.equal(excel.brandExportCells(brand('a',[],{createdAt:'2026-11-05T20:59:59Z'}),now)[1].toISOString(),'2026-11-05T00:00:00.000Z');
    assert.equal(excel.brandExportCells(brand('a',[],{createdAt:'invalid'}),now)[1],'غير متاح');
    assert.equal(excel.brandExportCells(brand('a',[],{accountStatus:'suspended'}),now)[2],'موقوف');
  });
  const names=['=HYPERLINK("https://example.invalid","x")','+SUM(1,2)','-2+3','@SUM(A1:A2)','اسم \u0001علامة\u0000'];
  const brands=Array.from({length:27},(_,i)=>brand(`brand-${i}`,[subscription({id:`sub-${i}`})],{
    name:names[i]??`علامة مستقلة ${i}`,ownerEmail:'PRIVATE_OWNER_SENTINEL',ownerPhone:'PRIVATE_PHONE_SENTINEL',privateToken:'PRIVATE_TOKEN_SENTINEL'
  }));
  const snapshot={exportedAt:iso(now),brands,customerData:'PRIVATE_CUSTOMER_SENTINEL'};
  const bytes=await excel.buildBrandDirectoryExcel(snapshot);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);
  const sheet=workbook.worksheets[0];
  const archive=await JSZip.loadAsync(bytes);
  const xml=Object.fromEntries(await Promise.all(Object.keys(archive.files).filter(n=>n.endsWith('.xml')).map(async n=>[n,await archive.file(n).async('string')])));
  await test('real XLSX roundtrip keeps all 27 brands and exactly eight visible columns in the requested order', () => {
    assert(bytes instanceof Uint8Array);assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4b);
    assert.equal(workbook.worksheets.length,1);assert.equal(sheet.columnCount,8);assert.equal(sheet.rowCount,32);
    assert.deepEqual(sheet.getRow(5).values.slice(1),['اسم العلامة التجارية','تاريخ الانضمام وإنشاء الحساب','حالة الحساب','تاريخ بداية الباقة الحالية','تاريخ نهاية الباقة الحالية','المدة المتبقية بالأيام','إجمالي مدفوعات العلامة','عدد التجديدات']);
    assert.deepEqual(sheet.getRow(5).values.slice(1),excel.BRAND_EXCEL_COLUMNS);
    assert.equal(sheet.getCell('A32').value,'علامة مستقلة 26');
    assert(sheet.columns.every(c=>!c.hidden));
  });
  await test('actual OOXML table and filter cover all data rows', () => {
    const tables=Object.keys(xml).filter(n=>/^xl\/tables\/table\d+\.xml$/.test(n));assert.equal(tables.length,1);
    const table=xml[tables[0]];assert.match(table,/ref="A5:H32"/);assert.match(table,/<autoFilter ref="A5:H32"/);
    assert.equal((table.match(/<tableColumn\b/g)||[]).length,8);
    assert(!table.includes('hiddenButton="1"'));assert(!table.includes('showButton="0"'));
    assert.match(xml['xl/worksheets/sheet1.xml'],/<tableParts count="1">/);
  });
  await test('frozen headers RTL and real sortable date/numeric cells survive serialization', () => {
    assert.equal(sheet.views[0].state,'frozen');assert.equal(sheet.views[0].ySplit,5);assert.equal(sheet.views[0].rightToLeft,true);
    assert.equal(sheet.views[0].topLeftCell,'A6');assert.equal(sheet.getCell('B6').value.toISOString(),'2026-11-06T00:00:00.000Z');
    assert.equal(sheet.getCell('B6').numFmt,'yyyy-mm-dd');assert.equal(sheet.getCell('C6').value,'نشط');
    assert.equal(sheet.getCell('D6').value.toISOString(),'2026-11-05T00:00:00.000Z');assert.equal(sheet.getCell('D6').numFmt,'yyyy-mm-dd');
    assert.equal(sheet.getCell('E6').value.toISOString(),'2026-11-11T00:00:00.000Z');assert.equal(sheet.getCell('E6').numFmt,'yyyy-mm-dd');
    assert.equal(sheet.getCell('F6').value,5);
    assert.equal(sheet.getCell('F6').type,ExcelJS.ValueType.Number);assert.equal(sheet.getCell('A6').alignment.readingOrder,'rtl');
    assert.equal(sheet.pageSetup.orientation,'landscape');assert.match(sheet.getCell('A2').text,/27 علامة/);
    assert.equal(sheet.pageSetup.printArea,'A1:H32');
  });
  await test('payments and renewals columns are present, styled and empty in every brand row', () => {
    for(let row=6;row<=32;row++)for(const column of ['G','H']){
      const cell=sheet.getCell(`${column}${row}`);
      assert.equal(cell.value,null,cell.address);assert.equal(cell.type,ExcelJS.ValueType.Null,cell.address);
    }
    assert.equal(sheet.getCell('G6').numFmt,'#,##0.00');assert.equal(sheet.getCell('H6').numFmt,'0');
    assert.match(xml['xl/worksheets/sheet1.xml'],/<c r="G6" s="\d+"\/>/);assert.match(xml['xl/worksheets/sheet1.xml'],/<c r="H32" s="\d+"\/>/);
  });
  await test('formula-like brand names remain literal strings, never formulas or external links', () => {
    for(let i=0;i<4;i++){const cell=sheet.getCell(i+6,1);assert.equal(cell.type,ExcelJS.ValueType.String);assert.equal(cell.value,names[i]);}
    assert.equal(sheet.getCell('A10').value,'اسم علامة');
    for(const value of Object.values(xml))assert(!/<f(?:\s|>)/.test(value));
    assert(!Object.keys(archive.files).some(name=>name.startsWith('xl/externalLinks/')));
    assert(!xml['xl/worksheets/sheet1.xml'].includes('<hyperlink'));
  });
  await test('only requested fields are exported; no IDs contact tokens customers or financial values', () => {
    const all=Object.values(xml).join('\n');
    for(const needle of ['PRIVATE_OWNER_SENTINEL','PRIVATE_PHONE_SENTINEL','PRIVATE_TOKEN_SENTINEL','PRIVATE_CUSTOMER_SENTINEL','PRIVATE_PLAN_SENTINEL','brand-0','sub-0','subscription-base','plan-base','54321'])assert(!all.includes(needle),needle);
    assert.equal(sheet.getRow(6).cellCount,8);
  });
  await test('zero-brand workbook remains a usable eight-column file', async () => {
    const empty=new ExcelJS.Workbook();await empty.xlsx.load(await excel.buildBrandDirectoryExcel({exportedAt:iso(now),brands:[]}));
    assert.equal(empty.worksheets[0].rowCount,5);assert.equal(empty.worksheets[0].columnCount,8);
  });
  await test('invalid snapshot timestamp rejects rather than emitting inaccurate date', async () => {
    await assert.rejects(()=>excel.buildBrandDirectoryExcel({...snapshot,exportedAt:'invalid'}),/Invalid export timestamp/);
  });
  const route=(getter,builder=excel.buildBrandDirectoryExcel)=>load('app/api/admin/brands/export/route.ts',{
    '@/lib/data/admin-brand-export':{getAdminBrandExportSnapshot:getter},
    '@/lib/export/brand-directory-excel':{...excel,buildBrandDirectoryExcel:builder},
  });
  await test('authorized route emits the actual XLSX binary with attachment and private no-cache headers', async () => {
    let calls=0;const endpoint=route(async()=>{calls++;return snapshot;});assert.equal(endpoint.dynamic,'force-dynamic');assert.equal(endpoint.runtime,'nodejs');
    const response=await endpoint.GET();assert.equal(calls,1);assert.equal(response.status,200);
    assert.equal(response.headers.get('Content-Type'),excel.BRAND_EXCEL_MIME);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
    assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');assert.match(response.headers.get('Content-Disposition'),/^attachment; filename="branda-brands-2026-11-06\.xlsx"$/);
    const actual=new ExcelJS.Workbook();await actual.xlsx.load(await response.arrayBuffer());assert.equal(actual.worksheets[0].rowCount,32);
  });
  for(const [message,status] of [['Unauthorized',401],['Forbidden: active platform admin required',403],['PRIVATE_DATABASE_ERROR',503]]){
    await test(`route rejects DAL ${status} without serializing or exposing private errors`,async()=>{
      let serialized=0;const response=await route(async()=>{throw Error(message);},async()=>{serialized++;return bytes;}).GET();
      assert.equal(serialized,0);assert.equal(response.status,status);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
      assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(response.headers.get('Content-Disposition'),null);
      const payload=await response.json();assert.equal(payload.ok,false);assert.equal(typeof payload.message,'string');assert(!JSON.stringify(payload).includes(message));
    });
  }
  await test('serializer failure stays a private generic 503 without partial attachment',async()=>{
    const response=await route(async()=>snapshot,async()=>{throw Error('PRIVATE_SERIALIZER_ERROR');}).GET();
    assert.equal(response.status,503);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('Content-Disposition'),null);
    assert(!(await response.text()).includes('PRIVATE_SERIALIZER_ERROR'));
  });
  await test('activation report restricts the RPC and exports filtered RTL dates and phones as text', async () => {
    const base = { brand_id:'20000000-0000-4000-8000-000000000001', brand_name:'=PrivateFixture', owner_phone:'+970590000001',
      account_status:'نشط', handoff_status:'غير موثّق', trial_state:'لم تبدأ', trial_days:7, trial_started_at:null,
      joined_at:'2026-11-01T22:30:00.000Z',last_activity:null,last_activity_at:null,
      active_plan_names:'ولاء، منيو',subscription_expires_at:'2026-12-01T21:00:00.000Z',issued_card_count:123,
      stamp_operation_count:45,menu_visitor_count:67,dashboard_login_count:8,
      menu_tracking_since:'2026-10-05T00:00:00.000Z',stamp_tracking_since:'2026-10-04T00:00:00.000Z' };
    const pages = [[base],[{ ...base,brand_id:'20000000-0000-4000-8000-000000000002',brand_name:'Z',owner_phone:null }],[]];
    const cursors = [];
    const stubs = { '@/lib/data/cafes':{requirePlatformAdmin:async()=>({id:'fixture'})},
      '@/lib/supabase/server':{createClient:async()=>({rpc(name){
        assert.equal(name,'admin_brand_contact_report_v2');
        return {lte(){return this;},order(column){assert.equal(column,'brand_id');return this;},limit(){return this;},
          gt(column,value){assert.equal(column,'brand_id');cursors.push(value);return this;},
          then(resolve){resolve({data:pages.shift(),error:null});}};
      }})} };
    const data = load('lib/data/admin-brand-contact-report.ts',stubs);
    const workbook = load('lib/export/brand-contact-excel.ts');
    const endpoint = (dal) => load('app/api/admin/brands/contact-report/route.ts',{
      '@/lib/data/admin-brand-contact-report':dal,'@/lib/export/brand-contact-excel':workbook,'@/lib/export/brand-directory-excel':excel,
    });
    const response = await endpoint(data).GET();
    const missing = load('lib/data/admin-brand-contact-report.ts',{
      ...stubs, '@/lib/supabase/server':{createClient:async()=>({rpc:()=>({
        lte(){return this;}, order(){return this;}, limit(){return {error:{code:'PGRST202'}};}
      })})}
    });
    const unavailable = await endpoint(missing).GET();
    assert.equal(unavailable.status,503);
    assert.equal((await unavailable.json()).code,'report_not_installed');
    assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
    assert.match(response.headers.get('Content-Disposition'),/branda-activation-follow-up-/);
    assert.equal(cursors.length,2);
    const output = new ExcelJS.Workbook();await output.xlsx.load(await response.arrayBuffer());
    const sheet=output.worksheets[0];
    assert.equal(sheet.views[0].rightToLeft,true);assert.equal(sheet.autoFilter,'A2:P4');
    const row=[sheet.getRow(3),sheet.getRow(4)].find(r=>r.getCell(1).value===base.brand_name);
    assert.equal(row.getCell(1).type,ExcelJS.ValueType.String);
    assert.equal(row.getCell(2).value,base.owner_phone);assert.equal(row.getCell(2).numFmt,'@');
    assert.equal(row.getCell(3).value.toISOString(),'2026-11-02T01:30:00.000Z');
    assert.equal(row.getCell(7).value,null);assert.equal(row.getCell(8).value,7);
    assert.equal(row.getCell(9).value,'لا يوجد نشاط موثّق');assert.equal(row.getCell(10).value,null);
    assert.equal(row.getCell(11).value,base.active_plan_names);
    assert.equal(row.getCell(12).value.toISOString(),'2026-12-02T00:00:00.000Z');
    assert.deepEqual([13,14,15,16].map(c=>row.getCell(c).value),[123,45,67,8]);
    assert.equal(output.worksheets[1].name,'دليل المؤشرات');
    for (const [message,status] of [['Unauthorized',401],['Forbidden',403],['private database error',503]]) {
      const denied = await endpoint({getBrandContactReport:async()=>{throw Error(message);}}).GET();
      assert.equal(denied.status,status);assert.equal(denied.headers.get('Content-Disposition'),null);
      assert(!(await denied.text()).includes(message));
    }
  });
  console.log(`Brand directory Excel: ${passed} groups passed`);
}
await main();
})().catch(error=>{console.error(error);process.exitCode=1;});
