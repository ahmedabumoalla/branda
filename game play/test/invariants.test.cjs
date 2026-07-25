const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('tile map keeps the measured 36 x 64 grid', () => {
  const lines = fs.readFileSync(path.join(root, 'data', 'tilemap.csv'), 'utf8').replace(/\r/g, '').trimEnd().split('\n');
  const grid = lines.slice(3, 67).map(line => line.split(',').slice(1, 37));
  assert.equal(grid.length, 64);
  assert.ok(grid.every(row => row.length === 36));
});

test('all generated production assets exist and are non-empty', () => {
  const names = [
    'arena-desert-crystal.png', 'emberhorn.png', 'prismwing.png', 'dune-colossus.png', 'cinder-imp.png',
    'stormfin.png', 'mossbit.png', 'shardback.png', 'lumen-wisp.png'
  ];
  for (const name of names) {
    const stat = fs.statSync(path.join(root, 'assets', 'generated', name));
    assert.ok(stat.size > 50_000, `${name} is unexpectedly small`);
  }
});

test('source constants remain pinned to extracted values', () => {
  const source = fs.readFileSync(path.join(root, 'src', 'data.js'), 'utf8');
  for (const exact of ['width: 36', 'height: 64', 'tileWorldUnits: 1000', 'fixedTickMs: 50', 'maxElixir: 10', 'startingElixir: 6', 'normalSeconds: 180', 'overtimeSeconds: 120']) {
    assert.ok(source.includes(exact), `missing source constant: ${exact}`);
  }
});

test('units keep lane routing through the two measured bridge corridors', () => {
  const game = fs.readFileSync(path.join(root, 'src', 'game.js'), 'utf8');
  assert.ok(game.includes("x<18000?'left':'right'"));
  assert.ok(game.includes("u.lane==='left'?7000:29000"));
  assert.ok(game.includes("t.type==='guard'&&t.id.includes(u.lane)"));
});

test('visual size is intentionally independent from collision size', () => {
  const data = fs.readFileSync(path.join(root, 'src', 'data.js'), 'utf8');
  const pairs = [...data.matchAll(/collisionRadius: (\d+), renderDiameter: (\d+)/g)]
    .map(match => ({ collision: Number(match[1]), visual: Number(match[2]) }));
  assert.equal(pairs.length, 10);
  assert.ok(pairs.every(pair => pair.visual > pair.collision * 3));
});
