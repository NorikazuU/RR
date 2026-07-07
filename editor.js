// ============================================================
// editor.js — ステージエディタ
// ============================================================

const EDITOR_THEME = LEVELS[0].theme;

const ED = {
  map: [],            // ROWS 個の文字配列（各 COLS 文字の配列）
  tool: "#",
  painting: 0,        // 0:なし 1:描画 2:消去
  hoverC: -1, hoverR: -1,
  name: "カスタムステージ",
  fromTest: false,
};

const PALETTE = [
  { ch: ".", label: "消しゴム" },
  { ch: "#", label: "レンガ（掘れる）" },
  { ch: "X", label: "岩盤（掘れない）" },
  { ch: "H", label: "ハシゴ" },
  { ch: "-", label: "バー（ロープ）" },
  { ch: "$", label: "金塊" },
  { ch: "%", label: "金塊＋バー" },
  { ch: "T", label: "落とし穴レンガ" },
  { ch: "S", label: "隠しハシゴ（出口）" },
  { ch: "P", label: "プレイヤー開始位置" },
  { ch: "E", label: "敵" },
  { ch: "e", label: "敵＋バー" },
];

function edInit() {
  ED.map = [];
  for (let r = 0; r < ROWS; r++) {
    ED.map.push(Array(COLS).fill(r === ROWS - 1 ? "X" : "."));
  }
  ED.map[ROWS - 2][2] = "P";
}

function edBuildPalette() {
  const pal = document.getElementById("palette");
  pal.innerHTML = "";
  for (const item of PALETTE) {
    const btn = document.createElement("button");
    btn.className = "palBtn" + (item.ch === ED.tool ? " sel" : "");
    btn.title = item.label;
    const c = document.createElement("canvas");
    c.width = 32; c.height = 32;
    drawEdCell(c.getContext("2d"), item.ch, 0, 0, 0);
    btn.appendChild(c);
    btn.onclick = () => {
      ED.tool = item.ch;
      edBuildPalette();
      edMsg("選択: " + item.label);
    };
    pal.appendChild(btn);
  }
}

function edMsg(s) {
  document.getElementById("edMsg").textContent = s;
}

// エディタ用セル描画（記号 1 文字 → 見た目）
function drawEdCell(g, ch, x, y, time) {
  const th = EDITOR_THEME;
  switch (ch) {
    case "#": drawTileGfx(g, T_BRICK, x, y, th, time); break;
    case "X": drawTileGfx(g, T_SOLID, x, y, th, time); break;
    case "H": drawTileGfx(g, T_LADDER, x, y, th, time); break;
    case "-": drawTileGfx(g, T_BAR, x, y, th, time); break;
    case "T":
      drawTileGfx(g, T_BRICK, x, y, th, time);
      g.fillStyle = "#ff5f6d";
      g.beginPath();
      g.moveTo(x + 26, y + 2); g.lineTo(x + 30, y + 2); g.lineTo(x + 30, y + 6);
      g.closePath(); g.fill();
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.fillRect(x + 6, y + 14, 20, 3);
      break;
    case "S":
      g.save(); g.globalAlpha = 0.45;
      drawTileGfx(g, T_LADDER, x, y, th, time);
      g.restore();
      g.fillStyle = "#7dff9a"; g.font = "10px monospace";
      g.fillText("EXIT", x + 3, y + 30);
      break;
    case "$": drawGold(g, x, y, th, time); break;
    case "%":
      drawTileGfx(g, T_BAR, x, y, th, time);
      drawGold(g, x, y, th, time);
      break;
    case "P": {
      const dummy = { x: x, y: y, dir: 1, prog: 1, falling: false, climbing: false, onBar: false, animT: 0, isPlayer: true, digT: 0, carry: false };
      drawRunner(g, dummy, "#4da3ff", "#f5c9a0", 0);
      break;
    }
    case "E": {
      const dummy = { x: x, y: y, dir: -1, prog: 1, falling: false, climbing: false, onBar: false, animT: 0, isPlayer: false, digT: 0, carry: false };
      drawRunner(g, dummy, "#d94f6a", "#e8b48f", 0);
      break;
    }
    case "e": {
      drawTileGfx(g, T_BAR, x, y, th, time);
      const dummy = { x: x, y: y, dir: -1, prog: 1, falling: false, climbing: false, onBar: true, animT: 0, isPlayer: false, digT: 0, carry: false };
      drawRunner(g, dummy, "#d94f6a", "#e8b48f", 0);
      break;
    }
  }
}

