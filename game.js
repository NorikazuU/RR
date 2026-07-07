// ============================================================
// game.js — 画面遷移・入力・メインループ
// ============================================================

const LS_HI = "caverunner.hiscore";
const LS_CLEAR = "caverunner.cleared";

const TITLE = { sel: 0, hover: -1, t: 0 };

function getHiscore() { return parseInt(localStorage.getItem(LS_HI) || "0", 10); }
function setHiscore(v) { localStorage.setItem(LS_HI, String(v)); }
function getCleared() {
  try { return JSON.parse(localStorage.getItem(LS_CLEAR) || "[]"); } catch (e) { return []; }
}
function markCleared(i) {
  const c = getCleared(); c[i] = true;
  localStorage.setItem(LS_CLEAR, JSON.stringify(c));
}

// ---- ゲーム開始/進行 ----
function startGame(index) {
  G.score = 0; G.lives = 3;
  loadLevel(LEVELS[index], index, false);
  G.screen = "play";
}

function onStageCleared() {
  if (G.custom) {
    // エディタのテストプレイ
    G.screen = "editor";
    enterEditor();
    edMsg("✔ クリアできました！ このステージは遊べます");
    return;
  }
  markCleared(G.levelIndex);
  if (G.score > getHiscore()) setHiscore(G.score);
  G.screen = G.levelIndex >= LEVELS.length - 1 ? "allclear" : "clear";
}

function nextStage() {
  G.lives = Math.min(9, G.lives + 1); // クリアボーナス
  loadLevel(LEVELS[G.levelIndex + 1], G.levelIndex + 1, false);
  G.screen = "play";
}

function toTitle() {
  leaveEditorUI();
  G.screen = "title";
  if (G.score > getHiscore()) setHiscore(G.score);
}

// ---- 入力 ----
const KeyMap = {
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down",
  KeyZ: "digL", KeyJ: "digL",
  KeyX: "digR", KeyK: "digR",
};

window.addEventListener("keydown", ev => {
  if (ev.target.tagName === "TEXTAREA" || ev.target.tagName === "INPUT") return;
  audio(); // 最初のキーで AudioContext を起こす
  const act = KeyMap[ev.code];
  if (ev.code === "Space" || ev.code.startsWith("Arrow")) ev.preventDefault();

  if (G.screen === "play") {
    if (act) { Input[act] = true; ev.preventDefault(); return; }
    if (ev.code === "KeyR") { killPlayer(); return; }
    if (ev.code === "Escape") {
      if (G.custom) { enterEditor(); edMsg("テストプレイを中断しました"); }
      else toTitle();
      return;
    }
  }
  else if (G.screen === "title") {
    if (ev.code === "ArrowLeft" || ev.code === "KeyA") TITLE.sel = (TITLE.sel + 8) % 9;
    else if (ev.code === "ArrowRight" || ev.code === "KeyD") TITLE.sel = (TITLE.sel + 1) % 9;
    else if (ev.code === "ArrowUp" || ev.code === "KeyW") TITLE.sel = TITLE.sel === 8 ? 4 : (TITLE.sel + 5) % 9 > 8 ? TITLE.sel : (TITLE.sel < 4 ? 8 : TITLE.sel - 4);
    else if (ev.code === "ArrowDown" || ev.code === "KeyS") TITLE.sel = TITLE.sel >= 4 ? 8 : TITLE.sel + 4;
    else if (ev.code === "Enter" || ev.code === "Space") titleActivate(TITLE.sel);
    ev.preventDefault();
  }
  else if (G.screen === "clear") {
    if (ev.code === "Enter" || ev.code === "Space") nextStage();
    else if (ev.code === "Escape") toTitle();
  }
  else if (G.screen === "gameover" || G.screen === "allclear") {
    if (ev.code === "Enter" || ev.code === "Space" || ev.code === "Escape") {
      if (G.custom) { enterEditor(); edMsg("ゲームオーバー…調整してみよう"); }
      else toTitle();
    }
  }
  else if (G.screen === "editor") {
    if (ev.code === "Escape") { leaveEditorUI(); G.screen = "title"; }
  }
});

window.addEventListener("keyup", ev => {
  const act = KeyMap[ev.code];
  if (act) Input[act] = false;
});

window.addEventListener("blur", () => {
  for (const k in Input) Input[k] = false;
});

