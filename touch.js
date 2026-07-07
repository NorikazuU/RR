// ============================================================
// touch.js — スマホ用バーチャルコントローラ
//   タッチ端末（hover:none + pointer:coarse）で、プレイ中のみ表示。
//   URL に #touch を付けるとデスクトップでも強制表示（デバッグ用）。
// ============================================================

(() => {
  const ui = document.getElementById("touchUI");
  if (!ui) return;

  // ---- タッチ端末判定 ----
  const coarse = window.matchMedia &&
    matchMedia("(hover: none) and (pointer: coarse)").matches;
  const forced = location.hash.indexOf("touch") >= 0;
  const markTouch = () => document.body.classList.add("touch");
  if (coarse || forced) markTouch();
  // 判定をすり抜けた端末でも、実際にタッチされたら表示に切り替える
  window.addEventListener("touchstart", markTouch, { once: true, passive: true });

  // ---- プレイ中のみ表示 ----
  (function sync() {
    document.body.classList.toggle("playing", G.screen === "play");
    requestAnimationFrame(sync);
  })();

  // ---- 十字パッド（スライドで方向切替、斜め入力対応） ----
  const pad = document.getElementById("tPad");
  let padId = null;
  const clearDirs = () => {
    Input.left = Input.right = Input.up = Input.down = false;
    pad.classList.remove("on");
  };
  const padUpdate = t => {
    const r = pad.getBoundingClientRect();
    const dx = t.clientX - (r.left + r.width / 2);
    const dy = t.clientY - (r.top + r.height / 2);
    const dead = r.width * 0.14;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    Input.left  = dx < -dead && ax > ay * 0.45;
    Input.right = dx >  dead && ax > ay * 0.45;
    Input.up    = dy < -dead && ay > ax * 0.45;
    Input.down  = dy >  dead && ay > ax * 0.45;
    pad.classList.toggle("on", Input.left || Input.right || Input.up || Input.down);
  };
  pad.addEventListener("touchstart", ev => {
    ev.preventDefault();
    audio();
    const t = ev.changedTouches[0];
    padId = t.identifier;
    padUpdate(t);
  }, { passive: false });
  pad.addEventListener("touchmove", ev => {
    ev.preventDefault();
    for (const t of ev.changedTouches) if (t.identifier === padId) padUpdate(t);
  }, { passive: false });
  const padEnd = ev => {
    for (const t of ev.changedTouches) if (t.identifier === padId) { padId = null; clearDirs(); }
  };
  pad.addEventListener("touchend", padEnd);
  pad.addEventListener("touchcancel", padEnd);

  // ---- 押している間だけ効くボタン（掘る） ----
  function holdButton(id, key) {
    const el = document.getElementById(id);
    el.addEventListener("touchstart", ev => {
      ev.preventDefault();
      audio();
      Input[key] = true;
      el.classList.add("on");
    }, { passive: false });
    const off = ev => { ev.preventDefault(); Input[key] = false; el.classList.remove("on"); };
    el.addEventListener("touchend", off);
    el.addEventListener("touchcancel", off);
  }
  holdButton("tDigL", "digL");
  holdButton("tDigR", "digR");

  // ---- 1タップで効くボタン ----
  function tapButton(id, fn) {
    const el = document.getElementById(id);
    el.addEventListener("touchstart", ev => { ev.preventDefault(); audio(); fn(); }, { passive: false });
    el.addEventListener("click", ev => { ev.preventDefault(); fn(); }); // マウス併用端末向け
  }
  tapButton("tRestart", () => { if (G.screen === "play") killPlayer(); });
  tapButton("tTitle", () => {
    if (G.screen !== "play") return;
    if (G.custom) { enterEditor(); edMsg("テストプレイを中断しました"); }
    else toTitle();
  });

  // ---- エディタをタッチで描けるように ----
  const cvsEl = document.getElementById("game");
  const edTouch = ev => {
    if (G.screen !== "editor") return; // タイトル等ではタップ→click 合成を邪魔しない
    ev.preventDefault();
    const t = ev.changedTouches[0];
    const cell = edCellFromEvent({ clientX: t.clientX, clientY: t.clientY });
    if (!cell) return;
    ED.hoverC = cell.c; ED.hoverR = cell.r;
    edPaint(cell.c, cell.r, false);
  };
  cvsEl.addEventListener("touchstart", edTouch, { passive: false });
  cvsEl.addEventListener("touchmove", edTouch, { passive: false });
})();
