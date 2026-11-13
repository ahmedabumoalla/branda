'use strict';
// Local verification only. No deployment, database writes, or provider dispatch.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const directory = 'output/integrated-system';
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const walk = directory => fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]) : [];
const inputs = () => Object.fromEntries([
  ...['app', 'components', 'lib', 'types', 'public', 'assets', 'data'].flatMap(walk),
  ...walk('supabase/migrations').filter(file => /20261113\d+_(erp_|brand_account_cancellation)/.test(file)),
  ...walk('scripts').filter(file => /\/(check-(erp|account-cancellation|document-template)|verify-erp-final)/.test(file)),
  'package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'next-env.d.ts', 'postcss.config.mjs', 'eslint.config.mjs', 'proxy.ts', 'instrumentation.ts', 'instrumentation-client.ts',
].filter(file => fs.existsSync(file)).sort().map(file => [file, digest(file)]));
const lint = [
  'app/dashboard/system', 'app/finance/[slug]/system', 'app/api/erp', 'app/account/cancel', 'app/store', 'app/api/store',
  'components/erp', 'components/account', 'components/store', 'lib/erp', 'lib/account',
  ...walk('app/actions').filter(file => /\/(erp-|account-cancellation|brand-archive-files)/.test(file)),
  ...walk('lib/data').filter(file => /\/(erp-|account-cancellation)/.test(file)),
  'components/admin/brand-archive-files.tsx',
].filter(file => fs.existsSync(file));
const commands = [
  ['typescript', ['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false']],
  ['text', ['scripts/check-text-integrity.mjs']],
  ['lint', ['node_modules/eslint/bin/eslint.js', ...lint]],
  ['navigation', ['scripts/check-erp-navigation-coverage.cjs']],
];
if (process.argv.includes('--build')) commands.push(['build', ['node_modules/next/dist/bin/next', 'build']]);
fs.mkdirSync(directory, { recursive: true });
const report = { startedAt: new Date().toISOString(), runtime: process.version, inputs: inputs(), checks: [], published: false };
let buildDirectory = process.cwd();
function prepareIsolatedBuild() {
  const root = process.cwd();
  buildDirectory = fs.mkdtempSync(path.join(path.dirname(root), 'branda-erp-verification-'));
  // Source copies keep Next's generated files away from the active dev server.
  for (const relative of Object.keys(report.inputs).filter(file => /^(app|components|lib|types|public|assets|data)\//.test(file) || !file.includes('/'))) {
    const destination = path.join(buildDirectory, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, relative), destination);
  }
  // Hard links keep dependencies inside Turbopack's root without copying their
  // bytes or following an external node_modules junction. No installs run.
  function linkTree(source, destination) {
    fs.mkdirSync(destination, { recursive: true });
    for (const item of fs.readdirSync(source, { withFileTypes: true })) {
      if (item.name === '.cache') continue;
      const from = path.join(source, item.name), to = path.join(destination, item.name);
      const stat = fs.statSync(from);
      if (stat.isDirectory()) linkTree(from, to);
      else fs.linkSync(fs.realpathSync(from), to);
    }
  }
  linkTree(path.join(root, 'node_modules'), path.join(buildDirectory, 'node_modules'));
  report.isolatedBuild = { directory: buildDirectory, sourceCopiedUnchanged: true, dependencyMode: 'local hard links', privateConfiguration: 'loaded into child environment; no secret file copied' };
}
async function run([name, args]) {
  const startedAt = new Date().toISOString();
  const log = `${directory}/final-${name}.log`;
  const fd = fs.openSync(log, 'w');
  const code = await new Promise(resolve => {
    const child = spawn(process.execPath, args, { cwd: name === 'build' ? buildDirectory : process.cwd(), windowsHide: true, stdio: ['ignore', fd, fd] });
    child.once('error', error => { fs.writeSync(fd, error.message); resolve(-1); });
    child.once('exit', code => resolve(code));
  });
  fs.closeSync(fd);
  const result = { name, command: [process.execPath, ...args], cwd: name === 'build' ? buildDirectory : process.cwd(), startedAt, finishedAt: new Date().toISOString(), exitCode: code, log, logSha256: digest(log) };
  report.checks.push(result);
  console.log(JSON.stringify({ name, exitCode: code, log }));
}
(async () => {
  // Build follows all other checks and never races its own generated types.
  await Promise.all(commands.filter(([name]) => name !== 'build').map(run));
  if (commands.some(([name]) => name === 'build') && report.checks.every(check => check.exitCode === 0)) {
    if (process.argv.includes('--isolated')) {
      if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
      prepareIsolatedBuild();
    }
    await run(commands.find(([name]) => name === 'build'));
  }
  const after = inputs();
  report.changedDuringChecks = [...new Set([...Object.keys(after), ...Object.keys(report.inputs)])].filter(file => after[file] !== report.inputs[file]);
  report.finishedAt = new Date().toISOString();
  report.passed = report.changedDuringChecks.length === 0 && report.checks.length === commands.length && report.checks.every(check => check.exitCode === 0);
  fs.writeFileSync(`${directory}/erp-final-verification.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, changedDuringChecks: report.changedDuringChecks, checks: report.checks.length }));
  if (!report.passed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
