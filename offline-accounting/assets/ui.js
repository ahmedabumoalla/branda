import { configureButcher, butcherView, butcherSettings, butcherInvoice } from "./butcher-ui.js";
const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const printSurface = document.createElement('div');
printSurface.id = 'print-surface';
document.body.append(printSurface);
let restorePrintedDialog = false;
window.addEventListener('beforeprint', () => { if (dialog.open) {
    printSurface.innerHTML = document.querySelector('#dialog-content').innerHTML;
    document.body.classList.add('printing-dialog');
    restorePrintedDialog = true;
    dialog.close();
} });
window.addEventListener('afterprint', () => { document.body.classList.remove('printing-dialog'); printSurface.replaceChildren(); if (restorePrintedDialog) {
    restorePrintedDialog = false;
    dialog.showModal();
} });
let csrf = '', snapshot, current = 'home', offset = 0, filterKind = '', reportData = null, reportTab = 'trial';
const labels = { sale: 'فاتورة مبيعات', purchase: 'فاتورة مشتريات', expense: 'مصروف', receipt: 'سند قبض', payment: 'سند صرف', journal: 'قيد يومية', reversal: 'قيد عكسي' };
const kinds = { asset: 'أصول', liability: 'التزامات', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصروفات' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const amount = (v) => new Intl.NumberFormat('ar-SA-u-nu-latn', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v || 0) / 100);
const rawAmount = (v) => (v / 100).toFixed(2);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const field = (label, name, type = 'text', value = '', required = false, extra = '') => `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} ${extra}></div>`;
const select = (label, name, options) => `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}">${options}</select></div>`;
const option = (v, l) => `<option value="${esc(v)}">${esc(l)}</option>`;
const accounts = (test = () => true) => snapshot.accounts.filter(test).map(a => option(a.code, `${a.code} · ${a.name}`)).join('');
const parties = (kind) => option('', 'بدون طرف') + snapshot.parties.filter(p => !kind || p.kind === kind).map(p => option(p.id, p.name)).join('');
const heading = (title, subtitle, actions = '') => `<div class="header"><div><div class="compact-title">برندة المحاسبية</div><h1>${title}</h1><p class="muted">${subtitle}</p></div><div class="actions no-print">${actions}</div></div>`;
const errorBox = '<div class="error" role="alert" tabindex="-1"></div>';
const table = (heads, rows, empty = 'لا توجد سجلات بعد') => `<div class="table-wrap"><table><thead><tr>${heads.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${heads.length}" class="empty">${empty}</td></tr>`}</tbody></table></div>`;
const notice = (message) => { const n = document.querySelector('#notice'); n.textContent = message; setTimeout(() => { if (n.textContent === message)
    n.textContent = ''; }, 6500); };
function showError(container, error) { const el = container.querySelector('.error'); if (el) {
    el.textContent = error instanceof Error ? error.message : String(error);
    el.focus();
}
else
    notice(String(error)); }
async function api(path, payload, binary = false) {
    let response;
    try {
        response = await fetch('/api/' + path, payload === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(payload) });
    }
    catch {
        throw new Error('تعذر الاتصال بالبرنامج المحلي إذا كنت تحفظ عملية فراجع السجل قبل إعادة إنشائها');
    }
    if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'تعذر تنفيذ الطلب' }));
        throw new Error(data.error);
    }
    return binary ? response.blob() : response.json();
}
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
function setDialog(title, body) { document.querySelector('#dialog-content').innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${title}</h2><button type="button" data-close aria-label="إغلاق النافذة">إغلاق</button></div>${body}`; dialog.showModal(); }
function formSubmit(form, fn) { form.addEventListener('submit', async (event) => { event.preventDefault(); if (form.dataset.busy)
    return; form.dataset.busy = '1'; const buttons = [...form.querySelectorAll('button[type=submit]')]; buttons.forEach(b => b.disabled = true); form.querySelector('.error').textContent = ''; try {
    await fn(Object.fromEntries(new FormData(form)));
}
catch (e) {
    showError(form, e);
}
finally {
    delete form.dataset.busy;
    buttons.forEach(b => b.disabled = false);
} }); }
async function start() { configureButcher({ api, snapshot: () => snapshot, refresh, document: showDocument, dialog: setDialog, notice }); const s = await api('status'); csrf = s.csrf; if (!s.authenticated) {
    auth(s.initialized);
    return;
} snapshot = await api('snapshot'); shell(); await navigate(current); }
function auth(initialized) { app.innerHTML = `<main class="card auth"><img class="brand-official" src="/branda-logo.png" alt="شعار برندة"><h1>${initialized ? 'أهلًا بعودتك' : 'ابدأ حسابات منشأتك'}</h1><p class="muted">محاسبة محفوظة على جهازك<br>تعمل بالكامل دون إنترنت</p><form id="auth-form">${errorBox}${!initialized ? field('اسم المنشأة', 'company', 'text', '', true, 'maxlength="150"') : ''}${initialized ? select('الدخول بصفة', 'role', option('owner', 'المالك') + option('cashier', 'الكاشير')) : ''}${field(initialized ? 'كلمة المرور' : 'أنشئ كلمة مرور محلية', 'password', 'password', '', true, 'minlength="10" maxlength="128" autocomplete="' + (initialized ? 'current-password' : 'new-password') + '"')}${!initialized ? field('تأكيد كلمة المرور', 'confirm', 'password', '', true, 'minlength="10" maxlength="128" autocomplete="new-password"') : ''}<button class="primary" type="submit">${initialized ? 'دخول' : 'إنشاء الحساب المحلي'}</button></form><small>كلمة المرور محلية ولا يمكن استعادتها بالبريد أو الجوال<br>احتفظ بها وبنسخك الاحتياطية في مكان آمن</small></main>`; formSubmit(document.querySelector('#auth-form'), async (d) => { if (!initialized && d.password !== d.confirm)
    throw new Error('كلمتا المرور غير متطابقتين'); const r = await api(initialized ? 'login' : 'setup', d); csrf = r.csrf; current = d.role === 'cashier' ? 'sale' : 'home'; await start(); }); }