// ---- エディタ描画 ----
function drawEditor(time) {
  const th = EDITOR_THEME;
  const bg = ctx.createLinearGradient(0, 0, 0, cvs.height);
  bg.addColorStop(0, "#171c2e"); bg.addColorStop(1, "#0b0d16");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cvs.width, cvs.height);

  // ヘッダ
  ctx.fillStyle = "#0a0c14";
  ctx.fillRect(0, 0, cvs.width, HUD_H);
  ctx.fillStyle = "#ffd23e";
  ctx.font = "bold 17px sans-serif";
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText("EDIT MODE — " + ED.name, 14, HUD_H / 2);
  ctx.fillStyle = "#8a93ad";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("左ドラッグ: 配置 ／ 右ドラッグ: 消去", cvs.width - 14, HUD_H / 2);

  ctx.save();
  ctx.translate(0, HUD_H);

  // グリッド線
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c * TILE + 0.5, 0); ctx.lineTo(c * TILE + 0.5, ROWS * TILE); ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * TILE + 0.5); ctx.lineTo(COLS * TILE, r * TILE + 0.5); ctx.stroke();
  }

  // セル
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const ch = ED.map[r][c];
      if (ch !== ".") drawEdCell(ctx, ch, c * TILE, r * TILE, time);
    }

  // ホバー表示
  if (ED.hoverC >= 0) {
    ctx.strokeStyle = "#ffd23e";
    ctx.lineWidth = 2;
    ctx.strokeRect(ED.hoverC * TILE + 1, ED.hoverR * TILE + 1, TILE - 2, TILE - 2);
    ctx.save();
    ctx.globalAlpha = 0.5;
    drawEdCell(ctx, ED.tool, ED.hoverC * TILE, ED.hoverR * TILE, time);
    ctx.restore();
  }
  ctx.restore();
}

// ---- マウス操作 ----
function edCellFromEvent(ev) {
  const rect = cvs.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (cvs.width / rect.width);
  const y = (ev.clientY - rect.top) * (cvs.height / rect.height) - HUD_H;
  const c = Math.floor(x / TILE), r = Math.floor(y / TILE);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
  return { c, r };
}

function edPaint(c, r, erase) {
  const ch = erase ? "." : ED.tool;
  if (ch === "P") {
    // P は 1 つだけ
    for (let rr = 0; rr < ROWS; rr++)
      for (let cc = 0; cc < COLS; cc++)
        if (ED.map[rr][cc] === "P") ED.map[rr][cc] = ".";
  }
  ED.map[r][c] = ch;
}

function edAttachMouse() {
  cvs.addEventListener("mousedown", ev => {
    if (G.screen !== "editor") return;
    ev.preventDefault();
    const cell = edCellFromEvent(ev);
    if (!cell) return;
    ED.painting = ev.button === 2 ? 2 : 1;
    edPaint(cell.c, cell.r, ED.painting === 2);
  });
  cvs.addEventListener("mousemove", ev => {
    if (G.screen !== "editor") return;
    const cell = edCellFromEvent(ev);
    if (!cell) { ED.hoverC = -1; return; }
    ED.hoverC = cell.c; ED.hoverR = cell.r;
    if (ED.painting) edPaint(cell.c, cell.r, ED.painting === 2);
  });
  window.addEventListener("mouseup", () => { ED.painting = 0; });
  cvs.addEventListener("mouseleave", () => { ED.hoverC = -1; ED.painting = 0; });
  cvs.addEventListener("contextmenu", ev => { if (G.screen === "editor") ev.preventDefault(); });
}

// ---- 検証・変換 ----
function edToDef() {
  const map = ED.map.map(row => row.join(""));
  return { name: ED.name, hint: "", enemySpeed: 0.9, theme: EDITOR_THEME, map };
}
function edValidate() {
  const flat = ED.map.flat().join("");
  const p = (flat.match(/P/g) || []).length;
  const g = (flat.match(/[$%]/g) || []).length;
  if (p !== 1) return "プレイヤー開始位置(P)を 1 つ置いてください";
  if (g < 1) return "金塊($)を 1 つ以上置いてください";
  return null;
}

