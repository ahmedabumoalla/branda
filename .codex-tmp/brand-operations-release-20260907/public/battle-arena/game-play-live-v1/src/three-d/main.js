const B = globalThis.BABYLON;
if (!B) throw new Error('Babylon.js did not load');
const PREVIEW_TYPE = new URLSearchParams(location.search).get('unitPreview');
if(PREVIEW_TYPE)document.body.classList.add('unit-preview');

const canvas = document.querySelector('#renderCanvas');
const engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true });
const scene = new B.Scene(engine);
// Keep the WebGL clear transparent so the arena backdrop remains visible while
// the orthographic camera is being resized or rotated by the device.
scene.clearColor = new B.Color4(0.045, 0.035, 0.08, 0);
scene.skipPointerMovePicking = true;
scene.imageProcessingConfiguration.exposure = 1.02;
scene.imageProcessingConfiguration.contrast = 1.02;
const glow = new B.GlowLayer('battleGlow', scene, { blurKernelSize: 48 });
glow.intensity = .58;

const FIXED_DT = 1 / 20;
const WORLD = Object.freeze({ width: 36, length: 64, riverHalf: 2.1, bridges: [-11, 11] });
const BATTLE_DURATION = 120;
const ENERGY_BASE_RATE = .50;
const AI_DIFFICULTY = .5;
const CARD_COSTS = Object.freeze({ emberhorn:3, mossbit:3, shardback:6, lumen:2 });
const ui = {
  timer: document.querySelector('#timer'), elixir: document.querySelector('#elixirValue'), fill: document.querySelector('#elixirFill'),
  message: document.querySelector('#message'),
  playerScore: document.querySelector('#playerScore'), enemyScore: document.querySelector('#enemyScore')
};

function color(hex) { return B.Color3.FromHexString(hex); }
function material(name, diffuse, emissive = null) {
  const mat = new B.StandardMaterial(name, scene);
  mat.diffuseColor = color(diffuse);
  mat.specularColor = new B.Color3(.16, .16, .18);
  if (emissive) mat.emissiveColor = color(emissive);
  return mat;
}

const mats = {
  sand: material('sand', '#b96845'), sandLight: material('sandLight', '#d99b6a'), stone: material('stone', '#554053'),
  water: material('water', '#167da7', '#075574'), wood: material('wood', '#80502e'), gold: material('gold', '#d7a83c', '#4b2a05'),
  blue: material('blue', '#248ac5', '#0b426f'), red: material('red', '#c23b65', '#60132f'),
  cyan: material('cyan', '#63eaff', '#25bddd'), magenta: material('magenta', '#ee68ff', '#a328b8'),
  black: material('black', '#090b13'), white: material('white', '#fff9e9')
};
mats.water.alpha = .92;

const camera = new B.FreeCamera('battleCamera', new B.Vector3(0, 66, -56), scene);
camera.setTarget(new B.Vector3(0, 0, 2));
camera.mode = B.Camera.ORTHOGRAPHIC_CAMERA;
camera.minZ = .1;
camera.maxZ = 180;
camera.inputs.clear();
scene.activeCamera = camera;

function resizeCamera() {
  const aspect = engine.getRenderWidth() / engine.getRenderHeight();
  // "cover" framing: on tall phones height is the constraint, while wider
  // phones/tablets zoom until the arena fills both sides with no black gutter.
  const arenaHalfWidth = WORLD.width * .5;
  const vertical = PREVIEW_TYPE
    ? ({emberhorn:3.3,mossbit:3.1,shardback:3.8,lumen:3.1}[PREVIEW_TYPE]||3.4)
    : Math.min(28.8, (arenaHalfWidth - .35) / Math.max(aspect, .01));
  camera.orthoTop = vertical;
  camera.orthoBottom = -vertical;
  camera.orthoLeft = -vertical * aspect;
  camera.orthoRight = vertical * aspect;
}

const hemi = new B.HemisphericLight('sky', new B.Vector3(0, 1, -.25), scene);
hemi.intensity = .76;
hemi.diffuse = color('#fff1d0');
hemi.groundColor = color('#34203f');
const sun = new B.DirectionalLight('sun', new B.Vector3(-.45, -1, .3), scene);
sun.position = new B.Vector3(18, 34, -24);
sun.intensity = .9;
const shadows = new B.ShadowGenerator(1024, sun);
shadows.useBlurExponentialShadowMap = true;
shadows.blurKernel = 18;

function addShadow(mesh) {
  shadows.addShadowCaster(mesh);
  mesh.receiveShadows = true;
  return mesh;
}

function createArena() {
  const ground = B.MeshBuilder.CreateGround('arenaGround', { width: WORLD.width, height: WORLD.length, subdivisions: 2 }, scene);
  const arenaMaterial = new B.StandardMaterial('firstArenaMaterial', scene);
  const arenaTexture = new B.Texture('assets/generated/arena-desert-crystal.png', scene, false, false, B.Texture.TRILINEAR_SAMPLINGMODE);
  arenaTexture.wrapU = B.Texture.CLAMP_ADDRESSMODE;
  arenaTexture.wrapV = B.Texture.CLAMP_ADDRESSMODE;
  arenaTexture.vScale = -1;
  arenaTexture.vOffset = 1;
  arenaMaterial.diffuseTexture = arenaTexture;
  arenaMaterial.emissiveTexture = arenaTexture;
  arenaMaterial.emissiveColor = new B.Color3(.12,.12,.12);
  arenaMaterial.specularColor = B.Color3.Black();
  arenaMaterial.ambientColor = new B.Color3(.72,.72,.72);
  arenaMaterial.roughness = 1;
  ground.material = arenaMaterial;
  ground.receiveShadows = true;
  ground.isPickable = true;
}

