import { SOURCE, CARDS, TOWER_TYPES, TOWER_LAYOUT } from './data.js';

const canvas = document.querySelector('#arena');
const ctx = canvas.getContext('2d', { alpha: false });
const ui = {
  wrap: document.querySelector('#arenaWrap'), hand: document.querySelector('#hand'), clock: document.querySelector('#clock'),
  phase: document.querySelector('#phase'), elixir: document.querySelector('#elixirValue'), fill: document.querySelector('#elixirFill'),
  next: document.querySelector('#nextCardImage'), start: document.querySelector('#startOverlay'), result: document.querySelector('#resultOverlay'),
  resultTitle: document.querySelector('#resultTitle'), resultText: document.querySelector('#resultText'), resultRune: document.querySelector('#resultRune'),
  toast: document.querySelector('#toast'), playerCrowns: document.querySelector('#playerCrowns'), enemyCrowns: document.querySelector('#enemyCrowns'),
  home: document.querySelector('#homeScreen'), battle: document.querySelector('#battleScreen'), collection: document.querySelector('#collectionScreen'),
  matchmaking: document.querySelector('#matchmaking'), homeDeck: document.querySelector('#homeDeck'), activeDeck: document.querySelector('#activeDeck'),
  collectionGrid: document.querySelector('#collectionGrid'), modal: document.querySelector('#cardModal')
};

const SCALE_X = canvas.width / SOURCE.world.width;
const SCALE_Y = canvas.height / SOURCE.world.height;
const TILE_PX = canvas.width / SOURCE.mapTiles.width;
const images = new Map();
const BATTLE_CARD_IDS = ['emberhorn','mossbit','shardback','lumenwisp'];
const BATTLE_CARDS = BATTLE_CARD_IDS.map(id=>CARDS.find(card=>card.id===id));
let mapGrid = [];
let game;
let animationId;
let lastFrame = performance.now();
let accumulator = 0;

const arenaImage = new Image();
arenaImage.src = 'assets/generated/arena-desert-crystal.png';

function loadImage(src) {
  if (images.has(src)) return images.get(src);
  const img = new Image(); img.src = src; images.set(src, img); return img;
}
CARDS.forEach(c => loadImage(c.image));

async function loadMap() {
  const csv = await fetch('data/tilemap.csv').then(r => r.text());
  const rows = csv.replace(/\r/g, '').split('\n').slice(3, 67);
  mapGrid = rows.map(row => row.split(',').slice(1, 37).map(v => v === '' ? 0 : Number(v)));
}

function showScreen(name) {
  const screens = { home: ui.home, battle: ui.battle, collection: ui.collection };
  Object.values(screens).forEach(screen => screen.classList.remove('active'));
  screens[name].classList.add('active');
  if (name !== 'battle' && game) game.running = false;
}

function cardMarkup(card, className) {
  return `<button class="${className}" data-card="${card.id}"><img src="${card.image}" alt="${card.name}"><span class="cost">${card.cost}</span><span class="level">مستوى ${card.level}</span><span class="label">${card.name}</span>${className === 'collection-card' ? '<span class="progress"><i></i></span>' : ''}</button>`;
}

function renderMetaScreens() {
  ui.homeDeck.innerHTML = BATTLE_CARDS.map(card => `<img src="${card.image}" alt="${card.name}">`).join('');
  ui.activeDeck.innerHTML = CARDS.map(card => cardMarkup(card, 'deck-card')).join('');
  ui.collectionGrid.innerHTML = [...CARDS, ...CARDS].map(card => cardMarkup(card, 'collection-card')).join('');
  document.querySelector('#averageCost').textContent = (CARDS.reduce((sum, card) => sum + card.cost, 0) / CARDS.length).toFixed(1);
  document.querySelectorAll('[data-card]').forEach(button => button.addEventListener('click', () => {
    openCardModal(CARDS.find(card => card.id === button.dataset.card));
  }));
}