function shell() { app.innerHTML = `<div class="shell"><aside class="sidebar"><img class="brand-official" src="/branda-logo-dark.png" alt="شعار برندة"><p>نظام الملحمة المحلي</p><nav class="nav" aria-label="الأقسام">${[['home', 'نظرة عامة'], ['sale', 'نقطة البيع'], ['products', 'المنتجات والأسعار'], ['stock', 'المخزون والجرد'], ['butcher-purchase', 'شراء دفعة'], ['butcher-reports', 'المبيعات والربح'], ['sale-history', 'فواتير المبيعات'], ['purchase-history', 'فواتير المشتريات'], ['expense', 'المصروفات'], ['vouchers', 'القبض والصرف'], ['journal', 'القيود اليومية'], ['parties', 'العملاء والموردون'], ['accounts', 'دليل الحسابات'], ['reports', 'التقارير'], ['settings', 'الإعدادات والنسخ'], ['help', 'دليل الاستخدام']].filter(([key]) => snapshot.role !== 'cashier' || ['sale', 'sale-history'].includes(key)).map(([key, label]) => `<button data-nav="${key}">${label}</button>`).join('')}</nav><footer>البيانات على هذا الجهاز<br>لا توجد مزامنة سحابية<button data-logout>قفل البرنامج</button>${snapshot.role !== 'cashier' ? '<button data-quit>نسخ احتياطي وإغلاق</button>' : ''}</footer></aside><main class="main"><div class="topbar"><span class="company">${esc(snapshot.company.company)}</span><span class="status">محلي · لا يحتاج إنترنت</span></div><div id="view"></div></main></div>`; }
async function navigate(page) { current = page; offset = 0; document.querySelectorAll('[data-nav]').forEach(el => el.setAttribute('aria-current', el.dataset.nav === page ? 'page' : 'false')); const view = document.querySelector('#view'); view.innerHTML = '<p role="status">جار عرض البيانات</p>'; try {
    if (snapshot.role === 'cashier' && !['sale', 'sale-history'].includes(page)) {
        await navigate('sale');
        return;
    }
    if (await butcherView(view, page))
        return;
    if (page === 'home')
        await home(view);
    else if (['sale-history', 'purchase-history', 'expense', 'journal', 'vouchers'].includes(page))
        await documentsView(view, page.replace('-history', ''));
    else if (page === 'parties')
        partyView(view);
    else if (page === 'accounts')
        accountView(view);
    else if (page === 'reports')
        await reports(view);
    else if (page === 'settings') {
        settings(view);
        butcherSettings(view);
    }
    else
        help(view);
}
catch (e) {
    view.innerHTML = errorBox;
    showError(view, e);
} }
async function refresh() { snapshot = await api('snapshot'); document.querySelector('.company').textContent = snapshot.company.company; }
async function home(view) { const report = await api('report?from=' + today().slice(0, 4) + '-01-01&to=' + today()); const s = report.summary; const cash = snapshot.accounts.filter(a => a.cash).reduce((v, a) => v + a.balance, 0); view.innerHTML = heading('حسابات واضحة في مكان واحد', 'ابدأ العملية من هنا ثم تابع أثرها في التقارير') + `<div class="metrics">${[['إيرادات السنة حتى اليوم', s.revenue], ['مصروفات السنة حتى اليوم', s.expense], ['نتيجة السنة حتى اليوم', s.profit], ['النقد والبنك · جميع التواريخ', cash]].map(([l, v]) => `<div class="metric"><span>${l}</span><strong>${amount(Number(v))}</strong><small>ريال سعودي</small></div>`).join('')}</div><div class="card"><h2>عملية جديدة</h2><div class="actions">${['sale', 'purchase', 'expense', 'receipt', 'payment', 'journal'].map(k => `<button data-new="${k}" ${k === 'sale' ? 'class="primary"' : ''}>${labels[k]}</button>`).join('')}</div></div><div class="grid"><section class="card"><h2>ابدأ بإعداد أرصدتك</h2><p class="hint">أضف العملاء والموردين ثم أدخل الأرصدة الافتتاحية بقيد متوازن مقابل رأس المال أو الحساب المناسب</p><div class="actions"><button data-nav="parties">الأطراف</button><button data-new="journal">قيد افتتاحي</button></div></section><section class="card"><h2>نسختك الاحتياطية</h2><p class="hint">الحفظ تلقائي عند ترحيل العملية، والنسخ الاحتياطي ملف مستقل انقله إلى فلاش أو قرص آخر</p><button data-backup>تنزيل نسخة احتياطية</button></section></div><section class="card"><h2>آخر العمليات</h2><div id="recent"></div></section>`; const d = await api('documents'); document.querySelector('#recent').innerHTML = documentTable(d.rows.slice(0, 8)); }
function documentTable(rows) { return table(['المستند', 'التاريخ', 'الطرف أو البيان', 'الإجمالي', 'المتبقي', 'الحالة', ''], rows.map(d => [esc(d.number) + '<br><small>' + labels[d.kind] + '</small>', esc(d.date), esc(d.party_name || d.note || '—'), `<span class="num">${amount(d.total)}</span>`, d.outstanding === null ? '—' : amount(d.outstanding), d.reversal_number ? '<span class="badge reversed">معكوس</span>' : '<span class="badge">مرحّل</span>', `<button class="small" data-document="${d.id}">عرض</button>`])); }
async function documentsView(view, page) { filterKind = page === 'vouchers' ? '' : page; view.innerHTML = heading(page === 'vouchers' ? 'القبض والصرف' : ({ sale: 'فواتير المبيعات', purchase: 'فواتير المشتريات', expense: 'المصروفات', journal: 'القيود اليومية' }[page] || ''), 'كل عملية محفوظة مرتبطة بقيد محاسبي يمكن مراجعته', page === 'vouchers' ? '<button data-new="receipt" class="primary">سند قبض</button><button data-new="payment">سند صرف</button>' : page === 'sale' ? '<button data-nav="sale" class="primary">نقطة البيع</button>' : page === 'purchase' ? '<button data-nav="butcher-purchase" class="primary">شراء دفعة</button>' : `<button data-new="${page}" class="primary">إضافة ${labels[page]}</button>`) + `<section class="card"><form id="list-filter" class="filter">${field('بحث برقم المستند أو الاسم', 'q')}${select('النوع', 'kind', option('', 'جميع العمليات') + Object.keys(labels).map(k => option(k, labels[k])).join(''))}${field('من تاريخ', 'from', 'date')}${field('إلى تاريخ', 'to', 'date')}<button type="submit">بحث</button></form><div id="documents-list"></div><div class="pagination"><button data-prev>السابق</button><span id="page-info"></span><button data-next>التالي</button></div></section>`; document.querySelector('#kind').value = filterKind; document.querySelector('#list-filter').addEventListener('submit', e => { e.preventDefault(); offset = 0; void loadDocuments(); }); await loadDocuments(); }
async function loadDocuments() { const form = document.querySelector('#list-filter'); const query = new URLSearchParams(new FormData(form)); query.set('offset', String(offset)); const data = await api('documents?' + query); document.querySelector('#documents-list').innerHTML = documentTable(data.rows); document.querySelector('#page-info').textContent = `${data.total ? offset + 1 : 0}–${Math.min(offset + 50, data.total)} من ${data.total}`; document.querySelector('[data-prev]').disabled = offset === 0; document.querySelector('[data-next]').disabled = offset + 50 >= data.total; }
function rowLine(kind) { const list = accounts(a => kind === 'sale' ? a.kind === 'revenue' : ['asset', 'expense'].includes(a.kind) && !a.cash && !['1200', '1300'].includes(a.code)); return `<tr><td><input aria-label="وصف البند" name="description" class="description" required maxlength="250"></td><td><input aria-label="الكمية" name="quantity" type="number" min="0.001" step="0.001" value="1" required></td><td><input aria-label="السعر قبل الضريبة" name="price" type="number" min="0" step="0.01" value="0" required></td><td><input aria-label="خصم البند" name="discount" type="number" min="0" step="0.01" value="0" required></td><td><input aria-label="نسبة الضريبة" name="rate" type="number" min="0" max="100" step="0.01" value="0" required></td><td><select aria-label="حساب البند" name="account">${list}</select></td><td><button class="line-action danger" type="button" data-remove aria-label="حذف البند">حذف</button></td></tr>`; }
function rowJournal() { return `<tr><td><select name="account" aria-label="الحساب">${accounts()}</select></td><td><select name="party_id" aria-label="طرف حساب الذمم">${parties()}</select></td><td><input name="debit" aria-label="مدين" type="number" min="0" step="0.01" value="0" required></td><td><input name="credit" aria-label="دائن" type="number" min="0" step="0.01" value="0" required></td><td><input name="memo" aria-label="بيان السطر" maxlength="250"></td><td><button type="button" data-remove class="line-action danger">حذف</button></td></tr>`; }
function readRows(form) { return [...form.querySelectorAll('#entry-lines tr')].map(tr => Object.fromEntries([...tr.querySelectorAll('input,select')].map(el => [el.name, el.value]))); }
const scaled = (v, scale) => { const t = String(v || '0'); if (!/^\d*(\.\d*)?$/.test(t))
    return BigInt(0); const [a, b = ''] = t.split('.'); return BigInt(a || '0') * BigInt(10) ** BigInt(scale) + BigInt((b + '0'.repeat(scale)).slice(0, scale) || '0'); };