const towerParts = [];
function createTower(id, team, type, x, z, hp) {
  const root = new B.TransformNode(id, scene);
  root.position.set(x, 0, z);
  const teamMat = team === 0 ? mats.blue : mats.red;
  const baseSize = type === 'core' ? 4.8 : 3.7;
  const base = addShadow(B.MeshBuilder.CreateBox(`${id}_base`, { width: baseSize, height: .75, depth: baseSize }, scene));
  base.parent = root; base.position.y = .4; base.material = mats.stone;
  const keep = addShadow(B.MeshBuilder.CreateBox(`${id}_keep`, { width: baseSize * .76, height: type === 'core' ? 3.25 : 2.5, depth: baseSize * .76 }, scene));
  keep.parent = root; keep.position.y = type === 'core' ? 2.15 : 1.75; keep.material = teamMat;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const turret = addShadow(B.MeshBuilder.CreateCylinder(`${id}_turret`, { diameter: type === 'core' ? 1.25 : 1.0, height: type === 'core' ? 3.2 : 2.5, tessellation: 8 }, scene));
    turret.parent = root; turret.position.set(sx * baseSize * .31, type === 'core' ? 2.2 : 1.78, sz * baseSize * .31); turret.material = teamMat;
    const cap = addShadow(B.MeshBuilder.CreateCylinder(`${id}_cap`, { diameterBottom: type === 'core' ? 1.5 : 1.2, diameterTop: .15, height: .8, tessellation: 8 }, scene));
    cap.parent = root; cap.position.copyFrom(turret.position); cap.position.y += type === 'core' ? 2 : 1.6; cap.material = mats.gold;
  }
  const turretPivot = new B.TransformNode(`${id}_weaponPivot`,scene);turretPivot.parent=root;turretPivot.position.y=type==='core'?4.05:3.15;
  const crystal = addShadow(B.MeshBuilder.CreatePolyhedron(`${id}_crystal`, { type: 1, size: type === 'core' ? .9 : .65 }, scene));
  crystal.parent = turretPivot; crystal.scaling.y = 1.45; crystal.material = team === 0 ? mats.cyan : mats.magenta;
  const barrel=addShadow(B.MeshBuilder.CreateCylinder(`${id}_barrel`,{diameter:type==='core'?.28:.22,height:type==='core'?1.8:1.35,tessellation:10},scene));
  barrel.parent=turretPivot;barrel.position.set(0,.05,type==='core'?.78:.58);barrel.rotation.x=Math.PI/2;barrel.material=mats.gold;
  const hpY=type==='core'?5.25:4.12;
  const healthBack=B.MeshBuilder.CreatePlane(`${id}_hpBack`,{width:type==='core'?3.8:3.05,height:.28},scene);healthBack.parent=root;healthBack.position.y=hpY;healthBack.billboardMode=B.Mesh.BILLBOARDMODE_ALL;healthBack.material=mats.black;healthBack.isPickable=false;
  const healthFill=B.MeshBuilder.CreatePlane(`${id}_hpFill`,{width:type==='core'?3.62:2.87,height:.18},scene);healthFill.parent=root;healthFill.position.set(0,hpY,-.02);healthFill.billboardMode=B.Mesh.BILLBOARDMODE_ALL;healthFill.material=team===0?mats.cyan:mats.magenta;healthFill.isPickable=false;
  const tower = { id, team, type, root, hp, maxHp: hp, alive: true, active:type==='guard', radius: type === 'core' ? 2.3 : 1.8, range: type === 'core' ? 7 : 7.5, cooldown: .4, crystal, turretPivot, barrel, barrelHomeZ:barrel.position.z, recoil:0, healthBack, healthFill, hitPulse:0 };
  towerParts.push(tower);
  return tower;
}

const UNIT_CONFIG = Object.freeze({
  emberhorn: { label: 'قرن الجمر', hp: 690, damage: 79, speed: 3.0, acceleration: 8, turnSpeed: 5.8, sight: 6.2, range: 1.25, radius: .52, windup: .42, recovery: .72, scale: 1.24, ranged: false, color: '#e86120', accent: '#ffad1c' },
  mossbit: { label: 'مهندس الطحلب', hp: 480, damage: 95, speed: 3.35, acceleration: 9, turnSpeed: 6.4, sight: 7, range: 5.2, radius: .48, windup: .38, recovery: .67, scale: 1.08, ranged: true, projectile: 'spark', color: '#78a83a', accent: '#c79743' },
  shardback: { label: 'ظهر الشظايا', hp: 3200, damage: 180, speed: 2.1, acceleration: 4.2, turnSpeed: 3.2, sight: 7.8, range: 1.1, radius: .82, windup: .76, recovery: .78, scale: 1.62, ranged: false, buildingsOnly: true, color: '#292d38', accent: '#ff9e22' },
  lumen: { label: 'طيف الفانوس', hp: 220, damage: 45, speed: 3.8, acceleration: 10, turnSpeed: 7.2, sight: 6.5, range: 4.1, radius: .42, windup: .28, recovery: .62, scale: .96, ranged: true, flying: true, projectile: 'flame', color: '#f0aa24', accent: '#a65ade' }
});

const units = [];
const projectiles = [];
const effects = [];
let nextUnitId = 1;
let battleElapsed = 0;
let elixir = 6;
let selectedType = 'emberhorn';
let enemyDeployTimer = 2.2 / AI_DIFFICULTY;
let energyPhase = 1;
let battleEnded = false;
const scores = [0, 0];

function unitMaterial(name, value, emissive = null) { return material(name, value, emissive); }

class RiggedUnit {
  constructor(type, team, position) {
    this.id = nextUnitId++;
    this.type = type; this.team = team; this.cfg = UNIT_CONFIG[type];this.lane=position.x<0?'left':'right';
    this.pos = position.clone(); this.prevPos = position.clone(); this.yaw = team === 0 ? 0 : Math.PI; this.prevYaw = this.yaw;
    this.hp = this.cfg.hp; this.maxHp = this.cfg.hp; this.alive = true; this.state = 'spawn'; this.stateTime = 0;
    this.target = null; this.retarget = 0; this.speed = 0; this.visualPhase = 0; this.hitDone = false; this.spawnScale = .05; this.pendingRemoval=false;
    this.buildRig(); units.push(this);
  }

