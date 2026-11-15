"""Offline butcher ledger: integer grams/quarters/pieces and integer halalas.

All inventory commands share the accounting transaction. FIFO consumes the exact
remaining value on the last unit, so rounding can never create or lose inventory value.
"""
from __future__ import annotations
import base64
import datetime as dt
import hashlib
import hmac
import json
import re
import struct
from decimal import Decimal, ROUND_HALF_UP

from engine import Store as AccountingStore, ValidationError, date, money, now, number, password_hash, text

UNITS = {"each": ("piece", 1), "piece": ("piece", 1), "g": ("weight", 1), "kg": ("weight", 1000), "quarter": ("carcass", 1), "half": ("carcass", 2), "whole": ("carcass", 4)}


def rounded(value):
    return int(Decimal(value).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def image_data(value):
    if not value:
        return ""
    if not isinstance(value, str) or len(value) > 400_000:
        raise ValidationError("اختر صورة أصغر من ٢٥٠ كيلوبايت")
    match = re.fullmatch(r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)", value)
    if not match:
        raise ValidationError("الصورة يجب أن تكون PNG أو JPEG أو WebP")
    try:
        data = base64.b64decode(match[2], validate=True)
    except ValueError:
        raise ValidationError("الصورة غير صالحة") from None
    valid = (match[1] == "png" and data.startswith(b"\x89PNG\r\n\x1a\n")) or (match[1] == "jpeg" and data.startswith(b"\xff\xd8\xff")) or (match[1] == "webp" and data.startswith(b"RIFF") and data[8:12] == b"WEBP")
    if not valid or len(data) > 250_000:
        raise ValidationError("بيانات الصورة أو حجمها غير صالح")
    if match[1] == "png":
        if len(data) < 45 or data[12:16] != b"IHDR" or b"IEND" not in data[-12:]:
            raise ValidationError("ملف PNG غير مكتمل")
        width, height = struct.unpack(">II", data[16:24])
        if not 1 <= width <= 4096 or not 1 <= height <= 4096:
            raise ValidationError("أبعاد الصورة كبيرة صغّرها قبل الرفع")
    if match[1] == "jpeg" and not data.endswith(b"\xff\xd9"):
        raise ValidationError("ملف JPEG غير مكتمل")
    if match[1] == "webp" and (len(data) < 20 or struct.unpack("<I", data[4:8])[0] + 8 != len(data)):
        raise ValidationError("ملف WebP غير مكتمل")
    return value


def vat_number(value, required=False):
    result = text(value or "", "الرقم الضريبي", 15, required=required)
    if result and not re.fullmatch(r"3\d{13}3", result):
        raise ValidationError("الرقم الضريبي السعودي ١٥ رقمًا يبدأ وينتهي بالرقم ٣")
    return result


def qr_tlv(issuer, timestamp, total, tax):
    """ZATCA Phase 1 tags 1..5: length is UTF-8 byte count, not characters."""
    fields = [issuer["company"], vat_number(issuer.get("tax_number"), True), timestamp, f"{total / 100:.2f}", f"{tax / 100:.2f}"]
    data = bytearray()
    for tag, value in enumerate(fields, 1):
        encoded = value.encode("utf-8")
        if len(encoded) > 255:
            raise ValidationError("اسم المنشأة أطول من الحد المسموح لرمز الفاتورة اختصر الاسم إلى ١٢٧ حرفًا عربيًا")
        data.extend(bytes([tag, len(encoded)]))
        data.extend(encoded)
    return base64.b64encode(data).decode("ascii")


class Store(AccountingStore):
    def authenticate_role(self, password, role="owner"):
        if role == "owner":
            return self.authenticate(password)
        if role != "cashier":
            return False
        with self.connect() as db:
            stored = self.config(db).get("cashier_password", "")
        try:
            return bool(stored) and hmac.compare_digest(stored, password_hash(password, stored.split(":")[0]))
        except (ValidationError, ValueError):
            return False

    def cashier_settings(self, payload):
        hashed = password_hash(payload.get("password")) if payload.get("enabled") else ""
        with self.connect() as db:
            db.execute("INSERT INTO config VALUES('cashier_password',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (hashed,))
            self.audit(db, "cashier_access", "enabled" if hashed else "disabled")

    def settings(self, payload):
        payload = dict(payload)
        payload["tax_number"] = vat_number(payload.get("tax_number"))
        if len(str(payload.get("company", "")).encode("utf-8")) > 255:
            raise ValidationError("اختصر اسم المنشأة ليصلح لرمز الفاتورة الضريبية")
        super().settings(payload)

    def logo(self, payload):
        logo = image_data(payload.get("image", ""))
        with self.connect() as db:
            db.execute("INSERT INTO config VALUES('logo',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (logo,))
            self.audit(db, "company_logo")

    def save_product(self, payload):
        name = text(payload.get("name"), "اسم المنتج", 150)
        unit = payload.get("unit")
        if unit not in UNITS:
            raise ValidationError("اختر وحدة المنتج")
        group = text(payload.get("stock_group"), "مجموعة المخزون", 100)
        price = money(payload.get("price"))
        image = image_data(payload.get("image", ""))
        active = 0 if payload.get("active") is False else 1
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if payload.get("id"):
                old = db.execute("SELECT * FROM products WHERE id=?", (str(payload["id"]),)).fetchone()
                if not old:
                    raise ValidationError("المنتج غير موجود")
                if (old["unit"] != unit or old["stock_group"] != group) and db.execute("SELECT 1 FROM stock_moves WHERE product_id=?", (old["id"],)).fetchone():
                    raise ValidationError("أنشئ منتجًا جديدًا لتغيير وحدة أو مجموعة منتج سبق بيعه")
                db.execute("UPDATE products SET name=?,price=?,unit=?,stock_group=?,image=?,active=? WHERE id=?", (name, price, unit, group, image, active, old["id"]))
                identity = old["id"]
            else:
                identity = db.execute("INSERT INTO products(name,price,unit,stock_group,image,active) VALUES(?,?,?,?,?,?)", (name, price, unit, group, image, active)).lastrowid
            self.audit(db, "product_save", str(identity))
            return identity

    @staticmethod
    def base_quantity(unit, quantity):
        qty = number(quantity, 3 if unit == "kg" else 0, Decimal("1000000"))
        result = qty * UNITS[unit][1]
        if result <= 0 or result != result.to_integral_value():
            raise ValidationError("أدخل كمية موجبة بالجرام الصحيح أو القطعة الصحيحة")
        return int(result)

    @staticmethod
    def move(db, lot, document, quantity, cost, reason, product=None):
        operation_day = db.execute("SELECT date FROM documents WHERE id=?", (document,)).fetchone()[0]
        latest = db.execute("SELECT MAX(d.date) FROM stock_moves m JOIN documents d ON d.id=m.document_id WHERE m.lot_id=?", (lot,)).fetchone()[0]
        if latest and operation_day < latest:
            raise ValidationError("تاريخ حركة المخزون يجب ألا يسبق آخر حركة على الدفعة")
        db.execute("UPDATE stock_lots SET remaining_qty=remaining_qty+?,remaining_cost=remaining_cost+? WHERE id=?", (quantity, cost, lot))
        db.execute("INSERT INTO stock_moves(lot_id,document_id,quantity,cost,reason,product_id) VALUES(?,?,?,?,?,?)", (lot, document, quantity, cost, reason, product))

    def consume(self, db, group, basis, quantity, allocations, product=None):
        remaining = quantity
        for row in db.execute("SELECT l.* FROM stock_lots l JOIN documents d ON d.id=l.document_id WHERE l.stock_group=? AND l.basis=? AND l.remaining_qty>0 ORDER BY d.date,l.id", (group, basis)).fetchall():
            # Include allocations earlier in this same sale, before posting moves.
            used = sum(a[1] for a in allocations if a[0] == row["id"])
            used_cost = sum(a[2] for a in allocations if a[0] == row["id"])
            available, value = row["remaining_qty"] - used, row["remaining_cost"] - used_cost
            take = min(remaining, available)
            if take <= 0:
                continue
            cost = value if take == available else rounded(Decimal(value) * take / available)
            allocations.append((row["id"], take, cost, product))
            remaining -= take
            if not remaining:
                break
        if remaining:
            raise ValidationError(f"المخزون غير كاف لمجموعة {group} راجع الدفعات أو حوّل الذبيحة إلى وزن بعد التقطيع")

    def command(self, payload, role="owner"):
        if not isinstance(payload, dict):
            raise ValidationError("بيانات العملية غير صالحة")
        action = payload.get("action")
        if role not in ("owner", "cashier") or (role == "cashier" and action != "sale"):
            raise ValidationError("هذا الإجراء متاح للمالك فقط")
        request = text(payload.get("request_id"), "رقم الطلب", 100)
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            prior = db.execute("SELECT * FROM butcher_requests WHERE request_id=?", (request,)).fetchone()
            if prior:
                if prior["request_hash"] != digest:
                    raise ValidationError("طلب سابق ببيانات مختلفة")
                return prior["document_id"]
            if db.execute("SELECT 1 FROM documents WHERE request_id=?", (request,)).fetchone():
                raise ValidationError("رقم العملية مستخدم سابقًا")
            today = dt.datetime.now(dt.timezone(dt.timedelta(hours=3))).date().isoformat()
            day = today if action == "sale" else date(payload.get("date"))
            if day > today:
                raise ValidationError("لا يمكن ترحيل عملية مخزون أو تسوية بتاريخ مستقبلي")
            if action == "reconcile" and day != today:
                raise ValidationError("تسوية الرصيد الحالي تُسجل بتاريخ اليوم")
            if day <= self.config(db).get("closed_through", ""):
                raise ValidationError("الفترة مقفلة")
            base = {"request_id": request, "date": day, "note": text(payload.get("note", ""), "البيان", 1000, False)}
            if action == "sale":
                identity = self.sale(db, base, payload, role)
            elif action == "purchase":
                identity = self.purchase_lot(db, base, payload)
            elif action in ("adjust", "cut"):
                identity = self.stock_operation(db, base, payload, action)
            elif action == "reconcile":
                identity = self.reconcile(db, base, payload)
            else:
                raise ValidationError("إجراء غير معروف")
            db.execute("INSERT INTO butcher_requests VALUES(?,?,?)", (request, digest, identity))
            return identity

    def sale(self, db, base, payload, role):
        cfg = self.config(db)
        taxable = bool(cfg.get("tax_number"))
        if taxable:
            vat_number(cfg["tax_number"], True)
            if not cfg.get("address", "").strip():
                raise ValidationError("أكمل عنوان المنشأة في الإعدادات قبل إصدار فاتورة ضريبية")
        lines = payload.get("items")
        if not isinstance(lines, list) or not 1 <= len(lines) <= 100:
            raise ValidationError("أضف من منتج واحد إلى مئة منتج")
        allocations, invoice_lines, stock_lines = [], [], []
        net = tax = 0
        for raw in lines:
            product = db.execute("SELECT * FROM products WHERE id=? AND active=1", (str(raw.get("product_id")),)).fetchone()
            if not product:
                raise ValidationError("منتج غير متاح أعد تحميل نقطة البيع")
            unit, group = product["unit"], product["stock_group"]
            qty = self.base_quantity(unit, raw.get("quantity"))
            self.consume(db, group, UNITS[unit][0], qty, allocations, product["id"])
            amount = rounded(Decimal(str(raw["quantity"])) * product["price"])
            discount = money(raw.get("discount", 0))
            if role == "cashier" and discount:
                raise ValidationError("خصم الفاتورة يحتاج المالك")
            if discount > amount:
                raise ValidationError("الخصم أكبر من قيمة البند")
            line_net = amount - discount
            line_tax = rounded(Decimal(line_net) * Decimal("0.15")) if taxable else 0
            net += line_net
            tax += line_tax
            invoice_lines.append({"description": product["name"], "quantity": str(raw["quantity"]), "price": f"{product['price']/100:.2f}", "discount": f"{discount/100:.2f}", "rate": "15" if taxable else "0"})
            stock_lines.append({"product_id": product["id"], "unit": unit, "stock_group": group, "base_quantity": qty})
        total = net + tax
        cash, card = money(payload.get("cash", 0)), money(payload.get("card", 0))
        if total <= 0 or cash + card != total:
            raise ValidationError("مجموع النقد والشبكة يجب أن يساوي إجمالي الفاتورة")
        customer_name = text(payload.get("customer_name", ""), "اسم العميل", 150, False)
        phone = text(payload.get("customer_phone", ""), "هاتف العميل", 25, False)
        if phone and not re.fullmatch(r"\+?[0-9 ()-]{5,25}", phone):
            raise ValidationError("رقم هاتف العميل غير صحيح")
        customer_tax = vat_number(payload.get("customer_tax", ""))
        customer_address = text(payload.get("customer_address", ""), "عنوان العميل", 300, False)
        if customer_tax and (not customer_name or not customer_address):
            raise ValidationError("أدخل اسم وعنوان العميل صاحب الرقم الضريبي")
        timestamp = now()
        issuer = {key: cfg.get(key, "") for key in ("company", "tax_number", "address", "logo")}
        qr = qr_tlv(issuer, timestamp, total, tax) if taxable else ""
        cost = sum(a[2] for a in allocations)
        context = {"butcher": True, "operator": role, "customer_name": customer_name, "customer_phone": phone, "customer_tax": customer_tax, "customer_address": customer_address, "issued_at": timestamp, "qr_tlv": qr, "cash": cash, "card": card, "cost": cost, "stock_lines": stock_lines, "tax_title": "فاتورة ضريبية" if customer_tax and taxable else "فاتورة ضريبية مبسطة" if taxable else "فاتورة مبيعات"}
        identity = super().post({**base, "kind": "sale", "lines": invoice_lines, "paid": f"{total/100:.2f}", "cash_account": "1100", "_trusted_context": context}, _db=db)
        # Split the default full cash debit into cash and card with a balanced transfer.
        if card:
            self.journal_pair(db, identity, "1120", "1100", card, "تحصيل شبكة")
        if cost:
            self.journal_pair(db, identity, "5300", "1400", cost, "تكلفة مبيعات الدفعات")
        for lot, qty, value, product in allocations:
            self.move(db, lot, identity, -qty, -value, "sale", product)
        return identity

    @staticmethod
    def journal_pair(db, identity, debit, credit, amount, memo):
        if amount:
            db.executemany("INSERT INTO journal(document_id,account,debit,credit,memo) VALUES(?,?,?,?,?)", [(identity, debit, amount, 0, memo), (identity, credit, 0, amount, memo)])

    def purchase_lot(self, db, base, payload):
        basis = payload.get("basis")
        if basis not in ("piece", "weight", "carcass"):
            raise ValidationError("اختر أساس مخزون الدفعة")
        count = int(number(payload.get("carcass_count", 0), 0, Decimal("1000000")))
        weight = int(number(payload.get("weight_kg", 0), 3, Decimal("1000000")) * 1000)
        qty = count * 4 if basis == "carcass" else weight if basis == "weight" else int(number(payload.get("pieces", 0), 0, Decimal("1000000")))
        if qty <= 0:
            raise ValidationError("أدخل كمية الدفعة على أساس المخزون المختار")
        group = text(payload.get("stock_group"), "مجموعة المخزون", 100)
        reference = text(payload.get("reference"), "مرجع الدفعة", 100)
        used_date = db.execute("SELECT MAX(d.date) FROM stock_moves m JOIN stock_lots l ON l.id=m.lot_id JOIN documents d ON d.id=m.document_id WHERE l.stock_group=? AND l.basis=? AND m.reason<>'purchase'", (group, basis)).fetchone()[0]
        if used_date and base["date"] < used_date:
            raise ValidationError("تاريخ دفعة جديدة لا يسبق حركات المخزون السابقة في المجموعة حفاظًا على ترتيب التكلفة")
        cost = money(payload.get("cost"))
        if cost <= 0:
            raise ValidationError("تكلفة الدفعة يجب أن تكون موجبة")
        rate = number(payload.get("rate", 0), 2, Decimal("15"))
        if rate not in (0, 15):
            raise ValidationError("نسبة الضريبة صفر أو ١٥ حسب فاتورة المورد")
        if rate and not self.config(db).get("tax_number"):
            raise ValidationError("المنشأة غير مسجلة ضريبيًا أدخل التكلفة شاملة ضريبة المورد واختر ضريبة صفر")
        tax = rounded(Decimal(cost) * rate / 100)
        paid = money(payload.get("paid", f"{(cost+tax)/100:.2f}"))
        account = payload.get("cash_account", "1100")
        if account not in ("1100", "1110"):
            raise ValidationError("اختر الصندوق أو البنك لسداد المشتريات")
        context = {"butcher": True, "operation": "purchase", "batch_reference": reference, "stock_group": group, "basis": basis, "carcass_count": count, "weight_grams": weight}
        identity = super().post({**base, "kind": "purchase", "party_id": payload.get("party_id"), "paid": f"{paid/100:.2f}", "cash_account": account, "lines": [{"description": "دفعة " + reference + " · " + group, "quantity": "1", "price": f"{cost/100:.2f}", "rate": str(rate), "account": "1400"}], "_trusted_context": context}, _db=db)
        lot = db.execute("INSERT INTO stock_lots(reference,stock_group,basis,initial_qty,remaining_qty,initial_cost,remaining_cost,carcass_count,weight_grams,document_id,created_at) VALUES(?,?,?,?,0,?,0,?,?,?,?)", (reference, group, basis, qty, cost, count, weight, identity, now())).lastrowid
        self.move(db, lot, identity, qty, cost, "purchase")
        return identity

    def stock_operation(self, db, base, payload, action):
        lot = db.execute("SELECT * FROM stock_lots WHERE id=?", (str(payload.get("lot_id")),)).fetchone()
        if not lot:
            raise ValidationError("اختر دفعة موجودة")
        if not base["note"]:
            raise ValidationError("أدخل سبب التسوية أو ملاحظة التقطيع")
        if action == "cut":
            if lot["basis"] != "carcass":
                raise ValidationError("التقطيع متاح لدفعات الذبائح والأرباع")
            consume = int(number(payload.get("quarters"), 0, Decimal("1000000")))
            grams = int(number(payload.get("output_kg"), 3, Decimal("1000000")) * 1000)
            waste = int(number(payload.get("waste_kg", 0), 3, Decimal("1000000")) * 1000)
            if not 0 < consume <= lot["remaining_qty"] or grams <= 0:
                raise ValidationError("راجع عدد الأرباع والوزن الصافي الناتج")
            value = lot["remaining_cost"] if consume == lot["remaining_qty"] else rounded(Decimal(lot["remaining_cost"]) * consume / lot["remaining_qty"])
            # Measured yield+discarded weight allocate cost; never recognizes revenue.
            waste_cost = rounded(Decimal(value) * waste / (grams + waste))
            output_cost = value - waste_cost
            group = text(payload.get("stock_group"), "مجموعة اللحم المقطع", 100)
            entries = [{"account": "1400", "debit": f"{output_cost/100:.2f}", "credit": "0"}] if output_cost else []
            if waste_cost:
                entries.append({"account": "5310", "debit": f"{waste_cost/100:.2f}", "credit": "0"})
            entries.append({"account": "1400", "credit": f"{value/100:.2f}", "debit": "0"})
            if value == 0:
                raise ValidationError("الدفعة بلا قيمة متبقية لا يمكن تقطيعها")
            context = {"butcher": True, "operation": "cut", "parent_lot": lot["id"], "quarters": consume, "output_grams": grams, "waste_grams": waste, "waste_cost": waste_cost}
            identity = super().post({**base, "kind": "journal", "entries": entries, "_trusted_context": context}, _db=db)
            self.move(db, lot["id"], identity, -consume, -value, "cut")
            child = db.execute("INSERT INTO stock_lots(reference,stock_group,basis,initial_qty,remaining_qty,initial_cost,remaining_cost,weight_grams,document_id,parent_id,created_at) VALUES(?,?,'weight',?,0,?,0,?,?,?,?)", (lot["reference"] + "/CUT-" + str(identity), group, grams, output_cost, grams, identity, lot["id"], now())).lastrowid
            self.move(db, child, identity, grams, output_cost, "cut_yield")
            return identity
        counted = int(number(payload.get("counted"), 3 if lot["basis"] == "weight" else 0, Decimal("1000000")) * (1000 if lot["basis"] == "weight" else 1))
        expected = int(number(payload.get("expected"), 0))
        if expected != lot["remaining_qty"]:
            raise ValidationError("تغير رصيد الدفعة أثناء الجرد حدّث البيانات وأعد العد")
        delta = counted - expected
        if not delta:
            raise ValidationError("العدد مطابق للرصيد لا توجد تسوية")
        if delta < 0:
            value = lot["remaining_cost"] if counted == 0 else rounded(Decimal(lot["remaining_cost"]) * -delta / expected)
        else:
            value = money(payload.get("added_cost"))
            if value <= 0:
                raise ValidationError("أدخل قيمة المخزون الزائد بتكلفة موثقة")
        if value <= 0:
            raise ValidationError("قيمة التسوية أقل من هللة راجع تكلفة الدفعة")
        debit, credit = ("5310", "1400") if delta < 0 else ("1400", "5310")
        identity = super().post({**base, "kind": "journal", "entries": [{"account": debit, "debit": f"{value/100:.2f}"}, {"account": credit, "credit": f"{value/100:.2f}"}], "_trusted_context": {"butcher": True, "operation": "adjust", "lot_id": lot["id"], "expected": expected, "counted": counted}}, _db=db)
        self.move(db, lot["id"], identity, delta, value if delta > 0 else -value, "count_adjustment")
        return identity

    def reconcile(self, db, base, payload):
        account = payload.get("account")
        if account not in ("1100", "1120"):
            raise ValidationError("اختر الصندوق أو الشبكة")
        if not base["note"]:
            raise ValidationError("أدخل بيان التسوية")
        expected = db.execute("SELECT COALESCE(SUM(debit-credit),0) FROM journal WHERE account=?", (account,)).fetchone()[0]
        if str(payload.get("expected")) != str(expected):
            raise ValidationError("تغير الرصيد أثناء المراجعة حدّث التقرير")
        actual = money(payload.get("actual"))
        delta = actual - expected
        # A matching count needs no accounting entry; do not invent money movement.
        if not delta:
            raise ValidationError("الرصيد مطابق لا توجد فروق تحتاج ترحيلًا")
        debit, credit = (account, "5320") if delta > 0 else ("5320", account)
        value = abs(delta)
        return super().post({**base, "kind": "journal", "entries": [{"account": debit, "debit": f"{value/100:.2f}"}, {"account": credit, "credit": f"{value/100:.2f}"}], "_trusted_context": {"butcher": True, "operation": "reconcile", "account": account, "expected": expected, "actual": actual}}, _db=db)

    def post(self, payload, _db=None):
        # Public legacy accounting endpoint never accepts internal invoice context.
        payload = {key: value for key, value in payload.items() if key != "_trusted_context"}
        if payload.get("kind") == "sale":
            raise ValidationError("أصدر المبيعات من نقطة البيع لربط المخزون والضريبة")
        if payload.get("kind") in ("purchase", "expense"):
            with self.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                if not self.config(db).get("tax_number") and any(number(line.get("rate", 0), 2, Decimal("100")) for line in payload.get("lines", []) if isinstance(line, dict)):
                    raise ValidationError("المنشأة غير مسجلة ضريبيًا أدخل التكلفة شاملة ضريبة المورد واختر ضريبة صفر")
                return super().post(payload, _db=db)
        if payload.get("kind") != "reversal":
            return super().post(payload, _db)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute("SELECT id FROM documents WHERE request_id=?", (str(payload.get("request_id")),)).fetchone()
            if old:
                saved = db.execute("SELECT request_hash,context FROM documents WHERE id=?", (old["id"],)).fetchone()
                context = json.loads(saved["context"])
                if context.get("operation") == "credit_note":
                    payload["_trusted_context"] = {key: value for key, value in context.items() if key != "party"}
                return super().post(payload, _db=db)
            moves = db.execute("SELECT m.*,l.remaining_qty,l.remaining_cost FROM stock_moves m JOIN stock_lots l ON l.id=m.lot_id WHERE m.document_id=? ORDER BY m.id DESC", (str(payload.get("reverse_of")),)).fetchall()
            if moves and date(payload.get("date")) > dt.datetime.now(dt.timezone(dt.timedelta(hours=3))).date().isoformat():
                raise ValidationError("لا يمكن عكس حركة مخزون بتاريخ مستقبلي")
            for m in moves:
                if m["remaining_qty"] - m["quantity"] < 0 or m["remaining_cost"] - m["cost"] < 0:
                    raise ValidationError("لا يمكن عكس الدفعة بعد استهلاك مخزونها اعكس العمليات التابعة أولًا")
                if m["quantity"] > 0 and db.execute("SELECT 1 FROM stock_moves WHERE lot_id=? AND document_id<>?", (m["lot_id"], m["document_id"])).fetchone():
                    # Only disallow unreversed downstream consumption, not closed history.
                    dependent = db.execute("SELECT 1 FROM stock_moves s JOIN documents d ON d.id=s.document_id WHERE s.lot_id=? AND s.document_id<>? AND d.reverse_of IS NULL AND NOT EXISTS(SELECT 1 FROM documents r WHERE r.reverse_of=d.id) LIMIT 1", (m["lot_id"], m["document_id"])).fetchone()
                    if dependent:
                        raise ValidationError("اعكس العمليات المرتبطة بالدفعة أولًا")
            original = db.execute("SELECT * FROM documents WHERE id=?", (str(payload.get("reverse_of")),)).fetchone()
            if original and original["kind"] == "sale":
                original_context = json.loads(original["context"])
                if original_context.get("butcher"):
                    timestamp = now()
                    context = {key: value for key, value in original_context.items() if key != "party"}
                    context.update({"operation": "credit_note", "tax_title": "إشعار دائن لفاتورة " + original["number"], "issued_at": timestamp, "original_number": original["number"]})
                    context["qr_tlv"] = qr_tlv(context["issuer"], timestamp, original["total"], original["tax"]) if context["issuer"].get("tax_number") else ""
                    payload["_trusted_context"] = context
            identity = super().post(payload, _db=db)
            for m in moves:
                self.move(db, m["lot_id"], identity, -m["quantity"], -m["cost"], "reversal", m["product_id"])
            return identity

    def catalog(self, role="owner"):
        with self.connect() as db:
            products = [dict(row) for row in db.execute("SELECT * FROM products ORDER BY active DESC,name")]
            stocks = [dict(row) for row in db.execute("SELECT stock_group,basis,SUM(remaining_qty) quantity,SUM(remaining_cost) cost FROM stock_lots GROUP BY stock_group,basis")]
            for p in products:
                p["available_qty"] = next((s["quantity"] for s in stocks if s["stock_group"] == p["stock_group"] and s["basis"] == UNITS[p["unit"]][0]), 0)
            if role == "cashier":
                return {"products": [p for p in products if p["active"]], "stocks": [{k: v for k, v in s.items() if k != "cost"} for s in stocks]}
            return {"products": products, "stocks": stocks, "lots": [dict(row) for row in db.execute("SELECT l.*,d.number document_number FROM stock_lots l JOIN documents d ON d.id=l.document_id ORDER BY l.id DESC")]}

    def butcher_report(self, filters):
        start, end = date(filters.get("from", "1900-01-01")), date(filters.get("to", "2200-12-31"))
        if start > end:
            raise ValidationError("راجع نطاق التواريخ")
        with self.connect() as db:
            rows = []
            for row in db.execute("SELECT d.id,d.number,d.date,d.net,d.tax,d.total,d.context,r.number reversal_number FROM documents d LEFT JOIN documents r ON r.reverse_of=d.id WHERE d.kind='sale' AND d.date BETWEEN ? AND ? ORDER BY d.id DESC", (start, end)):
                item = dict(row)
                context = json.loads(item.pop("context"))
                if not context.get("butcher"):
                    continue
                item.update({key: context.get(key, 0) for key in ("cash", "card", "cost")})
                item["profit"] = item["net"] - item["cost"]
                rows.append(item)
            for row in db.execute("SELECT r.id,r.number,r.date,o.net,o.tax,o.total,o.context,o.number original_number FROM documents r JOIN documents o ON o.id=r.reverse_of WHERE o.kind='sale' AND r.date BETWEEN ? AND ? ORDER BY r.id", (start, end)):
                item = dict(row)
                context = json.loads(item.pop("context"))
                if not context.get("butcher"):
                    continue
                for key in ("net", "tax", "total"):
                    item[key] = -item[key]
                item.update({key: -context.get(key, 0) for key in ("cash", "card", "cost")})
                item["profit"] = item["net"] - item["cost"]
                item["credit_note"] = True
                rows.append(item)
            balances = {code: db.execute("SELECT COALESCE(SUM(debit-credit),0) FROM journal WHERE account=?", (code,)).fetchone()[0] for code in ("1100", "1110", "1120", "1400", "5310")}
            return {"from": start, "to": end, "rows": rows, "summary": {key: sum(r[key] for r in rows) for key in ("net", "tax", "total", "cash", "card", "cost", "profit")}, "balances": balances, "stock_value": db.execute("SELECT COALESCE(SUM(remaining_cost),0) FROM stock_lots").fetchone()[0]}
