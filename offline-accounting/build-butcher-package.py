"""Build a separate offline butcher package; preserve the original v1 ZIP."""
import hashlib,json,shutil,subprocess,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parent
OUT=REPO/'output/offline-accounting-butcher-pos-20261114'
PACKAGE=OUT/'Branda-Butcher-Windows'
RUNTIME=REPO/'output/offline-accounting/python-3.14.10-embed-amd64.zip'
SHA='90905e64a840557d8c1bc4f5b74db3d7ee85e3ffb217611cac1c7813acea4159'
assert hashlib.sha256(RUNTIME.read_bytes()).hexdigest()==SHA
OUT.mkdir(parents=True,exist_ok=True)
subprocess.run(['node',str(REPO/'node_modules/typescript/bin/tsc'),'-p',str(ROOT/'tsconfig.json'),'--pretty','false'],check=True,cwd=REPO)
(PACKAGE/'runtime').mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(RUNTIME) as archive:archive.extractall(PACKAGE/'runtime')
with zipfile.ZipFile(RUNTIME) as archive:runtime_files={'runtime/'+name for name in archive.namelist() if not name.endswith('/')}
(PACKAGE/'runtime/python314._pth').write_text('python314.zip\n.\n../app\n',encoding='utf-8')
(PACKAGE/'app/assets').mkdir(parents=True,exist_ok=True)
for name in ('engine.py','server.py','butcher.py','butcher_migrations.py'):shutil.copy2(ROOT/name,PACKAGE/'app'/name)
for name in ('index.html','app.css','butcher.css','pos.css','butcher-ui.js','branda-logo.png','branda-logo-dark.png','qr.js'):shutil.copy2(ROOT/'assets'/name,PACKAGE/'app/assets'/name)
shutil.copy2(ROOT/'assets/ui.js',PACKAGE/'app/assets/app.js')
for name in ('tajawal-regular.ttf','tajawal-bold.ttf'):shutil.copy2(REPO/'public/fonts'/name,PACKAGE/'app/assets'/name)
(PACKAGE/'licenses').mkdir(exist_ok=True)
shutil.copy2(REPO/'public/fonts/OFL.txt',PACKAGE/'licenses/Tajawal-OFL.txt')
shutil.copy2(PACKAGE/'runtime/LICENSE.txt',PACKAGE/'licenses/Python.txt')
(PACKAGE/'licenses/QR-generator.txt').write_text('QR Code Generator for JavaScript\nCopyright (c) 2009 Kazuhiko Arase\nMIT License\nhttps://github.com/kazuhikoarase/qrcode-generator\nBundled qr.js retains the upstream license header.\n',encoding='utf-8')
shutil.copy2(ROOT/'READ-ME-BUTCHER.html',PACKAGE/'READ-ME.html')
(PACKAGE/'Start-Branda.cmd').write_text('@echo off\nsetlocal\ncd /d "%~dp0"\nif not exist "runtime\\pythonw.exe" (\n echo Extract the complete ZIP first.\n pause\n exit /b 1\n)\nstart "" "runtime\\pythonw.exe" "app\\server.py"\n',encoding='ascii')
(PACKAGE/'Create-Desktop-Shortcut.vbs').write_text('Set shell = CreateObject("WScript.Shell")\nSet fs = CreateObject("Scripting.FileSystemObject")\nroot = fs.GetParentFolderName(WScript.ScriptFullName)\nSet link = shell.CreateShortcut(shell.SpecialFolders("Desktop") & "\\Branda Butcher.lnk")\nlink.TargetPath = root & "\\runtime\\pythonw.exe"\nlink.Arguments = Chr(34) & root & "\\app\\server.py" & Chr(34)\nlink.WorkingDirectory = root\nlink.Description = "Branda Offline Butcher"\nlink.Save\nMsgBox "Desktop shortcut created", 64, "Branda"\n',encoding='ascii')
approved=runtime_files|{'app/'+name for name in ('engine.py','server.py','butcher.py','butcher_migrations.py')}|{'app/assets/'+name for name in ('index.html','app.css','butcher.css','pos.css','butcher-ui.js','app.js','branda-logo.png','branda-logo-dark.png','qr.js','tajawal-regular.ttf','tajawal-bold.ttf')}|{'licenses/Tajawal-OFL.txt','licenses/Python.txt','licenses/QR-generator.txt','READ-ME.html','Start-Branda.cmd','Create-Desktop-Shortcut.vbs'}
files=[{'file':name,'sha256':hashlib.sha256((PACKAGE/name).read_bytes()).hexdigest(),'bytes':(PACKAGE/name).stat().st_size} for name in sorted(approved)]
(PACKAGE/'manifest.json').write_text(json.dumps({'application':'Branda Offline Butcher','version':'2.1.0','runtime':'3.14.10','runtimeSha256':SHA,'files':files},indent=2),encoding='utf-8')
target=OUT/'Branda-Butcher-Windows.zip'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for name in sorted(approved|{'manifest.json'}):archive.write(PACKAGE/name,Path(PACKAGE.name)/name)
print(json.dumps({'path':str(target),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}))