function openCardModal(card) {
  if (!card) return;
  document.querySelector('#modalHero').src = card.image;
  document.querySelector('#modalIcon').src = card.image;
  document.querySelector('#previewUnit').src = card.image;
  document.querySelector('#modalName').textContent = card.name;
  document.querySelector('#modalLevel').textContent = `${card.rarity} · المستوى ${card.level}`;
  document.querySelector('#modalHp').textContent = card.hp;
  document.querySelector('#modalDamage').textContent = card.damage;
  document.querySelector('#modalSpeed').textContent = card.speedPerTick >= 80 ? 'سريعة' : card.speedPerTick >= 55 ? 'متوسطة' : 'بطيئة';
  ui.modal.classList.remove('hidden');
}

function closeCardModal() { ui.modal.classList.add('hidden'); }

function openBattle() {
  ui.matchmaking.classList.remove('hidden');
  clearTimeout(openBattle.timer);
  openBattle.timer = setTimeout(() => {
    ui.matchmaking.classList.add('hidden');
    newGame();
    showScreen('battle');
  }, 1250);
}

function cancelMatchmaking() {
  clearTimeout(openBattle.timer);
  ui.matchmaking.classList.add('hidden');
}

function newGame() {
  game = {
    running: false, ended: false, elapsed: 0, normalLeft: SOURCE.normalSeconds, overtime: false,
    elixir: [SOURCE.startingElixir, SOURCE.startingElixir], units: [], towers: [], projectiles: [], effects: [],
    selected: null, playerDeck: [0,1,2,3,4,5,6,7], enemyDeck: [6,0,7,5,2,3,4,1], playerHand: [], enemyHand: [],
    playerCursor: 0, enemyCursor: 0, enemyThink: 1200, id: 1, crowns: [0,0], winner: null
  };
  for (let i=0;i<4;i++) { game.playerHand.push(game.playerDeck[game.playerCursor++]); game.enemyHand.push(game.enemyDeck[game.enemyCursor++]); }
  game.towers = TOWER_LAYOUT.map(t => {
    const base = TOWER_TYPES[t.type];
    const hp = t.hpOverride || base.hp;
    return { ...t, ...base, hp, maxHp:hp, cooldown:500, alive:true, active:t.type==='guard' };
  });
  ui.result.classList.add('hidden'); ui.start.classList.remove('hidden');
  renderHand(); updateUI();
}

function begin() {
  if (game.ended) return;
  game.running = true;
  ui.start.classList.add('hidden');
}

function formatTime(total) {
  const s = Math.max(0, Math.ceil(total));
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
}

function elixirFullBarMs() {
  return SOURCE.timeline.find(x => game.elapsed < x.until)?.fullBarMs || 9300;
}

function phaseLabel() {
  const energy = SOURCE.timeline.find(x => game.elapsed < x.until)?.label || 'طاقة ثلاثية';
  return game.overtime ? `وقت إضافي · ${energy}` : energy;
}

function updateUI() {
  const remaining = game.overtime ? SOURCE.normalSeconds + SOURCE.overtimeSeconds - game.elapsed : SOURCE.normalSeconds - game.elapsed;
  ui.clock.textContent = formatTime(remaining); ui.phase.textContent = phaseLabel();
  ui.elixir.textContent = Math.floor(game.elixir[0]); ui.fill.style.width = `${game.elixir[0] / SOURCE.maxElixir * 100}%`;
  ui.playerCrowns.textContent = game.crowns[0]; ui.enemyCrowns.textContent = game.crowns[1];
  const next = CARDS[game.playerDeck[game.playerCursor % game.playerDeck.length]]; ui.next.src = next.image;
  document.querySelectorAll('.card').forEach((el,i) => el.classList.toggle('disabled', CARDS[game.playerHand[i]].cost > game.elixir[0]));
}

function renderHand() {
  ui.hand.replaceChildren();
  game.playerHand.forEach((cardIndex, slot) => {
    const c = CARDS[cardIndex]; const button = document.createElement('button'); button.className='card'; button.dataset.slot=slot;
    button.innerHTML = `<img src="${c.image}" alt="${c.name}"><span class="cost">${c.cost}</span><span class="name">${c.name}</span>`;
    button.addEventListener('click', () => selectCard(slot)); ui.hand.append(button);
  });
}

function selectCard(slot) {
  const card = CARDS[game.playerHand[slot]];
  if (!game.running) begin();
  if (card.cost > game.elixir[0]) { showToast('طاقة الصدع غير كافية'); return; }
  game.selected = game.selected === slot ? null : slot;
  document.querySelectorAll('.card').forEach((el,i) => el.classList.toggle('selected', i===game.selected));
}

