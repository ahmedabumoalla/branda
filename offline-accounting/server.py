"""Local Windows application host. No cloud keys, telemetry, or outbound requests."""
from __future__ import annotations
import argparse
import base64
import hashlib
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
import os
from pathlib import Path
import secrets
import sqlite3
import socketserver
import sys
import threading
import time
from urllib.parse import parse_qs, urlsplit
import webbrowser

from butcher import Store, ValidationError

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"


def deny_outbound(event, args):
    if event in ("socket.connect", "socket.getaddrinfo", "socket.gethostbyname", "socket.gethostbyaddr"):
        raise PermissionError("This application is offline-only")


class LocalServer(ThreadingHTTPServer):
    def server_bind(self):
        socketserver.TCPServer.server_bind(self)
        self.server_name = "127.0.0.1"
        self.server_port = self.server_address[1]


class Application:
    def __init__(self, directory):
        self.store = Store(directory)
        self.lock = threading.RLock()
        self.sessions = {}
        self.bootstrap = secrets.token_urlsafe(32)
        self.login_failures = 0
        self.blocked_until = 0.0
        self.origin = ""
        self.server = None

    def session(self, header):
        cookies = SimpleCookie()
        try:
            cookies.load(header or "")
            key = cookies.get(self.cookie_name)
            token = key.value if key else ""
        except Exception:
            return None
        value = self.sessions.get(token)
        if value and value["expires"] > time.monotonic():
            value["expires"] = time.monotonic() + 3600
            return value
        self.sessions.pop(token, None)
        return None

    def login(self, role="owner"):
        token = secrets.token_urlsafe(40)
        csrf = secrets.token_urlsafe(32)
        self.sessions[token] = {"csrf": csrf, "expires": time.monotonic()+3600, "role": role}
        return csrf, f"{self.cookie_name}={token}; HttpOnly; SameSite=Strict; Path=/"

    @property
    def cookie_name(self):
        return "branda_local_" + self.origin.rsplit(":", 1)[-1]


