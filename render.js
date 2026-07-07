// ============================================================
// render.js — 描画（タイル・スプライト・HUD）
// ============================================================

const cvs = document.getElementById("game");
const ctx = cvs.getContext("2d");

// ---- タイル描画（ゲーム/エディタ共用） ----
function drawTileGfx(g, t, x, y, th, time) {
  switch (t) {
    case T_BRICK:
    case T_TRAP: {
      g.fillStyle = th.brick;
      g.fillRect(x, y, TILE, TILE);
      g.fillStyle = th.brickDark;
      g.fillRect(x, y + TILE - 5, TILE, 5);
      g.fillStyle = th.mortar;
      g.fillRect(x, y + 9, TILE, 2);
      g.fillRect(x, y + 21, TILE, 2);
      g.fillRect(x + 15, y, 2, 9);
      g.fillRect(x + 7, y + 11, 2, 10);
      g.fillRect(x + 23, y + 11, 2, 10);
      g.fillRect(x + 15, y + 23, 2, 9);
      // ハイライト
      g.fillStyle = "rgba(255,255,255,0.13)";
      g.fillRect(x, y, TILE, 2);
      break;
    }
    case T_SOLID: {
      g.fillStyle = th.solid;
      g.fillRect(x, y, TILE, TILE);
      g.fillStyle = th.solidDark;
      g.fillRect(x, y + TILE - 6, TILE, 6);
      g.fillRect(x + TILE - 6, y, 6, TILE);
      g.fillStyle = "rgba(255,255,255,0.15)";
      g.fillRect(x, y, TILE, 3);
      g.fillRect(x, y, 3, TILE);
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.fillRect(x + 8, y + 10, 6, 4);
      g.fillRect(x + 18, y + 20, 6, 4);
      break;
    }
    case T_LADDER: {
      g.fillStyle = th.ladder;
      g.fillRect(x + 5, y, 4, TILE);
      g.fillRect(x + TILE - 9, y, 4, TILE);
      for (let i = 0; i < 3; i++) g.fillRect(x + 5, y + 4 + i * 11, TILE - 10, 3);
      break;
    }
    case T_BAR: {
      g.fillStyle = th.bar;
      g.fillRect(x, y + 3, TILE, 3);
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.fillRect(x, y + 5, TILE, 1);
      break;
    }
  }
}

function drawGold(g, x, y, th, time) {
  const bob = Math.sin(time * 3 + (x + y) * 0.05) * 1.5;
  const cx2 = x + TILE / 2, cy2 = y + TILE / 2 + 6 + bob;
  g.fillStyle = th.gold;
  g.beginPath();
  g.moveTo(cx2 - 9, cy2 + 5); g.lineTo(cx2 - 5, cy2 - 4); g.lineTo(cx2 + 5, cy2 - 4);
  g.lineTo(cx2 + 9, cy2 + 5); g.closePath(); g.fill();
  g.fillStyle = "rgba(255,255,255,0.7)";
  g.fillRect(cx2 - 4, cy2 - 2, 3, 2);
  // キラッ
  const tw = (time * 2 + x * 0.3 + y) % 3;
  if (tw < 0.25) {
    g.fillStyle = "#fff";
    g.fillRect(cx2 + 4, cy2 - 6, 2, 6);
    g.fillRect(cx2 + 2, cy2 - 4, 6, 2);
  }
}

