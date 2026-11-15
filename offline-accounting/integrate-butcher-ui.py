from pathlib import Path

root = Path(__file__).parent
p = root / 'ui.ts'
s = p.read_text(encoding='utf-8')
s = s.replace('export {};', 'import { configureButcher, butcherView, butcherSettings, butcherInvoice } from "./butcher-ui.js";\nexport {};', 1)
s = s.replace('data_directory: string };', 'data_directory: string; role: string };')
s = s.replace("async function start(){", "async function start(){configureButcher({api,snapshot:()=>snapshot,refresh,document:showDocument,dialog:setDialog,notice});")
s = s.replace("current='home';await start();", "current=d.role==='cashier'?'sale':'home';await start();")
s = s.replace('<div class="wordmark">برندة</div>', '<img class="brand-official" src="/branda-logo.png" alt="شعار برندة">')
s = s.replace('<aside class="sidebar"><img class="brand-official" src="/branda-logo.png" alt="شعار برندة"><p>المحاسبة المحلية</p>', '<aside class="sidebar"><img class="brand-official" src="/branda-logo-dark.png" alt="شعار برندة"><p>نظام الملحمة المحلي</p>')
s = s.replace("${field(initialized?'كلمة المرور'", "${initialized?select('الدخول بصفة','role',option('owner','المالك')+option('cashier','الكاشير')):''}${field(initialized?'كلمة المرور'")
s = s.replace("[['home','نظرة عامة'],['sale','المبيعات'],['purchase','المشتريات']", "[['home','نظرة عامة'],['sale','نقطة البيع'],['products','المنتجات والأسعار'],['stock','المخزون والجرد'],['butcher-purchase','شراء دفعة'],['butcher-reports','المبيعات والربح'],['sale-history','فواتير المبيعات'],['purchase-history','فواتير المشتريات']")
s = s.replace("['help','دليل الاستخدام']].map", "['help','دليل الاستخدام']].filter(([key])=>snapshot.role!=='cashier'||['sale','sale-history'].includes(key)).map")
s = s.replace('<button data-quit>نسخ احتياطي وإغلاق</button>', '${snapshot.role!==\'cashier\'?\'<button data-quit>نسخ احتياطي وإغلاق</button>\':\'\'}')
s = s.replace("try{if(page==='home')await home(view);", "try{if(snapshot.role==='cashier'&&!['sale','sale-history'].includes(page)){await navigate('sale');return;}if(await butcherView(view,page))return;if(page==='home')await home(view);")
s = s.replace("else if(['sale','purchase','expense','journal','vouchers'].includes(page))await documentsView(view,page);", "else if(['sale-history','purchase-history','expense','journal','vouchers'].includes(page))await documentsView(view,page.replace('-history',''));")
s = s.replace("else if(page==='settings')settings(view);", "else if(page==='settings'){settings(view);butcherSettings(view);}")
s = s.replace("const d=await api('document?id='+encodeURIComponent(String(id)));const meta=", "const d=await api('document?id='+encodeURIComponent(String(id)));const retail=butcherInvoice(d);if(retail){setDialog(d.context.tax_title,retail);return;}const meta=")
# Do not provide a bypass from the sale history back into manual sale creation.
s = s.replace("`<button data-new=\"${page}\" class=\"primary\">إضافة ${labels[page]}</button>`", "page==='sale'?'<button data-nav=\"sale\" class=\"primary\">نقطة البيع</button>':page==='purchase'?'<button data-nav=\"butcher-purchase\" class=\"primary\">شراء دفعة</button>':`<button data-new=\"${page}\" class=\"primary\">إضافة ${labels[page]}</button>`")
s = s.replace("else if(b.dataset.new)newDocument(b.dataset.new);", "else if(b.dataset.new==='sale')await navigate('sale');else if(b.dataset.new==='purchase')await navigate('butcher-purchase');else if(b.dataset.new)newDocument(b.dataset.new);")
s = s.replace("العملة في هذه النسخة الريال السعودي، نسبة الضريبة تحدد لكل بند", "العملة الريال السعودي، أسعار نقطة البيع قبل الضريبة ويضاف ١٥٪ عند إدخال رقم ضريبي صحيح، لا تدخل رقمًا غير مسجل للمنشأة")
s = s.replace("منشأة واحدة وعملة الريال السعودي ومستخدم محلي واحد", "منشأة واحدة وعملة الريال السعودي ودور مالك وكاشير")
s = s.replace("المشتريات محاسبية، ويمكن تحميلها على مصروف أو أصل، لا توجد إدارة كميات مخزون أو احتساب آلي لتكلفة البضاعة، إظهار المخزون وتكلفة المبيعات يعتمد القيود التي تدخلها", "اشتر دفعة بأرباع الذبائح أو الوزن أو القطع، ثم بع من نقطة البيع ليخصم المخزون وتحتسب تكلفة البضاعة تلقائيًا، يحول التقطيع الأرباع إلى وزن فعلي ويحمّل الهالك على المصروفات، استخدم الجرد لتسوية الفروقات بسبب واضح")
p.write_text(s,encoding='utf-8')
p=root/'assets/index.html'
s=p.read_text(encoding='utf-8').replace('</head>','<link rel="stylesheet" href="/butcher.css"></head>').replace('<script type="module" src="/app.js">','<script src="/qr.js"></script><script type="module" src="/app.js">')
p.write_text(s,encoding='utf-8')