// ---- タイトル画面 ----
const CARD_W = 200, CARD_H = 92, CARD_GAP = 16;
function cardRect(i) {
  if (i === 8) { // エディットモードカード
    return { x: cvs.width / 2 - 150, y: 452, w: 300, h: 52 };
  }
  const col = i % 4, row = (i / 4) | 0;
  const x0 = (cvs.width - 4 * CARD_W - 3 * CARD_GAP) / 2;
  return { x: x0 + col * (CARD_W + CARD_GAP), y: 218 + row * (CARD_H + CARD_GAP), w: CARD_W, h: CARD_H };
}

function titleActivate(i) {
  if (i === 8) enterEditor();
  else startGame(i);
}

cvs.addEventListener("mousemove", ev => {
  if (G.screen !== "title") return;
  const rect = cvs.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (cvs.width / rect.width);
  const y = (ev.clientY - rect.top) * (cvs.height / rect.height);
  TITLE.hover = -1;
  for (let i = 0; i < 9; i++) {
    const r = cardRect(i);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { TITLE.hover = i; TITLE.sel = i; break; }
  }
});
cvs.addEventListener("click", ev => {
  audio();
  if (G.screen === "title") {
    if (TITLE.hover >= 0) titleActivate(TITLE.hover);
  } else if (G.screen === "clear") nextStage();
  else if (G.screen === "gameover" || G.screen === "allclear") {
    if (G.custom) { enterEditor(); } else toTitle();
  }
});