// ---- ランナー/敵スプライト ----
function drawRunner(g, e, body, skin, time) {
  const x = e.x, y = e.y;
  const cx2 = x + 16;
  g.save();
  g.translate(cx2, y);
  if (e.dir < 0) g.scale(-1, 1);

  const run = e.prog < 1 && !e.falling && !e.climbing && !e.onBar;
  const ph = Math.sin(e.animT * 16);
  const legSwing = run ? ph * 5 : 0;

  g.fillStyle = body;
  if (e.isPlayer && e.digT > 0) {
    // 掘削ポーズ
    g.fillRect(-5, 8, 10, 14);                 // 胴
    g.fillRect(3, 10, 11, 4);                  // 腕（前へ）
    g.fillRect(-8, 22, 6, 9); g.fillRect(2, 22, 6, 9); // 脚
    g.fillStyle = skin; g.beginPath(); g.arc(0, 5, 6, 0, 7); g.fill();
  } else if (e.falling) {
    g.fillRect(-5, 8, 10, 14);
    g.fillRect(-13, 4, 5, 12); g.fillRect(8, 4, 5, 12);  // 万歳
    g.fillRect(-7, 22, 5, 9); g.fillRect(2, 22, 5, 9);
    g.fillStyle = skin; g.beginPath(); g.arc(0, 5, 6, 0, 7); g.fill();
  } else if (e.onBar) {
    // ぶら下がり
    const sw = Math.sin(e.animT * 10) * 3;
    g.fillRect(-4, 10, 8, 13);
    g.fillRect(-7, 4, 4, 8); g.fillRect(3, 4, 4, 8);     // 上へ伸ばした腕
    g.fillRect(-6 + sw, 23, 5, 8); g.fillRect(2 + sw, 23, 5, 8);
    g.fillStyle = skin; g.beginPath(); g.arc(0, 12, 5, 0, 7); g.fill();
    g.fillStyle = body;
  } else if (e.climbing) {
    const cl = Math.sin(e.animT * 12) * 4;
    g.fillRect(-5, 8, 10, 14);
    g.fillRect(-9, 4 + cl, 4, 10); g.fillRect(5, 4 - cl, 4, 10);
    g.fillRect(-6, 22, 5, 9 - cl * 0.5); g.fillRect(1, 22, 5, 9 + cl * 0.5);
    g.fillStyle = skin; g.beginPath(); g.arc(0, 5, 6, 0, 7); g.fill();
  } else {
    // 立ち/走り
    g.fillRect(-5, 8, 10, 14);
    g.fillRect(2, 10, 8, 4);
    g.fillRect(-7 - legSwing * 0.5, 22, 5, 9); g.fillRect(2 + legSwing * 0.5, 22, 5, 9);
    g.fillStyle = skin; g.beginPath(); g.arc(0, 5, 6, 0, 7); g.fill();
  }
  // 目
  g.fillStyle = "#101018";
  g.fillRect(2, e.onBar ? 10 : 3, 2, 3);
  g.restore();

  // 金塊を運んでいる敵
  if (e.carry) {
    g.fillStyle = "#ffd23e";
    g.fillRect(e.x + 10, e.y - 6, 12, 7);
    g.fillStyle = "rgba(255,255,255,0.6)";
    g.fillRect(e.x + 12, e.y - 5, 3, 2);
  }
}

