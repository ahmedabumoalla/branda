const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src', 'three-d', 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'battle3d.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles-3d.css'), 'utf8');

test('battle remains driven by the local WebGL engine and articulated rig', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies.babylonjs);
  assert.match(source, /new B\.Engine/);
  assert.match(source, /class RiggedUnit/);
  assert.doesNotMatch(source, /drawImage\(/);
});

test('animated rigs remain visible and card images are not mounted as flat unit billboards', () => {
  assert.doesNotMatch(source, /CARD_SPRITES|createCardVisual|cardSprite/);
  assert.match(source, /this\.leftLeg\.rotation\.x/);
  assert.match(source, /this\.rightArm\.rotation\.x/);
});

test('map color correction is visual-only and keeps the measured arena simulation intact', () => {
  assert.match(source, /exposure = 1\.02/);
  assert.match(source, /emissiveTexture = arenaTexture/);
  assert.match(source, /const FIXED_DT = 1 \/ 20/);
  assert.match(source, /width: 36, length: 64/);
});

test('articulated locomotion has independently animated limbs and continuous yaw', () => {
  for (const part of ['leftLeg', 'rightLeg', 'leftArm', 'rightArm']) assert.ok(source.includes(`this.${part}`));
  assert.match(source, /Math\.atan2\(dx,dz\)/);
  assert.match(source, /rotateToward\(this\.yaw,desired,this\.cfg\.turnSpeed\*dt\)/);
  assert.doesNotMatch(source, /Math\.abs\(gait\)/);
});

test('attack state has windup, contact event, recovery, projectile and hit response', () => {
  for (const token of ["state==='attack'", 'this.cfg.windup', 'this.cfg.recovery', 'this.releaseAttack()', 'spawnProjectile', "state==='hit'", "setState('death')"]) {
    assert.ok(source.includes(token), `missing 3D combat token: ${token}`);
  }
});

test('unit aggro is not restricted to a permanently assigned lane', () => {
  assert.match(source, /units\.filter\(u=>u\.alive&&u\.team!==this\.team\)/);
  assert.doesNotMatch(source, /u\.lane===/);
  assert.match(source, /WORLD\.bridges\.some/);
});

test('simulation remains fixed at 20 Hz while rendering interpolates', () => {
  assert.match(source, /const FIXED_DT = 1 \/ 20/);
  assert.match(source, /B\.Vector3\.Lerp\(this\.prevPos,this\.pos,alpha\)/);
});

test('3D arena uses the first desert crystal map artwork', () => {
  assert.match(source, /assets\/generated\/arena-desert-crystal\.png/);
  assert.match(source, /firstArenaMaterial/);
});

test('each playable archetype receives its first-design silhouette parts', () => {
  for (const token of ['emberShield', 'emberTail', 'emberSnout', 'mossLens', 'mossPack', 'mossMushroomCap', 'shardPlate', 'shardSnout', 'lumenLantern', 'lumenMask', 'lumenRibbon']) {
    assert.ok(source.includes(token), `missing first-design part: ${token}`);
  }
});

test('defeated units fall, fade and are disposed from the scene and simulation', () => {
  assert.match(source, /this\.stateTime>=\.72\)this\.pendingRemoval=true/);
  assert.match(source, /this\.root\.dispose\(false,false\)/);
  assert.match(source, /units\.splice\(i,1\)/);
  assert.match(source, /this\.healthBack\.setEnabled\(false\)/);
});

test('every monster archetype has a distinct attack pose', () => {
  assert.match(source, /renderAttackPose\(\)/);
  for (const type of ['emberhorn', 'mossbit', 'shardback', 'lumen']) {
    assert.ok(source.includes(`this.type==='${type}'`), `missing attack pose for ${type}`);
  }
  for (const part of ['muzzle', 'plates', 'lantern', 'ribbons']) assert.ok(source.includes(`this.${part}`));
});

test('combat feedback includes glow, particles and expanding impact waves', () => {
  assert.match(source, /new B\.GlowLayer/);
  assert.match(source, /function shockwave/);
  assert.match(source, /kind:'wave'/);
  assert.match(source, /e\.mesh\.visibility/);
});

test('defensive towers aim, recoil and expose live health feedback', () => {
  assert.match(source, /tower\.turretPivot\.rotation\.y=rotateToward/);
  assert.match(source, /tower\.recoil=\.12/);
  assert.match(source, /tower\.healthFill\.scaling\.x/);
  assert.match(source, /target\.hitPulse=\.18/);
});

test('a unit targets only its lane guard and then the enemy core', () => {
  assert.match(source, /this\.lane=position\.x<0\?'left':'right'/);
  assert.match(source, /const laneGuard=towerParts\.find/);
  assert.match(source, /return laneGuard\|\|core\|\|null/);
  assert.doesNotMatch(source, /guards\.sort/);
});

test('destroying the core ends the battle even when another guard survives', () => {
  assert.match(source, /if\(target\.type==='core'\)endBattle\(team\)/);
  assert.match(source, /battleEnded=true/);
  assert.match(source, /if\(battleEnded\|\|!pick/);
});

test('two-minute battle uses the requested staged energy regeneration', () => {
  assert.match(source, /const BATTLE_DURATION = 120/);
  assert.match(source, /const ENERGY_BASE_RATE = \.50/);
  assert.match(source, /elapsed>=90\?2:elapsed>=60\?1\.5:1/);
  assert.match(source, /ENERGY_BASE_RATE\*energyPhase\*dt/);
  assert.match(html, /id="timer">2:00/);
});

test('unaffordable cards are disabled and visibly dimmed until affordable', () => {
  assert.match(source, /card\.disabled=battleEnded\|\|elixir\+1e-6<CARD_COSTS/);
  assert.match(styles, /\.card:disabled\{/);
  assert.match(styles, /grayscale\(\.86\) brightness\(\.38\)/);
});

test('enemy deployment pressure is fixed at half strength', () => {
  assert.match(source, /const AI_DIFFICULTY = \.5/);
  assert.match(source, /enemyDeployTimer=\(2\.6\+Math\.random\(\)\*1\.8\)\/AI_DIFFICULTY/);
});

test('developer hertz inspector is absent from the player interface', () => {
  assert.doesNotMatch(html, /stateInspector|3D \/ 20Hz|inspectorText/);
  assert.doesNotMatch(styles, /\.state-inspector/);
});
