// ============================================================
// engine.js — コアロジック（移動・掘削・敵AI・当たり判定）
// ============================================================

const TILE = 32;
const HUD_H = 48;
const T_EMPTY = 0, T_BRICK = 1, T_SOLID = 2, T_LADDER = 3, T_BAR = 4, T_TRAP = 5, T_HLADDER = 6;

const CHAR2TILE = {
  ".": T_EMPTY, "#": T_BRICK, "X": T_SOLID, "H": T_LADDER,
  "-": T_BAR, "T": T_TRAP, "S": T_HLADDER,
};

// 穴のタイミング（秒）
const HOLE_OPEN_TIME = 5.2;   // 開いている時間
const HOLE_CLOSE_TIME = 0.7;  // 塞がるアニメ時間
const TRAP_STUCK_TIME = 2.6;  // 敵が穴から抜け出すまで
const RESPAWN_TIME = 3.0;

const PLAYER_SPEED = 4.6;  // タイル/秒
const FALL_SPEED = 7.5;
const DIG_TIME = 0.32;

// ---- グローバル状態 ----
const G = {
  screen: "title",       // title / play / clear / gameover / allclear / editor
  levelIndex: 0,
  levelDef: null,
  custom: false,         // エディタからのテストプレイ中
  grid: [], gold: [],    // gold[r][c] = true
  holes: [],             // {c, r, t}
  player: null,
  enemies: [],
  goldTotal: 0, goldLeft: 0,
  exitOpen: false,
  score: 0, lives: 3,
  time: 0,
  deadTimer: 0,          // 死亡演出
  clearTimer: 0,
  msg: "", msgTimer: 0,
  shake: 0,
  particles: [],
};

const Input = { left: false, right: false, up: false, down: false, digL: false, digR: false };

// ---- タイルヘルパー ----
function tileAt(c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return T_SOLID;
  let t = G.grid[r][c];
  if (t === T_HLADDER) return G.exitOpen ? T_LADDER : T_EMPTY;
  return t;
}
function rawTile(c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return T_SOLID;
  return G.grid[r][c];
}
function isBlocking(t) { return t === T_BRICK || t === T_SOLID; }
function canEnter(c, r) { return !isBlocking(tileAt(c, r)); }

function enemyTrappedAt(c, r) {
  return G.enemies.some(e => e.alive && e.trapped && e.cx === c && e.cy === r);
}
// 立てるか（足元判定）
function supported(c, r) {
  const below = tileAt(c, r + 1);
  if (below === T_BRICK || below === T_SOLID || below === T_LADDER) return true;
  if (tileAt(c, r) === T_LADDER || tileAt(c, r) === T_BAR) return true;
  if (enemyTrappedAt(c, r + 1)) return true;
  return false;
}

// ---- レベル読み込み ----
function makeEntity(c, r, isPlayer) {
  return {
    cx: c, cy: r, x: c * TILE, y: r * TILE,
    tx: c, ty: r, prog: 1,          // トゥイーン（prog>=1 で停止中）
    dir: 1, falling: false, climbing: false, onBar: false,
    isPlayer,
    // 敵用
    alive: true, trapped: false, trapT: 0, respawnT: 0, escaping: false,
    carry: false, spawnC: c, spawnR: r,
    thinkCool: 0, path: null,
    digT: 0, digDir: 0,             // プレイヤー用
    animT: Math.random() * 10,
  };
}

