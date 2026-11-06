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

async function main() {
  await test('subscription status and remaining-day boundaries', () => {
    const cases = [
      [null,['بدون اشتراك','لا يوجد اشتراك']],
      [subscription({}),['اشتراك فعال',5]],
      [subscription({expires_at:iso(now+1)}),['اشتراك فعال',1]],
      [subscription({expires_at:iso(now+day+1)}),['اشتراك فعال',2]],
      [subscription({status:'trialing'}),['فترة تجربة',5]],
      [subscription({status:'trialing',activation_source:'admin_prepared_trial',started_at:null,expires_at:null}),['فترة تجربة لم تبدأ','تبدأ بعد إرسال بيانات الدخول']],
      [subscription({status:'expired'}),['اشتراك منتهي',0]],
      [subscription({expires_at:iso(now)}),['اشتراك منتهي',0]],
      [subscription({status:'trialing',expires_at:iso(now-1)}),['فترة تجربة منتهية',0]],
      [subscription({status:'cancelled'}),['اشتراك ملغي','غير متاح']],
      [subscription({started_at:iso(now+day)}),['اشتراك لم يبدأ','لم يبدأ بعد']],
      [subscription({status:'trialing',started_at:iso(now+day)}),['فترة تجربة لم تبدأ','لم يبدأ بعد']],
      [subscription({expires_at:null}),['اشتراك فعال','بدون تاريخ انتهاء']],
      [subscription({expires_at:'invalid-date'}),['اشتراك غير فعال','غير متاح']],
      [subscription({started_at:'invalid-date'}),['اشتراك غير فعال','غير متاح']],
      [subscription({platform_plans:{active:false}}),['اشتراك غير فعال','غير متاح']],
      [subscription({platform_plans:null}),['اشتراك غير فعال','غير متاح']],
      [subscription({status:'pending'}),['بانتظار التفعيل','لم يبدأ بعد']],
      [subscription({status:'past_due'}),['بانتظار التفعيل','لم يبدأ بعد']],
      [subscription({status:'unknown'}),['اشتراك غير فعال','غير متاح']],
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
  await test('real XLSX roundtrip keeps all 27 brands and exactly five visible columns', () => {
    assert(bytes instanceof Uint8Array);assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4b);
    assert.equal(workbook.worksheets.length,1);assert.equal(sheet.columnCount,5);assert.equal(sheet.rowCount,32);
    assert.deepEqual(sheet.getRow(5).values.slice(1),['العلامة التجارية','تاريخ الانضمام','حالة الحساب','حالة الاشتراك','المتبقي في الاشتراك بالأيام']);
    assert.equal(sheet.getCell('A32').value,'علامة مستقلة 26');
    assert(sheet.columns.every(c=>!c.hidden));
  });
  await test('actual OOXML table and filter cover all data rows', () => {
    const tables=Object.keys(xml).filter(n=>/^xl\/tables\/table\d+\.xml$/.test(n));assert.equal(tables.length,1);
    const table=xml[tables[0]];assert.match(table,/ref="A5:E32"/);assert.match(table,/<autoFilter ref="A5:E32"/);
    assert.equal((table.match(/<tableColumn\b/g)||[]).length,5);
    assert(!table.includes('hiddenButton="1"'));assert(!table.includes('showButton="0"'));
    assert.match(xml['xl/worksheets/sheet1.xml'],/<tableParts count="1">/);
  });
  await test('frozen headers RTL and real sortable date/numeric cells survive serialization', () => {
    assert.equal(sheet.views[0].state,'frozen');assert.equal(sheet.views[0].ySplit,5);assert.equal(sheet.views[0].rightToLeft,true);
    assert.equal(sheet.views[0].topLeftCell,'A6');assert.equal(sheet.getCell('B6').value.toISOString(),'2026-11-06T00:00:00.000Z');
    assert.equal(sheet.getCell('B6').numFmt,'yyyy-mm-dd');assert.equal(sheet.getCell('E6').value,5);
    assert.equal(sheet.getCell('E6').type,ExcelJS.ValueType.Number);assert.equal(sheet.getCell('A6').alignment.readingOrder,'rtl');
    assert.equal(sheet.pageSetup.orientation,'landscape');assert.match(sheet.getCell('A2').text,/27 علامة/);
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
    assert.equal(sheet.getRow(6).cellCount,5);
  });
  await test('zero-brand workbook remains a usable five-column file', async () => {
    const empty=new ExcelJS.Workbook();await empty.xlsx.load(await excel.buildBrandDirectoryExcel({exportedAt:iso(now),brands:[]}));
    assert.equal(empty.worksheets[0].rowCount,5);assert.equal(empty.worksheets[0].columnCount,5);
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
  console.log(`Brand directory Excel: ${passed} groups passed`);
}
await main();
})().catch(error=>{console.error(error);process.exitCode=1;});