  buildRig() {
    const cfg = this.cfg, s = cfg.scale;
    this.root = new B.TransformNode(`unit_${this.id}`, scene);
    this.root.position.copyFrom(this.pos); this.root.rotation.y = this.yaw; this.root.scaling.setAll(.05);
    this.pelvis = new B.TransformNode(`pelvis_${this.id}`, scene); this.pelvis.parent = this.root; this.pelvis.position.y = cfg.flying ? 1.7 : .82 * s;
    this.bodyMat = unitMaterial(`unitMat_${this.id}`, cfg.color);
    this.accentMat = unitMaterial(`accentMat_${this.id}`, cfg.accent, cfg.flying ? cfg.accent : null);
    this.body = addShadow(B.MeshBuilder.CreateSphere(`body_${this.id}`, { diameter: 1.25 * s, segments: 12 }, scene));
    this.body.parent = this.pelvis; this.body.position.y = .52 * s; this.body.scaling.set(.8, 1.05, .68); this.body.material = this.bodyMat;
    this.head = addShadow(B.MeshBuilder.CreateSphere(`head_${this.id}`, { diameter: .82 * s, segments: 12 }, scene));
    this.head.parent = this.pelvis; this.head.position.set(0, 1.24 * s, .06 * s); this.head.material = this.bodyMat;
    const outlineColor=this.team===0?color('#38d9ff'):color('#ff4c9a');
    for(const mesh of [this.body,this.head]){mesh.renderOutline=true;mesh.outlineColor=outlineColor;mesh.outlineWidth=.035*s}
    this.horns=[];
    for (const side of [-1, 1]) {
      const horn = addShadow(B.MeshBuilder.CreateCylinder(`horn_${this.id}`, { diameterBottom: .22*s, diameterTop: .03, height: .62*s, tessellation: 8 }, scene));
      horn.parent = this.head; horn.position.set(side * .31*s, .31*s, 0); horn.rotation.z = side * -.48; horn.material = this.accentMat;
      this.horns.push(horn);
    }
    this.leftLeg = this.makeLimb('leftLeg', -.3*s, 0, .72*s, .24*s, this.bodyMat);
    this.rightLeg = this.makeLimb('rightLeg', .3*s, 0, .72*s, .24*s, this.bodyMat);
    this.leftArm = this.makeLimb('leftArm', -.56*s, 1.04*s, .68*s, .2*s, this.bodyMat);
    this.rightArm = this.makeLimb('rightArm', .56*s, 1.04*s, .68*s, .2*s, this.bodyMat);
    this.leftArm.rotation.z = -.12; this.rightArm.rotation.z = .12;
    if (cfg.ranged) {
      this.weapon = addShadow(B.MeshBuilder.CreateCylinder(`weapon_${this.id}`, { diameter: .2*s, height: 1.15*s, tessellation: 8 }, scene));
      this.weapon.parent = this.rightArm; this.weapon.position.set(0,-.66*s,.25*s); this.weapon.rotation.x = Math.PI/2; this.weapon.material = this.accentMat;
    } else {
      this.weapon = addShadow(B.MeshBuilder.CreateBox(`weapon_${this.id}`, { width:.12*s,height:1.25*s,depth:.2*s }, scene));
      this.weapon.parent = this.rightArm; this.weapon.position.set(0,-.72*s,.2*s); this.weapon.rotation.x=-.18; this.weapon.material=this.accentMat;
    }
    this.decorateType();
    this.weaponHome=this.weapon.position.clone();this.headHome=this.head.position.clone();this.bodyHome=this.body.position.clone();
    if(this.lantern)this.lanternHomeScaling=this.lantern.scaling.clone();
    this.healthBack = B.MeshBuilder.CreatePlane(`hpBack_${this.id}`, { width: 1.65*s, height: .16 }, scene);
    this.healthBack.parent=this.root;this.healthBack.position.set(0,(cfg.flying?3.05:2.72)*s,0);this.healthBack.billboardMode=B.Mesh.BILLBOARDMODE_ALL;this.healthBack.material=mats.black;this.healthBack.isPickable=false;this.healthBack.renderingGroupId=3;
    this.healthFill = B.MeshBuilder.CreatePlane(`hpFill_${this.id}`, { width: 1.55*s, height: .1 }, scene);
    this.healthFill.parent=this.root;this.healthFill.position.set(0,(cfg.flying?3.05:2.72)*s,-.01);this.healthFill.billboardMode=B.Mesh.BILLBOARDMODE_ALL;this.healthFill.material=this.team===0?mats.cyan:mats.magenta;this.healthFill.isPickable=false;this.healthFill.renderingGroupId=3;
  }

  makeLimb(name, x, y, length, width, mat) {
    const pivot = new B.TransformNode(`${name}Pivot_${this.id}`, scene); pivot.parent=this.pelvis; pivot.position.set(x,y,0);
    const limb = addShadow(B.MeshBuilder.CreateCapsule(`${name}_${this.id}`, { radius:width, height:length, tessellation:8 }, scene));
    limb.parent=pivot;limb.position.y=-length*.45;limb.material=mat;return pivot;
  }

