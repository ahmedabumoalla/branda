export const SOURCE = Object.freeze({
  mapTiles: { width: 36, height: 64, tileWorldUnits: 1000 },
  world: { width: 36000, height: 64000 },
  fixedTickMs: 50,
  maxElixir: 10,
  startingElixir: 6,
  timeline: [
    { until: 120, fullBarMs: 28000, label: 'طاقة عادية' },
    { until: 240, fullBarMs: 14000, label: 'طاقة مضاعفة' },
    { until: 300, fullBarMs: 9300, label: 'طاقة ثلاثية' }
  ],
  normalSeconds: 180,
  overtimeSeconds: 120,
  pathCosts: { default: 8, road: 5, blocked: 50, building: 50, water: 7, heuristic: 5 }
});

const A = 'assets/generated/';
export const CARDS = Object.freeze([
  {
    id: 'emberhorn', name: 'قرن الجمر', image: `${A}emberhorn.png`, cost: 3, count: 1, rarity: 'نادر', level: 9,
    hp: 690, damage: 79, speedPerTick: 60, hitSpeedMs: 1200, loadMs: 420,
    range: 1200, sight: 5500, collisionRadius: 500, renderDiameter: 3600, projectileSpeed: 0, targetBuildings: false
  },
  {
    id: 'prismwing', name: 'جناح المنشور', image: `${A}prismwing.png`, cost: 5, count: 1, rarity: 'ملحمي', level: 8,
    hp: 1000, damage: 88, speedPerTick: 60, hitSpeedMs: 1200, loadMs: 520,
    range: 5000, sight: 6000, collisionRadius: 500, renderDiameter: 3500, projectileSpeed: 800, targetBuildings: false
  },
  {
    id: 'colossus', name: 'عملاق الكثبان', image: `${A}dune-colossus.png`, cost: 5, count: 1, rarity: 'ملحمي', level: 10,
    hp: 3800, damage: 140, speedPerTick: 45, hitSpeedMs: 1300, loadMs: 720,
    range: 1200, sight: 7500, collisionRadius: 700, renderDiameter: 5000, projectileSpeed: 0, targetBuildings: true
  },
  {
    id: 'cinderimp', name: 'عفريت الرماد', image: `${A}cinder-imp.png`, cost: 1, count: 3, rarity: 'عادي', level: 9,
    hp: 96, damage: 32, speedPerTick: 90, hitSpeedMs: 1000, loadMs: 330,
    range: 650, sight: 5500, collisionRadius: 420, renderDiameter: 2300, projectileSpeed: 0, targetBuildings: false
  },
  {
    id: 'stormfin', name: 'زعنفة العاصفة', image: `${A}stormfin.png`, cost: 4, count: 1, rarity: 'ملحمي', level: 8,
    hp: 820, damage: 108, speedPerTick: 78, hitSpeedMs: 1150, loadMs: 460,
    range: 4500, sight: 6200, collisionRadius: 520, renderDiameter: 3900, projectileSpeed: 1050, targetBuildings: false
  },
  {
    id: 'mossbit', name: 'مهندس الطحلب', image: `${A}battle-model-cards/mossbit-card-v2.png`, cost: 3, count: 1, rarity: 'نادر', level: 7,
    hp: 480, damage: 95, speedPerTick: 72, hitSpeedMs: 1050, loadMs: 390,
    range: 5400, sight: 6500, collisionRadius: 480, renderDiameter: 3400, projectileSpeed: 1250, targetBuildings: false
  },
  {
    id: 'shardback', name: 'ظهر الشظايا', image: `${A}battle-model-cards/shardback-card-v2.png`, cost: 6, count: 1, rarity: 'نادر', level: 9,
    hp: 3200, damage: 180, speedPerTick: 40, hitSpeedMs: 1450, loadMs: 780,
    range: 1050, sight: 7600, collisionRadius: 760, renderDiameter: 5200, projectileSpeed: 0, targetBuildings: true
  },
  {
    id: 'lumenwisp', name: 'طيف الفانوس', image: `${A}battle-model-cards/lumen-card-v2.png`, cost: 2, count: 2, rarity: 'عادي', level: 8,
    hp: 220, damage: 45, speedPerTick: 82, hitSpeedMs: 900, loadMs: 300,
    range: 4000, sight: 5800, collisionRadius: 400, renderDiameter: 2700, projectileSpeed: 950, targetBuildings: false
  }
]);

export const TOWER_TYPES = Object.freeze({
  guard: { hp: 2534, range: 7500, hitSpeedMs: 800, loadMs: 400, collisionRadius: 1250, renderDiameter: 5600, damage: 79 },
  core: { hp: 4000, range: 7000, hitSpeedMs: 1000, loadMs: 500, collisionRadius: 1650, renderDiameter: 7500, damage: 140 }
});

// Visual centers measured against the supplied 386×848 recording, then mapped to the 36×64 world.
export const TOWER_LAYOUT = Object.freeze([
  { id: 'e-core', team: 1, type: 'core', x: 18000, y: 11200, hpOverride: 4280 },
  { id: 'e-left', team: 1, type: 'guard', x: 7500, y: 17500, hpOverride: 2786 },
  { id: 'e-right', team: 1, type: 'guard', x: 28500, y: 17500, hpOverride: 2786 },
  { id: 'p-left', team: 0, type: 'guard', x: 7500, y: 47000, hpOverride: 2534 },
  { id: 'p-right', team: 0, type: 'guard', x: 28500, y: 47000, hpOverride: 2534 },
  { id: 'p-core', team: 0, type: 'core', x: 18000, y: 53500, hpOverride: 4000 }
]);