def handler_for(app):
    class Handler(BaseHTTPRequestHandler):
        server_version = "BrandaLocal"

        def setup(self):
            super().setup()
            self.connection.settimeout(30)

        def log_message(self, *_):
            pass

        def send(self, data, status=200, mime="application/json; charset=utf-8", cookie=None, filename=None):
            body = data if isinstance(data, bytes) else json.dumps(data, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Cross-Origin-Resource-Policy", "same-origin")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'")
            if cookie:
                self.send_header("Set-Cookie", cookie)
            if filename:
                self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.end_headers()
            self.wfile.write(body)

        def guard(self, mutation=False):
            if self.headers.get("Host") != app.origin.removeprefix("http://") or self.headers.get("Sec-Fetch-Site") == "cross-site":
                self.send({"error": "الوصول متاح من البرنامج المحلي فقط"}, 403)
                return False
            if mutation and self.headers.get("Origin") != app.origin:
                self.send({"error": "مصدر الطلب غير مسموح"}, 403)
                return False
            return True

        def do_GET(self):
            try:
                if not self.guard():
                    return
                path = urlsplit(self.path).path
                static = {"/": ("index.html", "text/html; charset=utf-8"), "/app.js": ("app.js", "text/javascript; charset=utf-8"), "/app.css": ("app.css", "text/css; charset=utf-8"), "/tajawal-regular.ttf": ("tajawal-regular.ttf", "font/ttf"), "/tajawal-bold.ttf": ("tajawal-bold.ttf", "font/ttf")}
                static.update({"/butcher-ui.js": ("butcher-ui.js", "text/javascript; charset=utf-8"), "/qr.js": ("qr.js", "text/javascript; charset=utf-8"), "/branda-logo.png": ("branda-logo.png", "image/png"), "/branda-logo-dark.png": ("branda-logo-dark.png", "image/png"), "/butcher.css": ("butcher.css", "text/css; charset=utf-8")})
                static["/pos.css"] = ("pos.css", "text/css; charset=utf-8")
                if path in static:
                    file, mime = static[path]
                    self.send((ASSETS/file).read_bytes(), mime=mime)
                    return
                with app.lock:
                    session = app.session(self.headers.get("Cookie"))
                    if path == "/api/status":
                        self.send({"initialized": app.store.initialized(), "authenticated": bool(session), "role": session.get("role", "owner") if session else None, "csrf": session["csrf"] if session else app.bootstrap})
                        return
                    if not session:
                        self.send({"error": "سجل الدخول للمتابعة"}, 401)
                        return
                    query = {k: v[0] for k, v in parse_qs(urlsplit(self.path).query).items()}
                    role = session.get("role", "owner")
                    if role == "cashier" and path not in ("/api/snapshot", "/api/catalog", "/api/documents", "/api/document"):
                        self.send({"error": "هذه الصفحة متاحة للمالك فقط"}, 403)
                        return
                    if path == "/api/snapshot":
                        snapshot = app.store.snapshot()
                        snapshot["role"] = role
                        if role == "cashier":
                            snapshot.update({"accounts": [], "parties": [], "data_directory": "", "document_count": 0})
                        self.send(snapshot)
                    elif path == "/api/catalog":
                        self.send(app.store.catalog(role))
                    elif path == "/api/butcher-report":
                        self.send(app.store.butcher_report(query))
                    elif path == "/api/documents":
                        if role == "cashier":
                            query["kind"] = "sale"
                        result = app.store.documents(query)
                        for row in result["rows"]:
                            row.pop("context", None)
                        self.send(result)
                    elif path == "/api/document":
                        result = app.store.document(query.get("id"))
                        if role == "cashier":
                            if result["kind"] != "sale":
                                self.send({"error": "المستند غير متاح للكاشير"}, 403)
                                return
                            result["entries"] = []
                            result["context"].pop("cost", None)
                            result["context"]["stock_lines"] = [{"unit": line.get("unit", "")} for line in result["context"].get("stock_lines", [])]
                        self.send(result)
                    elif path == "/api/report":
                        self.send(app.store.report(query))
                    else:
                        self.send({"error": "الصفحة غير موجودة"}, 404)
            except (ValidationError, ValueError, TypeError):
                self.send({"error": "راجع بيانات الطلب"}, 400)
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception:
                logging.exception("Read failed")
                self.send({"error": "تعذر قراءة البيانات أعد فتح البرنامج"}, 500)

        def do_POST(self):
            try:
                if not self.guard(True):
                    return
                if self.headers.get("Content-Type") != "application/json" or self.headers.get("Transfer-Encoding"):
                    self.send({"error": "صيغة الطلب غير مدعومة"}, 415)
                    return
                path = urlsplit(self.path).path
                limit = 140*1024*1024 if path == "/api/restore" else 600*1024
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= limit:
                    self.send({"error": "حجم الطلب غير صالح"}, 413)
                    return
                with app.lock:
                    session = app.session(self.headers.get("Cookie"))
                    expected = session["csrf"] if session else app.bootstrap
                    if not secrets.compare_digest(self.headers.get("X-CSRF-Token", ""), expected):
                        self.send({"error": "انتهت الجلسة حدّث الصفحة"}, 403)
                        return
                    if not session and path not in ("/api/login", "/api/setup"):
                        self.send({"error": "سجل الدخول للمتابعة"}, 401)
                        return
                    payload = json.loads(self.rfile.read(length))
                    if not isinstance(payload, dict):
                        raise ValidationError("بيانات غير صالحة")
                    if path in ("/api/login", "/api/setup"):
                        role = "owner" if path == "/api/setup" else payload.get("role", "owner")
                        if time.monotonic() < app.blocked_until:
                            self.send({"error": "انتظر قليلًا قبل إعادة محاولة الدخول"}, 429)
                            return
                        if path == "/api/setup":
                            app.store.setup(payload)
                        elif not app.store.authenticate_role(payload.get("password"), role):
                            app.login_failures += 1
                            app.blocked_until = time.monotonic() + min(30, 2 ** min(app.login_failures, 5))
                            self.send({"error": "كلمة المرور غير صحيحة"}, 401)
                            return
                        app.login_failures = 0
                        csrf, cookie = app.login(role)
                        self.send({"ok": True, "csrf": csrf, "role": role}, cookie=cookie)
                        return
                    role = session.get("role", "owner")
                    if role == "cashier" and path not in ("/api/butcher", "/api/logout"):
                        self.send({"error": "هذا الإجراء متاح للمالك فقط"}, 403)
                        return
                    result = {"ok": True}
                    if path == "/api/butcher":
                        result["id"] = app.store.command(payload, role)
                    elif path == "/api/product":
                        result["id"] = app.store.save_product(payload)
                    elif path == "/api/logo":
                        app.store.logo(payload)
                    elif path == "/api/cashier-settings":
                        app.store.cashier_settings(payload)
                        app.sessions = {token: value for token, value in app.sessions.items() if value.get("role", "owner") != "cashier"}
                    elif path == "/api/post":
                        result["id"] = app.store.post(payload)
                    elif path == "/api/party":
                        result["id"] = app.store.add_party(payload)
                    elif path == "/api/account":
                        app.store.add_account(payload)
                    elif path == "/api/settings":
                        app.store.settings(payload)
                    elif path == "/api/password":
                        app.store.change_password(payload)
                        app.sessions.clear()
                    elif path == "/api/period":
                        app.store.close_period(payload)
                    elif path == "/api/backup":
                        file = app.store.backup()
                        self.send(file.read_bytes(), mime="application/octet-stream", filename=file.name)
                        return
                    elif path == "/api/restore":
                        try:
                            data = base64.b64decode(payload.get("data", ""), validate=True)
                        except (ValueError, TypeError):
                            raise ValidationError("ملف النسخة غير صالح") from None
                        result["previous_backup"] = app.store.restore(data, payload.get("password"))
                        app.sessions.clear()
                    elif path == "/api/logout":
                        app.sessions.clear()
                    elif path == "/api/quit":
                        app.store.backup("on-exit")
                        self.send(result)
                        threading.Thread(target=app.server.shutdown, daemon=True).start()
                        return
                    else:
                        self.send({"error": "الإجراء غير موجود"}, 404)
                        return
                    self.send(result)
            except (ValidationError, json.JSONDecodeError, ValueError, TypeError, KeyError, AttributeError) as error:
                message = str(error) if isinstance(error, ValidationError) else "راجع بيانات الحقول والملف ثم أعد المحاولة"
                self.send({"error": message}, 400)
            except (BrokenPipeError, ConnectionResetError):
                pass
            except sqlite3.Error:
                logging.exception("Database operation failed")
                self.send({"error": "تعذر حفظ العملية تحقق من مساحة القرص ثم أعد المحاولة بنفس البيانات"}, 500)
            except Exception:
                logging.exception("Operation failed")
                self.send({"error": "تعذر تنفيذ الإجراء احتفظ بالبيانات وراجع سجل البرنامج"}, 500)

    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=str(Path(os.getenv("LOCALAPPDATA", str(Path.home()))) / "BrandaOffline" / "v1"))
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()
    directory = Path(args.data).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(filename=directory/"application.log", level=logging.WARNING, encoding="utf-8")
    lock = open(directory/"application.lock", "a+b")
    lock.seek(0)
    if os.name == "nt":
        import msvcrt
        try:
            if lock.read(1) == b"":
                lock.write(b"1"); lock.flush()
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            state = json.loads((directory/"running.json").read_text())
            url = state.get("url", "")
            parts = urlsplit(url)
            if parts.scheme == "http" and parts.hostname == "127.0.0.1" and parts.port and not args.no_browser:
                webbrowser.open(url)
            return
    sys.addaudithook(deny_outbound)
    app = Application(directory)
    if app.store.initialized():
        app.store.backup("on-start")
    server = LocalServer(("127.0.0.1", args.port), handler_for(app))
    server.daemon_threads = True
    app.origin = "http://127.0.0.1:"+str(server.server_port)
    app.server = server
    state = {"pid": os.getpid(), "url": app.origin}
    (directory/"running.json").write_text(json.dumps(state), encoding="utf-8")
    if not args.no_browser:
        webbrowser.open(app.origin)
    try:
        server.serve_forever(poll_interval=0.2)
    finally:
        server.server_close()
        (directory/"running.json").unlink(missing_ok=True)
        lock.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        logging.exception("Startup failed")
        if os.name == "nt":
            import ctypes
            message = str(error) if isinstance(error, ValidationError) else "تعذر تشغيل محاسبة برندة المحلية\nراجع مساحة القرص وسجل البرنامج في مجلد البيانات"
            ctypes.windll.user32.MessageBoxW(None, message, "برندة", 16)
        raise