  decorateType() {
    const s=this.cfg.scale;
    if(this.type==='emberhorn'){
      this.weapon.setEnabled(false);
      this.body.scaling.set(1.12,.72,1.42);this.body.position.y=.38*s;
      this.head.scaling.set(1.05,.78,1.28);this.head.position.set(0,.72*s,.78*s);
      this.leftArm.position.set(-.58*s,.7*s,.48*s);this.rightArm.position.set(.58*s,.7*s,.48*s);
      this.leftLeg.position.set(-.43*s,.28*s,-.48*s);this.rightLeg.position.set(.43*s,.28*s,-.48*s);
      const belly=addShadow(B.MeshBuilder.CreateSphere(`emberBelly_${this.id}`,{diameter:1.02*s,segments:12},scene));belly.parent=this.pelvis;belly.position.set(0,.28*s,.52*s);belly.scaling.set(.82,.62,.38);belly.material=mats.sandLight;
      const snout=addShadow(B.MeshBuilder.CreateSphere(`emberSnout_${this.id}`,{diameter:.72*s,segments:12},scene));snout.parent=this.head;snout.position.set(0,-.15*s,.43*s);snout.scaling.set(.72,.5,1);snout.material=this.bodyMat;
      for(const side of [-1,1]){const eye=addShadow(B.MeshBuilder.CreateSphere(`emberEye_${this.id}_${side}`,{diameter:.13*s,segments:8},scene));eye.parent=this.head;eye.position.set(side*.22*s,.06*s,.43*s);eye.material=mats.cyan}
      for(let i=0;i<7;i++){const crystal=addShadow(B.MeshBuilder.CreateCylinder(`emberCrystal_${this.id}`,{diameterBottom:(.24+(i%2)*.06)*s,diameterTop:0,height:(.62+i*.035)*s,tessellation:6},scene));crystal.parent=this.pelvis;crystal.position.set((i%2?-.12:.12)*s,(.86+(i%3)*.08)*s,(-.72+i*.22)*s);crystal.rotation.x=-.2;crystal.material=i%3===0?mats.stone:this.accentMat}
      let parent=this.pelvis;for(let i=0;i<4;i++){const joint=new B.TransformNode(`emberTailJoint_${this.id}_${i}`,scene);joint.parent=parent;joint.position.set(0,(.5-i*.05)*s,-(.55+i*.32)*s);const tail=addShadow(B.MeshBuilder.CreateSphere(`emberTail_${this.id}_${i}`,{diameter:(.45-i*.07)*s,segments:8},scene));tail.parent=joint;tail.scaling.z=1.5;tail.material=this.bodyMat;parent=joint}
      this.shield=addShadow(B.MeshBuilder.CreateCylinder(`emberShield_${this.id}`,{diameter:1.2*s,height:.2*s,tessellation:8},scene));this.shield.parent=this.leftArm;this.shield.position.set(0,-.5*s,.42*s);this.shield.rotation.x=Math.PI/2;this.shield.material=mats.stone;
      const gem=addShadow(B.MeshBuilder.CreatePolyhedron(`emberShieldGem_${this.id}`,{type:1,size:.5*s},scene));gem.parent=this.shield;gem.position.y=.16*s;gem.scaling.set(.72,1.45,.72);gem.material=this.accentMat;
    }
    if(this.type==='mossbit'){
      this.horns.forEach(horn=>horn.setEnabled(false));this.head.scaling.set(1.26,.98,.94);this.body.scaling.set(.88,.94,.7);
      const nose=addShadow(B.MeshBuilder.CreateSphere(`mossNose_${this.id}`,{diameter:.2*s,segments:9},scene));nose.parent=this.head;nose.position.set(0,-.06*s,.47*s);nose.material=mats.sandLight;
      for(const side of [-1,1]){const ear=addShadow(B.MeshBuilder.CreateCylinder(`mossEar_${this.id}_${side}`,{diameterBottom:.42*s,diameterTop:.035,height:.86*s,tessellation:10},scene));ear.parent=this.head;ear.position.set(side*.52*s,.01,.02);ear.rotation.z=side*Math.PI/2;ear.material=this.bodyMat;const lens=addShadow(B.MeshBuilder.CreateTorus(`mossLens_${this.id}_${side}`,{diameter:.54*s,thickness:.105*s,tessellation:22},scene));lens.parent=this.head;lens.position.set(side*.235*s,.09*s,.43*s);lens.rotation.x=Math.PI/2;lens.material=mats.gold;const eye=addShadow(B.MeshBuilder.CreateSphere(`mossEye_${this.id}_${side}`,{diameter:.34*s,segments:12},scene));eye.parent=this.head;eye.position.set(side*.235*s,.09*s,.45*s);eye.material=mats.cyan}
      this.pack=addShadow(B.MeshBuilder.CreateCylinder(`mossPack_${this.id}`,{diameter:.82*s,height:1.25*s,tessellation:12},scene));this.pack.parent=this.pelvis;this.pack.position.set(0,.68*s,-.56*s);this.pack.material=mats.wood;
      const mushroomStem=addShadow(B.MeshBuilder.CreateCylinder(`mossMushroomStem_${this.id}`,{diameter:.13*s,height:.38*s,tessellation:8},scene));mushroomStem.parent=this.pack;mushroomStem.position.y=.7*s;mushroomStem.material=mats.sandLight;
      const mushroomCap=addShadow(B.MeshBuilder.CreateSphere(`mossMushroomCap_${this.id}`,{diameter:.4*s,segments:10},scene));mushroomCap.parent=mushroomStem;mushroomCap.position.y=.2*s;mushroomCap.scaling.y=.45;mushroomCap.material=this.accentMat;
      this.weapon.scaling.set(2.05,1.45,2.05);
      this.muzzle=addShadow(B.MeshBuilder.CreateCylinder(`mossMuzzle_${this.id}`,{diameter:.5*s,height:.4*s,tessellation:10},scene));this.muzzle.parent=this.weapon;this.muzzle.position.y=-.7*s;this.muzzle.material=mats.gold;
    }
    if(this.type==='shardback'){
      this.horns.forEach(horn=>horn.setEnabled(false));this.body.scaling.set(1.35,.64,1.62);this.body.position.y=.32*s;this.head.scaling.set(.88,.58,1.48);this.head.position.set(0,.5*s,.92*s);this.weapon.setEnabled(false);
      this.leftArm.position.set(-.58*s,.52*s,.58*s);this.rightArm.position.set(.58*s,.52*s,.58*s);this.leftLeg.position.set(-.53*s,.25*s,-.55*s);this.rightLeg.position.set(.53*s,.25*s,-.55*s);
      const armoredSnout=addShadow(B.MeshBuilder.CreatePolyhedron(`shardSnout_${this.id}`,{type:1,size:.56*s},scene));armoredSnout.parent=this.head;armoredSnout.position.set(0,-.08*s,.58*s);armoredSnout.scaling.set(.72,.55,1.25);armoredSnout.material=mats.stone;
      for(const side of [-1,1]){const eye=addShadow(B.MeshBuilder.CreateSphere(`shardEye_${this.id}_${side}`,{diameter:.13*s,segments:8},scene));eye.parent=this.head;eye.position.set(side*.23*s,.02*s,.48*s);eye.material=this.accentMat}
      this.plates=[];for(let i=0;i<11;i++){const plate=addShadow(B.MeshBuilder.CreatePolyhedron(`shardPlate_${this.id}_${i}`,{type:1,size:(.4+(i%4)*.07)*s},scene));plate.parent=this.pelvis;plate.position.set((i%2?-.29:.29)*s,(.72+(i%3)*.09)*s,(-.9+i*.19)*s);plate.scaling.set(.82,1.35,.98);plate.rotation.y=i*.47;plate.material=i%4===0?this.accentMat:mats.stone;this.plates.push(plate)}
    }
    if(this.type==='lumen'){
      this.horns.forEach(horn=>horn.setEnabled(false));this.leftLeg.scaling.setAll(.01);this.rightLeg.scaling.setAll(.01);this.leftArm.scaling.setAll(.01);this.rightArm.scaling.setAll(.01);this.body.scaling.set(.68,1.12,.68);this.head.scaling.set(.9,.72,.55);this.head.position.z=.28*s;
      this.lantern=addShadow(B.MeshBuilder.CreateCylinder(`lumenLantern_${this.id}`,{diameter:1.3*s,height:1.78*s,tessellation:14},scene));this.lantern.parent=this.pelvis;this.lantern.position.y=.62*s;this.lantern.material=this.accentMat;this.lantern.visibility=.78;
      this.mask=addShadow(B.MeshBuilder.CreateSphere(`lumenMask_${this.id}`,{diameter:.82*s,segments:14},scene));this.mask.parent=this.pelvis;this.mask.position.set(0,1.3*s,.42*s);this.mask.scaling.set(1,.9,.28);this.mask.material=mats.white;
      for(const side of [-1,1]){const curl=addShadow(B.MeshBuilder.CreateTorus(`lumenCurl_${this.id}_${side}`,{diameter:.58*s,thickness:.1*s,tessellation:20},scene));curl.parent=this.pelvis;curl.position.set(side*.42*s,1.58*s,.1*s);curl.rotation.x=Math.PI/2;curl.material=mats.gold;const eye=addShadow(B.MeshBuilder.CreateSphere(`lumenEye_${this.id}_${side}`,{diameter:.12*s,segments:8},scene));eye.parent=this.mask;eye.position.set(side*.2*s,.05*s,.25*s);eye.material=this.accentMat}
      const crown=addShadow(B.MeshBuilder.CreateTorus(`lumenCrown_${this.id}`,{diameter:.46*s,thickness:.09*s,tessellation:20},scene));crown.parent=this.pelvis;crown.position.y=1.73*s;crown.rotation.x=Math.PI/2;crown.material=mats.gold;
      this.ribbons=[];for(const side of [-1,1]){const ribbon=B.MeshBuilder.CreateTube(`lumenRibbon_${this.id}`,{path:[new B.Vector3(side*.35*s,.55*s,0),new B.Vector3(side*.72*s,.15*s,-.1*s),new B.Vector3(side*1.05*s,.35*s,-.2*s)],radius:.06*s,tessellation:7},scene);ribbon.parent=this.pelvis;ribbon.material=mats.magenta;ribbon.isPickable=false;this.ribbons.push(ribbon)}
    }
  }