// ---- 保存/読込/入出力 ----
const LS_CUSTOM = "caverunner.custom";

function edSavedList() {
  try { return JSON.parse(localStorage.getItem(LS_CUSTOM) || "[]"); }
  catch (e) { return []; }
}
function edSave() {
  const name = prompt("ステージ名を入力:", ED.name);
  if (!name) return;
  ED.name = name;
  const list = edSavedList().filter(s => s.name !== name);
  list.push({ name, map: ED.map.map(r => r.join("")) });
  localStorage.setItem(LS_CUSTOM, JSON.stringify(list));
  edMsg("保存しました: " + name);
}
function edLoad() {
  const list = edSavedList();
  if (!list.length) { edMsg("保存されたステージがありません"); return; }
  const names = list.map((s, i) => (i + 1) + ": " + s.name).join("\n");
  const sel = prompt("読み込むステージ番号を入力:\n" + names);
  if (!sel) return;
  const item = list[parseInt(sel, 10) - 1];
  if (!item) { edMsg("番号が正しくありません"); return; }
  ED.name = item.name;
  ED.map = item.map.map(row => row.padEnd(COLS, ".").slice(0, COLS).split(""));
  while (ED.map.length < ROWS) ED.map.push(Array(COLS).fill("."));
  edMsg("読み込みました: " + item.name);
}

function edShowIO(text, writable) {
  const modal = document.getElementById("ioModal");
  const ta = document.getElementById("ioText");
  modal.classList.remove("hidden");
  ta.value = text;
  ta.readOnly = false;
  document.getElementById("btnIoApply").style.display = writable ? "" : "none";
}
function edExport() {
  edShowIO(JSON.stringify({ name: ED.name, map: ED.map.map(r => r.join("")) }, null, 1), false);
  edMsg("テキストをコピーして保存できます");
}
function edImportOpen() {
  edShowIO("", true);
  document.getElementById("ioText").placeholder = '{"name":"...","map":["...28文字×16行..."]}';
  edMsg("エクスポートしたJSONを貼り付けて「読み込む」を押してください");
}
function edImportApply() {
  try {
    const data = JSON.parse(document.getElementById("ioText").value);
    if (!Array.isArray(data.map)) throw new Error("map がありません");
    ED.name = String(data.name || "インポート");
    ED.map = [];
    for (let r = 0; r < ROWS; r++) {
      ED.map.push(String(data.map[r] || "").padEnd(COLS, ".").slice(0, COLS).split(""));
    }
    document.getElementById("ioModal").classList.add("hidden");
    edMsg("インポートしました: " + ED.name);
  } catch (e) {
    edMsg("読み込みエラー: " + e.message);
  }
}

// ---- 画面切替 ----
function enterEditor() {
  if (!ED.map.length) edInit();
  G.screen = "editor";
  document.getElementById("editorBar").classList.remove("hidden");
  edBuildPalette();
  edMsg("パレットからタイルを選んでキャンバスに描いてください");
}
function leaveEditorUI() {
  document.getElementById("editorBar").classList.add("hidden");
  document.getElementById("ioModal").classList.add("hidden");
}

function edTestPlay() {
  const err = edValidate();
  if (err) { edMsg("⚠ " + err); return; }
  leaveEditorUI();
  G.score = 0; G.lives = 3;
  loadLevel(edToDef(), -1, true);
  G.screen = "play";
}

function edBindButtons() {
  document.getElementById("btnTest").onclick = edTestPlay;
  document.getElementById("btnEdSave").onclick = edSave;
  document.getElementById("btnEdLoad").onclick = edLoad;
  document.getElementById("btnEdClear").onclick = () => {
    if (confirm("すべて消去しますか？")) { edInit(); edMsg("初期化しました"); }
  };
  document.getElementById("btnEdExport").onclick = edExport;
  document.getElementById("btnEdImport").onclick = edImportOpen;
  document.getElementById("btnEdExit").onclick = () => { leaveEditorUI(); G.screen = "title"; };
  document.getElementById("btnIoApply").onclick = edImportApply;
  document.getElementById("btnIoClose").onclick = () => document.getElementById("ioModal").classList.add("hidden");
  document.getElementById("btnIoCopy").onclick = () => {
    const ta = document.getElementById("ioText");
    ta.select(); document.execCommand("copy");
    edMsg("コピーしました");
  };
}