function showToast(text) {
  ui.toast.textContent=text; ui.toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>ui.toast.classList.remove('show'),1200);
}

function canvasPoint(event) {
  const r=canvas.getBoundingClientRect(); return { x:(event.clientX-r.left)/r.width*SOURCE.world.width, y:(event.clientY-r.top)/r.height*SOURCE.world.height };
}

canvas.addEventListener('pointerdown', event => {
  if (!game.running) { begin(); return; }
  if (game.selected===null) return;
  const p=canvasPoint(event); const slot=game.selected; const card=CARDS[game.playerHand[slot]];
  if (p.y < 34000 || p.y > 62000 || !cellWalkable(Math.floor(p.x/1000),Math.floor(p.y/1000))) { showToast('انشر الوحوش في منطقتك فقط'); return; }
  if (game.elixir[0] < card.cost) { showToast('طاقة الصدع غير كافية'); return; }
  playCard(0, slot, p.x, p.y);
});

function playCard(team, slot, x, y) {
  const hand=team===0?game.playerHand:game.enemyHand; const deck=team===0?game.playerDeck:game.enemyDeck;
  const cursorKey=team===0?'playerCursor':'enemyCursor'; const cardIndex=hand[slot]; const card=CARDS[cardIndex];
  if (game.elixir[team] < card.cost) return false;
  game.elixir[team]-=card.cost;
  for (let i=0;i<card.count;i++) spawnUnit(team,card,x+(i-(card.count-1)/2)*850,y+(team===0?i*250:-i*250));
  hand[slot]=deck[game[cursorKey] % deck.length]; game[cursorKey]++;
  if (team===0) { game.selected=null; renderHand(); }
  return true;
}

function spawnUnit(team, card, x, y) {
  const lane=x<18000?'left':'right';
  game.units.push({
    id:game.id++, team, lane, card, x, y, hp:card.hp, maxHp:card.hp,
    cooldown:card.loadMs, target:null, attackTarget:null, windup:0, attackPulse:0,
    path:[], pathAge:0, spawn:450, alive:true, flash:0, moving:false, facing:team===0?-1:1
  });
  effect(x,y,team===0?'#ffad48':'#9b65ff',700,'ring');
}

function cellWalkable(x,y) {
  if (x<0||x>=36||y<0||y>=64) return false;
  const v=mapGrid[y]?.[x] ?? 0;
  return v!==16 && v!==32;
}

function heuristic(a,b){return Math.abs(a.x-b.x)+Math.abs(a.y-b.y)}
function findPath(sx,sy,tx,ty) {
  const start={x:Math.max(0,Math.min(35,Math.floor(sx/1000))),y:Math.max(0,Math.min(63,Math.floor(sy/1000)))};
  const goal={x:Math.max(0,Math.min(35,Math.floor(tx/1000))),y:Math.max(0,Math.min(63,Math.floor(ty/1000)))};
  const key=p=>p.y*36+p.x, open=[start], came=new Map(), g=new Map([[key(start),0]]), f=new Map([[key(start),heuristic(start,goal)]]), closed=new Set();
  let best=start;
  for(let loops=0;open.length&&loops<2400;loops++){
    open.sort((a,b)=>(f.get(key(a))??1e9)-(f.get(key(b))??1e9)); const cur=open.shift(); const ck=key(cur);
    if(closed.has(ck))continue; closed.add(ck); if(heuristic(cur,goal)<heuristic(best,goal))best=cur; if(cur.x===goal.x&&cur.y===goal.y){best=cur;break;}
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const n={x:cur.x+dx,y:cur.y+dy};if(!cellWalkable(n.x,n.y)||closed.has(key(n)))continue;const nk=key(n);const ng=(g.get(ck)||0)+1;if(ng<(g.get(nk)??1e9)){came.set(nk,cur);g.set(nk,ng);f.set(nk,ng+heuristic(n,goal));open.push(n)}}
  }
  const path=[]; let cur=best; while(came.has(key(cur))&&path.length<100){path.push({x:(cur.x+.5)*1000,y:(cur.y+.5)*1000});cur=came.get(key(cur))} return path.reverse();
}