  setState(next) { if(this.state===next)return;this.state=next;this.stateTime=0;this.hitDone=false; }

  findTarget() {
    const enemyUnits = this.cfg.buildingsOnly ? [] : units.filter(u=>u.alive&&u.team!==this.team);
    const inSight = enemyUnits.filter(u=>distanceXZ(this.pos,u.pos)<=this.cfg.sight);
    inSight.sort((a,b)=>distanceXZ(this.pos,a.pos)-distanceXZ(this.pos,b.pos));
    if(inSight[0]) return inSight[0];
    const laneGuard=towerParts.find(t=>t.alive&&t.team!==this.team&&t.type==='guard'&&(this.lane==='left'?t.root.position.x<0:t.root.position.x>0));
    const core=towerParts.find(t=>t.alive&&t.team!==this.team&&t.type==='core');
    return laneGuard||core||null;
  }

  fixedUpdate(dt) {
    this.prevPos.copyFrom(this.pos); this.prevYaw=this.yaw; this.stateTime+=dt;
    if(!this.alive){this.speed=0;if(this.stateTime>=.72)this.pendingRemoval=true;return}
    if(this.state==='spawn'){this.spawnScale=Math.min(1,this.stateTime/.42);if(this.stateTime>=.42)this.setState('idle');return}
    if(this.state==='hit'){if(this.stateTime>=.16)this.setState('idle');return}
    if(this.state==='attack'){
      const contact=this.cfg.windup;
      if(!this.hitDone&&this.stateTime>=contact){this.hitDone=true;this.releaseAttack()}
      if(this.stateTime>=this.cfg.windup+.14+this.cfg.recovery)this.setState('idle');
      return;
    }
    this.retarget-=dt;
    const targetTooFar=this.target instanceof RiggedUnit&&distanceXZ(this.pos,this.target.pos)>this.cfg.sight*1.35;
    const towerTarget=this.target&&!this.target.cfg;
    const nearbyThreat=!this.cfg.buildingsOnly&&units.some(u=>u.alive&&u.team!==this.team&&distanceXZ(this.pos,u.pos)<=this.cfg.sight);
    if(!isAlive(this.target)||targetTooFar||(towerTarget&&nearbyThreat)){this.target=this.findTarget();this.retarget=.18}
    if(!this.target){this.speed=Math.max(0,this.speed-this.cfg.acceleration*dt);this.setState('idle');return}
    const targetPos=getPosition(this.target),dx=targetPos.x-this.pos.x,dz=targetPos.z-this.pos.z;
    const desired=Math.atan2(dx,dz);this.yaw=rotateToward(this.yaw,desired,this.cfg.turnSpeed*dt);
    const reach=this.cfg.range+this.cfg.radius+(this.target.cfg?.radius||this.target.radius||.5);
    if(Math.hypot(dx,dz)<=reach){this.speed=Math.max(0,this.speed-this.cfg.acceleration*2*dt);this.setState('attack');return}
    this.setState('walk');this.speed=Math.min(this.cfg.speed,this.speed+this.cfg.acceleration*dt);
    const forward=new B.Vector3(Math.sin(this.yaw),0,Math.cos(this.yaw));
    this.pos.addInPlace(forward.scale(this.speed*dt));
    this.pos.x=B.Scalar.Clamp(this.pos.x,-16.8,16.8);
    this.steerToBridgeIfNeeded();
  }

  steerToBridgeIfNeeded() {
    const onBridge=WORLD.bridges.some(x=>Math.abs(this.pos.x-x)<=2.05);
    if(Math.abs(this.pos.z)<=WORLD.riverHalf&&!onBridge){
      this.pos.z=Math.sign(this.prevPos.z||(this.team===0?-1:1))*WORLD.riverHalf;
      const bridge=Math.abs(this.pos.x-WORLD.bridges[0])<Math.abs(this.pos.x-WORLD.bridges[1])?WORLD.bridges[0]:WORLD.bridges[1];
      this.pos.x+=(bridge-this.pos.x)*.18;
    } else if(Math.abs(this.pos.z)<7&&!onBridge){
      const bridge=Math.abs(this.pos.x-WORLD.bridges[0])<Math.abs(this.pos.x-WORLD.bridges[1])?WORLD.bridges[0]:WORLD.bridges[1];
      this.pos.x+=(bridge-this.pos.x)*.09;
    }
  }

  releaseAttack() {
    if(!isAlive(this.target))return;
    const origin=this.pos.add(new B.Vector3(0,this.cfg.flying?2.2:1.55,0));
    if(this.cfg.ranged)spawnProjectile(this,this.target,origin);
    else {
      const impact=getPosition(this.target).add(new B.Vector3(0,.2,0));
      applyDamage(this.target,this.cfg.damage,this.team);
      burst(impact.add(new B.Vector3(0,.65,0)),this.cfg.accent,this.type==='shardback'?20:14);
      shockwave(impact,this.cfg.accent,this.type==='shardback'?1.7:1.05);
    }
  }

  takeDamage(amount) {
    if(!this.alive)return;this.hp=Math.max(0,this.hp-amount);
    if(this.hp<=0){this.alive=false;this.setState('death');this.healthBack.setEnabled(false);this.healthFill.setEnabled(false);burst(this.pos.add(new B.Vector3(0,1,0)),'#ffffff',18)}
    else if(this.state!=='attack')this.setState('hit');
  }

