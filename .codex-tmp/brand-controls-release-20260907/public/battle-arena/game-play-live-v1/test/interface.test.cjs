const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const battle = fs.readFileSync(path.join(root, 'battle3d.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const battleStyles = fs.readFileSync(path.join(root, 'styles-3d.css'), 'utf8');
const data = fs.readFileSync(path.join(root, 'src', 'data.js'), 'utf8');
const game = fs.readFileSync(path.join(root, 'src', 'game.js'), 'utf8');

test('home and collection expose only home and monsters navigation', () => {
  assert.doesNotMatch(html, /<small>المعارك<\/small>|<small>العشيرة<\/small>|<small>الإعدادات<\/small>/);
  const navs = [...html.matchAll(/<nav class="bottom-nav[^>]*>([\s\S]*?)<\/nav>/g)];
  assert.equal(navs.length, 2);
  for (const nav of navs) assert.equal((nav[1].match(/<button/g) || []).length, 2);
  assert.match(styles, /grid-template-columns:repeat\(2,1fr\)/);
});

test('economy and arena-progress bars are absent from the main screens', () => {
  assert.doesNotMatch(html, /class="resource-bar/);
  assert.doesNotMatch(html, /class="progress-rail/);
  assert.doesNotMatch(html, />607<|>175 664<|>414</);
});

test('home fills phone widths and battle fills the complete viewport', () => {
  assert.match(styles, /width: min\(100vw, 480px\)/);
  assert.match(styles, /height: 100dvh/);
  assert.match(battleStyles, /width:100vw;max-width:none/);
  assert.match(battleStyles, /height:100dvh/);
});

test('summonable cards use model-matched generated portraits', () => {
  for (const name of ['emberhorn', 'mossbit', 'shardback', 'lumen']) {
    const relative = `assets/generated/battle-model-cards/${name}-card-v2.png`;
    assert.ok(battle.includes(relative), `battle card does not use ${name} portrait`);
    const stat = fs.statSync(path.join(root, relative));
    assert.ok(stat.size > 500_000, `${name} generated portrait is unexpectedly small`);
  }
  for (const relative of ['battle-model-cards/emberhorn-card-v2.png','battle-model-cards/mossbit-card-v2.png','battle-model-cards/shardback-card-v2.png','battle-model-cards/lumen-card-v2.png']) {
    assert.ok(data.includes(relative), `collection does not use ${relative}`);
  }
  assert.match(game, /BATTLE_CARD_IDS = \['emberhorn','mossbit','shardback','lumenwisp'\]/);
  assert.match(game, /ui\.homeDeck\.innerHTML = BATTLE_CARDS\.map/);
});