function loadLevel(def, index, custom) {
  G.levelDef = def;
  G.levelIndex = index;
  G.custom = !!custom;
  G.grid = []; G.gold = []; G.holes = [];
  G.enemies = []; G.particles = [];
  G.exitOpen = false; G.time = 0;
  G.deadTimer = 0; G.clearTimer = 0; G.shake = 0;

  let goldCount = 0;
  for (let r = 0; r < ROWS; r++) {
    const rowStr = (def.map[r] || "").padEnd(COLS, ".");
    const grow = [], gldrow = [];
    for (let c = 0; c < COLS; c++) {
      const ch = rowStr[c];
      let t = T_EMPTY, gold = false;
      if (ch in CHAR2TILE) t = CHAR2TILE[ch];
      else if (ch === "$") { gold = true; }
      else if (ch === "%") { gold = true; t = T_BAR; }
      else if (ch === "P") { G.player = makeEntity(c, r, true); }
      else if (ch === "E") { G.enemies.push(makeEntity(c, r, false)); }
      else if (ch === "e") { G.enemies.push(makeEntity(c, r, false)); t = T_BAR; }
      if (gold) goldCount++;
      grow.push(t); gldrow.push(gold);
    }
    G.grid.push(grow); G.gold.push(gldrow);
  }
  if (!G.player) G.player = makeEntity(1, ROWS - 2, true);
  G.goldTotal = goldCount; G.goldLeft = goldCount;
  showMsg(def.hint || "", 4.5);
}

function showMsg(text, sec) { G.msg = text; G.msgTimer = sec; }

// ---- サウンド（WebAudio 簡易シンセ） ----
let AC = null;
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (AC && AC.state === "suspended") AC.resume();
  return AC;
}
function beep(freq, dur, type = "square", vol = 0.05, slide = 0, delay = 0) {
  const ac = audio(); if (!ac) return;
  const t0 = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
const SFX = {
  gold()  { beep(880, 0.08, "square", 0.045); beep(1320, 0.12, "square", 0.045, 0, 0.07); },
  dig()   { beep(160, 0.12, "sawtooth", 0.06, -60); beep(90, 0.1, "square", 0.05, -30, 0.05); },
  fall()  { beep(500, 0.15, "triangle", 0.03, -300); },
  trap()  { beep(220, 0.12, "square", 0.05, -120); },
  die()   { beep(600, 0.5, "sawtooth", 0.06, -520); },
  kill()  { beep(300, 0.2, "square", 0.05, -200); },
  exit()  { [660, 880, 1100, 1320].forEach((f, i) => beep(f, 0.14, "square", 0.05, 0, i * 0.09)); },
  clear() { [523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, 0.22, "square", 0.05, 0, i * 0.12)); },
  over()  { [400, 350, 300, 200].forEach((f, i) => beep(f, 0.3, "sawtooth", 0.05, -40, i * 0.22)); },
  step()  { },
};

// ---- パーティクル ----
function puff(x, y, color, n = 8, spd = 90) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = spd * (0.4 + Math.random() * 0.7);
    G.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.5 + Math.random() * 0.3, t: 0, color });
  }
}

// ---- 掘削 ----
function tryDig(side) {  // side: -1 左 / +1 右
  const p = G.player;
  if (p.prog < 1 || p.falling || p.digT > 0) return;
  const c = p.cx + side, r = p.cy + 1;
  if (rawTile(c, p.cy) !== T_EMPTY && tileAt(c, p.cy) !== T_EMPTY) return; // 横が空いてないと掘れない
  if (G.gold[p.cy][c]) { /* 金塊があっても腕は振れる */ }
  if (rawTile(c, r) !== T_BRICK) return;
  if (G.gold[r] && G.gold[r][c]) return;
  G.grid[r][c] = T_EMPTY;
  G.holes.push({ c, r, t: 0 });
  p.digT = DIG_TIME; p.digDir = side; p.dir = side;
  puff(c * TILE + TILE / 2, r * TILE + TILE / 2, G.levelDef.theme.brick, 10);
  SFX.dig();
}

function holeAt(c, r) { return G.holes.find(h => h.c === c && h.r === r); }

function updateHoles(dt) {
  for (let i = G.holes.length - 1; i >= 0; i--) {
    const h = G.holes[i];
    h.t += dt;
    if (h.t >= HOLE_OPEN_TIME + HOLE_CLOSE_TIME) {
      // 完全に塞がる
      G.grid[h.r][h.c] = T_BRICK;
      G.holes.splice(i, 1);
      // 巻き込まれ判定
      const p = G.player;
      if (p.cx === h.c && p.cy === h.r && G.deadTimer <= 0) killPlayer();
      for (const e of G.enemies) {
        if (e.alive && e.cx === h.c && e.cy === h.r) {
          if (e.carry) { dropGold(e, h.c, h.r - 1); }
          e.alive = false; e.trapped = false; e.respawnT = RESPAWN_TIME;
          G.score += 200;
          puff(h.c * TILE + 16, h.r * TILE + 16, "#fff", 12);
          SFX.kill();
        }
      }
    }
  }
}