  render(alpha,dt) {
    const p=B.Vector3.Lerp(this.prevPos,this.pos,alpha);this.root.position.copyFrom(p);
    const yaw=lerpAngle(this.prevYaw,this.yaw,alpha);this.root.rotation.y=yaw;
    const hpRatio=this.hp/this.maxHp;this.healthFill.scaling.x=Math.max(.001,hpRatio);this.healthFill.position.x=-(1-hpRatio)*.775*this.cfg.scale;
    if(this.state==='spawn')this.root.scaling.setAll(easeOutBack(this.spawnScale));else this.root.scaling.setAll(1);
    if(!this.alive){const death=Math.min(1,this.stateTime/.72);this.pelvis.rotation.z=this.team===0?-death*1.35:death*1.35;this.root.scaling.setAll(Math.max(.04,1-death*.9));this.root.getChildMeshes().forEach(mesh=>mesh.visibility=Math.max(0,1-death));return}
    const moving=this.state==='walk'&&this.speed>.05;
    if(moving)this.visualPhase+=dt*this.speed*4.3;
    const gait=moving?Math.sin(this.visualPhase):0;
    this.leftLeg.rotation.x=B.Scalar.Lerp(this.leftLeg.rotation.x,gait*.62,Math.min(1,dt*15));
    this.rightLeg.rotation.x=B.Scalar.Lerp(this.rightLeg.rotation.x,-gait*.62,Math.min(1,dt*15));
    this.leftArm.rotation.x=B.Scalar.Lerp(this.leftArm.rotation.x,-gait*.38,Math.min(1,dt*13));
    this.rightArm.rotation.x=B.Scalar.Lerp(this.rightArm.rotation.x,gait*.38,Math.min(1,dt*13));
    this.pelvis.position.y=(this.cfg.flying?1.7+Math.sin(performance.now()*.004+this.id)*.12:.82*this.cfg.scale);
    this.pelvis.rotation.z=B.Scalar.Lerp(this.pelvis.rotation.z,moving?-gait*.035:0,Math.min(1,dt*12));
    this.resetSpecialPose(dt);
    if(this.state==='attack')this.renderAttackPose();
    if(this.state==='hit')this.pelvis.rotation.x=Math.sin(this.stateTime/.16*Math.PI)*-.22;
    else this.pelvis.rotation.x=B.Scalar.Lerp(this.pelvis.rotation.x,0,Math.min(1,dt*10));
  }

  renderAttackPose() {
    const t=this.stateTime,w=this.cfg.windup,wind=smooth(Math.min(1,t/w)),strike=t<w?0:smooth(Math.min(1,(t-w)/.14)),recover=t<w+.14?0:smooth(Math.min(1,(t-w-.14)/this.cfg.recovery));
    if(this.type==='emberhorn'){
      this.leftArm.rotation.x=B.Scalar.Lerp(-1.22,.72,strike)*(1-recover);this.rightArm.rotation.x=B.Scalar.Lerp(-1.72,.88,strike)*(1-recover);this.pelvis.rotation.y=B.Scalar.Lerp(-.36,.48,strike)*(1-recover);this.body.position.z=this.bodyHome.z+strike*.18;
    }else if(this.type==='mossbit'){
      const aim=-1.38*wind*(1-recover);this.leftArm.rotation.x=aim;this.rightArm.rotation.x=aim;this.pelvis.rotation.x=-.12*wind+strike*.18;this.weapon.position.y=this.weaponHome.y+strike*.28*(1-recover);if(this.muzzle)this.muzzle.scaling.setAll(1+strike*.32*(1-recover));
    }else if(this.type==='shardback'){
      this.pelvis.rotation.x=(-.24*wind+.52*strike)*(1-recover);this.head.position.z=this.headHome.z+(-.18*wind+.72*strike)*(1-recover);this.body.position.z=this.bodyHome.z+strike*.35*(1-recover);this.leftArm.rotation.x=this.rightArm.rotation.x=.55*strike*(1-recover);if(this.plates)this.plates.forEach((plate,i)=>plate.scaling.y=1.35+(i%3)*.08+strike*.32*(1-recover));
    }else if(this.type==='lumen'){
      const pulse=Math.sin(Math.min(1,t/(w+.14))*Math.PI);if(this.lantern)this.lantern.scaling.setAll(1+pulse*.34*(1-recover));if(this.mask)this.mask.rotation.y=Math.sin(t*18)*.11*pulse;this.pelvis.rotation.y=.42*pulse*(1-recover);if(this.ribbons)this.ribbons.forEach((ribbon,i)=>ribbon.rotation.z=(i?1:-1)*pulse*.32);
    }
  }

  resetSpecialPose(dt) {
    const blend=Math.min(1,dt*12);this.pelvis.rotation.y=B.Scalar.Lerp(this.pelvis.rotation.y,0,blend);this.body.position=B.Vector3.Lerp(this.body.position,this.bodyHome,blend);this.head.position=B.Vector3.Lerp(this.head.position,this.headHome,blend);this.weapon.position=B.Vector3.Lerp(this.weapon.position,this.weaponHome,blend);
    if(this.muzzle)this.muzzle.scaling=B.Vector3.Lerp(this.muzzle.scaling,B.Vector3.One(),blend);
    if(this.lantern)this.lantern.scaling=B.Vector3.Lerp(this.lantern.scaling,this.lanternHomeScaling,blend);
    if(this.mask)this.mask.rotation.y=B.Scalar.Lerp(this.mask.rotation.y,0,blend);
    if(this.ribbons)this.ribbons.forEach(ribbon=>ribbon.rotation.z=B.Scalar.Lerp(ribbon.rotation.z,0,blend));
    if(this.plates)this.plates.forEach(plate=>plate.scaling.y=B.Scalar.Lerp(plate.scaling.y,1.35,blend));
  }

  cruiseSeparation() {
    if(this.state!=='walk')return;
    for(const other of units){if(other===this||!other.alive||other.team!==this.team)continue;const d=distanceXZ(this.pos,other.pos),wanted=this.cfg.radius+other.cfg.radius;if(d>0&&d<wanted){const push=(wanted-d)*.025;this.pos.x+=(this.pos.x-other.pos.x)/d*push;this.pos.z+=(this.pos.z-other.pos.z)/d*push}}
  }

  dispose() {
    if(this.disposed)return;this.disposed=true;this.root.dispose(false,false);this.bodyMat.dispose();this.accentMat.dispose();
  }
}

function getPosition(target){return target.pos||target.root.position}
function isAlive(target){return !!target&&target.alive}
function distanceXZ(a,b){return Math.hypot(a.x-b.x,a.z-b.z)}
function normalizeAngle(a){while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a}
function rotateToward(current,target,max){const delta=normalizeAngle(target-current);return normalizeAngle(current+B.Scalar.Clamp(delta,-max,max))}
function lerpAngle(a,b,t){return normalizeAngle(a+normalizeAngle(b-a)*t)}
function smooth(t){return t*t*(3-2*t)}
function easeOutBack(t){const c=1.70158;return 1+(c+1)*(t-1)**3+c*(t-1)**2}