function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function aliveEnemies(team){return [...game.units,...game.towers].filter(e=>e.alive&&e.team!==team)}

function chooseTarget(u) {
  if(!u.card.targetBuildings){
    const nearby=game.units.filter(e=>e.alive&&e.team!==u.team&&distance(u,e)<=u.card.sight&&e.lane===u.lane);
    nearby.sort((a,b)=>distance(u,a)-distance(u,b));
    if(nearby[0])return nearby[0];
  }
  const enemyTeam=u.team===0?1:0;
  const laneTower=game.towers.find(t=>t.alive&&t.team===enemyTeam&&t.type==='guard'&&t.id.includes(u.lane));
  if(laneTower)return laneTower;
  return game.towers.find(t=>t.alive&&t.team===enemyTeam&&t.type==='core')||null;
}

function routeGoal(u,target){
  const across=u.team===0?target.y<30000:target.y>34000;
  if(!across)return target;
  const bridgeX=u.lane==='left'?7000:29000;
  if(u.team===0){
    if(u.y>34500)return {x:bridgeX,y:34500};
    if(u.y>=29500)return {x:bridgeX,y:29000};
  }else{
    if(u.y<29500)return {x:bridgeX,y:29500};
    if(u.y<=34500)return {x:bridgeX,y:35000};
  }
  return target;
}

function updateUnit(u,dt) {
  if(!u.alive){u.flash=Math.max(0,u.flash-dt);return}
  if(u.spawn>0){u.spawn-=dt;return}
  u.cooldown-=dt;u.pathAge-=dt;u.flash=Math.max(0,u.flash-dt);u.attackPulse=Math.max(0,u.attackPulse-dt);u.moving=false;
  if(u.windup>0){
    u.windup-=dt;
    if(u.windup<=0&&u.attackTarget?.alive)attack(u,u.attackTarget,u.card.damage,u.card.projectileSpeed);
    return;
  }
  if(!u.target?.alive)u.target=chooseTarget(u); if(!u.target)return;
  const d=distance(u,u.target)-((u.target.collisionRadius||500)+u.card.collisionRadius);
  if(d<=u.card.range){
    u.facing=Math.sign(u.target.x-u.x)||u.facing;
    if(u.cooldown<=0){u.cooldown=u.card.hitSpeedMs;u.windup=u.card.loadMs;u.attackPulse=u.card.loadMs;u.attackTarget=u.target;}
    return;
  }
  const routed=routeGoal(u,u.target);
  if(u.pathAge<=0||!u.path.length){u.path=findPath(u.x,u.y,routed.x,routed.y);u.pathAge=450;}
  const waypoint=u.path[0]||routed; const dx=waypoint.x-u.x,dy=waypoint.y-u.y,mag=Math.hypot(dx,dy)||1; const step=u.card.speedPerTick*(dt/SOURCE.fixedTickMs);
  u.x+=dx/mag*Math.min(step,mag);u.y+=dy/mag*Math.min(step,mag);u.facing=Math.sign(dx)||u.facing;u.moving=true;if(mag<500)u.path.shift();
}

function separateUnits(){
  const living=game.units.filter(u=>u.alive&&u.spawn<=0);
  for(let i=0;i<living.length;i++)for(let j=i+1;j<living.length;j++){
    const a=living[i],b=living[j];if(a.team!==b.team)continue;const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;const wanted=(a.card.collisionRadius+b.card.collisionRadius)*.72;
    if(d<wanted){const push=(wanted-d)*.12,nx=dx/d,ny=dy/d;a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;}
  }
}

function attack(from,to,damage,projectileSpeed) {
  if(projectileSpeed>0){game.projectiles.push({x:from.x,y:from.y,to,damage,team:from.team,speed:projectileSpeed*20,alive:true});}
  else applyDamage(to,damage,from.team);
  effect(from.x,from.y,from.team===0?'#ffbd55':'#b17cff',300,'spark');
}

function applyDamage(target,damage,team) {
  if(!target.alive)return; target.hp-=damage;target.flash=130;effect(target.x,target.y,team===0?'#ffd077':'#d0a7ff',250,'hit');
  if(target.hp<=0){target.hp=0;target.alive=false;target.flash=520;effect(target.x,target.y,'#ffffff',900,'burst');
    if(target.type){game.crowns[team]++;if(target.type==='guard'){const core=game.towers.find(t=>t.team===target.team&&t.type==='core');if(core)core.active=true;}else endGame(team);}
  }
}