function dropGold(e, c, r) {
  e.carry = false;
  // 落とせる場所を探す（指定セルが埋まってたら上へ）
  for (let rr = r; rr >= 0; rr--) {
    if (!isBlocking(rawTile(c, rr)) && !G.gold[rr][c]) { G.gold[rr][c] = true; return; }
  }
}

// ---- 移動（セル間トゥイーン方式） ----
function startTween(e, c, r, falling) {
  e.tx = c; e.ty = r; e.prog = 0;
  e.falling = !!falling;
}

function advanceTween(e, dt, speed) {
  if (e.prog >= 1) return true;
  const spd = e.falling ? FALL_SPEED : speed;
  e.prog = Math.min(1, e.prog + spd * dt);
  const fx = e.cx + (e.tx - e.cx) * e.prog;
  const fy = e.cy + (e.ty - e.cy) * e.prog;
  e.x = fx * TILE; e.y = fy * TILE;
  if (e.prog >= 1) {
    e.cx = e.tx; e.cy = e.ty;
    return true;
  }
  return false;
}

// 停止中のエンティティが次の一手を決める（プレイヤー）
function decidePlayer(p, dt) {
  const t = tileAt(p.cx, p.cy);
  const onLadder = t === T_LADDER;
  const onBar = t === T_BAR;
  p.onBar = onBar;
  if (!onLadder && tileAt(p.cx, p.cy + 1) !== T_LADDER) p.climbing = false;

  // 強制落下
  if (!onLadder && !onBar && !supported(p.cx, p.cy)) {
    if (!p.falling) SFX.fall();
    startTween(p, p.cx, p.cy + 1, true);
    return;
  }
  p.falling = false;

  // 掘る
  if (Input.digL) { tryDig(-1); }
  else if (Input.digR) { tryDig(1); }
  if (p.digT > 0) return; // 掘削モーション中は動けない

  if (Input.up) {
    if (onLadder && canEnter(p.cx, p.cy - 1)) { startTween(p, p.cx, p.cy - 1); p.climbing = true; return; }
  }
  if (Input.down) {
    const belowT = tileAt(p.cx, p.cy + 1);
    if (canEnter(p.cx, p.cy + 1) && !enemyTrappedAt(p.cx, p.cy + 1)) {
      // ハシゴ降下 or バーから落下 or 縁から降りる
      if (onLadder || belowT === T_LADDER) { startTween(p, p.cx, p.cy + 1); p.climbing = true; return; }
      if (onBar) { startTween(p, p.cx, p.cy + 1, true); return; }
    }
  }
  if (Input.left) {
    p.dir = -1;
    if (canEnter(p.cx - 1, p.cy)) { startTween(p, p.cx - 1, p.cy); p.climbing = false; return; }
  }
  if (Input.right) {
    p.dir = 1;
    if (canEnter(p.cx + 1, p.cy)) { startTween(p, p.cx + 1, p.cy); p.climbing = false; return; }
  }
}