function spawnProjectile(from,target,origin) {
  const mesh=B.MeshBuilder.CreateSphere(`projectile_${from.id}`,{diameter:from.type==='lumen'?.48:.34,segments:8},scene);
  const flame=from.type==='lumen';mesh.material=material(`projectileMat_${from.id}_${performance.now()}`,flame?'#ffb52e':'#b7ff5b',flame?'#ff6b16':'#6fdf33');mesh.position.copyFrom(origin);
  const light=new B.PointLight(`projectileLight_${from.id}`,origin,scene);light.diffuse=flame?color('#ff8a24'):color('#aaff77');light.intensity=.6;light.range=4;
  projectiles.push({mesh,light,from,target,team:from.team,damage:from.cfg.damage,start:origin.clone(),elapsed:0,duration:Math.max(.18,distanceXZ(origin,getPosition(target))/12),trail:0});
  burst(origin,from.cfg.accent,flame?8:5);
}

function endBattle(winnerTeam) {
  if(battleEnded)return;
  battleEnded=true;
  for(const unit of units){if(unit.alive){unit.target=null;unit.speed=0;unit.setState('idle')}}
  const text=winnerTeam===0?'انتصار!':winnerTeam===1?'هزيمة':'تعادل';
  showMessage(text,{persistent:true,end:true});
  updateUI();
}

function finishTimedBattle() {
  if(scores[0]!==scores[1]){endBattle(scores[0]>scores[1]?0:1);return}
  const remaining=team=>towerParts.filter(t=>t.team===team&&t.alive).reduce((sum,tower)=>sum+tower.hp/tower.maxHp,0);
  const player=remaining(0),enemy=remaining(1);
  endBattle(Math.abs(player-enemy)<.001?-1:player>enemy?0:1);
}

function applyDamage(target,damage,team) {
  if(!isAlive(target))return;
  if(target instanceof RiggedUnit)target.takeDamage(damage);
  else {
    target.active=true;target.hitPulse=.18;target.hp=Math.max(0,target.hp-damage);target.crystal.scaling.set(1.35,.68,1.35);
    if(target.hp<=0){
      target.alive=false;target.healthBack.setEnabled(false);target.healthFill.setEnabled(false);
      const collapseAt=target.root.position.add(new B.Vector3(0,target.type==='core'?2.4:1.8,0));
      burst(collapseAt,'#ffffff',28);shockwave(target.root.position,target.team===0?'#38d9ff':'#ff4c9a',2.7);
      target.root.setEnabled(false);
      if(target.type==='guard'){const core=towerParts.find(t=>t.alive&&t.team===target.team&&t.type==='core');if(core)core.active=true}
      scores[team]++;ui.playerScore.textContent=scores[0];ui.enemyScore.textContent=scores[1];
      if(target.type==='core')endBattle(team);
    }
  }
}

function burst(position,hex,count=10) {
  const mat=material(`burstMat_${performance.now()}`,hex,hex);
  for(let i=0;i<count;i++){const mesh=B.MeshBuilder.CreateSphere('particle',{diameter:.12+(i%3)*.05,segments:5},scene);mesh.position.copyFrom(position);mesh.material=mat;const a=i/count*Math.PI*2;effects.push({mesh,velocity:new B.Vector3(Math.cos(a)*(1.5+i%4),1.5+(i%5)*.45,Math.sin(a)*(1.5+i%4)),life:.42+(i%3)*.08,max:.58})}
}

function shockwave(position,hex,radius=1) {
  const mesh=B.MeshBuilder.CreateTorus('impactWave',{diameter:.6,thickness:.09,tessellation:28},scene);
  mesh.position.copyFrom(position);mesh.position.y=.14;mesh.rotation.x=Math.PI/2;mesh.material=material(`waveMat_${performance.now()}`,hex,hex);mesh.isPickable=false;
  effects.push({mesh,velocity:B.Vector3.Zero(),life:.38,max:.38,kind:'wave',radius});
}

function updateProjectiles(dt) {
  for(const p of projectiles){p.elapsed+=dt;const target=getPosition(p.target).add(new B.Vector3(0,p.target.cfg?.flying?1.8:1.2,0));const q=Math.min(1,p.elapsed/p.duration);const pos=B.Vector3.Lerp(p.start,target,q);pos.y+=Math.sin(q*Math.PI)*1.2;p.mesh.position.copyFrom(pos);p.light.position.copyFrom(pos);p.trail-=dt;if(p.trail<=0){p.trail=.045;const dot=B.MeshBuilder.CreateSphere('trail',{diameter:.13,segments:5},scene);dot.position.copyFrom(pos);dot.material=p.mesh.material;effects.push({mesh:dot,velocity:B.Vector3.Zero(),life:.18,max:.18})}if(q>=1){applyDamage(p.target,p.damage,p.team);burst(pos,p.from.cfg.accent,p.from.type==='lumen'?20:14);shockwave(pos,p.from.cfg.accent,p.from.type==='lumen'?1.25:.8);p.done=true;p.mesh.dispose();p.light.dispose()}}
  for(let i=projectiles.length-1;i>=0;i--)if(projectiles[i].done)projectiles.splice(i,1);
}

function updateEffects(dt){
  for(const e of effects){
    e.life-=dt;
    if(e.kind==='wave'){
      const progress=1-Math.max(0,e.life/e.max);e.mesh.scaling.setAll(.25+e.radius*smooth(progress));e.mesh.visibility=Math.max(0,1-progress);
    }else{
      e.velocity.y-=5.8*dt;e.mesh.position.addInPlace(e.velocity.scale(dt));e.mesh.scaling.setAll(Math.max(.01,e.life/e.max));e.mesh.visibility=Math.max(0,e.life/e.max);
    }
  }
  for(let i=effects.length-1;i>=0;i--)if(effects[i].life<=0){effects[i].mesh.dispose();effects.splice(i,1)}
}

function updateTowers(dt) {
  for(const tower of towerParts){
    if(!tower.alive)continue;
    tower.crystal.rotation.y+=dt*1.4;tower.crystal.scaling=B.Vector3.Lerp(tower.crystal.scaling,B.Vector3.One(),Math.min(1,dt*12));
    const hpRatio=tower.hp/tower.maxHp;tower.healthFill.scaling.x=Math.max(.001,hpRatio);tower.healthFill.position.x=-(1-hpRatio)*(tower.type==='core'?1.81:1.435);
    tower.hitPulse=Math.max(0,tower.hitPulse-dt);tower.recoil=Math.max(0,tower.recoil-dt);tower.root.scaling.setAll(1+(tower.hitPulse>0?Math.sin(tower.hitPulse*55)*.025:0));tower.barrel.position.z=B.Scalar.Lerp(tower.barrel.position.z,tower.barrelHomeZ-(tower.recoil>0?.32:0),Math.min(1,dt*22));
    if(!tower.active)continue;
    tower.cooldown-=dt;const targets=units.filter(u=>u.alive&&u.team!==tower.team&&distanceXZ(tower.root.position,u.pos)<=tower.range);targets.sort((a,b)=>distanceXZ(tower.root.position,a.pos)-distanceXZ(tower.root.position,b.pos));
    if(targets[0]){
      const dx=targets[0].pos.x-tower.root.position.x,dz=targets[0].pos.z-tower.root.position.z;const desired=Math.atan2(dx,dz);tower.turretPivot.rotation.y=rotateToward(tower.turretPivot.rotation.y,desired,dt*6.5);
      if(tower.cooldown<=0){tower.cooldown=tower.type==='core'?1:.8;tower.recoil=.12;spawnTowerProjectile(tower,targets[0])}
    }
  }
}