function updateTower(t,dt) {
  if(!t.alive||!t.active)return;t.cooldown-=dt;const targets=game.units.filter(u=>u.alive&&u.team!==t.team&&distance(t,u)<=t.range+t.collisionRadius);targets.sort((a,b)=>distance(t,a)-distance(t,b));
  if(targets[0]&&t.cooldown<=0){t.cooldown=t.hitSpeedMs;attack(t,targets[0],t.damage,900);}
}

function updateProjectiles(dt){for(const p of game.projectiles){if(!p.alive||!p.to.alive){p.alive=false;continue}p.px=p.x;p.py=p.y;const dx=p.to.x-p.x,dy=p.to.y-p.y,d=Math.hypot(dx,dy);const step=p.speed*dt/1000;if(d<=step+300){applyDamage(p.to,p.damage,p.team);p.alive=false}else{p.x+=dx/d*step;p.y+=dy/d*step}}game.projectiles=game.projectiles.filter(p=>p.alive)}
function effect(x,y,color,life,type){game.effects.push({x,y,color,life,max:life,type})}
function updateEffects(dt){for(const e of game.effects)e.life-=dt;game.effects=game.effects.filter(e=>e.life>0)}

function enemyAI(dt) {
  game.enemyThink-=dt;if(game.enemyThink>0)return;game.enemyThink=650;
  const options=game.enemyHand.map((idx,slot)=>({idx,slot,card:CARDS[idx]})).filter(o=>o.card.cost<=game.elixir[1]).sort((a,b)=>b.card.cost-a.card.cost);
  if(!options.length)return;const pick=options[0];const threatened=game.units.filter(u=>u.alive&&u.team===0&&u.y<30000).sort((a,b)=>a.y-b.y)[0];
  const x=threatened?Math.max(4000,Math.min(32000,threatened.x)):(game.enemyCursor%2?8500:27500);const y=threatened?Math.max(4000,Math.min(29000,threatened.y-3500)):15500;
  playCard(1,pick.slot,x,y);
}

function fixedUpdate(dt) {
  if(!game.running||game.ended)return;game.elapsed+=dt/1000;
  if(!game.overtime&&game.elapsed>=SOURCE.normalSeconds){const sides=game.crowns;if(sides[0]!==sides[1]){endGame(sides[0]>sides[1]?0:1);return}game.overtime=true;showToast('الوقت الإضافي — أول برج يحسم المعركة');}
  if(game.elapsed>=SOURCE.normalSeconds+SOURCE.overtimeSeconds){const hp=teamTowerHP(0)-teamTowerHP(1);endGame(hp>=0?0:1);return}
  const rate=SOURCE.maxElixir/elixirFullBarMs();game.elixir[0]=Math.min(10,game.elixir[0]+rate*dt);game.elixir[1]=Math.min(10,game.elixir[1]+rate*dt);
  enemyAI(dt);game.units.forEach(u=>updateUnit(u,dt));separateUnits();game.towers.forEach(t=>updateTower(t,dt));updateProjectiles(dt);updateEffects(dt);game.units=game.units.filter(u=>u.alive||u.hp===0&&u.flash>0);updateUI();
}

function teamTowerHP(team){return game.towers.filter(t=>t.team===team&&t.alive).reduce((a,t)=>a+t.hp,0)}
function endGame(winner){if(game.ended)return;game.ended=true;game.running=false;game.winner=winner;ui.resultTitle.textContent=winner===0?'انتصار الصدع':'سقط الحُرّاس';ui.resultText.textContent=winner===0?'أخضعت قلب الشفق.':'أعد ترتيب نشر وحوشك وحاول مجددًا.';ui.resultRune.textContent=winner===0?'✦':'◇';ui.result.classList.remove('hidden')}

