"""Single-company, local-only double-entry accounting. Money is integer minor units."""
from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import sqlite3
import tempfile
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from contextlib import closing, contextmanager, nullcontext

VERSION = 2
APP_ID = 1112687681
MAX_MONEY = 100_000_000_000
KINDS = {"sale", "purchase", "expense", "receipt", "payment", "journal", "reversal"}
SCHEMA = """
CREATE TABLE config(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE accounts(code TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('asset','liability','equity','revenue','expense')),cash INTEGER NOT NULL DEFAULT 0 CHECK(cash IN (0,1)));
CREATE TABLE parties(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('customer','supplier')),phone TEXT NOT NULL DEFAULT '',tax_number TEXT NOT NULL DEFAULT '');
CREATE TABLE documents(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,kind TEXT NOT NULL,number TEXT NOT NULL UNIQUE,date TEXT NOT NULL,party_id INTEGER REFERENCES parties(id),note TEXT NOT NULL,net INTEGER NOT NULL,tax INTEGER NOT NULL,total INTEGER NOT NULL,paid INTEGER NOT NULL DEFAULT 0,lines TEXT NOT NULL,related_id INTEGER REFERENCES documents(id),reverse_of INTEGER UNIQUE REFERENCES documents(id),created_at TEXT NOT NULL,context TEXT NOT NULL);
CREATE TABLE journal(id INTEGER PRIMARY KEY AUTOINCREMENT,document_id INTEGER NOT NULL REFERENCES documents(id),account TEXT NOT NULL REFERENCES accounts(code),party_id INTEGER REFERENCES parties(id),debit INTEGER NOT NULL CHECK(debit>=0),credit INTEGER NOT NULL CHECK(credit>=0),memo TEXT NOT NULL,CHECK((debit>0 AND credit=0) OR (credit>0 AND debit=0)));
CREATE INDEX document_date ON documents(date,id);
CREATE INDEX document_party ON documents(party_id,date,id);
CREATE INDEX document_related ON documents(related_id);
CREATE INDEX journal_account ON journal(account,document_id);
CREATE INDEX journal_party ON journal(party_id,document_id);
CREATE TABLE audit(id INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL,event TEXT NOT NULL,detail TEXT NOT NULL);
CREATE TRIGGER documents_no_update BEFORE UPDATE ON documents BEGIN SELECT RAISE(ABORT,'immutable document'); END;
CREATE TRIGGER documents_no_delete BEFORE DELETE ON documents BEGIN SELECT RAISE(ABORT,'immutable document'); END;
CREATE TRIGGER journal_no_update BEFORE UPDATE ON journal BEGIN SELECT RAISE(ABORT,'immutable journal'); END;
CREATE TRIGGER journal_no_delete BEFORE DELETE ON journal BEGIN SELECT RAISE(ABORT,'immutable journal'); END;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
"""
ACCOUNTS = [
    ("1100", "الصندوق", "asset", 1), ("1110", "البنك", "asset", 1),
    ("1200", "ذمم العملاء", "asset", 0), ("1300", "ضريبة المدخلات", "asset", 0),
    ("1400", "المخزون المحاسبي", "asset", 0), ("1500", "الأصول الثابتة", "asset", 0),
    ("2100", "ذمم الموردين", "liability", 0), ("2200", "ضريبة المخرجات", "liability", 0),
    ("3100", "رأس المال والأرصدة الافتتاحية", "equity", 0),
    ("4100", "إيرادات المبيعات", "revenue", 0),
    ("5100", "المشتريات المحملة على المصروف", "expense", 0),
    ("5200", "المصروفات التشغيلية", "expense", 0),
]


class ValidationError(ValueError):
    pass


def text(value, name="الحقل", limit=200, required=True):
    if not isinstance(value, str):
        raise ValidationError(f"راجع {name}")
    value = value.strip()
    if len(value) > limit or (required and not value):
        raise ValidationError(f"راجع {name} وحدود طوله")
    return value


def number(value, places=2, maximum=Decimal("1000000000")):
    try:
        if isinstance(value, bool) or len(str(value)) > 40:
            raise ValueError
        n = Decimal(str(value))
        if not n.is_finite() or n < 0 or n > maximum:
            raise ValueError
        rounded = n.quantize(Decimal(10) ** -places)
        if rounded != n:
            raise ValueError
        return rounded
    except (InvalidOperation, ValueError, TypeError):
        raise ValidationError("أدخل رقمًا موجبًا ضمن الحدود وبدقة الحقل المحددة") from None