function invoiceTotals(rows) { let net = BigInt(0), tax = BigInt(0); for (const r of rows) {
    const gross = (scaled(r.quantity, 3) * scaled(r.price, 2) + BigInt(500)) / BigInt(1000);
    const value = gross - scaled(r.discount, 2);
    net += value;
    tax += (value * scaled(r.rate, 2) + BigInt(5000)) / BigInt(10000);
} return { net: Number(net), tax: Number(tax), total: Number(net + tax) }; }
function updateTotals(form, kind) { const rows = readRows(form); const target = form.querySelector('#live-total'); if (kind === 'journal') {
    const debit = rows.reduce((s, r) => s + Number(scaled(r.debit, 2)), 0), credit = rows.reduce((s, r) => s + Number(scaled(r.credit, 2)), 0);
    target.innerHTML = `<span>المدين <strong>${amount(debit)}</strong></span><span>الدائن <strong>${amount(credit)}</strong></span><span>الفرق <strong>${amount(debit - credit)}</strong></span>`;
}
else {
    const t = invoiceTotals(rows);
    target.innerHTML = `<span>الصافي <strong>${amount(t.net)}</strong></span><span>الضريبة <strong>${amount(t.tax)}</strong></span><span>الإجمالي <strong>${amount(t.total)}</strong></span>`;
} }
function newDocument(kind) {
    const view = document.querySelector('#view');
    const invoice = ['sale', 'purchase', 'expense'].includes(kind), journal = kind === 'journal';
    view.innerHTML = heading('إضافة ' + labels[kind], 'راجع البيانات قبل الترحيل، تصحيح المستند المرحّل يتم بقيد عكسي') + `<form id="entry-form" class="card" data-request="${crypto.randomUUID()}">${errorBox}<div class="form-grid">${field('تاريخ المستند', 'date', 'date', today(), true)}${!journal ? select(kind === 'sale' || kind === 'receipt' ? 'العميل' : 'المورد', 'party_id', parties(kind === 'sale' || kind === 'receipt' ? 'customer' : 'supplier')) : ''}${!journal ? select('الصندوق أو البنك', 'cash_account', accounts(a => a.cash)) : ''}${!invoice && !journal ? field('المبلغ بالريال', 'amount', 'number', '', true, 'min="0.01" max="1000000000" step="0.01"') : ''}${!invoice && !journal ? field('رقم الفاتورة المرتبطة · اختياري', 'related_number', 'text', '', false, 'maxlength="30" placeholder="SAL-000001"').replace(' required', '') : ''}<div class="field wide"><label for="note">${journal ? 'بيان القيد' : 'ملاحظات أو مرجع خارجي'}</label><textarea id="note" name="note" maxlength="1000" ${journal ? 'required' : ''}></textarea></div></div>${invoice || journal ? `<div class="editor table-wrap"><table><thead><tr>${(journal ? ['الحساب', 'طرف الذمم', 'مدين', 'دائن', 'بيان', ''] : ['الوصف', 'الكمية', 'السعر قبل الضريبة', 'الخصم', 'الضريبة ٪', 'الحساب', '']).map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody id="entry-lines">${journal ? rowJournal() + rowJournal() : rowLine(kind)}</tbody></table></div><button type="button" id="add-line">إضافة ${journal ? 'سطر' : 'بند'}</button><div id="live-total" class="totalbar" aria-live="polite"></div>` : ''}${invoice ? `<div class="form-grid editor">${field('المدفوع الآن بالريال', 'paid', 'number', '0', true, 'min="0" max="1000000000" step="0.01"')}<div class="field"><label>السداد</label><button type="button" id="full-payment">تعبئة كامل المبلغ</button></div></div><p class="hint">اترك المدفوع صفرًا للآجل مع تحديد الطرف، الأسعار قبل الضريبة والخصم لكل بند، نسبة الضريبة الافتراضية صفر وتحددها حسب البند</p>` : ''}${journal ? '<p class="hint">أدخل طرفًا لحساب ذمم العملاء أو الموردين فقط، الأرصدة الافتتاحية تسجل بقيد متوازن</p>' : ''}${['purchase', 'expense'].includes(kind) ? '<p class="hint">حساب المشتريات الافتراضي مصروف، اختر حساب أصل عند الحاجة، هذه النسخة لا تتتبع كميات المخزون أو تكلفته تلقائيًا</p>' : ''}${!invoice && !journal ? '<p class="hint">الربط اختياري، تجد رقم الفاتورة في نافذة عرضها، السند غير المرتبط يؤثر في رصيد الطرف دون توزيع على فاتورة محددة</p>' : ''}<div class="form-footer"><button type="submit" class="primary">حفظ وترحيل</button><button type="button" data-nav="${kind === 'receipt' || kind === 'payment' ? 'vouchers' : kind}">إلغاء</button><small>الحفظ نهائي في قاعدة البيانات المحلية</small></div></form>`;
    const form = document.querySelector('#entry-form');
    if (invoice || journal) {
        if (invoice) {
            const first = form.querySelector('#entry-lines select[name=account]');
            first.value = kind === 'sale' ? '4100' : kind === 'purchase' ? '5100' : '5200';
        }
        form.addEventListener('input', () => updateTotals(form, kind));
        form.addEventListener('click', event => { const b = event.target.closest('[data-remove]'); if (b) {
            if (form.querySelectorAll('#entry-lines tr').length <= (journal ? 2 : 1)) {
                notice(journal ? 'احتفظ بسطرين على الأقل' : 'احتفظ ببند واحد على الأقل');
                return;
            }
            b.closest('tr').remove();
            updateTotals(form, kind);
        } });
        document.querySelector('#add-line').addEventListener('click', () => { if (form.querySelectorAll('#entry-lines tr').length >= 100) {
            notice('الحد الأقصى مئة سطر');
            return;
        } form.querySelector('#entry-lines').insertAdjacentHTML('beforeend', journal ? rowJournal() : rowLine(kind)); if (invoice)
            form.querySelector('#entry-lines tr:last-child select[name=account]').value = kind === 'sale' ? '4100' : kind === 'purchase' ? '5100' : '5200'; updateTotals(form, kind); });
        updateTotals(form, kind);
    }
    document.querySelector('#full-payment')?.addEventListener('click', () => { form.elements.namedItem('paid').value = rawAmount(invoiceTotals(readRows(form)).total); });
    formSubmit(form, async (d) => { const payload = { ...d, kind, request_id: form.dataset.request, ...(invoice ? { lines: readRows(form) } : journal ? { entries: readRows(form) } : {}) }; const r = await api('post', payload); await refresh(); notice('حُفظ المستند ورُحّل القيد على الجهاز'); await navigate(kind === 'receipt' || kind === 'payment' ? 'vouchers' : kind); await showDocument(r.id); });
}
async function showDocument(id) { const d = await api('document?id=' + encodeURIComponent(String(id))); const retail = butcherInvoice(d); if (retail) {
    setDialog(d.context.tax_title, retail);
    return;
} const meta = [['رقم المستند', d.number], ['التاريخ', d.date], ['الطرف', d.party_name || 'بدون طرف'], ['البيان', d.note || '—'], ['الحالة', d.reversal_number ? 'معكوس بمستند ' + d.reversal_number : 'مرحّل']]; setDialog(labels[d.kind], `<div class="invoice-brand"><img class="brand-official" src="/branda-logo.png" alt="شعار برندة"><h2>${esc(d.context.issuer.company)}</h2><p>${esc(d.context.issuer.address || '')}</p><small>${d.context.issuer.tax_number ? 'الرقم الضريبي ' + esc(d.context.issuer.tax_number) : 'سجل محاسبي محلي'}</small></div><h2>${labels[d.kind]} · ${esc(d.number)}</h2><div class="invoice-meta">${meta.map(([l, v]) => `<div><span>${l}</span><strong>${esc(v)}</strong></div>`).join('')}</div>${d.lines.length ? table(['الوصف', 'الكمية', 'السعر', 'الخصم', 'الضريبة', 'الإجمالي'], d.lines.map((l) => [esc(l.description), esc(l.quantity), amount(Number(l.price) * 100), amount(l.discount), amount(l.tax), amount(l.total)])) : ''}<div class="totalbar"><span>الإجمالي <strong>${amount(d.total)}</strong></span>${d.outstanding !== null ? `<span>المدفوع عند الإنشاء <strong>${amount(d.paid)}</strong></span><span>المتبقي <strong>${amount(d.outstanding)}</strong></span>` : ''}</div><h3 class="editor">القيد المحاسبي</h3>${table(['الحساب', 'الطرف', 'مدين', 'دائن'], d.entries.map((e) => [esc(e.account + ' · ' + e.account_name), esc(e.party_name || '—'), amount(e.debit), amount(e.credit)]))}<div class="actions no-print editor"><button data-print class="primary">طباعة أو حفظ PDF</button>${!d.reversal_number && d.kind !== 'reversal' ? `<button data-reverse="${d.id}" class="danger">عكس المستند</button>` : ''}</div><p class="hint">حفظ المستند هنا لا يرسله لأي جهة خارجية، تتوفر البيانات في سجل العمليات والتقارير</p>`); }
function reverseDocument(id) { dialog.close(); setDialog('عكس المستند', `<p class="hint">ينشأ قيد مقابل ويحفظ المستند الأصلي، اعكس سندات السداد المرتبطة أولًا إن وجدت</p><form id="reverse-form">${errorBox}<div class="form-grid">${field('تاريخ العكس', 'date', 'date', today(), true)}${field('سبب العكس', 'note', 'text', '', true, 'maxlength="1000"')}</div><div class="form-footer"><button type="submit" class="primary">تأكيد العكس</button><button type="button" data-close>إلغاء</button></div></form>`); const request_id = crypto.randomUUID(); formSubmit(document.querySelector('#reverse-form'), async (d) => { const r = await api('post', { ...d, request_id, kind: 'reversal', reverse_of: id }); dialog.close(); await refresh(); await navigate(current); await showDocument(r.id); notice('حُفظ القيد العكسي'); }); }
function partyView(view) { view.innerHTML = heading('العملاء والموردون', 'الرصيد الموجب مدين والسالب دائن، كشف الطرف يوضح جميع الحركات', '<button data-add-party class="primary">إضافة طرف</button>') + `<section class="card">${table(['الاسم', 'النوع', 'الجوال', 'الرصيد', ''], snapshot.parties.map(p => [esc(p.name), p.kind === 'customer' ? 'عميل' : 'مورد', esc(p.phone || '—'), amount(p.balance), `<button class="small" data-party-report="${p.id}">كشف الحساب</button>`]))}</section>`; }
function addParty() { setDialog('إضافة عميل أو مورد', `<form id="party-form">${errorBox}<div class="form-grid">${field('الاسم', 'name', 'text', '', true, 'maxlength="150"')}${select('النوع', 'kind', option('customer', 'عميل') + option('supplier', 'مورد'))}${field('الجوال', 'phone', 'tel', '', false, 'maxlength="30"')}${field('الرقم الضريبي · اختياري', 'tax_number', 'text', '', false, 'maxlength="30"')}</div><div class="form-footer"><button type="submit" class="primary">حفظ الطرف</button></div></form>`); formSubmit(document.querySelector('#party-form'), async (d) => { await api('party', d); dialog.close(); await refresh(); await navigate('parties'); notice('حُفظ الطرف'); }); }
function accountView(view) { view.innerHTML = heading('دليل الحسابات', 'حسابات تفصيلية جاهزة للاستخدام مع إمكانية إضافة حساب جديد', '<button data-add-account class="primary">إضافة حساب</button>') + `<section class="card">${table(['الرمز', 'الحساب', 'النوع', 'الرصيد · مدين موجب', ''], snapshot.accounts.map(a => [esc(a.code), esc(a.name) + (a.cash ? ' <span class="badge">نقد أو بنك</span>' : ''), kinds[a.kind], amount(a.balance), `<button data-account-report="${a.code}" class="small">الأستاذ</button>`]))}</section>`; }
function addAccount() { setDialog('إضافة حساب', `<form id="account-form">${errorBox}<div class="form-grid">${field('الرمز الرقمي', 'code', 'text', '', true, 'pattern="[0-9]{1,12}" maxlength="12"')}${field('اسم الحساب', 'name', 'text', '', true, 'maxlength="100"')}${select('النوع', 'kind', Object.keys(kinds).map(k => option(k, kinds[k])).join(''))}${select('حساب نقدي أو بنكي', 'cash', option('false', 'لا') + option('true', 'نعم — يجب اختيار أصول'))}</div><div class="form-footer"><button type="submit" class="primary">حفظ الحساب</button></div></form>`); formSubmit(document.querySelector('#account-form'), async (d) => { await api('account', { ...d, cash: d.cash === 'true' }); dialog.close(); await refresh(); await navigate('accounts'); }); }
async function reports(view) { view.innerHTML = heading('تقاريرك من القيود الفعلية', 'ميزان المراجعة ونتيجة النشاط والمركز المالي وكشوف الحساب', '<button data-export>تصدير CSV</button><button data-print>طباعة أو PDF</button>') + `<section class="card"><form id="report-filter" class="filter">${field('من تاريخ', 'from', 'date', today().slice(0, 4) + '-01-01', true)}${field('إلى تاريخ', 'to', 'date', today(), true)}${select('حساب كشف الأستاذ', 'account', option('', 'جميع الحسابات') + accounts())}${select('طرف كشف الحساب', 'party', parties())}<button type="submit" class="primary">عرض التقرير</button></form><p class="hint no-print">اختيار الحساب والطرف يخصص كشف الحركات فقط، ميزان المراجعة والقوائم يعرضان المنشأة كاملة ضمن الفترة</p>${errorBox}<div class="tabs no-print">${[['trial', 'ميزان المراجعة'], ['profit', 'نتيجة النشاط'], ['balance', 'المركز المالي'], ['ledger', 'كشف الحركات'], ['tax', 'ملخص الضريبة']].map(([k, l]) => `<button data-report-tab="${k}">${l}</button>`).join('')}</div><div id="report-content"></div></section>`; document.querySelector('#report-filter').addEventListener('submit', e => { e.preventDefault(); void loadReport().catch(error => showError(view, error)); }); await loadReport(); }
async function loadReport() { const form = document.querySelector('#report-filter'); reportData = await api('report?' + new URLSearchParams(new FormData(form))); renderReport(); }
function reportRows() { const r = reportData, s = r.summary; if (reportTab === 'ledger')
    return { headers: ['التاريخ', 'المستند', 'الحساب', 'الطرف', 'البيان', 'مدين', 'دائن', 'الرصيد'], rows: r.ledger.map((l) => [l.date, l.number, l.account_name, l.party_name || '', l.memo || l.note, rawAmount(l.debit), rawAmount(l.credit), rawAmount(l.running)]) }; if (reportTab === 'trial')
    return { headers: ['الرمز', 'الحساب', 'افتتاحي · مدين موجب', 'حركة مدين', 'حركة دائن', 'رصيد مدين', 'رصيد دائن'], rows: r.trial.map((t) => [t.code, t.name, rawAmount(t.opening), rawAmount(t.debit), rawAmount(t.credit), rawAmount(Math.max(t.balance, 0)), rawAmount(Math.max(-t.balance, 0))]) }; if (reportTab === 'profit')
    return { headers: ['البند', 'القيمة بالريال'], rows: [...r.trial.filter((t) => ['revenue', 'expense'].includes(t.kind)).map((t) => [t.name, rawAmount(t.kind === 'revenue' ? t.credit - t.debit : t.debit - t.credit)]), ['الإيرادات', rawAmount(s.revenue)], ['المصروفات', rawAmount(s.expense)], ['صافي النتيجة', rawAmount(s.profit)]] }; if (reportTab === 'balance')
    return { headers: ['البند', 'القيمة بالريال'], rows: [...r.trial.filter((t) => ['asset', 'liability', 'equity'].includes(t.kind)).map((t) => [t.name, rawAmount(t.kind === 'asset' ? t.balance : -t.balance)]), ['إجمالي الأصول', rawAmount(s.assets)], ['إجمالي الالتزامات', rawAmount(s.liabilities)], ['حقوق الملكية', rawAmount(s.equity)], ['النتيجة المتراكمة حتى نهاية الفترة', rawAmount(s.retained_profit)], ['فرق المعادلة · يجب أن يكون صفرًا', rawAmount(s.difference)]] }; return { headers: ['البند', 'القيمة بالريال'], rows: [['حركة ضريبة المدخلات', rawAmount(s.input_tax)], ['حركة ضريبة المخرجات', rawAmount(s.output_tax)], ['المخرجات ناقص المدخلات', rawAmount(s.output_tax - s.input_tax)]] }; }
function renderReport() { if (!reportData)
    return; const r = reportData, rows = reportRows(); document.querySelector('#report-content').innerHTML = `<div class="print-only"><h2>${esc(snapshot.company.company)}</h2><p>${esc(r.from)} — ${esc(r.to)}</p></div>${reportTab === 'ledger' ? `<p>الرصيد الافتتاحي <strong>${amount(r.opening)}</strong></p>` : ''}${table(rows.headers, rows.rows.map(row => row.map(esc)))}${reportTab === 'trial' ? `<div class="totalbar"><span>مجموع المدين <strong>${amount(r.trial.reduce((v, t) => v + t.debit, 0))}</strong></span><span>مجموع الدائن <strong>${amount(r.trial.reduce((v, t) => v + t.credit, 0))}</strong></span><span>فرق الأرصدة <strong>${amount(r.summary.difference)}</strong></span></div>` : ''}${reportTab === 'ledger' && r.truncated ? '<p class="error">الكشف يتجاوز ١٠ آلاف حركة ضيق الفترة أو اختر حسابًا لتظهر بقية الحركات، القوائم الإجمالية تشمل جميع القيود</p>' : ''}${reportTab === 'tax' ? '<p class="hint">ملخص حسابي حسب النسب المدخلة وليس إقرارًا أو إرسالًا ضريبيًا</p>' : ''}`; document.querySelectorAll('[data-report-tab]').forEach(b => b.classList.toggle('active', b.dataset.reportTab === reportTab)); }
function exportReport() { if (!reportData)
    return; const { headers, rows } = reportRows(); const safe = (v) => { let s = String(v ?? ''); if (/^[=+@\-\t\r]/.test(s))
    s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }; const csv = '\ufeff' + [headers, ...rows].map(r => r.map(safe).join(',')).join('\r\n'); download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `Branda-${reportTab}-${today()}.csv`); }
