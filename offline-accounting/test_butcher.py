import base64
import concurrent.futures
import datetime as dt
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import uuid

from butcher import Store, ValidationError, qr_tlv
from engine import SCHEMA, ACCOUNTS, APP_ID

TODAY = dt.datetime.now(dt.timezone(dt.timedelta(hours=3))).date().isoformat()


class ButcherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(self.temp.name)
        self.store.setup({"company": "ملحمة الاختبار", "password": "owner-test-password"})

    def tearDown(self):
        self.temp.cleanup()

    def command(self, action, **kwargs):
        return self.store.command({"action": action, "request_id": str(uuid.uuid4()), "date": TODAY, **kwargs})

    def product(self, unit="kg", group="لحم", price="50"):
        return self.store.save_product({"name": "لحم " + unit, "unit": unit, "stock_group": group, "price": price})

    def purchase(self, **kwargs):
        values = {"basis": "weight", "weight_kg": "10", "stock_group": "لحم", "reference": "LOT-1", "cost": "300", "paid": "300"}
        values.update(kwargs)
        return self.command("purchase", **values)

    def sale(self, product, quantity="1", **kwargs):
        return self.command("sale", items=[{"product_id": product, "quantity": quantity}], cash="50", card="0", **kwargs)

    def assert_balanced(self):
        with self.store.connect() as db:
            self.assertIsNone(db.execute("SELECT document_id FROM journal GROUP BY document_id HAVING SUM(debit)<>SUM(credit)").fetchone())
            self.assertIsNone(db.execute("SELECT id FROM stock_lots WHERE remaining_qty<0 OR remaining_cost<0").fetchone())
            self.assertIsNone(db.execute("SELECT l.id FROM stock_lots l JOIN stock_moves m ON m.lot_id=l.id GROUP BY l.id HAVING SUM(m.quantity)<>l.remaining_qty OR SUM(m.cost)<>l.remaining_cost").fetchone())

    def test_purchase_sale_cost_cash_card(self):
        product=self.product(); self.purchase()
        invoice=self.command("sale",items=[{"product_id":product,"quantity":"2.125"}],cash="50",card="56.25")
        d=self.store.document(invoice)
        self.assertEqual(d['context']['cost'],6375)
        self.assertEqual(self.store.catalog()['lots'][0]['remaining_qty'],7875)
        report=self.store.butcher_report({})
        self.assertEqual(report['summary']['profit'],4250)
        self.assertEqual(report['summary']['card'],5625)
        self.assert_balanced()

    def test_no_negative_and_rollback(self):
        p=self.product();self.purchase(weight_kg="1")
        with self.assertRaises(ValidationError):self.command("sale",items=[{"product_id":p,"quantity":"2"}],cash="100")
        self.assertEqual(self.store.snapshot()['document_count'],1)
        self.assertEqual(self.store.catalog()['lots'][0]['remaining_qty'],1000)

    def test_inventory_chronology(self):
        today=dt.date.fromisoformat(TODAY)
        with self.assertRaises(ValidationError):self.purchase(date=(today+dt.timedelta(days=1)).isoformat())
        self.purchase()
        lot=self.store.catalog()['lots'][0]
        with self.assertRaises(ValidationError):self.command('adjust',date=(today-dt.timedelta(days=1)).isoformat(),lot_id=lot['id'],expected=10000,counted='9',note='تسوية سابقة')
        self.assertEqual(self.store.catalog()['lots'][0]['remaining_qty'],10000)
        with self.assertRaises(ValidationError):self.command('reconcile',date=(today-dt.timedelta(days=1)).isoformat(),account='1100',expected=-30000,actual='0',note='تسوية سابقة')
        self.assert_balanced()

    def test_unregistered_supplier_vat_is_part_of_cost(self):
        with self.assertRaises(ValidationError):self.purchase(rate='15',paid='345')
        self.purchase(cost='345',paid='345')
        invoice=self.sale(self.product())
        self.assertEqual(self.store.document(invoice)['context']['cost'],3450)
        with self.assertRaises(ValidationError):self.store.post({'kind':'expense','request_id':str(uuid.uuid4()),'date':TODAY,'lines':[{'description':'مصروف','quantity':'1','price':'10','rate':'15'}],'paid':'11.50'})

    def test_fifo_uses_receipt_date_and_blocks_retroactive_cost_changes(self):
        yesterday=(dt.date.fromisoformat(TODAY)-dt.timedelta(days=1)).isoformat()
        self.purchase(weight_kg='1',cost='20',paid='20')
        self.purchase(date=yesterday,weight_kg='1',cost='10',paid='10')
        invoice=self.sale(self.product())
        self.assertEqual(self.store.document(invoice)['context']['cost'],1000)
        with self.assertRaises(ValidationError):self.purchase(date=yesterday,weight_kg='1',cost='5',paid='5')

    def test_fifo_and_repeated_lines(self):
        p=self.product();self.purchase(weight_kg="1",cost="10",paid="10");self.purchase(weight_kg="2",cost="40",paid="40")
        invoice=self.command("sale",items=[{"product_id":p,"quantity":".75"},{"product_id":p,"quantity":"1"}],cash="87.50")
        self.assertEqual(self.store.document(invoice)['context']['cost'],2500)
        self.assert_balanced()

    def test_idempotency_conflict(self):
        p=self.product();self.purchase()
        payload={"action":"sale","request_id":str(uuid.uuid4()),"items":[{"product_id":p,"quantity":"1"}],"cash":"50"}
        first=self.store.command(payload);self.assertEqual(first,self.store.command(payload))
        with self.assertRaises(ValidationError):self.store.command({**payload,"cash":"40","card":"10"})
        self.assertEqual(self.store.catalog()['lots'][0]['remaining_qty'],9000)

    def test_decimal_grams(self):
        p=self.product(unit="g",price=".05");self.purchase()
        self.command("sale",items=[{"product_id":p,"quantity":"125"}],cash="6.25")
        with self.assertRaises(ValidationError):self.command("sale",items=[{"product_id":p,"quantity":".5"}],cash=".03")
        self.assertEqual(self.store.catalog()['lots'][0]['remaining_qty'],9875)

    def test_piece_fraction_denied(self):
        p=self.product(unit="piece");self.purchase(basis="piece",pieces="3")
        with self.assertRaises(ValidationError):self.command("sale",items=[{"product_id":p,"quantity":".5"}],cash="25")

    def test_quarter_half_whole_share(self):
        whole=self.product('whole','ذبائح','1000');half=self.product('half','ذبائح','500');quarter=self.product('quarter','ذبائح','250')
        self.purchase(basis='carcass',carcass_count='2',weight_kg='40',stock_group='ذبائح',cost='1200',paid='1200')
        self.command('sale',items=[{'product_id':whole,'quantity':'1'},{'product_id':half,'quantity':'1'},{'product_id':quarter,'quantity':'1'}],cash='1750')
        self.assertEqual(self.store.catalog()['lots'][0]['remaining_qty'],1)
        self.assert_balanced()

    def test_cut_ancestry_cost_waste(self):
        self.purchase(basis='carcass',carcass_count='1',weight_kg='20',stock_group='ذبائح',cost='600',paid='600')
        identity=self.command('cut',lot_id=1,quarters=4,output_kg='16',waste_kg='4',stock_group='لحم',note='تقطيع ووزن فعلي')
        lots=self.store.catalog()['lots'];self.assertEqual(lots[0]['parent_id'],1);self.assertEqual(lots[0]['remaining_cost'],48000)
        self.assertEqual(lots[1]['remaining_qty'],0)
        self.assertEqual(self.store.document(identity)['context']['waste_cost'],12000)
        p=self.product();self.sale(p)
        self.assertEqual(self.store.catalog()['lots'][0]['remaining_qty'],15000)
        self.assert_balanced()

    def test_cross_basis_denied(self):
        p=self.product();self.purchase(basis='carcass',carcass_count='1',stock_group='لحم')
        with self.assertRaises(ValidationError):self.sale(p)

    def test_reversal_restores_cost_exactly(self):
        p=self.product();purchase=self.purchase();sale=self.sale(p)
        with self.assertRaises(ValidationError):self.store.post({'kind':'reversal','reverse_of':purchase,'request_id':str(uuid.uuid4()),'date':TODAY,'note':'خطأ'})
        payload={'kind':'reversal','reverse_of':sale,'request_id':str(uuid.uuid4()),'date':TODAY,'note':'إرجاع'}
        first=self.store.post(payload);self.assertEqual(first,self.store.post(payload))
        self.assertEqual(self.store.catalog()['lots'][0]['remaining_qty'],10000)
        self.store.post({'kind':'reversal','reverse_of':purchase,'request_id':str(uuid.uuid4()),'date':TODAY,'note':'تصحيح شراء'})
        self.assertEqual(self.store.catalog()['lots'][0]['remaining_cost'],0)
        self.assert_balanced()

    def test_cut_reversal_dependencies(self):
        self.purchase(basis='carcass',carcass_count='1',stock_group='ذبائح')
        cut=self.command('cut',lot_id=1,quarters=4,output_kg='10',waste_kg='0',stock_group='لحم',note='تقطيع')
        self.store.post({'kind':'reversal','reverse_of':cut,'request_id':str(uuid.uuid4()),'date':TODAY,'note':'تصحيح التقطيع'})
        lots=self.store.catalog()['lots'];self.assertEqual(lots[0]['remaining_qty'],0);self.assertEqual(lots[1]['remaining_qty'],4)
        self.assert_balanced()

    def test_stocktaking_and_stale_count(self):
        self.purchase()
        self.command('adjust',lot_id=1,expected=10000,counted='9.5',note='جرد فعلي')
        with self.assertRaises(ValidationError):self.command('adjust',lot_id=1,expected=10000,counted='9',note='جرد قديم')
        self.command('adjust',lot_id=1,expected=9500,counted='10',added_cost='15',note='زيادة موثقة')
        self.assertEqual(self.store.catalog()['lots'][0]['remaining_cost'],30000)
        self.assert_balanced()

    def test_cashier_commands_and_secrets(self):
        self.store.cashier_settings({'enabled':True,'password':'cashier-test-password'})
        self.assertTrue(self.store.authenticate_role('cashier-test-password','cashier'))
        self.assertFalse(self.store.authenticate_role('cashier-test-password','owner'))
        self.assertFalse(any('password' in key for key in self.store.snapshot()['company']))
        with self.assertRaises(ValidationError):self.store.command({'action':'purchase','request_id':str(uuid.uuid4())},'cashier')
        p=self.product();self.purchase();self.assertNotIn('cost',self.store.catalog('cashier')['stocks'][0])
        with self.assertRaises(ValidationError):self.store.command({'action':'sale','request_id':str(uuid.uuid4()),'items':[{'product_id':p,'quantity':1,'discount':1}],'cash':49},'cashier')

    def test_vat_qr_arabic_utf8(self):
        self.store.settings({'company':'ملحمة عربية','tax_number':'310114312600003','address':'الرياض'})
        p=self.product();self.purchase()
        invoice=self.command('sale',items=[{'product_id':p,'quantity':'1'}],cash='57.50',customer_name='عميل',customer_phone='0500000000')
        doc=self.store.document(invoice);raw=base64.b64decode(doc['context']['qr_tlv']);fields={};offset=0
        while offset<len(raw):
            tag,length=raw[offset],raw[offset+1];fields[tag]=raw[offset+2:offset+2+length].decode('utf-8');offset+=2+length
        self.assertEqual(fields[1],'ملحمة عربية');self.assertEqual(fields[2],'310114312600003');self.assertEqual(fields[4],'57.50');self.assertEqual(fields[5],'7.50')
        self.assertEqual(fields[3],doc['context']['issued_at']);self.assertEqual(doc['tax'],750)
        self.assert_balanced()

    def test_no_vat_without_number(self):
        p=self.product();self.purchase();invoice=self.sale(p)
        self.assertEqual(self.store.document(invoice)['context']['qr_tlv'],'')
        with self.assertRaises(ValidationError):self.store.settings({'company':'Test','tax_number':'123','address':''})

    def test_reconcile_separate_accounts(self):
        p=self.product();self.purchase();self.command('sale',items=[{'product_id':p,'quantity':1}],cash='20',card='30')
        self.command('reconcile',account='1120',expected=3000,actual='29.50',note='كشف الشبكة')
        self.assertEqual(self.store.butcher_report({})['balances']['1120'],2950)
        with self.assertRaises(ValidationError):self.command('reconcile',account='1120',expected=3000,actual='28',note='قديم')
        self.assert_balanced()

    def test_concurrent_last_stock(self):
        p=self.product();self.purchase(weight_kg='1')
        def run(_):
            try:return self.sale(p)
            except ValidationError:return None
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(run,range(2)))
        self.assertEqual(sum(x is not None for x in results),1)
        self.assertEqual(self.store.catalog()['lots'][0]['remaining_qty'],0)
        self.assert_balanced()

    def test_logo_snapshot_and_validation(self):
        image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII='
        self.store.logo({'image':image});p=self.product();self.purchase();invoice=self.sale(p)
        self.store.logo({'image':''});self.assertEqual(self.store.document(invoice)['context']['issuer']['logo'],image)
        with self.assertRaises(ValidationError):self.store.logo({'image':'data:image/svg+xml;base64,PHN2Zz4='})

    def test_tax_credit_note_and_report(self):
        self.store.settings({'company':'ملحمة عربية','tax_number':'310114312600003','address':'الرياض'})
        p=self.product();self.purchase()
        invoice=self.command('sale',items=[{'product_id':p,'quantity':'1'}],cash='57.50')
        payload={'kind':'reversal','reverse_of':invoice,'request_id':str(uuid.uuid4()),'date':TODAY,'note':'مرتجع كامل'}
        credit=self.store.post(payload);self.assertEqual(credit,self.store.post(payload))
        doc=self.store.document(credit)
        self.assertEqual(doc['context']['operation'],'credit_note');self.assertEqual(doc['tax'],750);self.assertTrue(doc['context']['qr_tlv']);self.assertEqual(len(doc['lines']),1)
        self.assertEqual(self.store.butcher_report({})['summary']['total'],0)
        self.assertEqual(self.store.butcher_report({})['summary']['cost'],0)
        self.assert_balanced()

    def test_archive_product(self):
        p=self.product();self.purchase();self.store.save_product({'id':p,'name':'أرشيف','price':'50','unit':'kg','stock_group':'لحم','active':False})
        with self.assertRaises(ValidationError):self.sale(p)

    def test_immutable_moves(self):
        self.purchase()
        with self.assertRaises(sqlite3.IntegrityError):
            with self.store.connect() as db:db.execute('DELETE FROM stock_moves')

    def test_legacy_upgrade_and_restore(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'accounts.sqlite3'
            with sqlite3.connect(path) as db:
                db.executescript(SCHEMA);db.execute(f'PRAGMA application_id={APP_ID}');db.execute('PRAGMA user_version=1');db.executemany('INSERT INTO accounts VALUES(?,?,?,?)',ACCOUNTS)
                from engine import password_hash
                db.executemany('INSERT INTO config VALUES(?,?)',[('company','منشأة سابقة'),('password',password_hash('legacy-test-password')),('currency','SAR'),('tax_number',''),('address',''),('closed_through','')])
            db.close()
            old=path.read_bytes();upgraded=Store(folder)
            self.assertTrue(upgraded.authenticate('legacy-test-password'));self.assertEqual(upgraded.catalog()['lots'],[])
            self.assertTrue(any(upgraded.backups.glob('before-v2-*.branda')))
            self.store.restore(old,'owner-test-password')
            self.assertTrue(self.store.authenticate('legacy-test-password'))

    def test_legacy_account_collision_preserves_original_schema(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'accounts.sqlite3'
            with sqlite3.connect(path) as db:
                db.executescript(SCHEMA);db.execute(f'PRAGMA application_id={APP_ID}');db.execute('PRAGMA user_version=1');db.executemany('INSERT INTO accounts VALUES(?,?,?,?)',ACCOUNTS)
                db.execute('INSERT INTO accounts VALUES(?,?,?,?)',('1120','مصروف قديم','expense',0))
            db.close()
            with self.assertRaisesRegex(ValidationError,'1120'):Store(folder)
            with sqlite3.connect(path) as db:
                self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0],1)
                self.assertEqual(db.execute('SELECT kind FROM accounts WHERE code=?',('1120',)).fetchone()[0],'expense')
                self.assertIsNone(db.execute("SELECT name FROM sqlite_master WHERE name='stock_lots'").fetchone())
            db.close()
            self.assertTrue(any((Path(folder)/'backups').glob('before-v2-*.branda')))


if __name__=='__main__':unittest.main()
