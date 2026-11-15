"""Financial invariants and backup recovery on isolated temporary databases."""
import concurrent.futures
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import uuid
from contextlib import closing
from engine import Store, ValidationError


class AccountingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(self.temp.name)
        self.password = "Local-Check-2026"
        self.store.setup({"company": "منشأة تحقق محلية", "password": self.password})
        self.customer = self.store.add_party({"name": "عميل التحقق", "kind": "customer"})
        self.supplier = self.store.add_party({"name": "مورد التحقق", "kind": "supplier"})

    def tearDown(self):
        self.temp.cleanup()

    def command(self, kind, **changes):
        payload = {"request_id": str(uuid.uuid4()), "kind": kind, "date": "2026-11-13", "note": "تحقق محلي", "cash_account": "1100"}
        if kind in ("sale", "purchase", "expense"):
            payload.update({"party_id": self.customer if kind == "sale" else self.supplier, "paid": "0", "lines": [{"description": "بند", "quantity": "2", "price": "100", "discount": "10", "rate": "15"}]})
        payload.update(changes)
        return payload

    def assert_balanced(self):
        with self.store.connect() as db:
            self.assertFalse(db.execute("SELECT document_id FROM journal GROUP BY document_id HAVING SUM(debit-credit)<>0").fetchone())
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertFalse(db.execute("PRAGMA foreign_key_check").fetchone())

    def test_sale_tax_discount_partial_receipt(self):
        identity = self.store.post(self.command("sale", paid="100"))
        d = self.store.document(identity)
        self.assertEqual((d["net"], d["tax"], d["total"], d["outstanding"]), (19000, 2850, 21850, 11850))
        self.store.post(self.command("receipt", party_id=self.customer, amount="118.50", related_id=identity))
        self.assertEqual(self.store.document(identity)["outstanding"], 0)
        self.assertEqual(next(p for p in self.store.snapshot()["parties"] if p["id"] == self.customer)["balance"], 0)
        self.assert_balanced()

    def test_purchase_payment_and_expense(self):
        purchase = self.store.post(self.command("purchase"))
        self.store.post(self.command("payment", party_id=self.supplier, amount="218.50", related_id=purchase))
        self.store.post(self.command("expense", paid="218.50", party_id=""))
        self.assertEqual(self.store.document(purchase)["outstanding"], 0)
        r = self.store.report({})
        self.assertEqual(r["summary"]["expense"], 38000)
        self.assertEqual(r["summary"]["input_tax"], 5700)
        self.assert_balanced()

    def test_exact_rounding_fractional_quantity(self):
        d = self.store.document(self.store.post(self.command("sale", lines=[{"description": "بند", "quantity": "0.005", "price": "1", "rate": "15"}])))
        self.assertEqual((d["net"], d["tax"]), (1, 0))

    def test_idempotent_and_mismatched_replay(self):
        p = self.command("sale")
        first = self.store.post(p)
        self.assertEqual(self.store.post(p), first)
        p["note"] = "مختلف"
        with self.assertRaises(ValidationError):
            self.store.post(p)
        self.assertEqual(self.store.snapshot()["document_count"], 1)

    def test_concurrent_same_request(self):
        p = self.command("sale")
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            values = list(pool.map(lambda _: self.store.post(p), range(2)))
        self.assertEqual(values[0], values[1])
        self.assertEqual(self.store.snapshot()["document_count"], 1)

    def test_transaction_rollback_for_invalid_lines(self):
        p = self.command("sale")
        p["lines"].append({"description": "خطأ", "quantity": "-1", "price": "10"})
        with self.assertRaises(ValidationError):
            self.store.post(p)
        self.assertEqual(self.store.snapshot()["document_count"], 0)
        self.assert_balanced()

    def test_invalid_money_dates_party_and_paid(self):
        for changes in ({"paid": "999"}, {"paid": "NaN"}, {"paid": "1.001"}, {"date": "2026-02-30"}, {"party_id": self.supplier}, {"party_id": ""}):
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                self.store.post(self.command("sale", **changes))

    def test_full_cash_sale_without_party(self):
        d = self.store.document(self.store.post(self.command("sale", paid="218.50", party_id="")))
        self.assertEqual(d["outstanding"], 0)
        self.assert_balanced()

    def test_overpayment_and_foreign_invoice_denied(self):
        sale = self.store.post(self.command("sale"))
        other = self.store.add_party({"name": "عميل آخر", "kind": "customer"})
        for party, amount in ((self.customer, "219"), (other, "10")):
            with self.assertRaises(ValidationError):
                self.store.post(self.command("receipt", party_id=party, amount=amount, related_id=sale))

    def test_receipt_before_invoice_denied(self):
        sale = self.store.post(self.command("sale"))
        with self.assertRaises(ValidationError):
            self.store.post(self.command("receipt", party_id=self.customer, amount="1", related_id=sale, date="2026-11-12"))

    def test_journal_and_opening_report(self):
        self.store.post(self.command("journal", date="2026-01-01", entries=[{"account": "1100", "debit": "1000"}, {"account": "3100", "credit": "1000"}]))
        r = self.store.report({"from": "2026-11-01", "to": "2026-11-30", "account": "1100"})
        self.assertEqual(r["opening"], 100000)
        self.assertEqual(r["summary"]["assets"], 100000)
        self.assertEqual(r["summary"]["equity"], 100000)
        self.assertEqual(r["summary"]["difference"], 0)
        self.assert_balanced()

    def test_unbalanced_and_unassigned_receivables_denied(self):
        for rows in ([{"account": "1100", "debit": "100"}, {"account": "3100", "credit": "99"}], [{"account": "1200", "debit": "100"}, {"account": "3100", "credit": "100"}], [{"account": "1100", "debit": "100", "party_id": self.customer}, {"account": "3100", "credit": "100"}]):
            with self.assertRaises(ValidationError):
                self.store.post(self.command("journal", entries=rows))

    def test_reversal_preserves_original_and_releases_allocation(self):
        sale = self.store.post(self.command("sale"))
        receipt = self.store.post(self.command("receipt", party_id=self.customer, amount="20", related_id=sale))
        with self.assertRaises(ValidationError):
            self.store.post(self.command("reversal", reverse_of=sale))
        self.store.post(self.command("reversal", reverse_of=receipt))
        self.assertEqual(self.store.document(sale)["outstanding"], 21850)
        reversal = self.store.post(self.command("reversal", reverse_of=sale))
        self.assertEqual(self.store.document(sale)["total"], 21850)
        self.assertTrue(self.store.document(sale)["reversal_number"])
        self.assertEqual(self.store.report({})["summary"]["revenue"], 0)
        for identity in (sale, reversal):
            with self.assertRaises(ValidationError):
                self.store.post(self.command("reversal", reverse_of=identity))
        self.assert_balanced()

    def test_period_closure(self):
        self.store.close_period({"password": self.password, "date": "2026-11-13"})
        with self.assertRaises(ValidationError):
            self.store.post(self.command("sale"))
        self.store.post(self.command("sale", date="2026-11-14"))
        with self.assertRaises(ValidationError):
            self.store.close_period({"password": self.password, "date": "2026-11-12"})

    def test_immutable_documents_and_journal(self):
        self.store.post(self.command("sale"))
        for sql in ("DELETE FROM documents", "UPDATE documents SET total=1", "DELETE FROM journal", "UPDATE journal SET debit=1", "DELETE FROM audit"):
            with self.assertRaises(sqlite3.IntegrityError), self.store.connect() as db:
                db.execute(sql)

    def test_backup_restore_and_reopen(self):
        sale = self.store.post(self.command("sale"))
        backup = self.store.backup().read_bytes()
        self.store.post(self.command("purchase"))
        prior = self.store.restore(backup, self.password)
        self.assertTrue((self.store.backups/prior).exists())
        self.store = Store(self.temp.name)
        self.assertTrue(self.store.authenticate(self.password))
        self.assertEqual(self.store.snapshot()["document_count"], 1)
        self.assertEqual(self.store.document(sale)["total"], 21850)
        self.assert_balanced()

    def test_bad_restore_never_changes_current_database(self):
        self.store.post(self.command("sale"))
        original = self.store.path.read_bytes()
        for data, password in ((b"not sqlite", self.password), (self.store.backup().read_bytes(), "incorrect")):
            with self.assertRaises(ValidationError):
                self.store.restore(data, password)
            self.assertEqual(self.store.path.read_bytes(), original)

    def test_restore_rejects_modified_schema(self):
        backup = self.store.backup()
        with closing(sqlite3.connect(backup)) as db:
            db.execute("DROP TRIGGER documents_no_update")
        with self.assertRaises(ValidationError):
            self.store.restore(backup.read_bytes(), self.password)

    def test_password_setup_and_change(self):
        self.assertFalse(self.store.authenticate("incorrect"))
        with self.assertRaises(ValidationError):
            self.store.setup({"company": "أخرى", "password": self.password})
        self.store.change_password({"current": self.password, "password": "Changed-Password-2026"})
        self.assertFalse(self.store.authenticate(self.password))
        self.assertTrue(self.store.authenticate("Changed-Password-2026"))

    def test_search_pagination_and_html_text(self):
        p = self.command("sale", note="<script>alert(1)</script> ' OR 1=1 --")
        self.store.post(p)
        self.assertEqual(self.store.documents({"q": "' OR 1=1 --"})["total"], 1)
        self.assertEqual(self.store.documents({"q": "no match"})["total"], 0)
        self.assertEqual(self.store.documents({"offset": 50})["rows"], [])

    def test_issuer_snapshot_survives_settings_change(self):
        identity = self.store.post(self.command("sale"))
        before = self.store.document(identity)["context"]
        self.store.settings({"company": "اسم منشأة محدث", "address": "عنوان محدث"})
        self.assertEqual(self.store.document(identity)["context"], before)
        self.assertNotEqual(self.store.snapshot()["company"]["company"], before["issuer"]["company"])

    def test_link_receipt_by_printed_invoice_number(self):
        identity = self.store.post(self.command("sale"))
        reference = self.store.document(identity)["number"]
        self.store.post(self.command("receipt", party_id=self.customer, amount="218.50", related_number=reference.lower()))
        self.assertEqual(self.store.document(identity)["outstanding"], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