function settings(view) { view.innerHTML = heading('إعدادات المنشأة وحماية البيانات', 'كل البيانات محفوظة محليًا، احتفظ بنسخة خارج هذا الجهاز') + `<div class="grid"><form id="settings-form" class="card"><h2>بيانات المنشأة</h2>${errorBox}<div class="form-grid">${field('اسم المنشأة', 'company', 'text', snapshot.company.company, true, 'maxlength="150"')}${field('الرقم الضريبي', 'tax_number', 'text', snapshot.company.tax_number, false, 'maxlength="30"')}<div class="wide">${field('العنوان', 'address', 'text', snapshot.company.address, false, 'maxlength="300"')}</div></div><p class="hint">العملة الريال السعودي، أسعار نقطة البيع قبل الضريبة ويضاف ١٥٪ عند إدخال رقم ضريبي صحيح، لا تدخل رقمًا غير مسجل للمنشأة</p><div class="form-footer"><button type="submit" class="primary">حفظ الإعدادات</button></div></form><section class="card"><h2>النسخ الاحتياطي والاستعادة</h2><p class="hint">نزّل النسخة وانقلها إلى فلاش أو قرص خارجي، تتضمن السجلات وكلمة المرور المحلية المشفرة بالتجزئة، يحتفظ البرنامج أيضًا بنسخة عند التشغيل والإغلاق</p><div class="actions editor"><button data-backup class="primary">تنزيل نسخة احتياطية</button><button data-restore>استعادة نسخة</button></div><small>مجلد بياناتك على الجهاز</small><p class="data-path">${esc(snapshot.data_directory)}</p><p class="hint">حذف مجلد البرنامج لا يحذف قاعدة البيانات، نقل البرنامج وحده إلى جهاز آخر لا ينقل الحسابات</p></section><form id="password-form" class="card"><h2>تغيير كلمة المرور</h2>${errorBox}${field('كلمة المرور الحالية', 'current', 'password', '', true, 'autocomplete="current-password"')}${field('كلمة المرور الجديدة', 'password', 'password', '', true, 'minlength="10" maxlength="128" autocomplete="new-password"')}${field('تأكيد الجديدة', 'confirm', 'password', '', true, 'minlength="10" maxlength="128" autocomplete="new-password"')}<div class="form-footer"><button type="submit">تغيير وقفل البرنامج</button></div></form><form id="period-form" class="card"><h2>إقفال فترة محاسبية</h2><p class="hint">يمنع إدخال مستند أو قيد عكسي بتاريخ الإقفال أو قبله، لا تتوفر إعادة الفتح في هذه النسخة</p><p>آخر إقفال <strong>${esc(snapshot.company.closed_through || 'لا يوجد')}</strong></p>${errorBox}${field('إقفال حتى', 'date', 'date', '', true)}${field('كلمة المرور للتأكيد', 'password', 'password', '', true, 'autocomplete="current-password"')}<div class="form-footer"><button type="submit">تأكيد الإقفال</button></div></form></div>`; formSubmit(document.querySelector('#settings-form'), async (d) => { await api('settings', d); await refresh(); notice('حُفظت إعدادات المنشأة'); }); formSubmit(document.querySelector('#password-form'), async (d) => { if (d.password !== d.confirm)
    throw new Error('كلمتا المرور غير متطابقتين'); await api('password', d); await start(); }); formSubmit(document.querySelector('#period-form'), async (d) => { if (!confirm('سيمنع الإقفال إدخال أي عملية بتاريخ الإقفال أو قبله، هل تريد المتابعة؟'))
    return; await api('period', d); await refresh(); await navigate('settings'); notice('أُقفلت الفترة'); }); }