function drawArena() {
  ctx.fillStyle='#181028';ctx.fillRect(0,0,canvas.width,canvas.height);
  if(arenaImage.complete)ctx.drawImage(arenaImage,0,0,canvas.width,canvas.height);
  const riverY=30*TILE_PX,riverH=4*TILE_PX;ctx.fillStyle='rgba(20,170,210,.24)';ctx.fillRect(0,riverY,canvas.width,riverH);
  ctx.fillStyle='rgba(255,223,158,.22)';for(const [a,b] of [[5,9],[27,31]])ctx.fillRect(a*TILE_PX,riverY,(b-a)*TILE_PX,riverH);
  ctx.fillStyle='rgba(109,68,190,.09)';ctx.fillRect(0,0,canvas.width,riverY);ctx.fillStyle='rgba(255,139,50,.07)';ctx.fillRect(0,34*TILE_PX,canvas.width,canvas.height-34*TILE_PX);
}

function hexPath(radius,stretchY=1){
  ctx.beginPath();for(let i=0;i<6;i++){const a=Math.PI/3*i-Math.PI/2,px=Math.cos(a)*radius,py=Math.sin(a)*radius*stretchY;i?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.closePath();
}

function drawTower(t) {
  if(!t.alive)return;
  const x=t.x*SCALE_X,y=t.y*SCALE_Y,size=t.renderDiameter*SCALE_X,r=size/2;
  const team=t.team===0
    ?{dark:'#16375a',mid:'#2b75ad',light:'#56d6ff',trim:'#e2c66c',roof:'#1c4f78'}
    :{dark:'#4b1c35',mid:'#9b3553',light:'#ff668d',trim:'#e8c56a',roof:'#71263e'};
  ctx.save();ctx.translate(x,y);ctx.globalAlpha=t.active?1:.72;ctx.lineJoin='round';
  ctx.fillStyle='rgba(10,6,15,.36)';ctx.beginPath();ctx.ellipse(0,r*.55,r*.72,r*.23,0,0,Math.PI*2);ctx.fill();
  ctx.shadowColor=team.light;ctx.shadowBlur=t.active?12:3;
  ctx.fillStyle=team.dark;ctx.strokeStyle='#1a1523';ctx.lineWidth=4;
  ctx.beginPath();ctx.roundRect(-r*.7,-r*.2,r*1.4,r*.9,r*.18);ctx.fill();ctx.stroke();
  ctx.shadowBlur=0;ctx.fillStyle=team.mid;ctx.beginPath();ctx.roundRect(-r*.6,-r*.48,r*1.2,r*.92,r*.12);ctx.fill();
  ctx.strokeStyle=team.trim;ctx.lineWidth=3;ctx.stroke();
  ctx.fillStyle=team.dark;
  for(const sx of [-1,1]){ctx.beginPath();ctx.roundRect(sx*r*.47-r*.17,-r*.66,r*.34,r*.36,r*.07);ctx.fill();ctx.stroke()}
  ctx.fillStyle=team.roof;ctx.beginPath();ctx.moveTo(-r*.62,-r*.4);ctx.lineTo(0,-r*.8);ctx.lineTo(r*.62,-r*.4);ctx.closePath();ctx.fill();ctx.strokeStyle=team.trim;ctx.stroke();
  if(t.type==='core'){
    ctx.fillStyle=team.dark;ctx.beginPath();ctx.roundRect(-r*.38,-r*.73,r*.76,r*1.04,r*.12);ctx.fill();ctx.stroke();
    ctx.fillStyle=team.roof;ctx.beginPath();ctx.moveTo(-r*.44,-r*.67);ctx.lineTo(0,-r*1.03);ctx.lineTo(r*.44,-r*.67);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle=team.trim;ctx.font=`900 ${Math.max(18,r*.48)}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('♛',0,-r*.3);
  }else{
    ctx.fillStyle=team.dark;ctx.beginPath();ctx.roundRect(-r*.28,-r*.67,r*.56,r*.63,r*.1);ctx.fill();ctx.stroke();
    ctx.fillStyle=team.trim;ctx.beginPath();ctx.arc(0,-r*.48,r*.17,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=t.active?team.light:'#6b6570';ctx.shadowColor=team.light;ctx.shadowBlur=t.active?15:0;ctx.beginPath();ctx.moveTo(0,-r*.62);ctx.lineTo(r*.12,-r*.42);ctx.lineTo(0,-r*.24);ctx.lineTo(-r*.12,-r*.42);ctx.closePath();ctx.fill();
  }
  ctx.restore();drawTowerHealth(t,x,y-r*.83-17,t.type==='core'?100:82);
}

function drawHealth(o,x,y,w){const pct=Math.max(0,o.hp/o.maxHp);ctx.fillStyle='rgba(8,5,18,.88)';ctx.beginPath();ctx.roundRect(x-w/2,y,w,7,4);ctx.fill();const fillW=Math.max(0,(w-2)*pct);if(fillW>0){ctx.fillStyle=o.team===0?'#ffb14e':'#a66cff';ctx.beginPath();ctx.roundRect(x-w/2+1,y+1,fillW,5,Math.min(3,fillW/2));ctx.fill()}}
function drawTowerHealth(t,x,y,w){
  ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 13px system-ui';
  ctx.fillStyle='rgba(7,7,13,.88)';ctx.beginPath();ctx.roundRect(x-w/2,y-13,w,19,5);ctx.fill();
  ctx.fillStyle='#ffe36a';ctx.beginPath();ctx.roundRect(x-w/2-17,y-13,17,19,5);ctx.fill();ctx.fillStyle='#302207';ctx.fillText('10',x-w/2-8.5,y-3);
  ctx.fillStyle='#fff';ctx.fillText(Math.ceil(t.hp),x,y-4);drawHealth(t,x,y+7,w);ctx.restore();
}

function drawUnit(u) {
  if(!u.alive&&u.flash<=0)return;
  const x=u.x*SCALE_X,y=u.y*SCALE_Y,base=u.card.renderDiameter*SCALE_X;
  const gait=Math.sin(game.elapsed*14+u.id),bob=u.moving?Math.abs(gait)*3:Math.sin(game.elapsed*3+u.id)*.8;
  const attack=u.attackPulse>0?1-u.attackPulse/Math.max(1,u.card.loadMs):0;
  ctx.save();ctx.translate(x,y+bob);
  if(!u.alive){ctx.globalAlpha=Math.max(0,u.flash/520);ctx.rotate((1-u.flash/520)*(u.team?-.7:.7));ctx.translate(0,(1-u.flash/520)*18)}
  else ctx.globalAlpha=u.spawn>0?Math.max(.25,1-u.spawn/600):1;
  const face=u.facing<0?-1:1;ctx.scale(face,1);ctx.rotate(u.moving?gait*.025:attack>0?Math.sin(attack*Math.PI)*-.12:0);ctx.scale(1+(attack>0?Math.sin(attack*Math.PI)*.13:0),1-(attack>0?Math.sin(attack*Math.PI)*.08:0));
  ctx.fillStyle=u.team===0?'rgba(255,158,66,.2)':'rgba(140,91,255,.22)';ctx.strokeStyle=u.team===0?'rgba(255,196,116,.78)':'rgba(194,160,255,.8)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,base*.12,base*.37,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.shadowColor=u.team===0?'#ff9e42':'#8c5bff';ctx.shadowBlur=14;ctx.fillStyle='rgba(10,7,22,.42)';ctx.beginPath();ctx.ellipse(0,base*.3,base*.35,base*.12,0,0,Math.PI*2);ctx.fill();
  const img=images.get(u.card.image);if(img?.complete){ctx.drawImage(img,-base*.53,-base*.67,base*1.06,base*1.06)}else{ctx.fillStyle=u.team===0?'#ff9e42':'#8c5bff';ctx.beginPath();ctx.arc(0,0,base*.38,0,Math.PI*2);ctx.fill()}
  if(u.flash>0){ctx.globalCompositeOperation='screen';ctx.fillStyle='rgba(255,255,255,.65)';ctx.beginPath();ctx.arc(0,0,base*.42,0,Math.PI*2);ctx.fill()}
  ctx.restore();if(u.alive)drawHealth(u,x,y-base*.5,Math.max(30,base*.76));
}

function drawProjectile(p){const x=p.x*SCALE_X,y=p.y*SCALE_Y,px=(p.px??p.x)*SCALE_X,py=(p.py??p.y)*SCALE_Y;ctx.save();ctx.shadowBlur=16;ctx.shadowColor=p.team===0?'#ffe07d':'#d6a8ff';ctx.strokeStyle=p.team===0?'#ffcf5c':'#b77cff';ctx.lineWidth=5;ctx.globalAlpha=.55;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(x,y);ctx.stroke();ctx.globalAlpha=1;ctx.fillStyle=p.team===0?'#fff4b5':'#ead7ff';ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();ctx.restore()}
function drawEffect(e){const p=1-e.life/e.max,x=e.x*SCALE_X,y=e.y*SCALE_Y;ctx.save();ctx.globalAlpha=1-p;ctx.strokeStyle=e.color;ctx.fillStyle=e.color;ctx.lineWidth=3;if(e.type==='ring'){ctx.beginPath();ctx.arc(x,y,6+p*32,0,Math.PI*2);ctx.stroke()}else if(e.type==='burst'){for(let i=0;i<8;i++){const a=i*Math.PI/4,r=p*38;ctx.fillRect(x+Math.cos(a)*r-2,y+Math.sin(a)*r-2,4,4)}}else{ctx.beginPath();ctx.arc(x,y,3+p*10,0,Math.PI*2);ctx.fill()}ctx.restore()}

function drawDeployHint(){if(game.selected===null||!game.running)return;ctx.save();ctx.fillStyle='rgba(255,172,70,.09)';ctx.fillRect(0,34*TILE_PX,canvas.width,30*TILE_PX);ctx.strokeStyle='rgba(255,225,165,.5)';ctx.lineWidth=3;ctx.setLineDash([8,8]);for(const x of [7000,29000]){ctx.beginPath();ctx.moveTo(x*SCALE_X,57500*SCALE_Y);ctx.lineTo(x*SCALE_X,29000*SCALE_Y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='rgba(255,226,171,.8)';ctx.beginPath();ctx.moveTo(x*SCALE_X,28500*SCALE_Y);ctx.lineTo(x*SCALE_X-7,30000*SCALE_Y);ctx.lineTo(x*SCALE_X+7,30000*SCALE_Y);ctx.closePath();ctx.fill();ctx.setLineDash([8,8])}ctx.restore()}

function render(){if(!game)return;drawArena();drawDeployHint();game.towers.forEach(drawTower);game.units.slice().sort((a,b)=>a.y-b.y).forEach(drawUnit);game.projectiles.forEach(drawProjectile);game.effects.forEach(drawEffect)}
function frame(now){const delta=Math.min(100,now-lastFrame);lastFrame=now;accumulator+=delta;while(accumulator>=SOURCE.fixedTickMs){fixedUpdate(SOURCE.fixedTickMs);accumulator-=SOURCE.fixedTickMs}render();animationId=requestAnimationFrame(frame)}

document.querySelector('#battleButton').addEventListener('click',()=>location.href='battle3d.html');
document.querySelector('#collectionBattle')?.addEventListener('click',()=>location.href='battle3d.html');
document.querySelector('#cancelMatch').addEventListener('click',cancelMatchmaking);
document.querySelector('#playAgainButton').addEventListener('click',newGame);
document.querySelector('#resultHomeButton').addEventListener('click',()=>showScreen('home'));
document.querySelector('#exitBattle').addEventListener('click',()=>showScreen('home'));
document.querySelector('#closeModal').addEventListener('click',closeCardModal);
document.querySelector('#useCard').addEventListener('click',closeCardModal);
ui.modal.addEventListener('pointerdown',event=>{if(event.target===ui.modal)closeCardModal()});
ui.start.addEventListener('click',begin);
document.querySelectorAll('[data-screen]').forEach(button=>button.addEventListener('click',()=>showScreen(button.dataset.screen)));

await loadMap();renderMetaScreens();newGame();showScreen('home');cancelAnimationFrame(animationId);animationId=requestAnimationFrame(frame);

// Deterministic visual smoke-test: http://localhost:3000/?demo=1
const query = new URLSearchParams(location.search);
if(query.get('screen')==='collection')showScreen('collection');
if(query.has('card')){showScreen('collection');openCardModal(CARDS.find(card=>card.id===query.get('card'))||CARDS[0]);}
if(query.has('demo')){
  showScreen('battle');begin();
  playCard(0,0,9000,44000);
  playCard(0,3,27000,45500);
  spawnUnit(0,CARDS[4],8000,39500);
  spawnUnit(1,CARDS[5],8500,27000);
  spawnUnit(1,CARDS[6],28500,25500);
  game.units.forEach(unit=>unit.spawn=0);
}