function drawTitle(dt) {
  TITLE.t += dt;
  const t = TITLE.t;
  const bg = ctx.createLinearGradient(0, 0, 0, cvs.height);
  bg.addColorStop(0, "#131a30"); bg.addColorStop(1, "#07090f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cvs.width, cvs.height);

  // 背景の星（金塊）
  for (let i = 0; i < 14; i++) {
    const gx = (i * 137 + 60) % cvs.width;
    const gy = (i * 89 + 40) % 180 + ((t * 12 + i * 30) % 40);
    ctx.globalAlpha = 0.12;
    drawGold(ctx, gx, gy, LEVELS[0].theme, t + i);
  }
  ctx.globalAlpha = 1;

  // ロゴ
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold 64px sans-serif";
  ctx.fillStyle = "#0a0c14";
  ctx.fillText("CAVE RUNNER", cvs.width / 2 + 4, 92 + 4);
  const grad = ctx.createLinearGradient(0, 60, 0, 124);
  grad.addColorStop(0, "#ffe066"); grad.addColorStop(0.55, "#ffb347"); grad.addColorStop(1, "#c9781f");
  ctx.fillStyle = grad;
  ctx.fillText("CAVE RUNNER", cvs.width / 2, 92);
  ctx.font = "16px sans-serif";
  ctx.fillStyle = "#8a93ad";
  ctx.fillText("— 金塊を集めて、掘って、逃げ切れ —", cvs.width / 2, 142);

  ctx.font = "bold 15px monospace";
  ctx.fillStyle = "#ffd23e";
  ctx.fillText("HI-SCORE " + String(getHiscore()).padStart(6, "0"), cvs.width / 2, 176);

  // ステージカード
  const cleared = getCleared();
  for (let i = 0; i < 8; i++) {
    const r = cardRect(i);
    const th = LEVELS[i].theme;
    const sel = TITLE.sel === i;
    ctx.fillStyle = sel ? "#232d4e" : "#161c30";
    ctx.strokeStyle = sel ? th.accent : "#2a3350";
    ctx.lineWidth = sel ? 2.5 : 1;
    roundRect(ctx, r.x, r.y, r.w, r.h, 8, true, true);

    // テーマ色バー
    ctx.fillStyle = th.brick;
    ctx.fillRect(r.x + 12, r.y + 58, r.w - 24, 8);
    ctx.fillStyle = th.brickDark;
    ctx.fillRect(r.x + 12, r.y + 64, r.w - 24, 2);

    ctx.textAlign = "left";
    ctx.fillStyle = th.accent;
    ctx.font = "bold 13px monospace";
    ctx.fillText("STAGE " + (i + 1), r.x + 12, r.y + 20);
    if (cleared[i]) {
      ctx.fillStyle = "#7dff9a";
      ctx.textAlign = "right";
      ctx.fillText("★", r.x + r.w - 12, r.y + 20);
    }
    ctx.textAlign = "left";
    ctx.fillStyle = "#f0f4ff";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText(LEVELS[i].name, r.x + 12, r.y + 42);
  }

  // エディットモードカード
  {
    const r = cardRect(8);
    const sel = TITLE.sel === 8;
    ctx.fillStyle = sel ? "#2c2440" : "#1c1830";
    ctx.strokeStyle = sel ? "#c98fff" : "#3a3358";
    ctx.lineWidth = sel ? 2.5 : 1;
    roundRect(ctx, r.x, r.y, r.w, r.h, 8, true, true);
    ctx.textAlign = "center";
    ctx.fillStyle = "#c98fff";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText("🛠 エディットモード", cvs.width / 2, r.y + r.h / 2);
  }

  ctx.fillStyle = "#6b7694";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("クリックまたは ←→↑↓ + Enter で選択", cvs.width / 2, 530);
}

function roundRect(g, x, y, w, h, rad, fill, stroke) {
  g.beginPath();
  g.moveTo(x + rad, y);
  g.arcTo(x + w, y, x + w, y + h, rad);
  g.arcTo(x + w, y + h, x, y + h, rad);
  g.arcTo(x, y + h, x, y, rad);
  g.arcTo(x, y, x + w, y, rad);
  g.closePath();
  if (fill) g.fill();
  if (stroke) g.stroke();
}

// ---- リザルト系画面 ----
function drawCenterPanel(title, titleColor, lines) {
  drawPlay(); // 背景に最後の盤面
  ctx.fillStyle = "rgba(5,7,12,0.78)";
  ctx.fillRect(0, 0, cvs.width, cvs.height);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold 46px sans-serif";
  ctx.fillStyle = titleColor;
  ctx.fillText(title, cvs.width / 2, 190);
  ctx.font = "17px sans-serif";
  lines.forEach((ln, i) => {
    ctx.fillStyle = ln.color || "#dfe6f5";
    ctx.fillText(ln.text, cvs.width / 2, 260 + i * 34);
  });
}

function drawClear() {
  drawCenterPanel("STAGE " + (G.levelIndex + 1) + " CLEAR!", "#ffd23e", [
    { text: G.levelDef.name + " 制覇！", color: G.levelDef.theme.accent },
    { text: "SCORE " + G.score, color: "#fff" },
    { text: "残機ボーナス +1", color: "#7dff9a" },
    { text: "" },
    { text: "Enter / クリックで次のステージへ", color: "#8a93ad" },
  ]);
}

function drawGameover() {
  drawCenterPanel("GAME OVER", "#ff5f6d", [
    { text: "SCORE " + G.score, color: "#fff" },
    { text: "HI-SCORE " + getHiscore(), color: "#ffd23e" },
    { text: "" },
    { text: "Enter / クリックでタイトルへ", color: "#8a93ad" },
  ]);
}

function drawAllClear(dt) {
  drawCenterPanel("ALL CLEAR !!", "#7dff9a", [
    { text: "全 8 ステージを制覇した、伝説のランナーよ！", color: "#ffe066" },
    { text: "TOTAL SCORE " + G.score, color: "#fff" },
    { text: "HI-SCORE " + getHiscore(), color: "#ffd23e" },
    { text: "" },
    { text: "Enter / クリックでタイトルへ", color: "#8a93ad" },
  ]);
  // 紙吹雪
  if (Math.random() < 0.3) {
    G.particles.push({
      x: Math.random() * cvs.width, y: -10,
      vx: (Math.random() - 0.5) * 40, vy: 60 + Math.random() * 60,
      life: 3, t: 0,
      color: ["#ffd23e", "#7dff9a", "#4da3ff", "#ff5f6d", "#c98fff"][(Math.random() * 5) | 0],
    });
  }
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const pt = G.particles[i];
    pt.t += dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    if (pt.t > pt.life) { G.particles.splice(i, 1); continue; }
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x, pt.y, 5, 5);
  }
}

// ---- メインループ ----
let lastT = 0;
function frame(ts) {
  const dt = Math.min(1 / 30, (ts - lastT) / 1000 || 0);
  lastT = ts;

  switch (G.screen) {
    case "title": drawTitle(dt); break;
    case "play":
      updatePlay(dt);
      // updatePlay 内で screen が変わることがある
      if (G.screen === "play") drawPlay();
      break;
    case "clear": drawClear(); break;
    case "gameover": drawGameover(); break;
    case "allclear": drawAllClear(dt); break;
    case "editor": drawEditor(ts / 1000); break;
  }
  requestAnimationFrame(frame);
}

// ---- 起動 ----
edInit();
edAttachMouse();
edBindButtons();
requestAnimationFrame(frame);