function spawnTowerProjectile(tower,target){const proxy={id:tower.id,type:'tower',team:tower.team,cfg:{damage:tower.type==='core'?140:79,accent:tower.team===0?'#50ddff':'#ff58a3'},pos:tower.root.position};spawnProjectile(proxy,target,tower.root.position.add(new B.Vector3(0,tower.type==='core'?4.3:3.4,0)))}

function updateEnemyAI(dt){if(battleEnded)return;enemyDeployTimer-=dt;if(enemyDeployTimer>0)return;enemyDeployTimer=(2.6+Math.random()*1.8)/AI_DIFFICULTY;const type=['emberhorn','mossbit','lumen'][Math.floor(Math.random()*3)];const x=Math.random()<.5?-11:11;new RiggedUnit(type,1,new B.Vector3(x+(Math.random()-.5)*2,0,20+Math.random()*3))}

function separateUnits(){for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++){const a=units[i],b=units[j];if(!a.alive||!b.alive||a.team!==b.team)continue;const dx=a.pos.x-b.pos.x,dz=a.pos.z-b.pos.z,d=Math.hypot(dx,dz)||.001,wanted=a.cfg.radius+b.cfg.radius;if(d<wanted){const push=(wanted-d)*.18;a.pos.x+=dx/d*push;a.pos.z+=dz/d*push;b.pos.x-=dx/d*push;b.pos.z-=dz/d*push}}}
function removeDefeated(){for(let i=units.length-1;i>=0;i--){if(!units[i].pendingRemoval)continue;units[i].dispose();units.splice(i,1)}}
function energyMultiplierAt(elapsed){return elapsed>=90?2:elapsed>=60?1.5:1}
function updateEnergyPhase(){const next=energyMultiplierAt(battleElapsed);if(next===energyPhase)return;energyPhase=next;showMessage(`تسارع الطاقة ×${next}`,{boost:true})}
function fixedUpdate(dt){
  if(battleEnded){updateEffects(dt);return}
  battleElapsed=Math.min(BATTLE_DURATION,battleElapsed+dt);updateEnergyPhase();elixir=Math.min(10,elixir+ENERGY_BASE_RATE*energyPhase*dt);
  if(battleElapsed>=BATTLE_DURATION){updateUI();finishTimedBattle();return}
  for(const unit of units){if(battleEnded)break;unit.fixedUpdate(dt)}
  if(battleEnded){updateEffects(dt);updateUI();return}
  separateUnits();updateProjectiles(dt);updateEffects(dt);
  if(battleEnded){updateUI();return}
  updateTowers(dt);removeDefeated();updateEnemyAI(dt);updateUI();
}

function updateUI(){
  const remaining=Math.max(0,Math.ceil(BATTLE_DURATION-battleElapsed));ui.timer.textContent=`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;ui.elixir.textContent=Math.floor(elixir);ui.fill.style.width=`${elixir*10}%`;
  document.querySelectorAll('.card').forEach(card=>{card.disabled=battleEnded||elixir+1e-6<CARD_COSTS[card.dataset.unit]});
}

function showMessage(text,{persistent=false,boost=false,end=false}={}){ui.message.textContent=text;ui.message.classList.remove('boost','end');ui.message.classList.add('show');if(boost)ui.message.classList.add('boost');if(end)ui.message.classList.add('end');clearTimeout(showMessage.timer);if(!persistent)showMessage.timer=setTimeout(()=>ui.message.classList.remove('show','boost'),1500)}

createArena();
if(PREVIEW_TYPE&&UNIT_CONFIG[PREVIEW_TYPE]){
  const previewUnit=new RiggedUnit(PREVIEW_TYPE,0,new B.Vector3(0,0,2));previewUnit.state='idle';previewUnit.spawnScale=1;previewUnit.yaw=Math.PI;previewUnit.prevYaw=Math.PI;previewUnit.root.rotation.y=Math.PI;previewUnit.healthBack.setEnabled(false);previewUnit.healthFill.setEnabled(false);battleEnded=true;
}else{
  createTower('enemyCore',1,'core',0,27,4280);createTower('enemyLeft',1,'guard',-11,18,2786);createTower('enemyRight',1,'guard',11,18,2786);
  createTower('playerLeft',0,'guard',-11,-18,2534);createTower('playerRight',0,'guard',11,-18,2534);createTower('playerCore',0,'core',0,-27,4000);
  new RiggedUnit('emberhorn',0,new B.Vector3(-11,0,-13));new RiggedUnit('mossbit',1,new B.Vector3(-10,0,-1));new RiggedUnit('shardback',1,new B.Vector3(11,0,8));new RiggedUnit('lumen',0,new B.Vector3(10,0,-10));
  document.querySelectorAll('.card').forEach(button=>button.addEventListener('click',()=>{selectedType=button.dataset.unit;document.querySelectorAll('.card').forEach(card=>card.classList.toggle('selected',card===button));showMessage(`تم اختيار ${UNIT_CONFIG[selectedType].label}`)}));
  scene.onPointerDown=(_,pick)=>{if(battleEnded||!pick?.hit||!pick.pickedPoint)return;const point=pick.pickedPoint,cost=CARD_COSTS[selectedType];if(point.z>-3){showMessage('النشر في نصفك فقط');return}if(elixir<cost){showMessage('الطاقة غير كافية');return}elixir-=cost;new RiggedUnit(selectedType,0,new B.Vector3(B.Scalar.Clamp(point.x,-16,16),0,B.Scalar.Clamp(point.z,-29,-3.2)));updateUI()};
}

let accumulator=0,last=performance.now();
updateUI();
engine.runRenderLoop(()=>{const now=performance.now(),renderDt=Math.min(.05,(now-last)/1000);last=now;accumulator+=renderDt;while(accumulator>=FIXED_DT){fixedUpdate(FIXED_DT);accumulator-=FIXED_DT}const alpha=accumulator/FIXED_DT;units.forEach(u=>u.render(alpha,renderDt));scene.render()});
resizeCamera();
window.addEventListener('resize',()=>{engine.resize();resizeCamera()});
