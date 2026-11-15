"""Build a self-contained Windows x64 ZIP. This is a developer-only online step."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
OUT = REPO / "output" / "offline-accounting"
PACKAGE = OUT / "Branda-Accounting-Windows"
VERSION = "3.14.10"
URL = f"https://www.python.org/ftp/python/{VERSION}/python-{VERSION}-embed-amd64.zip"
SHA = "90905e64a840557d8c1bc4f5b74db3d7ee85e3ffb217611cac1c7813acea4159"
OUT.mkdir(parents=True, exist_ok=True)
archive = OUT / ("python-"+VERSION+"-embed-amd64.zip")
if not archive.exists():
    urllib.request.urlretrieve(URL, archive)
if hashlib.sha256(archive.read_bytes()).hexdigest() != SHA:
    raise RuntimeError("Python runtime checksum does not match the official release")
subprocess.run(["node", str(REPO/"node_modules/typescript/bin/tsc"), "-p", str(ROOT/"tsconfig.json"), "--pretty", "false"], check=True, cwd=REPO)
(PACKAGE/"runtime").mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(archive) as z:
    for member in z.infolist():
        target = PACKAGE/"runtime"/member.filename
        content = z.read(member)
        if not target.exists() or target.read_bytes() != content:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
# Only import our own application directory and the bundled standard library.
(PACKAGE/"runtime/python314._pth").write_text("python314.zip\n.\n../app\n", encoding="utf-8")
(PACKAGE/"app/assets").mkdir(parents=True, exist_ok=True)
for name in ("engine.py", "server.py"):
    shutil.copy2(ROOT/name, PACKAGE/"app"/name)
for name in ("index.html", "app.css"):
    shutil.copy2(ROOT/"assets"/name, PACKAGE/"app/assets"/name)
shutil.copy2(ROOT/"assets/ui.js", PACKAGE/"app/assets/app.js")
for name in ("tajawal-regular.ttf", "tajawal-bold.ttf"):
    shutil.copy2(REPO/"public/fonts"/name, PACKAGE/"app/assets"/name)
(PACKAGE/"licenses").mkdir(exist_ok=True)
shutil.copy2(REPO/"public/fonts/OFL.txt", PACKAGE/"licenses/Tajawal-OFL.txt")
shutil.copy2(PACKAGE/"runtime/LICENSE.txt", PACKAGE/"licenses/Python.txt")
shutil.copy2(ROOT/"READ-ME.html", PACKAGE/"READ-ME.html")
launcher = r'''@echo off
setlocal
cd /d "%~dp0"
if not exist "runtime\pythonw.exe" (
  echo Extract the complete ZIP to a local folder first.
  pause
  exit /b 1
)
start "" "runtime\pythonw.exe" "app\server.py"
'''
(PACKAGE/"Start-Branda.cmd").write_text(launcher, encoding="ascii")
shortcut = '''Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
root = fs.GetParentFolderName(WScript.ScriptFullName)
Set link = shell.CreateShortcut(shell.SpecialFolders("Desktop") & "\\Branda Accounting.lnk")
link.TargetPath = root & "\\runtime\\pythonw.exe"
link.Arguments = Chr(34) & root & "\\app\\server.py" & Chr(34)
link.WorkingDirectory = root
link.Description = "Branda Offline Accounting"
link.Save
MsgBox "Desktop shortcut created", 64, "Branda"
'''
(PACKAGE/"Create-Desktop-Shortcut.vbs").write_text(shortcut, encoding="ascii")
files = [{"file":p.relative_to(PACKAGE).as_posix(),"sha256":hashlib.sha256(p.read_bytes()).hexdigest(),"bytes":p.stat().st_size} for p in sorted(PACKAGE.rglob("*")) if p.is_file() and "__pycache__" not in p.parts and p.name!="manifest.json"]
(PACKAGE/"manifest.json").write_text(json.dumps({"application":"Branda Offline Accounting","version":"1.0.0","runtime":VERSION,"source":URL,"runtimeSha256":SHA,"files":files},indent=2),encoding="utf-8")
target = OUT/"Branda-Accounting-Windows.zip"
with zipfile.ZipFile(target,"w",zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in sorted(PACKAGE.rglob("*")):
        if p.is_file() and "__pycache__" not in p.parts:
            z.write(p,Path(PACKAGE.name)/p.relative_to(PACKAGE))
print(json.dumps({"file":str(target),"bytes":target.stat().st_size,"sha256":hashlib.sha256(target.read_bytes()).hexdigest(),"runtime":VERSION}))
