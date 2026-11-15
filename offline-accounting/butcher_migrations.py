"""Transactional v1 -> v2 additions; original accounting records are preserved."""
SCHEMA = [
"CREATE TABLE products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>=0),unit TEXT NOT NULL CHECK(unit IN ('each','piece','g','kg','quarter','half','whole')),stock_group TEXT NOT NULL,image TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)))",
"CREATE TABLE stock_lots(id INTEGER PRIMARY KEY AUTOINCREMENT,reference TEXT NOT NULL,stock_group TEXT NOT NULL,basis TEXT NOT NULL CHECK(basis IN('piece','weight','carcass')),initial_qty INTEGER NOT NULL CHECK(initial_qty>0),remaining_qty INTEGER NOT NULL CHECK(remaining_qty>=0),initial_cost INTEGER NOT NULL CHECK(initial_cost>=0),remaining_cost INTEGER NOT NULL CHECK(remaining_cost>=0),carcass_count INTEGER NOT NULL DEFAULT 0,weight_grams INTEGER NOT NULL DEFAULT 0,document_id INTEGER NOT NULL REFERENCES documents(id),parent_id INTEGER REFERENCES stock_lots(id),created_at TEXT NOT NULL)",
"CREATE INDEX stock_lot_group ON stock_lots(stock_group,basis,id)",
"CREATE TABLE stock_moves(id INTEGER PRIMARY KEY AUTOINCREMENT,lot_id INTEGER NOT NULL REFERENCES stock_lots(id),document_id INTEGER NOT NULL REFERENCES documents(id),quantity INTEGER NOT NULL,cost INTEGER NOT NULL,reason TEXT NOT NULL,product_id INTEGER REFERENCES products(id))",
"CREATE INDEX stock_move_document ON stock_moves(document_id)",
"CREATE TABLE butcher_requests(request_id TEXT PRIMARY KEY,request_hash TEXT NOT NULL,document_id INTEGER NOT NULL REFERENCES documents(id))",
"CREATE TRIGGER stock_moves_no_update BEFORE UPDATE ON stock_moves BEGIN SELECT RAISE(ABORT,'immutable stock move'); END",
"CREATE TRIGGER stock_moves_no_delete BEFORE DELETE ON stock_moves BEGIN SELECT RAISE(ABORT,'immutable stock move'); END",
"CREATE TRIGGER stock_lots_no_delete BEFORE DELETE ON stock_lots BEGIN SELECT RAISE(ABORT,'retain lot history'); END",
]


def migrate(db):
    if db.execute("PRAGMA user_version").fetchone()[0] == 2:
        return
    db.execute("BEGIN IMMEDIATE")
    try:
        from engine import ValidationError
        reserved = [
            ('1120', 'متحصلات الشبكة', 'asset', 1),
            ('5300', 'تكلفة البضاعة المباعة', 'expense', 0),
            ('5310', 'هالك وتسويات المخزون', 'expense', 0),
            ('5320', 'فروق الصندوق والشبكة', 'expense', 0),
        ]
        for code, name, kind, cash in reserved:
            existing = db.execute("SELECT name,kind,cash FROM accounts WHERE code=?", (code,)).fetchone()
            if existing and tuple(existing) != (name, kind, cash):
                raise ValidationError(f"الحساب {code} موجود بمعنى مختلف تعذرت الترقية الآمنة احتفظ بالنسخة الأصلية لمعالجة تعارض دليل الحسابات")
        for statement in SCHEMA:
            db.execute(statement)
        db.executemany("INSERT OR IGNORE INTO accounts VALUES(?,?,?,?)", reserved)
        db.execute("PRAGMA user_version=2")
        db.commit()
    except BaseException:
        db.rollback()
        raise