def money(value):
    return int(number(value) * 100)


def date(value):
    try:
        v = dt.date.fromisoformat(value)
        if v.isoformat() != value or not 1900 <= v.year <= 2200:
            raise ValueError
        return value
    except (ValueError, TypeError):
        raise ValidationError("أدخل تاريخًا صحيحًا بين ١٩٠٠ و٢٢٠٠") from None


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def password_hash(password, salt=None):
    if not isinstance(password, str) or not 10 <= len(password) <= 128:
        raise ValidationError("كلمة المرور من ١٠ إلى ١٢٨ حرفًا")
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 600_000)
    return salt + ":" + digest.hex()


class Store:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = self.directory / "accounts.sqlite3"
        self.backups = self.directory / "backups"
        self.backups.mkdir(exist_ok=True)
        if not self.path.exists():
            with self.connect() as db:
                db.executescript(SCHEMA)
                db.execute(f"PRAGMA application_id={APP_ID}")
                db.execute("PRAGMA user_version=1")
                db.executemany("INSERT INTO accounts VALUES(?,?,?,?)", ACCOUNTS)
        with self.connect() as db:
            if db.execute("PRAGMA application_id").fetchone()[0] != APP_ID or db.execute("PRAGMA user_version").fetchone()[0] not in (1, VERSION):
                raise ValidationError("نسخة قاعدة البيانات غير مدعومة احتفظ بها ولا تستبدلها")
            if db.execute("PRAGMA user_version").fetchone()[0] == 1:
                target = self.backups / ("before-v2-" + secrets.token_hex(6) + ".branda")
                with closing(sqlite3.connect(target)) as backup:
                    db.backup(backup)
                from butcher_migrations import migrate
                migrate(db)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=20)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA synchronous=FULL")
        db.execute("PRAGMA trusted_schema=OFF")
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def config(db):
        return dict(db.execute("SELECT key,value FROM config"))

    @staticmethod
    def audit(db, event, detail=""):
        db.execute("INSERT INTO audit(at,event,detail) VALUES(?,?,?)", (now(), event, detail))

    def initialized(self):
        with self.connect() as db:
            return "password" in self.config(db)

    def setup(self, payload):
        company = text(payload.get("company"), "اسم المنشأة", 150)
        hashed = password_hash(payload.get("password"))
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if "password" in self.config(db):
                raise ValidationError("سبق إعداد البرنامج سجل الدخول")
            values = {"company": company, "password": hashed, "currency": "SAR", "tax_number": "", "address": "", "closed_through": ""}
            db.executemany("INSERT INTO config VALUES(?,?)", values.items())
            self.audit(db, "setup")

    def authenticate(self, password):
        with self.connect() as db:
            stored = self.config(db).get("password", "")
        try:
            return bool(stored) and hmac.compare_digest(stored, password_hash(password, stored.split(":")[0]))
        except (ValidationError, ValueError):
            return False

    def settings(self, payload):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            values = {k: text(payload.get(k, ""), k, limit, required=k == "company") for k, limit in (("company", 150), ("address", 300), ("tax_number", 30))}
            for k, v in values.items():
                db.execute("INSERT INTO config VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (k, v))
            self.audit(db, "settings")

    def change_password(self, payload):
        if not self.authenticate(payload.get("current")):
            raise ValidationError("كلمة المرور الحالية غير صحيحة")
        hashed = password_hash(payload.get("password"))
        with self.connect() as db:
            db.execute("UPDATE config SET value=? WHERE key='password'", (hashed,))
            self.audit(db, "password_change")

    def close_period(self, payload):
        if not self.authenticate(payload.get("password")):
            raise ValidationError("كلمة المرور غير صحيحة")
        through = date(payload.get("date"))
        with self.connect() as db:
            if through < self.config(db).get("closed_through", ""):
                raise ValidationError("لا يمكن إعادة فتح فترة مقفلة في هذه النسخة")
            db.execute("UPDATE config SET value=? WHERE key='closed_through'", (through,))
            self.audit(db, "period_close", through)

    def add_party(self, payload):
        name = text(payload.get("name"), "اسم الطرف", 150)
        kind = payload.get("kind")
        if kind not in ("customer", "supplier"):
            raise ValidationError("حدد عميلًا أو موردًا")
        with self.connect() as db:
            row = db.execute("INSERT INTO parties(name,kind,phone,tax_number) VALUES(?,?,?,?)", (name, kind, text(payload.get("phone", ""), limit=30, required=False), text(payload.get("tax_number", ""), limit=30, required=False)))
            self.audit(db, "party_create", str(row.lastrowid))
            return row.lastrowid

    def add_account(self, payload):
        code = text(payload.get("code"), "رمز الحساب", 12)
        name = text(payload.get("name"), "اسم الحساب", 100)
        kind = payload.get("kind")
        if not code.isascii() or not code.isdigit() or kind not in ("asset", "liability", "equity", "revenue", "expense"):
            raise ValidationError("راجع رمز الحساب ونوعه")
        cash = payload.get("cash") is True
        if cash and kind != "asset":
            raise ValidationError("حساب النقد أو البنك يجب أن يكون أصلًا")
        with self.connect() as db:
            if db.execute("SELECT 1 FROM accounts WHERE code=?", (code,)).fetchone():
                raise ValidationError("رمز الحساب مستخدم")
            db.execute("INSERT INTO accounts VALUES(?,?,?,?)", (code, name, kind, int(cash)))
            self.audit(db, "account_create", code)

    @staticmethod
    def account(db, code, kinds=None, cash=False):
        row = db.execute("SELECT * FROM accounts WHERE code=?", (str(code),)).fetchone()
        if not row or (kinds and row["kind"] not in kinds) or (cash and not row["cash"]):
            raise ValidationError("اختر حسابًا صالحًا لهذه العملية")
        return row["code"]

    @staticmethod
    def party(db, identity, kind=None):
        if identity in (None, "", 0):
            return None
        row = db.execute("SELECT * FROM parties WHERE id=?", (str(identity),)).fetchone()
        if not row or (kind and row["kind"] != kind):
            raise ValidationError("اختر العميل أو المورد المناسب للعملية")
        return row["id"]

    @staticmethod
    def outstanding(db, doc):
        if db.execute("SELECT 1 FROM documents WHERE reverse_of=?", (doc["id"],)).fetchone():
            return 0
        payments = db.execute("SELECT COALESCE(SUM(d.total),0) FROM documents d WHERE d.related_id=? AND d.kind IN ('receipt','payment') AND NOT EXISTS(SELECT 1 FROM documents r WHERE r.reverse_of=d.id)", (doc["id"],)).fetchone()[0]
        return doc["total"] - doc["paid"] - payments

    def post(self, payload, _db=None):
        if not isinstance(payload, dict):
            raise ValidationError("بيانات غير صحيحة")
        request = text(payload.get("request_id"), "رقم الطلب", 100)
        fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        kind = payload.get("kind")
        if kind not in KINDS:
            raise ValidationError("نوع العملية غير صحيح")
        with (self.connect() if _db is None else nullcontext(_db)) as db:
            if _db is None:
                db.execute("BEGIN IMMEDIATE")
            previous = db.execute("SELECT id,request_hash FROM documents WHERE request_id=?", (request,)).fetchone()
            if previous:
                if previous["request_hash"] != fingerprint:
                    raise ValidationError("رقم الطلب مستخدم ببيانات مختلفة")
                return previous["id"]
            document_date = date(payload.get("date"))
            if document_date <= self.config(db).get("closed_through", ""):
                raise ValidationError("التاريخ ضمن فترة مقفلة اختر تاريخًا بعد الإقفال")
            note = text(payload.get("note", ""), "البيان", 1000, required=False)
            party = self.party(db, payload.get("party_id"), "customer" if kind in ("sale", "receipt") else "supplier" if kind in ("purchase", "expense", "payment") else None)
            net = tax = total = paid = 0
            related = reverse_of = None
            lines, entries = [], []

            def entry(account, debit=0, credit=0, entry_party=None, memo=""):
                if not debit and not credit:
                    return
                self.account(db, account)
                if min(debit, credit) < 0 or (debit and credit) or max(debit, credit) > MAX_MONEY:
                    raise ValidationError("قيمة القيد غير صالحة")
                if account in ("1200", "2100"):
                    self.party(db, entry_party, "customer" if account == "1200" else "supplier")
                    if not entry_party:
                        raise ValidationError("حدد الطرف لكل سطر ذمم عملاء أو موردين")
                elif entry_party:
                    raise ValidationError("الطرف مطلوب لحسابات الذمم فقط")
                entries.append((account, entry_party, debit, credit, memo))

            if kind in ("sale", "purchase", "expense"):
                raw_lines = payload.get("lines")
                if not isinstance(raw_lines, list) or not 1 <= len(raw_lines) <= 100:
                    raise ValidationError("أضف من بند واحد إلى مئة بند")
                for raw in raw_lines:
                    label = text(raw.get("description"), "وصف البند", 250)
                    qty = number(raw.get("quantity"), 3, Decimal("1000000"))
                    price = number(raw.get("price"))
                    discount = money(raw.get("discount", "0"))
                    rate = number(raw.get("rate", "0"), 2, Decimal("100"))
                    gross = int((qty * price * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP))
                    if qty <= 0 or discount > gross:
                        raise ValidationError("راجع الكمية والخصم في بنود الفاتورة")
                    line_net = gross - discount
                    line_tax = int((Decimal(line_net) * rate / 100).quantize(Decimal(1), rounding=ROUND_HALF_UP))
                    account = self.account(db, raw.get("account", "4100" if kind == "sale" else "5100" if kind == "purchase" else "5200"), ("revenue",) if kind == "sale" else ("expense", "asset"))
                    if account in ("1100", "1110", "1200", "1300") or db.execute("SELECT cash FROM accounts WHERE code=?", (account,)).fetchone()[0]:
                        raise ValidationError("اختر حساب مصروف أو أصل غير نقدي لبند الشراء")
                    lines.append({"description": label, "quantity": str(qty), "price": str(price), "discount": discount, "rate": str(rate), "account": account, "net": line_net, "tax": line_tax, "total": line_net + line_tax})
                    net += line_net
                    tax += line_tax
                    entry(account, credit=line_net if kind == "sale" else 0, debit=0 if kind == "sale" else line_net)
                total = net + tax
                paid = money(payload.get("paid", "0"))
                if total <= 0 or total > MAX_MONEY or paid > total:
                    raise ValidationError("راجع إجمالي الفاتورة والمبلغ المدفوع")
                if paid < total and not party:
                    raise ValidationError("الفاتورة الآجلة أو الجزئية تحتاج عميلًا أو موردًا")
                cash = self.account(db, payload.get("cash_account", "1100"), cash=True)
                if kind == "sale":
                    entry("2200", credit=tax)
                    entry(cash, debit=paid)
                    entry("1200", debit=total-paid, entry_party=party)
                else:
                    entry("1300", debit=tax)
                    entry(cash, credit=paid)
                    entry("2100", credit=total-paid, entry_party=party)
            elif kind in ("receipt", "payment"):
                total = money(payload.get("amount"))
                if total <= 0 or not party:
                    raise ValidationError("حدد الطرف ومبلغًا أكبر من صفر")
                cash = self.account(db, payload.get("cash_account", "1100"), cash=True)
                if payload.get("related_id") or payload.get("related_number"):
                    if payload.get("related_number"):
                        reference = text(payload["related_number"], "رقم الفاتورة", 30).upper()
                        original = db.execute("SELECT * FROM documents WHERE number=?", (reference,)).fetchone()
                    else:
                        original = db.execute("SELECT * FROM documents WHERE id=?", (str(payload["related_id"]),)).fetchone()
                    allowed = ("sale",) if kind == "receipt" else ("purchase", "expense")
                    if not original or original["kind"] not in allowed or original["party_id"] != party or original["date"] > document_date or total > self.outstanding(db, original):
                        raise ValidationError("راجع الفاتورة المرتبطة وطرفها وتاريخها والمبلغ المتبقي")
                    related = original["id"]
                entry(cash, debit=total if kind == "receipt" else 0, credit=total if kind == "payment" else 0)
                entry("1200" if kind == "receipt" else "2100", debit=total if kind == "payment" else 0, credit=total if kind == "receipt" else 0, entry_party=party)
            elif kind == "journal":
                raw_lines = payload.get("entries")
                if not isinstance(raw_lines, list) or not 2 <= len(raw_lines) <= 100:
                    raise ValidationError("القيد يحتاج سطرين إلى مئة سطر")
                for raw in raw_lines:
                    debit, credit = money(raw.get("debit", "0")), money(raw.get("credit", "0"))
                    if not debit and not credit:
                        raise ValidationError("كل سطر يحتاج مبلغًا مدينًا أو دائنًا")
                    entry(str(raw.get("account")), debit, credit, self.party(db, raw.get("party_id")), text(raw.get("memo", ""), limit=250, required=False))
                total = sum(row[2] for row in entries)
                if not note:
                    raise ValidationError("أدخل بيان القيد")
            else:
                original = db.execute("SELECT * FROM documents WHERE id=?", (str(payload.get("reverse_of")),)).fetchone()
                if not original or original["kind"] == "reversal" or db.execute("SELECT 1 FROM documents WHERE reverse_of=?", (original["id"],)).fetchone():
                    raise ValidationError("المستند غير متاح للعكس أو سبق عكسه")
                if document_date < original["date"] or not note:
                    raise ValidationError("حدد سبب العكس وتاريخًا لا يسبق المستند الأصلي")
                if db.execute("SELECT 1 FROM documents p WHERE p.related_id=? AND NOT EXISTS(SELECT 1 FROM documents r WHERE r.reverse_of=p.id)", (original["id"],)).fetchone():
                    raise ValidationError("اعكس سندات السداد المرتبطة أولًا")
                reverse_of, party, total = original["id"], original["party_id"], original["total"]
                if json.loads(original["context"]).get("butcher") and original["kind"] == "sale":
                    net, tax, lines = original["net"], original["tax"], json.loads(original["lines"])
                for row in db.execute("SELECT * FROM journal WHERE document_id=?", (reverse_of,)):
                    entry(row["account"], row["credit"], row["debit"], row["party_id"], row["memo"])
            if not entries or sum(e[2] for e in entries) != sum(e[3] for e in entries):
                raise ValidationError("القيد غير متوازن يجب أن يتساوى إجمالي المدين والدائن")
            if sum(e[2] for e in entries) > MAX_MONEY:
                raise ValidationError("إجمالي العملية يتجاوز الحد المسموح")
            seq = db.execute("SELECT COALESCE(MAX(id),0)+1 FROM documents").fetchone()[0]
            prefixes = {"sale": "SAL", "purchase": "PUR", "expense": "EXP", "receipt": "REC", "payment": "PAY", "journal": "JRN", "reversal": "REV"}
            doc_number = f"{prefixes[kind]}-{seq:06d}"
            issuer = {k: v for k, v in self.config(db).items() if k in ("company", "address", "tax_number", "currency", "logo")}
            party_snapshot = dict(db.execute("SELECT * FROM parties WHERE id=?", (party,)).fetchone()) if party else None
            context = json.dumps({"issuer": issuer, "party": party_snapshot, **payload.get("_trusted_context", {})}, ensure_ascii=False)
            row = db.execute("INSERT INTO documents(request_id,request_hash,kind,number,date,party_id,note,net,tax,total,paid,lines,related_id,reverse_of,created_at,context) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (request, fingerprint, kind, doc_number, document_date, party, note, net, tax, total, paid, json.dumps(lines, ensure_ascii=False), related, reverse_of, now(), context))
            identity = row.lastrowid
            db.executemany("INSERT INTO journal(document_id,account,party_id,debit,credit,memo) VALUES(?,?,?,?,?,?)", [(identity, *e) for e in entries])
            self.audit(db, "document_post", doc_number)
            return identity

    def snapshot(self):
        with self.connect() as db:
            cfg = self.config(db)
            cfg = {k: v for k, v in cfg.items() if "password" not in k}
            accounts = [dict(r) for r in db.execute("SELECT a.*,COALESCE(SUM(j.debit-j.credit),0) balance FROM accounts a LEFT JOIN journal j ON j.account=a.code GROUP BY a.code ORDER BY a.code")]
            parties = [dict(r) for r in db.execute("SELECT p.*,COALESCE(SUM(j.debit-j.credit),0) balance FROM parties p LEFT JOIN journal j ON j.party_id=p.id GROUP BY p.id ORDER BY p.name")]
            return {"company": cfg, "accounts": accounts, "parties": parties, "document_count": db.execute("SELECT COUNT(*) FROM documents").fetchone()[0], "version": VERSION, "data_directory": str(self.directory)}

    def documents(self, filters):
        offset = max(0, int(filters.get("offset", 0)))
        kind, search = filters.get("kind", ""), str(filters.get("q", ""))[:150]
        where, args = ["1=1"], []
        if kind:
            where.append("d.kind=?")
            args.append(kind)
        if search:
            where.append("(d.number LIKE ? OR d.note LIKE ? OR p.name LIKE ?)")
            args.extend(["%"+search+"%"]*3)
        for key, op in (("from", ">="), ("to", "<=")):
            if filters.get(key):
                where.append("d.date"+op+"?")
                args.append(date(filters[key]))
        clause = " AND ".join(where)
        with self.connect() as db:
            total = db.execute("SELECT COUNT(*) FROM documents d LEFT JOIN parties p ON p.id=d.party_id WHERE "+clause, args).fetchone()[0]
            rows = [dict(r) for r in db.execute("SELECT d.*,p.name party_name,r.number reversal_number FROM documents d LEFT JOIN parties p ON p.id=d.party_id LEFT JOIN documents r ON r.reverse_of=d.id WHERE "+clause+" ORDER BY d.date DESC,d.id DESC LIMIT 50 OFFSET ?", [*args, offset])]
            for row in rows:
                row.pop("request_hash")
                row.pop("request_id")
                row.pop("lines")
                row["outstanding"] = self.outstanding(db, row) if row["kind"] in ("sale", "purchase", "expense") else None
            return {"rows": rows, "total": total, "offset": offset}

    def document(self, identity):
        with self.connect() as db:
            row = db.execute("SELECT d.*,p.name party_name,p.phone party_phone,p.tax_number party_tax,r.number reversal_number FROM documents d LEFT JOIN parties p ON p.id=d.party_id LEFT JOIN documents r ON r.reverse_of=d.id WHERE d.id=?", (str(identity),)).fetchone()
            if not row:
                raise ValidationError("المستند غير موجود")
            result = dict(row)
            result.pop("request_hash")
            result.pop("request_id")
            result["lines"] = json.loads(result["lines"])
            result["context"] = json.loads(result["context"])
            result["entries"] = [dict(r) for r in db.execute("SELECT j.*,a.name account_name,p.name party_name FROM journal j JOIN accounts a ON a.code=j.account LEFT JOIN parties p ON p.id=j.party_id WHERE j.document_id=? ORDER BY j.id", (row["id"],))]
            result["outstanding"] = self.outstanding(db, row) if row["kind"] in ("sale", "purchase", "expense") else None
            return result

    def report(self, filters):
        start, end = date(filters.get("from", "1900-01-01")), date(filters.get("to", "2200-12-31"))
        if start > end:
            raise ValidationError("تاريخ البداية يجب ألا يتجاوز النهاية")
        account, party = filters.get("account", ""), filters.get("party", "")
        with self.connect() as db:
            trial = [dict(r) for r in db.execute("SELECT a.code,a.name,a.kind,COALESCE(SUM(CASE WHEN d.date<? THEN j.debit-j.credit ELSE 0 END),0) opening,COALESCE(SUM(CASE WHEN d.date>=? THEN j.debit ELSE 0 END),0) debit,COALESCE(SUM(CASE WHEN d.date>=? THEN j.credit ELSE 0 END),0) credit,COALESCE(SUM(j.debit-j.credit),0) balance FROM accounts a LEFT JOIN journal j ON j.account=a.code LEFT JOIN documents d ON d.id=j.document_id WHERE d.date<=? OR d.id IS NULL GROUP BY a.code ORDER BY a.code", (start, start, start, end))]
            revenue = sum(r["credit"]-r["debit"] for r in trial if r["kind"] == "revenue")
            expense = sum(r["debit"]-r["credit"] for r in trial if r["kind"] == "expense")
            sheet = {k: sum(r["balance"] for r in trial if r["kind"] == k) for k in ("asset", "liability", "equity", "revenue", "expense")}
            all_profit = -sheet["revenue"]-sheet["expense"]
            summary = {"revenue": revenue, "expense": expense, "profit": revenue-expense, "assets": sheet["asset"], "liabilities": -sheet["liability"], "equity": -sheet["equity"], "retained_profit": all_profit, "difference": sum(r["balance"] for r in trial), "input_tax": next((r["debit"]-r["credit"] for r in trial if r["code"] == "1300"), 0), "output_tax": next((r["credit"]-r["debit"] for r in trial if r["code"] == "2200"), 0)}
            where, args = ["d.date>=?", "d.date<=?"], [start, end]
            prior_where, prior_args = ["d.date<?"], [start]
            if account:
                self.account(db, account)
                where.append("j.account=?"); args.append(account)
                prior_where.append("j.account=?"); prior_args.append(account)
            if party:
                self.party(db, party)
                where.append("j.party_id=?"); args.append(str(party))
                prior_where.append("j.party_id=?"); prior_args.append(str(party))
            opening = db.execute("SELECT COALESCE(SUM(j.debit-j.credit),0) FROM journal j JOIN documents d ON d.id=j.document_id WHERE "+" AND ".join(prior_where), prior_args).fetchone()[0]
            ledger = [dict(r) for r in db.execute("SELECT j.*,d.date,d.number,d.note,d.kind,a.name account_name,p.name party_name FROM journal j JOIN documents d ON d.id=j.document_id JOIN accounts a ON a.code=j.account LEFT JOIN parties p ON p.id=j.party_id WHERE "+" AND ".join(where)+" ORDER BY d.date,d.id,j.id LIMIT 10001", args)]
            truncated = len(ledger) > 10000
            ledger = ledger[:10000]
            balance = opening
            for row in ledger:
                balance += row["debit"]-row["credit"]
                row["running"] = balance
            return {"from": start, "to": end, "trial": trial, "summary": summary, "ledger": ledger, "opening": opening, "truncated": truncated}

    def backup(self, label="manual"):
        target = self.backups / (dt.datetime.now().strftime("%Y%m%d-%H%M%S-")+secrets.token_hex(3)+"-"+label+".branda")
        with self.connect() as db:
            with closing(sqlite3.connect(target)) as dest:
                db.backup(dest)
        return target

    def restore(self, data, password):
        if not self.authenticate(password):
            raise ValidationError("كلمة المرور الحالية غير صحيحة")
        if len(data) > 100*1024*1024 or not data.startswith(b"SQLite format 3\x00"):
            raise ValidationError("اختر نسخة احتياطية صالحة بحجم لا يتجاوز ١٠٠ ميجابايت")
        fd, tmp = tempfile.mkstemp(prefix="restore-", suffix=".sqlite3", dir=self.directory)
        candidate = Path(tmp)
        try:
            with os.fdopen(fd, "wb") as file:
                file.write(data)
            with closing(sqlite3.connect(candidate)) as db:
                db.execute("PRAGMA trusted_schema=OFF")
                if db.execute("PRAGMA application_id").fetchone()[0] != APP_ID or db.execute("PRAGMA user_version").fetchone()[0] not in (1, VERSION):
                    raise ValidationError("الملف ليس نسخة مدعومة من محاسبة برندة المحلية")
                if db.execute("PRAGMA user_version").fetchone()[0] == 1:
                    from butcher_migrations import migrate
                    migrate(db)
                with self.connect() as live:
                    schema = lambda conn: conn.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name").fetchall()
                    if schema(db) != [tuple(x) for x in schema(live)]:
                        raise ValidationError("بنية النسخة الاحتياطية غير متوافقة")
                if db.execute("PRAGMA quick_check").fetchone()[0] != "ok" or db.execute("PRAGMA foreign_key_check").fetchone():
                    raise ValidationError("النسخة الاحتياطية تالفة")
                if db.execute("SELECT d.id FROM documents d LEFT JOIN journal j ON j.document_id=d.id GROUP BY d.id HAVING COALESCE(SUM(j.debit-j.credit),1)<>0 OR COUNT(j.id)<2 LIMIT 1").fetchone():
                    raise ValidationError("النسخة تحتوي قيودًا غير متوازنة")
                cfg = dict(db.execute("SELECT key,value FROM config"))
                if not cfg.get("company") or len(cfg.get("password", "")) != 97:
                    raise ValidationError("بيانات إعداد النسخة غير مكتملة")
            backup = self.backup("before-restore")
            os.replace(candidate, self.path)
            return backup.name
        finally:
            candidate.unlink(missing_ok=True)
