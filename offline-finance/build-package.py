from pathlib import Path
import shutil, json, hashlib, zipfile, datetime

root = Path(__file__).resolve().parent.parent
source = root / 'offline-finance'
out = root / 'output/offline-finance-windows-20261114'
stage = out / 'Branda-Finance-Offline'
stage.mkdir(parents=True, exist_ok=True)
def copy(src, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir(): shutil.copytree(src, target, dirs_exist_ok=True)
    else: shutil.copy2(src, target)
for name in ['server.cjs','storage.cjs','network-guard.cjs','backup.cjs','READ-ME.html','Start-Branda.cmd','NODE-LICENSE.txt']:
    copy(source / name, stage / name)
for name in ['index.mjs','local-boundary.sql','schema']:
    copy(source / 'engine' / name, stage / 'engine' / name)
copy(source / 'actions/dist/actions.cjs', stage / 'actions/dist/actions.cjs')
copy(source / 'dist/public', stage / 'dist/public')
copy(root / 'public/fonts/tajawal-regular.ttf', stage / 'public/fonts/tajawal-regular.ttf')
copy(root / 'public/fonts/tajawal-bold.ttf', stage / 'public/fonts/tajawal-bold.ttf')
copy(root / 'public/fonts/OFL.txt', stage / 'public/fonts/OFL.txt')
copy(Path('C:/Users/pc/AppData/Local/npm-cache/_npx/387698761821791d/node_modules/node/bin/node.exe'),stage/'node.exe')
copy(source / 'node_modules/@electric-sql/pglite',stage/'node_modules/@electric-sql/pglite')
for name in ['sharp','@img/colour','@img/sharp-win32-x64','detect-libc','semver']:
    copy(root/'node_modules'/name,stage/'node_modules'/name)
files=[]
for p in sorted(stage.rglob('*')):
    if not p.is_file() or p.name=='manifest.json': continue
    relative=p.relative_to(stage).as_posix()
    if any(part in ['.env','.git','database','files','running.json'] for part in p.relative_to(stage).parts): raise RuntimeError('Unexpected package data: '+relative)
    files.append({'file':relative,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
(stage/'manifest.json').write_text(json.dumps({'version':'3.0.0','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':files},indent=2),encoding='utf8')
archive=out/'Branda-Finance-Offline-Windows.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in sorted(stage.rglob('*')):
        if p.is_file(): z.write(p,Path(stage.name)/p.relative_to(stage))
print(json.dumps({'archive':str(archive),'files':len(files),'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}))