function restore() { setDialog('استعادة نسخة احتياطية', `<p class="error">تستبدل الاستعادة البيانات الحالية بمحتوى النسخة، ستُحفظ نسخة من الحالة الحالية تلقائيًا قبل الاستبدال</p><form id="restore-form">${errorBox}<div class="field"><label for="backup-file">ملف النسخة</label><input id="backup-file" type="file" accept=".branda" required></div>${field('كلمة المرور الحالية للتأكيد', 'password', 'password', '', true, 'autocomplete="current-password"')}<p class="hint">بعد الاستعادة سجل الدخول بكلمة المرور التي كانت موجودة وقت إنشاء النسخة</p><div class="form-footer"><button type="submit" class="primary">استعادة واستبدال البيانات</button></div></form>`); formSubmit(document.querySelector('#restore-form'), async (d) => { const file = document.querySelector('#backup-file').files?.[0]; if (!file || file.size > 100 * 1024 * 1024)
    throw new Error('اختر نسخة بحجم لا يتجاوز ١٠٠ ميجابايت'); if (!confirm('تأكيد استبدال السجلات الحالية بالنسخة المختارة؟'))
    return; const data = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = reject; r.readAsDataURL(file); }); await api('restore', { data, password: d.password }); dialog.close(); await start(); notice('تمت الاستعادة استخدم كلمة مرور النسخة'); }); }