// ---- プレイ画面描画 ----
function drawPlay() {
  const th = G.levelDef.theme;
  const time = G.time;

  ctx.save();
  if (G.shake > 0) ctx.translate((Math.random() - 0.5) * 8 * G.shake, (Math.random() - 0.5) * 8 * G.shake);

  // 背景
  const bg = ctx.createLinearGradient(0, HUD_H, 0, cvs.height);
  bg.addColorStop(0, th.sky1); bg.addColorStop(1, th.sky2);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cvs.width, cvs.height);

  ctx.save();
  ctx.translate(0, HUD_H);

  // タイル
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = G.grid[r][c];
      const x = c * TILE, y = r * TILE;
      if (t === T_HLADDER) {
        if (G.exitOpen) {
          // 出現アニメ: きらめくハシゴ
          ctx.save();
          ctx.globalAlpha = 0.75 + Math.sin(time * 6 + r) * 0.25;
          drawTileGfx(ctx, T_LADDER, x, y, th, time);
          ctx.restore();
        }
        continue;
      }
      if (t !== T_EMPTY) drawTileGfx(ctx, t, x, y, th, time);
      if (G.gold[r][c]) drawGold(ctx, x, y, th, time);
    }
  }

  // 塞がりかけの穴
  for (const h of G.holes) {
    const x = h.c * TILE, y = h.r * TILE;
    if (h.t > HOLE_OPEN_TIME) {
      const k = Math.min(1, (h.t - HOLE_OPEN_TIME) / HOLE_CLOSE_TIME);
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y + TILE * (1 - k), TILE, TILE * k); ctx.clip();
      drawTileGfx(ctx, T_BRICK, x, y, th, time);
      ctx.restore();
    } else if (h.t > HOLE_OPEN_TIME - 1.2) {
      // 点滅警告
      if (Math.floor(time * 8) % 2 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(x, y, TILE, TILE);
      }
    }
    // 穴の縁
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(x, y, TILE, 4);
  }

  // 敵
  for (const e of G.enemies) {
    if (!e.alive) continue;
    ctx.save();
    if (e.trapped) { ctx.globalAlpha = 0.9; }
    drawRunner(ctx, e, "#d94f6a", "#e8b48f", time);
    ctx.restore();
  }

  // プレイヤー（死亡中は点滅で消える）
  if (G.deadTimer <= 0 || Math.floor(G.deadTimer * 12) % 2 === 0) {
    if (G.deadTimer <= 0) drawRunner(ctx, G.player, "#4da3ff", "#f5c9a0", time);
  }

  // パーティクル
  for (const pt of G.particles) {
    ctx.globalAlpha = 1 - pt.t / pt.life;
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  ctx.restore(); // translate HUD

  drawHUD(th);

  // ステージ開始メッセージ
  if (G.msgTimer > 0 && G.msg) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, G.msgTimer);
    ctx.font = "15px sans-serif";
    ctx.fillStyle = "rgba(8,10,18,0.82)";
    const w = Math.min(860, ctx.measureText(G.msg).width + 48);
    ctx.fillRect(cvs.width / 2 - w / 2, 64, w, 44);
    ctx.strokeStyle = th.accent; ctx.lineWidth = 1;
    ctx.strokeRect(cvs.width / 2 - w / 2, 64, w, 44);
    ctx.fillStyle = "#f0f4ff";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(G.msg, cvs.width / 2, 86);
    ctx.restore();
  }

  // クリア演出
  if (G.clearTimer > 0) {
    ctx.fillStyle = "rgba(255,255,255," + Math.max(0, 0.6 - G.clearTimer * 0.4) + ")";
    ctx.fillRect(0, 0, cvs.width, cvs.height);
    ctx.fillStyle = "#ffd23e";
    ctx.font = "bold 42px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("STAGE CLEAR!", cvs.width / 2, cvs.height / 2 - 20);
  }
  ctx.restore(); // shake
}

function drawHUD(th) {
  ctx.fillStyle = "#0a0c14";
  ctx.fillRect(0, 0, cvs.width, HUD_H);
  ctx.fillStyle = "#1c2338";
  ctx.fillRect(0, HUD_H - 2, cvs.width, 2);

  ctx.textBaseline = "middle";
  // ステージ名
  ctx.textAlign = "left";
  ctx.fillStyle = th.accent;
  ctx.font = "bold 17px sans-serif";
  const label = G.custom ? "EDIT: " + (G.levelDef.name || "カスタム") : "STAGE " + (G.levelIndex + 1) + "  " + G.levelDef.name;
  ctx.fillText(label, 14, HUD_H / 2);

  // スコア
  ctx.textAlign = "center";
  ctx.fillStyle = "#f0f4ff";
  ctx.font = "bold 16px monospace";
  ctx.fillText("SCORE " + String(G.score).padStart(6, "0"), cvs.width / 2 - 40, HUD_H / 2);

  // 残り金塊
  drawGoldIcon(cvs.width / 2 + 108, HUD_H / 2);
  ctx.textAlign = "left";
  ctx.fillStyle = G.goldLeft === 0 ? "#7dff9a" : "#ffd23e";
  ctx.fillText("× " + G.goldLeft, cvs.width / 2 + 124, HUD_H / 2);

  // 残機
  ctx.textAlign = "right";
  ctx.fillStyle = "#4da3ff";
  ctx.font = "bold 16px monospace";
  ctx.fillText("♥ × " + Math.max(0, G.lives), cvs.width - 16, HUD_H / 2);
}

function drawGoldIcon(x, y) {
  ctx.fillStyle = "#ffd23e";
  ctx.beginPath();
  ctx.moveTo(x - 8, y + 5); ctx.lineTo(x - 4, y - 4); ctx.lineTo(x + 4, y - 4);
  ctx.lineTo(x + 8, y + 5); ctx.closePath(); ctx.fill();
}