// ---- 敵AI: BFS 経路探索 ----
function bfsNext(sc, sr, tc, tr) {
  if (sc === tc && sr === tr) return null;
  const key = (c, r) => r * COLS + c;
  const prev = new Int16Array(COLS * ROWS).fill(-1);
  const seen = new Uint8Array(COLS * ROWS);
  const q = [key(sc, sr)];
  seen[q[0]] = 1;
  // AI用: 敵は落とし穴レンガを床だと思っている（見た目で判断）
  const aiBlock = (c, r) => {
    const t = tileAt(c, r);
    return isBlocking(t) || t === T_TRAP;
  };
  const aiSupport = (c, r) => {
    const t = tileAt(c, r), b = tileAt(c, r + 1);
    if (t === T_LADDER || t === T_BAR) return true;
    if (b === T_BRICK || b === T_SOLID || b === T_LADDER || b === T_TRAP) return true;
    if (holeAt(c, r + 1)) return true; // 敵は掘られた穴に気付かず突っ込む
    return false;
  };
  let found = -1;
  while (q.length) {
    const cur = q.shift();
    const c = cur % COLS, r = (cur / COLS) | 0;
    if (c === tc && r === tr) { found = cur; break; }
    const push = (nc, nr) => {
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) return;
      if (aiBlock(nc, nr)) return;
      const k = key(nc, nr);
      if (seen[k]) return;
      seen[k] = 1; prev[k] = cur; q.push(k);
    };
    if (!aiSupport(c, r)) { push(c, r + 1); continue; } // 落下は強制
    if (tileAt(c, r) === T_LADDER) push(c, r - 1);
    push(c, r + 1);
    push(c - 1, r);
    push(c + 1, r);
  }
  if (found < 0) return null;
  // 経路を巻き戻して最初の一歩を返す
  let cur = found, p2 = prev[cur];
  while (p2 !== key(sc, sr) && p2 >= 0) { cur = p2; p2 = prev[cur]; }
  if (p2 < 0) return null;
  return { c: cur % COLS, r: (cur / COLS) | 0 };
}

function decideEnemy(e, dt, speedMul) {
  const t = tileAt(e.cx, e.cy);
  const inHole = !!holeAt(e.cx, e.cy);

  // 穴にはまっている
  if (inHole) {
    if (!e.trapped) {
      e.trapped = true; e.trapT = 0;
      G.score += 75; SFX.trap();
      if (e.carry) dropGold(e, e.cx, e.cy - 1);
    }
    e.trapT += dt;
    if (e.trapT > TRAP_STUCK_TIME && canEnter(e.cx, e.cy - 1) && !entityAt(e.cx, e.cy - 1, e)) {
      e.trapped = false; e.escaping = true;
      startTween(e, e.cx, e.cy - 1); // 穴からよじ登る
    }
    return;
  }
  e.trapped = false;

  // 穴から出た直後は横に一歩逃げる（でないと即落ち直す）
  if (e.escaping) {
    e.escaping = false;
    const pref = G.player.cx >= e.cx ? 1 : -1;
    for (const d of [pref, -pref]) {
      if (canEnter(e.cx + d, e.cy) && !entityAt(e.cx + d, e.cy, e) && !holeAt(e.cx + d, e.cy)) {
        e.dir = d;
        startTween(e, e.cx + d, e.cy);
        return;
      }
    }
  }

  // 強制落下
  if (t !== T_LADDER && t !== T_BAR && !supported(e.cx, e.cy)) {
    startTween(e, e.cx, e.cy + 1, true);
    return;
  }
  e.falling = false;
  e.onBar = t === T_BAR;
  e.climbing = t === T_LADDER;

  // 金塊を拾う/落とす
  if (G.gold[e.cy][e.cx] && !e.carry && Math.random() < 0.35) {
    G.gold[e.cy][e.cx] = false; e.carry = true;
  } else if (e.carry && Math.random() < 0.02 && !G.gold[e.cy][e.cx]) {
    G.gold[e.cy][e.cx] = true; e.carry = false;
  }

  const p = G.player;
  const step = bfsNext(e.cx, e.cy, p.cx, p.cy);
  let nc = e.cx, nr = e.cy;
  if (step) { nc = step.c; nr = step.r; }
  else {
    // 経路なし: プレイヤー方向へ寄る
    if (p.cx < e.cx && canEnter(e.cx - 1, e.cy)) nc = e.cx - 1;
    else if (p.cx > e.cx && canEnter(e.cx + 1, e.cy)) nc = e.cx + 1;
  }
  if (nc === e.cx && nr === e.cy) return;
  // 渋滞回避: 行き先に他の敵がいたら待つ
  if (entityAt(nc, nr, e)) return;
  if (nc !== e.cx) e.dir = nc > e.cx ? 1 : -1;
  startTween(e, nc, nr, nr > e.cy && tileAt(e.cx, e.cy + 1) !== T_LADDER && tileAt(nc, nr) !== T_LADDER);
}