function help(view) { view.innerHTML = heading('دليل الاستخدام السريع', 'الخطوات العملية ومكان العثور على بياناتك') + `<div class="card help"><h2>ابدأ مرة واحدة</h2><ol><li>أدخل بيانات المنشأة من الإعدادات وأضف العملاء والموردين</li><li>راجع دليل الحسابات وأضف الحسابات اللازمة، سجل الأرصدة الافتتاحية بقيد متوازن</li><li>أضف فاتورة مبيعات أو مشتريات أو مصروفًا، اختر الحساب ونسبة الضريبة والمدفوع، حدد الطرف للمبالغ الآجلة</li><li>بعد الحفظ تجد المستند في سجله، ويظهر القيد في التقارير فورًا، زر عرض يفتح التفاصيل والطباعة والعكس</li><li>سجل التحصيل من العملاء بسند قبض والسداد للموردين بسند صرف، يمكن ربط السند برقم الفاتورة من نافذة عرضها</li><li>لإيداع رأس المال أو التحويل بين البنك والصندوق استخدم قيد يومية متوازنًا</li><li>اختر الفترة في التقارير، ثم ميزان المراجعة أو نتيجة النشاط أو المركز المالي أو كشف الحساب، التصدير والطباعة يحفظان تقريرًا محليًا</li></ol><h2>الحفظ والتصحيح</h2><p>حفظ وترحيل يثبت العملية في قاعدة البيانات، لا يعتمد على بقاء الصفحة مفتوحة، المستندات المرحلة لا تحذف ولا تعدل: اعكس المستند بسبب واضح ثم أنشئ المستند الصحيح، اعكس سندات السداد المرتبطة أولًا</p><h2>ما تتضمنه النسخة</h2><p>منشأة واحدة وعملة الريال السعودي ودور مالك وكاشير، مبيعات ومشتريات ومصروفات وقبض وصرف وقيود متوازنة وتقارير وطباعة ونسخ احتياطي</p><p>اشتر دفعة بأرباع الذبائح أو الوزن أو القطع، ثم بع من نقطة البيع ليخصم المخزون وتحتسب تكلفة البضاعة تلقائيًا، يحول التقطيع الأرباع إلى وزن فعلي ويحمّل الهالك على المصروفات، استخدم الجرد لتسوية الفروقات بسبب واضح</p><p>لا توجد مزامنة سحابية أو رسائل واتساب أو ربط مع جهات خارجية، لا تُعد الطباعة إثبات إرسال أو اعتماد فاتورة إلكترونية، الملخص الضريبي يعتمد النسب التي تدخلها</p><h2>حماية حساباتك</h2><p>احفظ كلمة المرور، لا يوجد استرجاع بالبريد أو الجوال، انسخ البيانات إلى فلاش بانتظام، القفل يحمي الدخول للبرنامج لكن ملفات البيانات والنسخ نفسها غير مشفرة؛ احمِ حساب ويندوز ووسيط النسخ</p><p>استخدم زر نسخ احتياطي وإغلاق عند الانتهاء، القاعدة تحفظ كل عملية لحظيًا وتُنشأ نسخة إضافية عند التشغيل والإغلاق، إذا أغلق المتصفح فقط يمكنك فتح البرنامج مجددًا</p><p>إذا تعذر الحفظ راجع سجل المستندات قبل إنشاء عملية بديلة، ويمكن إعادة نفس الطلب دون تكراره، طباعة أو حفظ PDF تستخدم نافذة الطباعة المحلية في المتصفح</p></div>`; }
document.addEventListener('click', async (event) => { const b = event.target.closest('button'); if (!b)
    return; try {
    if (b.hasAttribute('data-close'))
        dialog.close();
    else if (b.dataset.nav)
        await navigate(b.dataset.nav);
    else if (b.dataset.new === 'sale')
        await navigate('sale');
    else if (b.dataset.new === 'purchase')
        await navigate('butcher-purchase');
    else if (b.dataset.new)
        newDocument(b.dataset.new);
    else if (b.dataset.document)
        await showDocument(b.dataset.document);
    else if (b.dataset.reverse)
        reverseDocument(b.dataset.reverse);
    else if (b.hasAttribute('data-print'))
        window.print();
    else if (b.hasAttribute('data-prev')) {
        offset = Math.max(0, offset - 50);
        await loadDocuments();
    }
    else if (b.hasAttribute('data-next')) {
        offset += 50;
        await loadDocuments();
    }
    else if (b.hasAttribute('data-add-party'))
        addParty();
    else if (b.hasAttribute('data-add-account'))
        addAccount();
    else if (b.dataset.reportTab) {
        reportTab = b.dataset.reportTab;
        renderReport();
    }
    else if (b.hasAttribute('data-export'))
        exportReport();
    else if (b.dataset.partyReport || b.dataset.accountReport) {
        await navigate('reports');
        document.querySelector(b.dataset.partyReport ? '#party' : '#account').value = b.dataset.partyReport || b.dataset.accountReport;
        document.querySelector('#from').value = '1900-01-01';
        reportTab = 'ledger';
        await loadReport();
    }
    else if (b.hasAttribute('data-backup')) {
        b.setAttribute('disabled', '');
        try {
            download(await api('backup', {}, true), 'Branda-backup-' + today() + '.branda');
            notice('نُزّلت النسخة انقلها إلى وسيط خارجي');
        }
        finally {
            b.removeAttribute('disabled');
        }
    }
    else if (b.hasAttribute('data-restore'))
        restore();
    else if (b.hasAttribute('data-logout')) {
        await api('logout', {});
        await start();
    }
    else if (b.hasAttribute('data-quit') && confirm('إنشاء نسخة احتياطية وإغلاق البرنامج؟')) {
        await api('quit', {});
        app.innerHTML = '<main class="auth card"><h1>حُفظت النسخة وأُغلق البرنامج</h1><p>يمكنك إغلاق هذه النافذة وفتح البرنامج من الاختصار لاحقًا</p></main>';
    }
}
catch (e) {
    notice(e instanceof Error ? e.message : String(e));
} });
void start().catch(e => { app.innerHTML = `<main class="auth card"><h1>تعذر فتح البرنامج</h1><p>${esc(e.message)}</p><button id="reload">إعادة المحاولة</button></main>`; document.querySelector('#reload').addEventListener('click', () => location.reload()); });
