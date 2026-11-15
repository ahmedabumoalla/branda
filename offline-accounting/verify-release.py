"""Verify the deliverable ZIP and record input identities without private data."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
OUT = REPO / 'output/offline-accounting-butcher-pos-20261114'
STAMP = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
results = []


def run(label, command, cwd=REPO, env=None):
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result = subprocess.run(command, cwd=cwd, env=env, capture_output=True, text=True, encoding='utf-8', errors='replace')
    log = OUT / (label + '.log')
    log.write_text(result.stdout + result.stderr, encoding='utf-8')
    results.append({'name': label, 'command': command, 'started': started, 'exitCode': result.returncode, 'log': str(log)})
    if result.returncode:
        print(log.read_text(encoding='utf-8'))
        raise RuntimeError(label + ' failed')


run('package-build', [sys.executable, str(ROOT / 'build-butcher-package.py')])
archive_path = OUT / 'Branda-Butcher-Windows.zip'
archive_sha = hashlib.sha256(archive_path.read_bytes()).hexdigest()
extracted = OUT / ('verified-' + STAMP)
with zipfile.ZipFile(archive_path) as archive:
    names = archive.namelist()
    assert all(not name.startswith(('/', '\\')) and '..' not in Path(name).parts for name in names)
    archive.extractall(extracted)
package = extracted / 'Branda-Butcher-Windows'
manifest = json.loads((package / 'manifest.json').read_text())
expected = {f['file'] for f in manifest['files']} | {'manifest.json'}
actual = {p.relative_to(package).as_posix() for p in package.rglob('*') if p.is_file()}
assert actual == expected
for file in manifest['files']:
    p = package / file['file']
    assert hashlib.sha256(p.read_bytes()).hexdigest() == file['sha256'], file
    assert p.stat().st_size == file['bytes']
assert not any(Path(name).suffix.lower() in {'.sqlite', '.sqlite3', '.db', '.pem', '.key', '.env', '.pyc'} or Path(name).name.startswith('.env') for name in actual)
for name in ('engine.py', 'server.py', 'butcher.py', 'butcher_migrations.py'):
    assert (ROOT/name).read_bytes() == (package/'app'/name).read_bytes()
env = {**os.environ, 'BRANDA_TEST_PACKAGE': str(package), 'PYTHONUTF8': '1'}
run('engine-and-packaged-api-tests', [sys.executable, '-m', 'unittest', 'discover', '-s', 'offline-accounting', '-p', 'test_*.py', '-q'], env=env)
run('invoice-qr-print-check', ['node', str(ROOT/'verify-print.cjs')])
run('text-integrity', ['node', str(REPO/'scripts/check-text-integrity.mjs')], cwd=ROOT)
# The repository checker excludes Python/HTML/CSS, so check those UTF-8 sources too.
for p in ROOT.rglob('*'):
    if p.suffix in ('.py', '.html', '.css', '.cjs') and '__pycache__' not in p.parts:
        source = p.read_text(encoding='utf-8')
        for forbidden in ('\u00d8', '\u00d9', '\u00d0', '\u00c3', '\u00c2', '\u00e2', '\ufffd', '\u0637\u00a7', '\u0638\u2026'):
            assert forbidden not in source, (str(p), repr(forbidden))
inputs = [{'file': p.relative_to(REPO).as_posix(), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(ROOT.rglob('*')) if p.is_file() and '__pycache__' not in p.parts]
record = {'executedAt': STAMP, 'zip': str(archive_path), 'sha256': archive_sha, 'bytes': archive_path.stat().st_size, 'manifestFiles': len(manifest['files']), 'verifiedExtraction': str(package), 'runtime': subprocess.check_output([str(package/'runtime/python.exe'), '--version'], text=True).strip(), 'checks': results, 'sourceInputs': inputs, 'limitations': ['No browser visual inspection', 'No physical printer test', 'No ZATCA certification or Phase 2 integration', 'Local device owner can access SQLite files; application roles do not replace operating system access controls']}
(OUT/'verification.json').write_text(json.dumps(record, indent=2), encoding='utf-8')
print(json.dumps({'result': 'passed', 'zip': str(archive_path), 'sha256': archive_sha, 'checks': len(results), 'manifestFiles': len(manifest['files'])}))