function entityAt(c, r, except) {
  return G.enemies.find(o => o !== except && o.alive && ((o.prog < 1 ? o.tx : o.cx) === c && (o.prog < 1 ? o.ty : o.cy) === r));
}

// ---- 死亡・リスポーン ----
function killPlayer() {
  if (G.deadTimer > 0 || G.clearTimer > 0) return;
  G.deadTimer = 1.6;
  G.shake = 0.5;
  puff(G.player.x + 16, G.player.y + 16, "#ff6b6b", 16, 140);
  SFX.die();
}

function respawnAll() {
  G.lives--;
  if (G.lives < 0) {
    G.screen = "gameover";
    SFX.over();
    return;
  }
  // 穴を全部塞ぎ、位置をリセット（取った金塊はそのまま）
  for (const h of G.holes) G.grid[h.r][h.c] = T_BRICK;
  G.holes = [];
  const p = G.player;
  Object.assign(p, makeEntity(p.spawnC, p.spawnR, true));
  for (const e of G.enemies) {
    Object.assign(e, makeEntity(e.spawnC, e.spawnR, false));
  }
  G.deadTimer = 0;
}

// ---- メイン更新 ----
function updatePlay(dt) {
  G.time += dt;
  if (G.msgTimer > 0) G.msgTimer -= dt;
  if (G.shake > 0) G.shake -= dt;

  // パーティクル
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const pt = G.particles[i];
    pt.t += dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 300 * dt;
    if (pt.t > pt.life) G.particles.splice(i, 1);
  }

  // ステージクリア演出中
  if (G.clearTimer > 0) {
    G.clearTimer -= dt;
    if (G.clearTimer <= 0) onStageCleared();
    return;
  }
  // 死亡演出中
  if (G.deadTimer > 0) {
    G.deadTimer -= dt;
    if (G.deadTimer <= 0) respawnAll();
    return;
  }

  updateHoles(dt);

  const p = G.player;
  if (p.digT > 0) p.digT -= dt;
  p.animT += dt;

  // プレイヤー移動
  if (advanceTween(p, dt, PLAYER_SPEED)) {
    // 到着処理: 金塊
    if (G.gold[p.cy][p.cx]) {
      G.gold[p.cy][p.cx] = false;
      G.goldLeft--; G.score += 100;
      puff(p.cx * TILE + 16, p.cy * TILE + 16, "#ffd23e", 8, 70);
      SFX.gold();
      if (G.goldLeft <= 0 && !G.exitOpen) {
        G.exitOpen = true;
        showMsg("出口のハシゴが現れた！ 最上段まで登れ！", 4);
        SFX.exit();
      }
    }
    decidePlayer(p, dt);
  }

  // 脱出判定
  if (G.exitOpen && p.cy === 0 && p.prog >= 1 && G.clearTimer <= 0) {
    G.clearTimer = 1.4;
    G.score += 1000;
    SFX.clear();
    return;
  }

  // 敵
  const spd = (G.levelDef.enemySpeed || 0.9) * PLAYER_SPEED * 0.62;
  for (const e of G.enemies) {
    e.animT += dt;
    if (!e.alive) {
      e.respawnT -= dt;
      if (e.respawnT <= 0) {
        const farEnough = Math.abs(e.spawnC - p.cx) + Math.abs(e.spawnR - p.cy) > 3;
        if (farEnough && !entityAt(e.spawnC, e.spawnR, e)) {
          Object.assign(e, makeEntity(e.spawnC, e.spawnR, false));
        } else e.respawnT = 0.8;
      }
      continue;
    }
    if (e.trapped) { decideEnemy(e, dt, spd); continue; }
    if (advanceTween(e, dt, spd)) decideEnemy(e, dt, spd);
  }

  // 当たり判定（トラップ中の敵は無害）
  for (const e of G.enemies) {
    if (!e.alive || e.trapped) continue;
    const dx = (e.x - p.x), dy = (e.y - p.y);
    if (Math.abs(dx) < TILE * 0.6 && Math.abs(dy) < TILE * 0.6) { killPlayer(); break; }
  }
}
