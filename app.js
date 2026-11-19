/* 焚き火くべ — 片手で薪をくべるだけ。通信・課金・広告なし、記録は localStorage のみ。 */
(() => {
  'use strict';

  // ================= 小道具 =================
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const $ = (id) => document.getElementById(id);
  const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  // 時間で進むものは、この時計の「時刻の差」から計算する。端末の時計がずれても壊れないよう、差は 0〜30日に丸める
  let clockSkew = 0; // ?debug の takibi.skip(分) で進められる
  const now = () => Date.now() + clockSkew;
  const span = (from, to) => clamp((to - from) / 1000, 0, 30 * 86400);
  const drop = (c) => { if (c) c.width = c.height = 0; }; // 使い終えたキャンバスのメモリをすぐ手放す（iOS は上限が厳しい）
  function seeded(s) {
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ================= データ定義 =================
  const PAL = {
    fire:   { core: [255, 236, 170], edge: [255, 96, 20],  glow: [255, 120, 30] },
    blue:   { core: [210, 240, 255], edge: [40, 110, 255], glow: [60, 130, 255] },
    green:  { core: [225, 255, 210], edge: [30, 200, 90],  glow: [50, 210, 110] },
    purple: { core: [245, 225, 255], edge: [150, 60, 255], glow: [165, 85, 255] },
    pink:   { core: [255, 235, 242], edge: [255, 90, 150], glow: [255, 115, 170] },
    red:    { core: [255, 225, 210], edge: [255, 45, 45],  glow: [255, 70, 60] },
    yellow: { core: [255, 255, 225], edge: [255, 205, 40], glow: [255, 215, 70] },
  };
  const RAINBOW = ['red', 'fire', 'yellow', 'green', 'blue', 'purple'];
  const FWC = [[255, 214, 130], [255, 96, 84], [120, 255, 160], [120, 180, 255], [206, 146, 255], [255, 150, 205], [255, 255, 236]];
  const GOLD = [255, 200, 110];

  // on:'log' = 薪をくべた瞬間に抽選 / on:'amb' = 火が燃えている間、10秒ごとに抽選
  const RARES = [
    { id: 'blue',    name: '青い炎',     star: 1, glyph: '炎', orb: ['#e2f4ff', '#3d8bff', '#142ac4'], on: 'log', p: 0.005,
      desc: '炎がすうっと青く澄む。', hint: '薪をくべていると、まれに炎の色が変わる。' },
    { id: 'green',   name: '翠の炎',     star: 1, glyph: '炎', orb: ['#e8ffdc', '#2fcf68', '#0a6a34'], on: 'log', p: 0.004,
      desc: '森の色をうつしたような翠（みどり）の炎。', hint: '薪をくべていると、まれに炎の色が変わる。' },
    { id: 'purple',  name: '紫の炎',     star: 2, glyph: '炎', orb: ['#f6e6ff', '#9a4dff', '#4a12a8'], on: 'log', p: 0.002,
      desc: '夜の底のような、深い紫の炎。', hint: '薪をくべていると、まれに炎の色が変わる。' },
    { id: 'pink',    name: '桜色の炎',   star: 2, glyph: '炎', orb: ['#fff0f5', '#ff6aa2', '#c02a6a'], on: 'log', p: 0.0015,
      desc: '季節はずれの花が咲いたような炎。', hint: '薪をくべていると、まれに炎の色が変わる。' },
    { id: 'rainbow', name: '虹色の炎',   star: 3, glyph: '炎', orb: null, on: 'log', p: 0.0003,
      desc: '七つの色がゆらめく、めったに見られない炎。', hint: '薪をくべていると、ごくまれに…。' },
    { id: 'hanabi',  name: '火の粉花火', star: 1, glyph: '花', orb: ['#fff3c8', '#ffb23c', '#a3421a'], on: 'log', p: 0.004,
      desc: '舞い上がった火の粉が、空で小さな花火になる。', hint: '薪をくべたとき、火の粉が高く舞い上がると…。' },
    { id: 'tairin',  name: '大輪の花火', star: 3, glyph: '花', orb: ['#fff6da', '#ff5d7a', '#5a2ad0'], on: 'log', p: 0.0005, minFuel: 65,
      desc: '空いっぱいに咲く大輪と、しだれる金の火。', hint: '大きく育てた火に薪をくべ続けると、ごくまれに…。' },
    { id: 'star',    name: '流れ星',     star: 1, glyph: '星', orb: ['#ffffff', '#8fb4ff', '#16224e'], on: 'amb', p: 0.03, sky: 'night',
      desc: '夜空をすっと横切る、ひとすじの光。', hint: '夜、火を絶やさずにいると…。' },
    { id: 'meteor',  name: '流星群',     star: 3, glyph: '星', orb: ['#ffffff', '#b9a4ff', '#1b1450'], on: 'amb', p: 0.0015, sky: 'night',
      desc: '数えきれない星が降る夜。', hint: '夜、気長に火を守っていると、ごくまれに…。' },
    { id: 'niji',    name: '朝の虹',     star: 2, glyph: '虹', orb: null, on: 'amb', p: 0.01, sky: 'day',
      desc: '朝の空にかかる、大きな虹。', hint: '朝、火を絶やさずにいると…。' },
    { id: 'hinoko',  name: '火の精霊',   star: 2, glyph: '霊', orb: ['#fff7cf', '#ffae3c', '#d2440e'], on: 'amb', p: 0.01, minFuel: 40,
      desc: '炎から飛び出した小さな精霊。ひとしきり跳ねて、火に帰っていく。', hint: 'しっかり育った焚き火のそばに、まれに…。' },
    { id: 'tsuyu',   name: '朝露の精霊', star: 3, glyph: '霊', orb: ['#ffffff', '#a8e0ff', '#3a8ad0'], on: 'amb', p: 0.003, sky: 'day', minFuel: 20,
      desc: '朝露から生まれた精霊が、火にあたりにやって来る。', hint: '朝、火を育てていると、ごくまれに…。' },
  ];
  const RMAP = Object.fromEntries(RARES.map((r) => [r.id, r]));
  const FLAME_IDS = ['blue', 'green', 'purple', 'pink', 'rainbow'];
  for (const [kind, ids] of Object.entries({ flame: FLAME_IDS, fw: ['hanabi', 'tairin'], sky: ['star', 'meteor'], niji: ['niji'], spirit: ['hinoko', 'tsuyu'] })) {
    for (const id of ids) RMAP[id].kind = kind;
  }
  function addRare(r) { RARES.push(r); RMAP[r.id] = r; }
  const starStr = (r) => r.stars || '★'.repeat(r.star);
  // あとから足す機能が差し込む口（更新・描画の各段階、薪を投げた/落ちた、図鑑に新しく載った、起動時）
  const HOOKS = { update: [], sec: [], sky: [], ground: [], front: [], top: [], thrown: [], land: [], found: [], resize: [], boot: [], back: [] };
  const run = (name, a, b) => { for (const fn of HOOKS[name]) fn(a, b); };
  const TRIG = {}, BUSY = {}, FX = {}, TAP_GUARD = [], BURN_MUL = [], RARE_MUL = [];
  const opened = (k) => !S.open || S.open[k] !== false; // 少しずつひらく（まだひらいていない機能はボタンを見せない）
  const SET_END = [], PREP = [], HOWTO = [], NEWS = [];
  const BOOK_PAGES = [], SET_ROWS = [], SET_TOP = [], STATS = [], REC_ROWS = [], AWAY_LINES = [];
  let secAcc = 0;
  HOOKS.update.push((dt, real) => { secAcc += real; if (secAcc >= 1) { secAcc = Math.min(1, secAcc - 1); run('sec'); } }); // 1秒に1回でよい処理はここに集める
  const STAGES = [[90, '天を焦がす炎'], [65, '大きな焚き火'], [40, '焚き火'], [20, '小さな火'], [5, '種火'], [0, '熾火']];
  const stageOf = (f) => STAGES.find((s) => f >= s[0])[1];

  // ================= 保存 =================
  const KEY = 'takibi-kube.v1';
  const DEBUG = /[?&]debug\b/.test(location.search);
  const fresh = () => ({
    v: 1, fuel: 0, lastSeen: Date.now(), firstDay: Date.now(), totalLogs: 0, burnSec: 0,
    col: {}, log: [], unseen: false, set: { sound: false, vib: true, sky: 'auto' },
  });
  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!s || typeof s !== 'object') return fresh();
      const d = fresh();
      return { ...d, ...s, col: s.col || {}, log: Array.isArray(s.log) ? s.log : [], set: { ...d.set, ...(s.set || {}) } };
    } catch (e) { return fresh(); }
  }
  let S = loadState();
  // 新機能の保存項目。古いセーブデータには無いので、足りないときだけ初期値で補う（既存の値には触れない）
  const DEFS = [];
  function fillDefs(s) { for (const [k, make, inSet] of DEFS) { const o = inSet ? s.set : s; if (o[k] === undefined) o[k] = make(); } return s; }
  function applyDefs() { fillDefs(S); }
  function def(key, make, inSet) { DEFS.push([key, make, inSet]); applyDefs(); }
  let dirty = false, saveT = 0;
  let noSave = false, saveFailTold = false;
  function save() {
    if (noSave) return; // 読み込み直前など、いまの状態で上書きしてはいけないとき
    try { S.lastSeen = Date.now(); localStorage.setItem(KEY, JSON.stringify(S)); dirty = false; } catch (e) {
      if (saveFailTold) return; // 保存できなくても遊べる。最初の1回だけ知らせる
      saveFailTold = true;
      setTimeout(() => showNote('記録について', ['この端末では、いま記録を保存できません（プライベートブラウズなど）。', '遊ぶことはできます。'], { ms: 14000 }), 900);
    }
  }

  // 燃焼: df/dt = -(A + B f)。離れていた時間ぶんも同じ式で減らす（熾火は消えない）
  const BURN_A = 0.35, BURN_B = 0.01, LOG_FUEL = 9;
  let awayK = 1; // 離れたときの熾で決まる、火持ちの倍率（熾が多いほど、留守の間も薪がゆっくり減る）
  function decayAway(sec) {
    awayK = 1 - 0.35 * clamp((S.ember || 0) / 100, 0, 1);
    if (S.fuel <= 0 || sec <= 0) return;
    S.fuel = Math.max(0, (S.fuel + BURN_A / BURN_B) * Math.exp(-BURN_B * sec * awayK) - BURN_A / BURN_B);
  }
  const burnTimeAway = (sec, f0) => (f0 < 5 ? 0 : Math.min(sec, Math.log((f0 + BURN_A / BURN_B) / (5 + BURN_A / BURN_B)) / BURN_B / awayK)); // 種火以上で燃えていた時間
  const awaySec = span(S.lastSeen, Date.now()), awayFuel0 = S.fuel;
  decayAway(awaySec);

  // ================= 音（WebAudioで合成。素材ファイルなし） =================
  const Sound = (() => {
    let ctx = null, master, bedG, hissG, white, brown, on = false, factor = 1, fireVol = 1, dead = false;
    const builders = [];
    function build() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
      const n = ctx.sampleRate * 3, F = 4096;
      white = ctx.createBuffer(1, n, ctx.sampleRate);
      brown = ctx.createBuffer(1, n, ctx.sampleRate);
      const w = white.getChannelData(0), b = brown.getChannelData(0), gen = new Float32Array(n + F);
      let last = 0;
      for (let i = 0; i < n + F; i++) {
        const v = Math.random() * 2 - 1;
        if (i < n) w[i] = v;
        last = (last + 0.02 * v) / 1.02; gen[i] = last * 3.5;
      }
      for (let i = 0; i < n; i++) b[i] = i < F ? gen[i] * (i / F) + gen[n + i] * (1 - i / F) : gen[i]; // ループの継ぎ目を消す
      const loop = (buf, type, f, q) => {
        const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
        const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q;
        const gn = ctx.createGain(); gn.gain.value = 0;
        s.connect(fl); fl.connect(gn); gn.connect(master); s.start();
        return gn;
      };
      bedG = loop(brown, 'lowpass', 420);
      hissG = loop(white, 'bandpass', 2600, 0.5);
      for (const fn of builders) fn(ctx, master, { white, brown, loop });
      return true;
    }
    const quiet = (pr) => { if (pr && pr.catch) pr.catch(() => {}); };
    const live = () => on && !dead && ctx && ctx.state === 'running';
    function set(v) {
      on = v;
      if (dead) return;
      if (v) {
        if (!ctx && !build()) return;
        if (ctx.state !== 'running') quiet(ctx.resume());
        master.gain.setTargetAtTime(0.85 * factor, ctx.currentTime, 0.15);
      } else if (ctx) {
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
      }
    }
    function unlock() { if (S.set.sound && (!ctx || ctx.state !== 'running')) set(true); }
    function pause(p) { if (!ctx || dead) return; if (p) quiet(ctx.suspend()); else if (on) quiet(ctx.resume()); }
    function level(I, lit) {
      if (!live()) return;
      bedG.gain.setTargetAtTime((0.04 + 0.3 * I * lit) * fireVol, ctx.currentTime, 0.3);
      hissG.gain.setTargetAtTime((0.003 + 0.03 * I * lit) * fireVol, ctx.currentTime, 0.3);
    }
    function noise(dur, type, f, vol, rate = 1, when = 0) {
      const t = ctx.currentTime + when;
      const s = ctx.createBufferSource(); s.buffer = white; s.playbackRate.value = rate;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f;
      const gn = ctx.createGain();
      gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(vol, t + 0.003);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(fl); fl.connect(gn); gn.connect(master);
      s.start(t, rnd(0, 2), dur + 0.05);
    }
    function tone(f0, f1, dur, vol, when = 0, type = 'sine') {
      const t = ctx.currentTime + when;
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const gn = ctx.createGain();
      gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(vol, t + 0.012);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gn); gn.connect(master); o.start(t); o.stop(t + dur + 0.05);
    }
    return {
      set, unlock, pause, level, live,
      ctx: () => ctx, out: () => master,
      onBuild(fn) { builders.push(fn); if (ctx) fn(ctx, master, { white, brown }); },
      setFactor(v) { factor = v; if (on && ctx && !dead) master.gain.setTargetAtTime(0.85 * v, ctx.currentTime, 0.4); },
      setFireVol(v) { fireVol = v; },
      puchun() { // 古いテレビの電源を切ったような短い電子音を1回。同時に、ほかの音をすべてぶつっと止める
        if (!ctx) return;
        const t = ctx.currentTime;
        if (live()) {
          const o = ctx.createOscillator(), gn = ctx.createGain();
          o.type = 'square'; o.frequency.setValueAtTime(2400, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.13);
          gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(0.1, t + 0.008); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
          o.connect(gn); gn.connect(ctx.destination); o.start(t); o.stop(t + 0.2);
        }
        dead = true;
        master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(0, t);
        setTimeout(() => { if (dead) quiet(ctx.suspend()); }, 500);
      },
      revive() { dead = false; if (on && ctx) { quiet(ctx.resume()); master.gain.setTargetAtTime(0.85 * factor, ctx.currentTime, 0.3); } },
      tone(...a) { if (live()) tone(...a); },
      noise(...a) { if (live()) noise(...a); },
      crackle(v = 1) { if (live() && fireVol > 0) noise(rnd(0.012, 0.06), 'highpass', rnd(1200, 5200), rnd(0.12, 0.45) * v * fireVol, rnd(0.5, 2)); },
      thud() { if (!live()) return; tone(120, 52, 0.14, 0.4); noise(0.09, 'lowpass', 700, 0.3); },
      chime(star) {
        if (!live()) return;
        const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
        for (let i = 0; i < 2 + star; i++) { tone(notes[i], notes[i], 1.1, 0.11, i * 0.12); tone(notes[i] * 2, notes[i] * 2, 0.5, 0.025, i * 0.12); }
      },
      boom(big) {
        if (!live()) return;
        noise(big ? 0.9 : 0.5, 'lowpass', big ? 160 : 240, big ? 0.9 : 0.6, 0.6);
        tone(90, 38, 0.35, big ? 0.5 : 0.3);
        for (let i = 0; i < (big ? 16 : 8); i++) noise(rnd(0.01, 0.04), 'highpass', rnd(2500, 6000), rnd(0.05, 0.16), rnd(0.8, 2), rnd(0.15, big ? 1.4 : 0.8));
      },
      swish() { if (live()) tone(2300, 800, 0.7, 0.045); },
      blip() { if (!live()) return; tone(880, 1320, 0.16, 0.08); tone(1320, 1760, 0.16, 0.08, 0.14); tone(1760, 1320, 0.22, 0.07, 0.28); },
    };
  })();

  // 演出のつよさ「しずか／にぎやか」。しずか は見た目・音・振動の強さだけを変える（確率・記録・できることは、にぎやかと同じ）。
  // 揺れ・明るさ・スロー・花火・効果音の数は、必ずここを通す
  const calm = () => !!S.set.calm;
  const feel = {
    shake(v) { if (!calm()) fx.shake = Math.max(fx.shake, v); },
    bright(v) { fx.bright = Math.max(fx.bright, calm() ? v * 0.3 : v); },
    slow(t) { if (!calm()) fx.slowT = t; },
    chime(star) { Sound.chime(calm() ? 0 : star); }, // しずか は2音まで
    fireworks(n) { if (calm()) return; const busy = fx.fwBusy; launchFireworks(n, false); fx.fwBusy = busy; }, // お祝いの花火は、レアの花火の抽選を邪魔しない
  };
  function haptic(p, isThrow) { // しずか のときは、くべたときの短い1回だけ
    if (!S.set.vib || !navigator.vibrate || (calm() && !isThrow)) return;
    try { navigator.vibrate(p); } catch (e) { /* 非対応 */ }
  }

  // ================= キャンバスと風景 =================
  const app = $('app'), cv = $('scene');
  const G = cv.getContext('2d', { alpha: false });
  let g = G; // いま描いている先（本体 or 低解像度バッファ）
  let W = 0, H = 0, DPR = 1, U = 1, cx = 0, baseY = 0, horizon = 0;
  let fBuf = null, sBuf = null;
  let layerN = null, layerD = null, skyN = null, skyD = null, moonCv = null, moonR = 0;
  let stars = [], clouds = [];

  const spriteCache = new Map();
  function sprite(c) {
    const key = (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0);
    let s = spriteCache.get(key);
    if (!s) {
      s = document.createElement('canvas'); s.width = s.height = 64;
      const x = s.getContext('2d');
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, rgba(c, 1)); gr.addColorStop(0.35, rgba(c, 0.55)); gr.addColorStop(1, rgba(c, 0));
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      spriteCache.set(key, s);
    }
    return s;
  }
  // ぼんやり光る玉。炎・火の粉・光はすべてこれの重ね合わせ
  function blob(c, x, y, r, a) {
    if (a <= 0.004 || r <= 0) return;
    g.globalAlpha = a > 1 ? 1 : a;
    g.drawImage(sprite(c), x - r, y - r, r * 2, r * 2);
  }
  // 炎と煙は低解像度の別キャンバスに描いてから拡大して重ねる。
  // もともとぼかした玉の集まりなので見た目は変わらず、塗る面積（＝負荷と電池消費）が大きく減る。
  function makeBuf(x0, y0, w, h, scale) {
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.ceil(w * scale)); c.height = Math.max(2, Math.ceil(h * scale));
    return { c, x: c.getContext('2d'), x0, y0, w, h, scale };
  }
  function beginBuf(b) {
    g = b.x;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.clearRect(0, 0, b.c.width, b.c.height);
    g.setTransform(b.scale, 0, 0, b.scale, -b.x0 * b.scale, -b.y0 * b.scale);
  }
  function endBuf(b, op, alpha) {
    g = G;
    if (alpha <= 0.004) return;
    g.globalCompositeOperation = op; g.globalAlpha = alpha > 1 ? 1 : alpha;
    g.drawImage(b.c, b.x0, b.y0, b.w, b.h);
  }
  function rr(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  function pine(x, px, base, h, hw) {
    const n = 5;
    x.beginPath(); x.moveTo(px, base - h);
    for (let i = 1; i <= n; i++) { const k = i / n, y = base - h + h * k * 0.9; x.lineTo(px + hw * k, y); x.lineTo(px + hw * k * 0.42, y + h * 0.012); }
    x.lineTo(px + hw * 0.1, base); x.lineTo(px - hw * 0.1, base);
    for (let i = n; i >= 1; i--) { const k = i / n, y = base - h + h * k * 0.9; x.lineTo(px - hw * k * 0.42, y + h * 0.012); x.lineTo(px - hw * k, y); }
    x.closePath(); x.fill();
  }

  // 山・森・地面のシルエット。夜用と朝用を同じ形で2枚作り、クロスフェードする
  function makeLayer(day, snow) {
    const c = document.createElement('canvas');
    c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
    const x = c.getContext('2d'); x.scale(DPR, DPR);
    const R = seeded(20261112);
    const col = day
      ? { far: '#93abc4', mid: '#4d7268', near: '#1f3d34', g0: '#46503a', g1: '#171d15', tuft: 'rgba(120,150,90,.5)' }
      : { far: '#0f1536', mid: '#090d20', near: '#03040a', g0: '#100d0e', g1: '#020202', tuft: 'rgba(40,44,52,.6)' };
    if (snow) { // 雪景色
      Object.assign(col, day
        ? { far: '#cbd8e6', mid: '#86a09e', near: '#3c5852', g0: '#eef2f6', g1: '#a3b3c4', tuft: 'rgba(255,255,255,.7)' }
        : { far: '#1a2246', mid: '#141a36', near: '#070914', g0: '#3c4670', g1: '#12162c', tuft: 'rgba(130,140,180,.5)' });
    }
    const p1 = R() * TAU, p2 = R() * TAU;
    x.fillStyle = col.far; x.beginPath(); x.moveTo(0, H);
    for (let px = 0; px <= W + 4; px += 4) {
      const k = px / W;
      x.lineTo(px, horizon - (44 + 28 * Math.sin(k * 5.2 + p1) + 12 * Math.sin(k * 13 + p2)) * U);
    }
    x.lineTo(W, H); x.closePath(); x.fill();
    if (day) { // 朝もや
      const hz = x.createLinearGradient(0, horizon - 110 * U, 0, horizon + 8 * U);
      hz.addColorStop(0, 'rgba(255,232,210,0)'); hz.addColorStop(1, 'rgba(255,226,200,.42)');
      x.fillStyle = hz; x.fillRect(0, horizon - 110 * U, W, 118 * U);
    }
    x.fillStyle = col.mid;
    for (let px = -10 * U; px < W + 20 * U; px += (13 + R() * 11) * U) {
      const k = Math.abs(px / W - 0.5) * 2;
      const h = (62 + 52 * k * k + R() * 44) * U;
      pine(x, px, horizon + 6 * U, h, h * 0.3);
    }
    const gg = x.createLinearGradient(0, horizon, 0, H);
    gg.addColorStop(0, col.g0); gg.addColorStop(1, col.g1);
    x.fillStyle = gg; x.fillRect(0, horizon + 2 * U, W, H - horizon);
    x.fillStyle = col.near;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const off = (i * 34 - 8 + R() * 14) * U;
        const h = (196 - i * 48 + R() * 30) * U;
        pine(x, side < 0 ? off : W - off, horizon + (30 - i * 7) * U, h, h * 0.27);
      }
    }
    x.strokeStyle = col.tuft; x.lineWidth = Math.max(1, 1.2 * U); x.lineCap = 'round';
    for (let i = 0; i < 26; i++) { // 草
      const tx = R() * W, ty = horizon + (14 + R() * R() * 300) * U, th = (5 + R() * 6) * U;
      if (Math.abs(tx - W / 2) < 96 * U && Math.abs(ty - baseY) < 44 * U) continue;
      x.beginPath();
      for (const d of [-0.5, 0, 0.5]) { x.moveTo(tx, ty); x.lineTo(tx + d * th, ty - th * (1 - Math.abs(d) * 0.4)); }
      x.stroke();
    }
    if (snow) { x.fillStyle = day ? 'rgba(70,62,50,.75)' : 'rgba(14,12,14,.8)'; x.beginPath(); x.ellipse(W / 2, baseY + 12 * U, 128 * U, 36 * U, 0, 0, TAU); x.fill(); } // 火のまわりだけ雪がとけている
    x.fillStyle = 'rgba(0,0,0,.4)'; // 灰床
    x.beginPath(); x.ellipse(W / 2, baseY + 10 * U, 84 * U, 23 * U, 0, 0, TAU); x.fill();
    return c;
  }

  // 月の満ち欠け。日付から計算する（通信なし。基準の新月 2000年1月6日 18:14 UTC、周期 29.530588853 日。1日ほどのずれは許容）
  const SYNODIC = 29.530588853;
  let moonForce = null; // ?debug の takibi.moon(0〜1)
  const moonPhase = (t) => { if (moonForce != null) return moonForce; const d = (t - Date.UTC(2000, 0, 6, 18, 14)) / 86400000 / SYNODIC; return d - Math.floor(d); }; // 0 = 新月、0.5 = 満月
  const moonAge = () => fx.moonP * SYNODIC;
  const isNewMoon = () => moonAge() < 2 || moonAge() > SYNODIC - 2;        // 新月のころ（前後2日）
  const isFullMoon = () => Math.abs(moonAge() - SYNODIC / 2) < 1;           // 満月のころ（前後1日）
  const moonName = () => { const a = moonAge(); return [[1.5, '新月'], [5.5, '三日月'], [9, '上弦の月'], [12, '十日夜の月'], [14, '十三夜'], [15.6, '満月'], [17.5, '十六夜'], [21, '更待月'], [24, '下弦の月'], [28, '有明の月'], [99, '新月']].find((m) => a < m[0])[1]; };
  function paintMoon() { // 形が変わったときと resize のときだけ描く
    const ms = moonCv.width, x = moonCv.getContext('2d'), c = ms / 2, r = c - 2, p = fx.moonP, k = Math.cos(p * TAU);
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, ms, ms);
    x.fillStyle = 'rgba(246,240,214,.07)'; x.beginPath(); x.arc(c, c, r, 0, TAU); x.fill(); // 影の側も、うっすら見える
    x.translate(c, c); if (p >= 0.5) x.scale(-1, 1);                                         // 欠けていく月は左右を入れ替える
    x.fillStyle = '#f6f0d6'; x.beginPath();
    x.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);                                        // 光っている側の縁
    x.ellipse(0, 0, Math.max(0.01, Math.abs(k) * r), r, 0, Math.PI / 2, -Math.PI / 2, k > 0); // 明暗の境
    x.fill();
  }
  function resize() {
    const r = app.getBoundingClientRect();
    W = Math.max(240, Math.round(r.width)); H = Math.max(320, Math.round(r.height));
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    U = Math.min(W, H * 0.6) / 360;
    cx = W / 2;
    baseY = Math.round(Math.min(H * 0.7, H - 196));
    horizon = Math.round(baseY - H * 0.1);
    drop(layerN); drop(layerD); drop(fBuf && fBuf.c); drop(sBuf && sBuf.c); drop(moonCv);
    layerN = makeLayer(false); layerD = makeLayer(true);
    fBuf = makeBuf(cx - 195 * U, baseY - 400 * U, 390 * U, 440 * U, 0.5);
    sBuf = makeBuf(cx - 215 * U, baseY - 580 * U, 430 * U, 600 * U, 0.3);
    skyN = g.createLinearGradient(0, 0, 0, horizon);
    skyN.addColorStop(0, '#04050d'); skyN.addColorStop(0.55, '#0a1030'); skyN.addColorStop(1, '#1d1b48');
    skyD = g.createLinearGradient(0, 0, 0, horizon);
    skyD.addColorStop(0, '#5f9bd4'); skyD.addColorStop(0.5, '#a9cfe9'); skyD.addColorStop(0.85, '#ffe2c4'); skyD.addColorStop(1, '#ffc49a');
    const R = seeded(99);
    stars = [];
    const n = Math.round(clamp((W * horizon) / 2400, 40, 160));
    fx.starBase = n; // ふだん見える数。新月のころは、残りも見える（上限240）
    for (let i = 0, m = Math.min(240, Math.round(n * 1.5)); i < m; i++) stars.push({ x: R() * W, y: R() * horizon * 0.96, r: 0.7 + R() * 1.3, a: 0.35 + R() * 0.65, sp: 0.6 + R() * 2.4, ph: R() * TAU });
    clouds = [];
    for (let i = 0; i < 4; i++) clouds.push({ x: R() * W, y: horizon * (0.12 + R() * 0.45), w: (90 + R() * 90) * U, h: (16 + R() * 12) * U, sp: (2 + R() * 4) * U });
    moonR = 18 * U;
    moonCv = document.createElement('canvas');
    moonCv.width = moonCv.height = Math.ceil(moonR * 2 * DPR) + 4;
    paintMoon();
    run('resize');
  }

  // ================= 火と粒子 =================
  let T = 0;                 // 経過秒
  let I = 0, lit = 0, flare = 0, flick = 1, flameH = 0;
  let dayTarget = 0, dayness = 0, skyCheck = 0;
  // 軽さの見張り: 重い端末では粒の「出る量」だけを自動で絞る（100% → 70% → 50%）。火力・抽選・記録には関わらない
  const perf = { q: 0, forced: -1, avg: 16.7, work: 6, over: 0, under: 0, wait: 20, lastUp: 0, fps: 60 };
  const Q = () => [1, 0.7, 0.5][perf.forced >= 0 ? perf.forced : perf.q];
  const LOW_RATE = []; // 毎秒30回に落としてよい場面
  const flames = [], sparks = [], smokes = [], flying = [], landed = [];
  const rockets = [], fw = [], shoots = [];
  const fx = { flame: null, flameT: 0, fwBusy: 0, meteorT: 0, rain: null, spirit: null, flash: 0, flashX: 0, flashY: 0, flashC: GOLD,
    slowT: 0, shake: 0, bright: 0, freeze: false, base: 'fire', hold: false, omen: null,
    ambGap: 10, steward: false, uncounted: false, moonP: 0.1, starBase: 0, starDark: false, fw: 1, fh: 1, sparkMul: 1, roastMul: 1, slots: null };
  let flameAcc = 0, sparkAcc = 0, smokeAcc = 0, ambT = 0, lastThrow = 0, lastRoll = 0, crackT = 0;

  const palName = () => { // レアの色炎 ＞ ふだんの色（業火タイムの金、または自分で選んだ色）
    const n = fx.flame && fx.flameT > 0 ? fx.flame : fx.base;
    return n === 'rainbow' ? RAINBOW[Math.floor(T * 2.3) % RAINBOW.length] : n;
  };

  // 薪による一時的な色味。レアの色炎があるときはそちらを優先し、ふだんの炎にだけ混ぜる
  const flamePal = () => { const n = palName(); return n === 'fire' && fx.tintT > 0 && Math.random() < 0.62 ? fx.tint : n; };
  function spawnFlame() {
    const spread = (10 + 34 * I) * U * fx.fw;
    const off = (Math.random() + Math.random() + Math.random() - 1.5) * spread;
    const center = 1 - Math.min(1, Math.abs(off) / (spread * 1.3));
    flames.push({
      x: cx + off, y: baseY - rnd(0, 8) * U, ox: off * 0.22,
      vx: rnd(-8, 8) * U, vy: -(52 + 150 * I) * U * fx.fh * (0.42 + 0.78 * center) * rnd(0.8, 1.2),
      life: (0.5 + 0.6 * I) * (0.5 + 0.7 * center) * rnd(0.8, 1.25) * (0.5 + 0.5 * lit), age: 0,
      size: (20 + 30 * I) * U * rnd(0.7, 1.2) * (0.45 + 0.55 * lit), seed: rnd(0, TAU), pal: flamePal(),
    });
  }
  function addSpark(x, y, vx, vy, life, size, c, grav) {
    if (sparks.length < 260) sparks.push({ x, y, vx, vy, life, age: 0, size, c, grav, seed: rnd(0, TAU) });
  }
  function emberBurst(x, y, n, power) {
    const pal = PAL[palName()];
    for (let i = 0; i < n; i++) {
      addSpark(x + rnd(-10, 10) * U, y + rnd(-6, 6) * U, rnd(-70, 70) * U * power, -rnd(60, 220) * U * power,
        rnd(0.7, 1.9), rnd(1, 2.4) * U, mix(pal.core, pal.edge, rnd(0.1, 0.8)), 40);
    }
  }

  function throwLog(px, auto, stew) { // auto = 長押しによる連続くべ ／ stew = おまかせ火の番がくべた薪（本数・コンボ・抽選などに数えない）
    const now = performance.now();
    if (now - lastThrow < 130 || flying.length >= 10) return;
    lastThrow = now;
    if (stew) S.watchLogs = (S.watchLogs || 0) + 1; else S.totalLogs++;
    dirty = true; fx.uncounted = !!stew;
    const L = {
      x0: cx + (px - cx) * 0.6, y0: H - 118, x1: cx + rnd(-16, 16) * U, y1: baseY - rnd(0, 14) * U,
      t: 0, dur: rnd(0.5, 0.62), rot: rnd(-0.6, 0.6), spin: (Math.random() < 0.5 ? -1 : 1) * rnd(3, 7), arc: rnd(90, 140) * U, x: 0, y: 0,
      fuel: LOG_FUEL, flare: 0.2, sparks: 1, len: 58, col: null, stew: !!stew,
    };
    flying.push(L);
    run('thrown', L, !!auto);
    fx.uncounted = false;
    hideHint(); if (!stew) haptic(8, true);
  }
  function landLog(L) {
    L.from = S.fuel;
    S.fuel = Math.min(100, S.fuel + L.fuel);
    flare = Math.min(0.9, flare + L.flare);
    emberBurst(L.x1, L.y1 - 8 * U, Math.round((9 + ((I * 9) | 0)) * L.sparks), 0.6 + I * 0.5);
    landed.push({ x: L.x1, y: L.y1, rot: L.rot, a: 1, len: L.len, col: L.col });
    Sound.thud(); Sound.crackle(1.4); Sound.crackle(1);
    run('land', L);
    const now = performance.now();
    if (!L.stew && now - lastRoll >= 1000) { lastRoll = now; rollRare('log'); } // 連打しても抽選は毎秒1回まで
  }

  // ================= レアな出来事 =================
  BUSY.flame = () => fx.flameT > 0;
  BUSY.fw = () => fx.fwBusy > 0;
  BUSY.sky = () => fx.meteorT > 0;
  BUSY.niji = () => !!fx.rain;
  BUSY.spirit = () => !!fx.spirit;
  function eligible(r, on) {
    if (S.fuel < (r.minFuel || (on === 'log' ? 20 : 5))) return false;
    if (r.sky && r.sky !== (dayTarget ? 'day' : 'night')) return false;
    if (r.ok && !r.ok()) return false;
    const busy = BUSY[r.kind];
    return !(busy && busy());
  }
  // 1回の抽選。条件を満たす出来事それぞれが、ちょうど確率 p（×倍率）で選ばれる
  function pickRare(on) {
    let mul = 1;
    for (const fn of RARE_MUL) mul *= fn();
    let x = Math.random();
    for (const r of RARES) {
      if ((r.on !== on && r.on !== 'both') || !eligible(r, on)) continue;
      const p = r.p * (r.pf ? r.pf() : 1) * (r.kind === 'hidden' ? 1 : mul);
      if (x < p) return r.id;
      x -= p;
    }
    return null;
  }
  // 予兆は「もう決まった結果」を先に見せるだけ。抽選そのものには関わらない
  let omenFn = null;
  function rollRare(on) { const id = pickRare(on); if (omenFn && omenFn(id)) return; if (id) trigger(id, true); }
  function recordRare(id, when, quiet) {
    const now = when || Date.now();
    const c = S.col[id] || (S.col[id] = { n: 0, first: now });
    c.n++; c.last = now;
    if (!quiet) { S.log.unshift({ id, t: now }); if (S.log.length > 100) S.log.length = 100; }
    if (c.n === 1) { S.unseen = true; run('found', id); }
    save(); syncButtons();
    return c;
  }
  function addLogText(txt, when) { S.log.unshift({ t: when || Date.now(), txt }); if (S.log.length > 100) S.log.length = 100; dirty = true; }
  function trigger(id, record) {
    const r = RMAP[id];
    if (!r) return;
    if (r.kind === 'hidden') { TRIG[id](record); return; } // 隠し要素は記録も演出も自前で行う
    if (FLAME_IDS.includes(id)) { fx.flame = id; fx.flameT = id === 'rainbow' ? 30 : 22; flare = 0.55; emberBurst(cx, baseY - 20 * U, 16, 1); }
    else if (id === 'hanabi') launchFireworks(4, false);
    else if (id === 'tairin') launchFireworks(10, true);
    else if (id === 'star') { addShoot(0); Sound.swish(); }
    else if (id === 'meteor') {
      fx.meteorT = 16;
      const dir = Math.random() < 0.5 ? -1 : 1, ang = rnd(0.45, 0.6);
      for (let i = 0; i < 40; i++) addShoot(rnd(0, 14), dir, ang + rnd(-0.05, 0.05));
      Sound.swish();
    }
    else if (id === 'niji') fx.rain = { age: 0 };
    else if (id === 'hinoko') { fx.spirit = { kind: 'fire', age: 0, x: cx, y: baseY, s: 0, al: 1 }; Sound.blip(); }
    else if (id === 'tsuyu') { fx.spirit = { kind: 'dew', age: 0, x: W * 0.16, y: H * 0.2, s: 1, al: 0 }; Sound.blip(); }
    else if (TRIG[id]) TRIG[id](record);

    let sub = 'プレビュー（記録されません）';
    if (record) { const c = recordRare(id); sub = c.n === 1 ? 'はじめて出会った！ 図鑑に記録' : `${c.n}回目`; }
    announce(r, sub);
  }
  function announce(r, sub, cls) {
    toast(starStr(r), r.name, sub, 5200, cls);
    feel.chime(Math.min(3, Math.round(r.star)));
    // ★の数で出方を変える: ★ トーストのみ ／ ★★ 画面がふわっと明るく ／ ★★★ 一瞬のスローと揺れ、決めの音
    if (r.star >= 2) feel.bright(0.2);
    if (r.star >= 3) { feel.slow(0.8); feel.shake(4); if (!calm()) { Sound.tone(196, 98, 0.9, 0.2); Sound.tone(1568, 1568, 1.4, 0.06, 0.1); } }
    haptic(r.star >= 3 ? [40, 60, 40, 60, 120] : r.star >= 2 ? [30, 50, 30] : 20);
  }

  function launchFireworks(n, big) {
    let d = 0;
    for (let i = 0; i < n; i++) {
      d += i === 0 ? 0.1 : rnd(0.35, 0.75);
      const isBig = big && (i % 3 === 2 || i === n - 1);
      rockets.push({
        delay: d, age: 0, dur: rnd(0.9, 1.3), sx: cx + rnd(-12, 12) * U, sy: baseY - flameH * 0.5,
        tx: W * (isBig ? rnd(0.32, 0.68) : rnd(0.16, 0.84)), ty: H * (isBig ? rnd(0.14, 0.22) : rnd(0.1, 0.3)),
        big: isBig, c: pick(FWC), x: 0, y: 0,
      });
    }
    fx.fwBusy = d + 5;
    emberBurst(cx, baseY - flameH * 0.4, 20, 1.2);
  }
  function explode(x, y, big, c) {
    const n = big ? 120 : (rnd(46, 64) | 0), sp = (big ? 215 : rnd(110, 150)) * U;
    let c2 = pick(FWC); if (c2 === c) c2 = [255, 255, 236];
    for (let i = 0; i < n && fw.length < 900; i++) {
      const a = (TAU * i) / n + rnd(-0.05, 0.05), inner = big && i % 2 === 1;
      const v = sp * (inner ? 0.55 : 1) * rnd(0.92, 1.05);
      fw.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: (big ? 2.1 : 1.4) * rnd(0.8, 1.15), c: inner ? c2 : c, drag: big ? 1.6 : 2, grav: 46 * U, tw: false, big });
    }
    if (big) { // しだれ
      for (let i = 0; i < 70 && fw.length < 900; i++) {
        const a = rnd(0, TAU), v = rnd(40, 160) * U;
        fw.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: rnd(2.2, 3.1), c: GOLD, drag: 2.5, grav: 74 * U, tw: true, big });
      }
    }
    fx.flash = big ? 0.34 : 0.16; fx.flashX = x; fx.flashY = y; fx.flashC = c;
    Sound.boom(big); haptic(big ? 30 : 12);
  }
  function addShoot(delay, dir, ang) {
    dir = dir || (Math.random() < 0.5 ? -1 : 1);
    ang = ang || rnd(0.35, 0.65);
    const sp = rnd(0.85, 1.25) * W;
    shoots.push({
      delay, age: 0, dur: rnd(0.7, 1.05), len: rnd(70, 125) * U,
      x: W * (dir > 0 ? rnd(0.02, 0.55) : rnd(0.45, 0.98)), y: horizon * rnd(0.04, 0.38),
      vx: Math.cos(ang) * sp * dir, vy: Math.sin(ang) * sp,
    });
  }

  // ================= 更新 =================
  function update(dt, real) {
    // --- 燃焼 ---
    if (!fx.freeze) {
      let bm = 1;
      for (const fn of BURN_MUL) bm *= fn();
      if (S.fuel > 0) S.fuel = Math.max(0, S.fuel - (BURN_A + BURN_B * S.fuel) * bm * dt);
      if (S.fuel >= 5) { S.burnSec += dt; dirty = true; }
    }
    flare *= Math.exp(-2.6 * dt);
    lit = clamp(S.fuel / 6, 0, 1);
    const target = clamp(Math.pow(S.fuel / 100, 0.8) * 0.92 + flare * 0.5, 0, 1.12) * (fx.veil ? 0.12 : 1);
    I += (target - I) * Math.min(1, dt * 4);
    flick = 1 + 0.07 * Math.sin(T * 11.3) + 0.05 * Math.sin(T * 23.7 + 1) + 0.04 * Math.sin(T * 5.1 + 2);
    flameH = (36 + 214 * I) * U * fx.fh * (0.2 + 0.8 * lit);

    // --- 空 ---
    skyCheck -= dt;
    if (skyCheck <= 0) { skyCheck = 1; const t = skyTarget(); if (t !== dayTarget) { dayTarget = t; syncButtons(); } }
    dayness = dayTarget > dayness ? Math.min(dayTarget, dayness + dt * 0.45) : Math.max(dayTarget, dayness - dt * 0.45);
    for (const c of clouds) { c.x += c.sp * dt; if (c.x - c.w > W) c.x = -c.w; }

    // --- 炎 ---
    flameAcc += (lit * (46 + 190 * I) + (1 - lit) * 6) * dt * Q();
    while (flameAcc >= 1) { flameAcc--; if (flames.length < 320) spawnFlame(); }
    const wind = Math.sin(T * 0.7) * 0.6 + Math.sin(T * 1.9 + 1.3) * 0.4;
    for (let i = flames.length - 1; i >= 0; i--) {
      const p = flames[i];
      p.age += dt;
      if (p.age >= p.life) { flames[i] = flames[flames.length - 1]; flames.pop(); continue; }
      const h = (baseY - p.y) / (160 * U);
      p.vx += ((cx + p.ox - p.x) * 3.2 + (wind * 46 + Math.sin(T * 6.3 + p.seed) * 40) * U * h) * dt;
      p.vx *= 1 - Math.min(1, 1.4 * dt);
      p.x += p.vx * dt; p.y += p.vy * dt;
    }

    // --- 火の粉 ---
    sparkAcc += (0.5 + lit * (2 + 11 * I)) * dt * Q() * fx.sparkMul;
    while (sparkAcc >= 1) {
      sparkAcc--;
      const pal = PAL[palName()];
      addSpark(cx + rnd(-1, 1) * (12 + 30 * I) * U, baseY - rnd(6, 10 + flameH * 0.55), rnd(-18, 18) * U, -rnd(50, 130) * U * (0.5 + I),
        rnd(0.9, 2.5), rnd(1, 2.2) * U, mix(pal.core, pal.edge, rnd(0.2, 0.8)), -10);
    }
    for (let i = sparks.length - 1; i >= 0 && !fx.hold; i--) { // hold = 予兆で火の粉が一瞬止まる
      const p = sparks[i];
      p.age += dt;
      if (p.age >= p.life) { sparks[i] = sparks[sparks.length - 1]; sparks.pop(); continue; }
      p.vx += (Math.sin(T * 4 + p.seed) * 46 * U + wind * 14 * U) * dt;
      p.vx *= 1 - Math.min(1, 0.9 * dt);
      p.vy += p.grav * U * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }

    // --- 煙 ---
    smokeAcc += (1.2 + lit * (2 + 5 * I)) * dt * Q();
    while (smokeAcc >= 1) {
      smokeAcc--;
      if (smokes.length < 60) smokes.push({
        x: cx + rnd(-10, 10) * U * (1 + I), y: baseY - (lit > 0.5 ? flameH * rnd(0.5, 0.85) : 10 * U),
        vx: rnd(-6, 6) * U, vy: -rnd(20, 38) * U, life: rnd(3, 5.5), age: 0, size: rnd(12, 20) * U * (0.7 + I * 0.7),
      });
    }
    for (let i = smokes.length - 1; i >= 0; i--) {
      const p = smokes[i];
      p.age += dt;
      if (p.age >= p.life) { smokes[i] = smokes[smokes.length - 1]; smokes.pop(); continue; }
      p.x += (p.vx + wind * 16 * U * (p.age / p.life)) * dt; p.y += p.vy * dt;
    }

    // --- 飛んでいく薪 ---
    for (let i = flying.length - 1; i >= 0; i--) {
      const L = flying[i];
      L.t += dt;
      const k = Math.min(1, L.t / L.dur);
      L.x = lerp(L.x0, L.x1, k); L.y = lerp(L.y0, L.y1, k) - L.arc * 4 * k * (1 - k);
      L.rot += L.spin * dt;
      if (k >= 1) { flying.splice(i, 1); landLog(L); }
    }
    for (let i = landed.length - 1; i >= 0; i--) { landed[i].a -= dt * 1.6; if (landed[i].a <= 0) landed.splice(i, 1); }

    // --- 花火 ---
    if (fx.fwBusy > 0) fx.fwBusy -= dt;
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      if (r.delay > 0) { r.delay -= dt; continue; }
      r.age += dt;
      const k = Math.min(1, r.age / r.dur), e = 1 - (1 - k) * (1 - k);
      r.x = lerp(r.sx, r.tx, e) + Math.sin(r.age * 18) * 3 * U * (1 - k); r.y = lerp(r.sy, r.ty, e);
      addSpark(r.x, r.y, rnd(-8, 8) * U, rnd(8, 30) * U, 0.4, 1.5 * U, r.c, 30);
      if (k >= 1) { rockets.splice(i, 1); explode(r.x, r.y, r.big, r.c); }
    }
    for (let i = fw.length - 1; i >= 0; i--) {
      const p = fw[i];
      p.age += dt;
      if (p.age >= p.life) { fw[i] = fw[fw.length - 1]; fw.pop(); continue; }
      p.vx -= p.vx * p.drag * dt; p.vy += (p.grav - p.vy * p.drag) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    if (fx.flash > 0) fx.flash = Math.max(0, fx.flash - dt * 0.7);

    // --- 流れ星・虹・精霊・色炎 ---
    if (fx.meteorT > 0) fx.meteorT -= dt;
    for (let i = shoots.length - 1; i >= 0; i--) {
      const s = shoots[i];
      if (s.delay > 0) { s.delay -= dt; continue; }
      s.age += dt;
      if (s.age >= s.dur) shoots.splice(i, 1);
    }
    if (fx.rain) { fx.rain.age += dt; if (fx.rain.age > 26) fx.rain = null; }
    if (fx.flameT > 0) { fx.flameT -= dt; if (fx.flameT <= 0) fx.flame = null; }
    updSpirit(dt);

    // --- 時間でのレア抽選（火が燃えている間、10秒ごと） ---
    if (!fx.freeze) ambT += dt;
    if (ambT >= fx.ambGap) { ambT = 0; rollRare('amb'); } // ふだんは10秒ごと。おまかせ火の番の間は20秒ごと

    // --- 音 ---
    crackT -= dt;
    if (crackT <= 0) { crackT = rnd(0.02, 0.5) / (0.25 + I * 1.6); if (lit > 0.2) Sound.crackle(0.5 + I); }
    Sound.level(Math.min(1, I), lit);

    if (fx.shake > 0) fx.shake = Math.max(0, fx.shake - real * 9);
    if (fx.bright > 0) fx.bright = Math.max(0, fx.bright - real * 0.35);
    run('update', dt, real);
    updHud();
    saveT += dt;
    if (saveT > 5) { saveT = 0; if (dirty) save(); }
  }

  function updSpirit(dt) {
    const sp = fx.spirit;
    if (!sp) return;
    sp.age += dt;
    const a = sp.age;
    if (sp.kind === 'fire') {
      const gy = baseY + 30 * U, R = 96 * U, tOut = 1.1, tPlay = 13, tIn = 1.3;
      if (a < tOut) {
        const k = a / tOut, e = 1 - Math.pow(1 - k, 3);
        sp.x = cx + R * e; sp.y = lerp(baseY - flameH * 0.6, gy, e) - Math.sin(k * Math.PI) * 60 * U; sp.s = 0.3 + 0.7 * e;
      } else if (a < tOut + tPlay) {
        const t = a - tOut;
        sp.x = cx + Math.cos(t * 0.85) * R; sp.y = gy - Math.abs(Math.sin(t * 3.4)) * 26 * U; sp.s = 1;
        sp.ex = sp.x; sp.ey = sp.y;
        if (Math.random() < dt * 6) addSpark(sp.x, sp.y - 20 * U, rnd(-20, 20) * U, -rnd(20, 60) * U, rnd(0.5, 1), 1.6 * U, [255, 210, 120], -10);
      } else if (a < tOut + tPlay + tIn) {
        const k = (a - tOut - tPlay) / tIn;
        sp.x = lerp(sp.ex, cx, k); sp.y = lerp(sp.ey, baseY - 24 * U, k) - Math.sin(k * Math.PI) * 70 * U; sp.s = 1 - 0.75 * k;
      } else {
        emberBurst(cx, baseY - 24 * U, 22, 1.1); flare = 0.55; Sound.crackle(2); fx.spirit = null;
      }
    } else {
      const hx = cx - 100 * U, hy = baseY - 30 * U;
      if (a < 3) {
        const k = a / 3, e = k * k * (3 - 2 * k);
        sp.x = lerp(W * 0.16, hx, e) + Math.sin(a * 2.2) * 14 * U * (1 - e); sp.y = lerp(H * 0.2, hy, e); sp.al = Math.min(1, k * 3);
      } else if (a < 14) {
        sp.x = hx + Math.sin(a * 0.9) * 8 * U; sp.y = hy + Math.sin(a * 1.6) * 5 * U; sp.al = 1;
      } else if (a < 17) {
        const k = (a - 14) / 3, e = k * k;
        sp.x = hx - 34 * U * e + Math.sin(a * 2.2) * 14 * U * e; sp.y = lerp(hy, H * 0.12, e); sp.al = 1 - k;
      } else { fx.spirit = null; return; }
      if (Math.random() < dt * 9) addSpark(sp.x + rnd(-12, 12) * U, sp.y + rnd(-14, 10) * U, rnd(-6, 6) * U, rnd(4, 18) * U, rnd(0.6, 1.3), rnd(1, 1.9) * U, [205, 240, 255], 10);
    }
  }

  // ================= 描画 =================
  const SLOTS = [
    { x: 1,   y: -20, a: -1.32, l: 58, at: 62 },
    { x: -13, y: -10, a: -0.92, l: 62, at: 26 },
    { x: 14,  y: -11, a: 0.95,  l: 60, at: 44 },
    { x: -20, y: 5,   a: -0.3,  l: 74, at: -10 },
    { x: 21,  y: 6,   a: 0.28,  l: 72, at: -10 },
    { x: 0,   y: 12,  a: 0.04,  l: 84, at: 10 },
  ];
  const STONES = (() => {
    const R = seeded(5), out = [];
    for (let i = 0; i < 11; i++) out.push({ a: (i / 11) * TAU + 0.18, rx: 11 + R() * 5, ry: 7 + R() * 3, sh: 0.8 + R() * 0.4 });
    return out.sort((p, q) => Math.sin(p.a) - Math.sin(q.a));
  })();

  function drawLog(x, y, ang, len, th, freshness, alpha, glow, col) {
    g.save(); g.translate(x, y); g.rotate(ang); g.globalAlpha = alpha;
    g.fillStyle = rgb(mix([34, 22, 15], col || [128, 88, 52], freshness));
    rr(-len / 2, -th / 2, len, th, th * 0.4); g.fill();
    g.strokeStyle = freshness > 0.5 ? 'rgba(60,36,18,.55)' : 'rgba(0,0,0,.5)'; g.lineWidth = Math.max(1, U);
    g.beginPath();
    g.moveTo(-len * 0.38, -th * 0.2); g.lineTo(len * 0.26, -th * 0.2);
    g.moveTo(-len * 0.3, th * 0.18); g.lineTo(len * 0.32, th * 0.18);
    g.stroke();
    g.fillStyle = rgb(mix([70, 44, 28], [214, 172, 116], freshness));
    g.beginPath(); g.ellipse(len / 2 - th * 0.2, 0, th * 0.2, th * 0.42, 0, 0, TAU); g.fill();
    if (glow > 0) { // 下側が赤く熾る
      g.globalCompositeOperation = 'lighter';
      const gr = g.createLinearGradient(0, -th / 2, 0, th / 2);
      gr.addColorStop(0, 'rgba(255,110,20,0)'); gr.addColorStop(1, 'rgba(255,110,20,1)');
      g.globalAlpha = alpha * glow * (0.7 + 0.3 * Math.sin(T * 3 + x));
      g.fillStyle = gr; rr(-len / 2, -th / 2, len, th, th * 0.4); g.fill();
    }
    g.restore();
  }

  function drawStones(front, pal) {
    const base = mix([38, 36, 40], [124, 120, 112], dayness);
    for (const s of STONES) {
      const sy = Math.sin(s.a);
      if ((sy > 0.05) !== front) continue;
      const x = cx + Math.cos(s.a) * 68 * U, y = baseY + 10 * U + sy * 18 * U;
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.fillStyle = rgb([base[0] * s.sh, base[1] * s.sh, base[2] * s.sh]);
      g.beginPath(); g.ellipse(x, y, s.rx * U, s.ry * U, 0, 0, TAU); g.fill();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = (0.1 + 0.3 * Math.min(1, I)) * flick * (0.3 + 0.7 * lit) * (front ? 0.45 : 1);
      g.fillStyle = rgb(pal.glow);
      g.beginPath(); g.ellipse(x, y - s.ry * U * 0.25, s.rx * U * 0.85, s.ry * U * 0.6, 0, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  }

  function drawSpirit() {
    const sp = fx.spirit;
    if (!sp || sp.s <= 0.02 || sp.al <= 0.02) return;
    const fire = sp.kind === 'fire';
    const s = 15 * U * sp.s, x = sp.x, y = sp.y + Math.sin(T * 5) * 1.5 * U;
    g.globalCompositeOperation = 'lighter';
    blob(fire ? [255, 170, 60] : [150, 220, 255], x, y - s * 0.3, s * 3.6, 0.5 * sp.al);
    g.globalCompositeOperation = 'source-over';
    g.save(); g.translate(x, y); g.globalAlpha = sp.al;
    const wob = Math.sin(T * 8 + 1) * (fire ? 0.35 : 0.1) * s, tip = -s * (fire ? 2.1 : 1.75);
    g.beginPath();
    g.moveTo(wob, tip);
    g.bezierCurveTo(s * 0.55, -s * 1.1, s * 1.05, -s * 0.35, s, s * 0.2);
    g.bezierCurveTo(s * 0.95, s, -s * 0.95, s, -s, s * 0.2);
    g.bezierCurveTo(-s * 1.05, -s * 0.35, -s * 0.55, -s * 1.1, wob, tip);
    const gr = g.createRadialGradient(0, s * 0.25, s * 0.1, 0, 0, s * 1.9);
    if (fire) { gr.addColorStop(0, '#fff7cf'); gr.addColorStop(0.45, '#ffc04a'); gr.addColorStop(1, '#ff5a12'); }
    else { gr.addColorStop(0, 'rgba(255,255,255,.98)'); gr.addColorStop(0.5, 'rgba(196,236,255,.94)'); gr.addColorStop(1, 'rgba(96,172,240,.88)'); }
    g.fillStyle = gr; g.fill();
    if (!fire) { g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(-s * 0.45, -s * 0.4, s * 0.13, s * 0.26, 0.5, 0, TAU); g.fill(); }
    const ink = fire ? '#4a1e08' : '#1d4a78';
    const blink = Math.sin(T * 1.7 + 0.5) > 0.985 ? 0.15 : 1;
    g.fillStyle = ink;
    for (const d of [-1, 1]) { g.beginPath(); g.ellipse(d * s * 0.34, s * 0.12, s * 0.11, s * 0.17 * blink, 0, 0, TAU); g.fill(); }
    g.fillStyle = fire ? 'rgba(255,80,50,.5)' : 'rgba(255,150,170,.6)';
    for (const d of [-1, 1]) { g.beginPath(); g.arc(d * s * 0.6, s * 0.4, s * 0.13, 0, TAU); g.fill(); }
    g.strokeStyle = ink; g.lineWidth = Math.max(1, s * 0.07); g.lineCap = 'round';
    g.beginPath(); g.arc(0, s * 0.3, s * 0.14, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    g.restore();
  }

  function draw() {
    const sh = fx.shake * DPR, st = performance.now() / 1000;
    g.setTransform(DPR, 0, 0, DPR, Math.sin(st * 71) * sh, Math.cos(st * 83) * sh);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    const day = dayness, night = 1 - day, pal = PAL[palName()], Ic = Math.min(1, I);

    // --- 空 ---
    if (day < 1) { g.fillStyle = skyN; g.fillRect(-9, -9, W + 18, H + 18); }
    if (day > 0) { g.globalAlpha = day; g.fillStyle = skyD; g.fillRect(-9, -9, W + 18, H + 18); g.globalAlpha = 1; }
    if (night > 0.02) {
      g.fillStyle = '#fff';
      for (let i = 0, m = fx.starDark ? stars.length : fx.starBase; i < m; i++) { const s = stars[i]; g.globalAlpha = night * s.a * (0.55 + 0.45 * Math.sin(T * s.sp + s.ph)); g.fillRect(s.x, s.y, s.r, s.r); }
      const mx = W * 0.78, my = Math.max(H * 0.15, 96);
      g.globalCompositeOperation = 'lighter';
      blob([190, 205, 255], mx, my, 64 * U, 0.2 * night);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = night; g.drawImage(moonCv, mx - moonR, my - moonR, moonR * 2, moonR * 2);
    }
    if (day > 0.02) {
      g.globalCompositeOperation = 'lighter';
      blob([255, 206, 150], W * 0.22, horizon - 44 * U, 170 * U, 0.38 * day);
      blob([255, 244, 214], W * 0.22, horizon - 44 * U, 34 * U, 0.85 * day);
      g.globalCompositeOperation = 'source-over';
      const cs = sprite([255, 255, 255]);
      g.globalAlpha = 0.42 * day;
      for (const c of clouds) g.drawImage(cs, c.x - c.w, c.y - c.h, c.w * 2, c.h * 2);
    }
    if (fx.rain) { // 虹
      const a = clamp(fx.rain.age / 3, 0, 1) * clamp((26 - fx.rain.age) / 4, 0, 1) * (0.25 + 0.75 * day);
      const cols = ['255,80,80', '255,160,60', '255,230,90', '110,220,120', '90,170,255', '120,110,240', '180,110,230'];
      const lw = 4.6 * U, R0 = W * 0.6;
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.lineWidth = lw + 0.6; g.lineCap = 'butt';
      cols.forEach((c, i) => {
        g.strokeStyle = `rgba(${c},${0.42 * a})`;
        g.beginPath(); g.arc(W * 0.5, horizon + 40 * U, R0 - i * lw, Math.PI, TAU); g.stroke();
      });
    }
    g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    for (const s of shoots) { // 流れ星
      if (s.delay > 0) continue;
      const k = s.age / s.dur, a = Math.sin(k * Math.PI) * (0.35 + 0.65 * night);
      const hx = s.x + s.vx * s.age, hy = s.y + s.vy * s.age, sp = Math.hypot(s.vx, s.vy);
      const len = s.len * Math.min(1, k * 3), tx = hx - (s.vx / sp) * len, ty = hy - (s.vy / sp) * len;
      const gr = g.createLinearGradient(hx, hy, tx, ty);
      gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(160,190,255,0)');
      g.globalAlpha = 1; g.strokeStyle = gr; g.lineWidth = 2 * U;
      g.beginPath(); g.moveTo(hx, hy); g.lineTo(tx, ty); g.stroke();
      blob([220, 232, 255], hx, hy, 7 * U, a);
    }

    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    run('sky', day);

    // --- 山・森・地面 ---
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    if (day < 1) g.drawImage(layerN, 0, 0, W, H);
    if (day > 0) { g.globalAlpha = day; g.drawImage(layerD, 0, 0, W, H); g.globalAlpha = 1; }
    run('ground', day);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;

    // --- 火の明かり ---
    g.globalCompositeOperation = 'lighter';
    g.save(); g.translate(cx, baseY + 12 * U); g.scale(1, 0.3);
    blob(pal.glow, 0, 0, (130 + 250 * Ic) * U, (0.16 + 0.34 * Ic) * flick * (1 - 0.55 * day) * (0.35 + 0.65 * lit));
    g.restore();
    blob(pal.glow, cx, baseY - flameH * 0.45, (90 + 230 * Ic) * U, (0.06 + 0.2 * Ic) * flick * lit * (1 - 0.5 * day));

    drawStones(false, pal);

    // --- 熾と薪 ---
    g.globalCompositeOperation = 'lighter';
    g.save(); g.translate(cx, baseY + 8 * U); g.scale(1, 0.34);
    const pulse = 0.78 + 0.22 * Math.sin(T * 2.1);
    blob([255, 80, 20], 0, 0, 74 * U, (0.5 + 0.3 * lit) * pulse);
    blob([255, 190, 80], 0, 0, 38 * U, (0.22 + 0.5 * lit) * pulse);
    g.restore();
    g.globalCompositeOperation = 'source-over';
    for (const s of fx.slots || SLOTS) {
      const a = clamp((S.fuel - s.at) / 6, 0, 1);
      if (a > 0) drawLog(cx + s.x * U, baseY + s.y * U, s.a, s.l * U, 13 * U, 0, a, 0.25 + 0.5 * lit);
    }
    for (const L of landed) drawLog(L.x, L.y, L.rot, L.len * U, 13 * U, L.a, L.a, 0, L.col);

    // --- 煙 ---
    const smokeC = mix([150, 150, 162], [238, 238, 238], day);
    beginBuf(sBuf);
    for (const p of smokes) { const k = p.age / p.life; blob(smokeC, p.x, p.y, p.size * (1 + k * 2.4), Math.sin(k * Math.PI) * (0.06 + 0.07 * day)); }
    endBuf(sBuf, 'source-over', 1);

    // --- 炎（加算で描きためてから、下地 → 加算の2度重ね。朝の明るい空でも色が残る） ---
    const dim = 0.78 - 0.34 * Ic; // 大きい火ほど粒が重なるので1粒を淡く
    beginBuf(fBuf);
    g.globalCompositeOperation = 'lighter';
    for (const p of flames) {
      const k = p.age / p.life, a = (k < 0.12 ? k / 0.12 : 1) * (1 - k) * dim, s = p.size * (1 - 0.7 * k), c = PAL[p.pal];
      blob(c.edge, p.x, p.y, s, a * 0.5);
      blob(c.core, p.x, p.y + s * 0.12, s * 0.5, a * (1 - k) * 0.6);
    }
    endBuf(fBuf, 'source-over', 0.22 + 0.5 * day);
    endBuf(fBuf, 'lighter', 1 - 0.3 * day);

    drawStones(true, pal);

    // --- 火の粉 ---
    g.globalCompositeOperation = 'lighter';
    for (const p of sparks) {
      const k = p.age / p.life;
      blob(p.c, p.x, p.y, p.size * 2.2, (1 - k) * (0.65 + 0.35 * Math.sin(T * 22 + p.seed)));
    }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;

    drawSpirit();
    run('front', day);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;

    for (const L of flying) { const k = L.t / L.dur, sc = 1.25 - 0.35 * k; drawLog(L.x, L.y, L.rot, L.len * U * sc, (L.th || 13) * U * sc, 1, 1, 0, L.col); }

    // --- 花火 ---
    g.globalCompositeOperation = 'lighter';
    if (fx.flash > 0) blob(fx.flashC, fx.flashX, fx.flashY, W * 0.9, fx.flash);
    for (const r of rockets) { if (r.delay > 0) continue; blob(r.c, r.x, r.y, 9 * U, 0.7); blob([255, 255, 240], r.x, r.y, 4 * U, 1); }
    g.lineCap = 'round';
    for (let i = 0; i < fw.length; i++) {
      const p = fw[i], k = p.age / p.life;
      let a = Math.pow(1 - k, 1.4);
      if (p.tw || k > 0.55) a *= 0.55 + 0.45 * Math.sin(T * 34 + i * 1.7);
      g.globalAlpha = 1; g.strokeStyle = rgba(p.c, a.toFixed(3)); g.lineWidth = (p.big ? 2.4 : 2) * U;
      g.beginPath(); g.moveTo(p.x - p.vx * 0.1, p.y - p.vy * 0.1); g.lineTo(p.x, p.y); g.stroke();
      blob(p.c, p.x, p.y, (p.big ? 5 : 4) * U, a);
    }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    run('top', day);
    if (fx.bright > 0) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(0.5, fx.bright); g.fillStyle = '#fff3dc'; g.fillRect(-9, -9, W + 18, H + 18); }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  }

  // ================= 画面まわり（DOM） =================
  const elStage = $('stage'), elCount = $('count'), elRing = $('ring'), elToast = $('toast'), elHint = $('hint');
  const ICON = {
    moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg>',
    on: '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    off: '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  };
  const SKY_LABEL = { auto: '自動', night: '夜', day: '朝' };

  function skyTarget() {
    if (S.set.sky === 'night') return 0;
    if (S.set.sky === 'day') return 1;
    const h = new Date().getHours();
    return h >= 5 && h < 17 ? 1 : 0; // 自動: 5:00〜16:59 を朝とする
  }

  let lastStage = '', lastCount = -1, lastRing = -1;
  function updHud() {
    const st = stageOf(S.fuel);
    if (st !== lastStage) { lastStage = st; elStage.textContent = st; }
    if (S.totalLogs !== lastCount) { lastCount = S.totalLogs; elCount.textContent = `くべた薪 ${S.totalLogs.toLocaleString('ja-JP')}本`; }
    const ring = Math.round(S.fuel * 2);
    if (ring !== lastRing) { lastRing = ring; elRing.style.strokeDashoffset = (295.31 * (1 - ring / 200)).toFixed(1); }
  }

  let toastTimer = 0;
  function toast(stars, title, sub, ms, cls) {
    elToast.className = cls || '';
    const b = elToast.querySelector('b');
    b.textContent = '';
    if (stars) { const sp = document.createElement('span'); sp.textContent = stars; b.appendChild(sp); }
    b.appendChild(document.createTextNode(title));
    elToast.querySelector('small').textContent = sub || '';
    elToast.classList.add('show'); app.classList.add('toasting');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { elToast.classList.remove('show'); app.classList.remove('toasting'); }, ms || 4000);
  }
  function hideHint() { elHint.classList.add('gone'); }

  function syncButtons() {
    $('icoSound').innerHTML = S.set.sound ? ICON.on : ICON.off;
    $('lblSound').textContent = S.set.sound ? '音・ON' : '音・OFF';
    $('btnSound').classList.toggle('active', S.set.sound);
    $('icoSky').innerHTML = skyTarget() ? ICON.sun : ICON.moon;
    $('lblSky').textContent = '空・' + SKY_LABEL[S.set.sky];
    $('lblBook').textContent = `図鑑 ${foundCount()}/${RARES.length}`;
    $('dot').classList.toggle('on', !!S.unseen);
  }
  const foundCount = () => RARES.filter((r) => S.col[r.id]).length;
  function setSound(v) { S.set.sound = v; Sound.set(v); save(); syncButtons(); }
  function setSky(m) { S.set.sky = m; dayTarget = skyTarget(); save(); syncButtons(); }

  // --- 薪をくべる操作（タップ／長押しで連続） ---
  const btnFeed = $('btnFeed');
  let holdDelay = 0, holdTimer = 0;
  function startFeed(e, fromBtn) {
    if (e.button > 0) return;
    e.preventDefault();
    Sound.unlock();
    const px = fromBtn ? cx : e.clientX - app.getBoundingClientRect().left;
    for (const guard of TAP_GUARD) if (guard(e)) return;
    throwLog(px);
    endFeed();
    if (fromBtn) btnFeed.classList.add('down');
    holdDelay = setTimeout(() => { holdTimer = setInterval(() => throwLog(px + rnd(-20, 20), true), 250); }, 380);
  }
  function endFeed() { clearTimeout(holdDelay); clearInterval(holdTimer); btnFeed.classList.remove('down'); }
  cv.addEventListener('pointerdown', (e) => startFeed(e, false));
  btnFeed.addEventListener('pointerdown', (e) => startFeed(e, true));
  for (const ev of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(ev, endFeed);
  window.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && !app.classList.contains('sheet')) {
      e.preventDefault(); Sound.unlock();
      for (const guard of TAP_GUARD) if (guard(e)) return;
      throwLog(cx);
    }
  });

  $('btnSound').addEventListener('click', () => {
    setSound(!S.set.sound);
    toast('', S.set.sound ? '音 ON' : '音 OFF', S.set.sound ? '消音モードのときは鳴りません' : '', 1800);
  });
  $('btnSky').addEventListener('click', () => {
    const order = ['auto', 'night', 'day'];
    setSky(order[(order.indexOf(S.set.sky) + 1) % 3]);
    toast('', '空：' + SKY_LABEL[S.set.sky], (S.set.sky === 'auto' ? '時刻に合わせて朝と夜が変わります　／　' : '') + '今夜の月：' + moonName(), 2600);
  });

  // --- 図鑑・ログ・設定 ---
  const fmtDate = (t) => { const d = new Date(t), p = (n) => String(n).padStart(2, '0'); return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  const fmtDay = (t) => { const d = new Date(t); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; };
  const fmtDur = (s) => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}時間${m}分` : m ? `${m}分` : `${s}秒`; };
  const orbCss = (r) => (r.orb
    ? `background:radial-gradient(circle at 50% 32%,${r.orb[0]},${r.orb[1]} 55%,${r.orb[2]});box-shadow:0 0 14px ${r.orb[1]}66`
    : 'background:conic-gradient(#ff5a5a,#ffb23c,#ffe66a,#5fd86f,#5aa8ff,#9a6aff,#ff5a5a);box-shadow:0 0 14px #ffffff55');
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  // 上部の小さな状態表示（天気・タイマーなど）、くべるボタンの上の小さなボタン、短いお知らせカード
  const statusParts = {};
  function setStatus(key, text) {
    if (statusParts[key] === text) return;
    statusParts[key] = text;
    $('wx').textContent = Object.values(statusParts).filter(Boolean).join('　');
  }
  // チップ: show() が真のときだけ見える。label(short) は、数が多いとき短い表記を返す。選択肢を出すあいだは、ほかのチップを隠す
  const CHIPS = [], CHIP_OFF = [];
  let chipMenu = null;
  function addChip(id, label, fn, show) {
    const b = el('button', 'chip'); b.id = id; b.hidden = true;
    b.addEventListener('click', (e) => { Sound.unlock(); fn(e); syncChips(); });
    CHIPS.push({ el: b, show: show || (() => true), label: typeof label === 'function' ? label : () => label, hot: null });
    $('chips').appendChild(b);
    return b;
  }
  function closeChipMenu() { if (chipMenu) for (const b of chipMenu) b.remove(); chipMenu = null; }
  function openChipMenu(items) { // items: [表示, 押したときの処理, id]
    closeChipMenu();
    chipMenu = items.map(([label, fn, id]) => {
      const b = el('button', 'chip', label); if (id) b.id = id;
      b.addEventListener('click', () => { Sound.unlock(); closeChipMenu(); fn(); syncChips(); });
      $('chips').appendChild(b);
      return b;
    });
    syncChips();
  }
  function syncChips() { // DOM は変わったときだけ書く
    const base = !chipMenu && !CHIP_OFF.some((fn) => fn());
    const vis = CHIPS.filter((c) => { const v = base && c.show(); if (c.el.hidden === v) c.el.hidden = !v; return v; });
    const tight = vis.length >= 4 || (chipMenu && chipMenu.length >= 5);
    for (const c of vis) { const t = c.label(tight); if (c.el.textContent !== t) c.el.textContent = t; }
    $('chips').classList.toggle('tight', !!tight);
    $('chips').classList.toggle('menu', !!chipMenu);
  }
  HOOKS.sec.push(syncChips);
  HOOKS.boot.push(syncChips);
  let noteTimer = 0;
  function closeNote() { clearTimeout(noteTimer); app.classList.remove('noting'); }
  function showNote(title, lines, opt) {
    opt = opt || {};
    const n = $('note'); n.textContent = '';
    n.appendChild(el('b', '', title));
    if (opt.img) { const im = new Image(); im.src = opt.img; n.appendChild(im); }
    for (const l of lines) n.appendChild(el('p', '', l));
    const bt = el('div', 'btns');
    for (const [label, fn] of opt.buttons || []) { const b = el('button', '', label); b.addEventListener('click', fn); bt.appendChild(b); }
    const c = el('button', '', 'とじる'); c.addEventListener('click', closeNote); bt.appendChild(c);
    n.appendChild(bt);
    app.classList.add('noting');
    clearTimeout(noteTimer);
    if (opt.ms) noteTimer = setTimeout(closeNote, opt.ms);
  }

  let sheetTab = 'book', selId = null, wipeArm = 0;
  function openSheet(tab) { sheetTab = tab; endFeed(); app.classList.add('sheet'); $('sheet').setAttribute('aria-hidden', 'false'); renderSheet(); $('sheetBody').scrollTop = 0; }
  function closeSheet() { app.classList.remove('sheet'); $('sheet').setAttribute('aria-hidden', 'true'); }
  function renderSheet() {
    for (const t of ['book', 'log', 'set']) $('pane' + t[0].toUpperCase() + t.slice(1)).classList.toggle('on', t === sheetTab);
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === sheetTab));
    if (sheetTab === 'book') { renderBook(); if (S.unseen) { S.unseen = false; save(); syncButtons(); } }
    else if (sheetTab === 'log') renderLog();
    else renderSet();
  }
  let bookPage = 'rare';
  function renderBook() {
    const pane = $('paneBook'); pane.textContent = '';
    const pages = BOOK_PAGES.filter((pg) => !pg.show || pg.show());
    if (pages.length > 1) {
      const seg = el('div', 'seg pages');
      for (const pg of pages) {
        const b = el('button', pg.id === bookPage ? 'on' : '', pg.label);
        b.addEventListener('click', () => { bookPage = pg.id; renderBook(); $('sheetBody').scrollTop = 0; });
        seg.appendChild(b);
      }
      pane.appendChild(seg);
    }
    (pages.find((pg) => pg.id === bookPage) || pages[0]).render(pane);
  }
  BOOK_PAGES.push({ id: 'rare', label: '出来事', render: renderRares });
  function renderRares(pane) {
    const h = el('h2', '', '出来事'); h.appendChild(el('small', '', `${foundCount()} / ${RARES.length}`)); pane.appendChild(h);
    const grid = el('div', 'grid'), d = el('div'); d.id = 'detail';
    const show = () => {
      grid.querySelectorAll('.card').forEach((c) => c.classList.toggle('sel', c.dataset.id === selId));
      d.textContent = '';
      const r = RMAP[selId], c = r && S.col[r.id];
      if (!r) { d.appendChild(el('small', '', 'カードをタップすると、説明が見られます。')); return; }
      const b = el('b', '', c ? r.name : '？？？'); b.appendChild(el('span', 'st', starStr(r)));
      d.append(b, el('div', '', c ? r.desc : r.hint));
      if (c) d.appendChild(el('small', '', `はじめて出会った日：${fmtDate(c.first)}　／　${c.n}回`));
    };
    for (const r of RARES) {
      const c = S.col[r.id];
      const card = el('button', 'card' + (c ? '' : ' lock') + (r.kind === 'hidden' ? ' hid' : '')); card.dataset.id = r.id;
      const orb = el('span', 'orb', c ? r.glyph : '？'); orb.style.cssText = orbCss(r);
      const meta = el('span', 'ct'); meta.append(el('i', 'st', starStr(r)), document.createTextNode(c ? ` ${c.n}回` : ''));
      card.append(orb, el('span', 'nm', c ? r.name : '？？？'), meta);
      card.addEventListener('click', () => { selId = r.id; show(); });
      grid.appendChild(card);
    }
    pane.append(grid, d);
    show();
  }
  function renderLog() {
    const pane = $('paneLog'); pane.textContent = '';
    pane.appendChild(el('h2', '', 'できごとログ'));
    if (!S.log.length) { pane.appendChild(el('div', 'empty', 'まだ何も起きていません。\n火を育てて、気長に待ちましょう。')); pane.lastChild.style.whiteSpace = 'pre-line'; return; }
    for (const e of S.log) {
      const r = RMAP[e.id];
      if (!r && !e.txt) continue;
      const row = el('div', 'logrow');
      row.append(el('time', '', fmtDate(e.t)), el('span', 'st', r ? starStr(r) : ''), el('span', '', r ? r.name : e.txt));
      pane.appendChild(row);
    }
  }
  function renderSet() {
    const pane = $('paneSet'); pane.textContent = '';
    pane.appendChild(el('h2', '', '設定'));
    const row = (label, ctl) => { const r = el('div', 'row'); r.append(el('span', '', label), ctl); pane.appendChild(r); return r; };
    const tog = (v, fn) => { const b = el('button', 'tog' + (v ? ' on' : '')); b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(v)); b.addEventListener('click', () => { fn(!v); renderSet(); }); return b; };
    const seg3 = (cur, opts, fn) => { // [値, 表示] の並びから切り替えボタンを作る
      const s = el('div', 'seg');
      for (const [v, label] of opts) { const b = el('button', cur === v ? 'on' : '', label); b.addEventListener('click', () => { fn(v); renderSet(); }); s.appendChild(b); }
      return s;
    };
    const head = (t) => { pane.appendChild(el('h2', '', t)).style.marginTop = '20px'; };
    const api = { pane, row, tog, seg: seg3, head };
    for (const fn of SET_TOP) fn(api);
    row('音（焚き火の音・効果音）', tog(S.set.sound, setSound));
    if (navigator.vibrate) row('振動', tog(S.set.vib, (v) => { S.set.vib = v; save(); }));
    const seg = el('div', 'seg');
    for (const m of ['auto', 'night', 'day']) {
      const b = el('button', S.set.sky === m ? 'on' : '', SKY_LABEL[m]);
      b.addEventListener('click', () => { setSky(m); renderSet(); });
      seg.appendChild(b);
    }
    row('空', seg);
    for (const fn of SET_ROWS) fn(api);
    pane.appendChild(el('h2', '', 'きろく')).style.marginTop = '20px';
    const dl = el('dl', 'stats');
    const stat = (k, v) => dl.append(el('dt', '', k), el('dd', '', v));
    stat('くべた薪', `${S.totalLogs.toLocaleString('ja-JP')}本`);
    stat('火を燃やした時間', fmtDur(S.burnSec));
    stat('見つけた出来事', `${foundCount()} / ${RARES.length}`);
    for (const fn of STATS) fn(stat);
    stat('はじめて火をおこした日', fmtDay(S.firstDay));
    pane.appendChild(dl);
    for (const fn of REC_ROWS) fn(pane);
    const armed = Date.now() < wipeArm;
    const wipe = el('button', 'danger' + (armed ? ' arm' : ''), armed ? '本当に消す（もう一度タップ）' : '記録をすべて消す');
    wipe.addEventListener('click', () => {
      if (Date.now() < wipeArm) {
        const keep = S.set; S = fresh(); S.set = keep; applyDefs(); wipeArm = 0; try { localStorage.removeItem(KEY + '.bak'); } catch (e) { /* 無ければ何もしない */ } selId = null; lastCount = -1;
        fx.flame = null; fx.flameT = 0; save(); syncButtons(); renderSet(); toast('', '記録を消しました', '', 2000);
      } else { wipeArm = Date.now() + 4000; renderSet(); setTimeout(() => { if (sheetTab === 'set' && app.classList.contains('sheet')) renderSet(); }, 4100); }
    });
    pane.appendChild(wipe);
    pane.appendChild(el('p', 'note', '課金・広告・通信は一切ありません。記録はこの端末のブラウザ内（localStorage）にだけ保存されます。'));
    for (const fn of SET_END) fn(api);
  }
  $('btnBook').addEventListener('click', () => openSheet('book'));
  $('btnSet').addEventListener('click', () => openSheet('set'));
  $('btnClose').addEventListener('click', closeSheet);
  $('backdrop').addEventListener('click', closeSheet);
  document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.addEventListener('click', () => { sheetTab = b.dataset.tab; renderSheet(); $('sheetBody').scrollTop = 0; }));
  { // つまみを下にスワイプで閉じる
    let y0 = null;
    const grab = $('grab');
    grab.addEventListener('pointerdown', (e) => { y0 = e.clientY; });
    grab.addEventListener('pointerup', (e) => { if (y0 != null && e.clientY - y0 > 30) closeSheet(); y0 = null; });
    grab.addEventListener('pointercancel', () => { y0 = null; });
  }

  // --- スマホ向けの抑止（スクロール・拡大・長押しメニュー） ---
  document.addEventListener('touchmove', (e) => { if (!e.target.closest || !e.target.closest('#sheetBody')) e.preventDefault(); }, { passive: false });
  for (const ev of ['contextmenu', 'gesturestart', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault());

  // --- 中断と再開 ---
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); endFeed(); save(); Sound.pause(true); }
    else {
      if (hiddenAt) { const sec = span(hiddenAt, Date.now()), f0 = S.fuel; decayAway(sec); run('back', sec, f0); }
      hiddenAt = 0; lastT = 0; Sound.pause(false);
    }
  });
  window.addEventListener('pagehide', save);
  let resizeT = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(resize, 120); });

  // ================= 図鑑の共通カード表示 =================
  // items: { id, name, glyph, css, rec:{n,first}|undefined, desc, hint, stars }
  const cardSel = {};
  function cardPage(pane, key, title, items, unit) {
    const h = el('h2', '', title); h.appendChild(el('small', '', `${items.filter((i) => i.rec).length} / ${items.length}`)); pane.appendChild(h);
    const grid = el('div', 'grid'), d = el('div'); d.id = 'detail';
    const show = () => {
      grid.querySelectorAll('.card').forEach((c) => c.classList.toggle('sel', c.dataset.id === cardSel[key]));
      d.textContent = '';
      const it = items.find((i) => i.id === cardSel[key]);
      if (!it) { d.appendChild(el('small', '', 'カードをタップすると、説明が見られます。')); return; }
      const b = el('b', '', it.rec ? it.name : '？？？'); if (it.stars) b.appendChild(el('span', 'st', it.stars));
      d.append(b, el('div', '', it.rec ? it.desc : it.hint));
      if (it.rec) d.appendChild(el('small', '', `はじめて：${fmtDate(it.rec.first)}　／　${it.rec.n.toLocaleString('ja-JP')}${unit}`));
    };
    for (const it of items) {
      const card = el('button', 'card' + (it.rec ? '' : ' lock')); card.dataset.id = it.id;
      const orb = el('span', 'orb', it.rec ? it.glyph : '？'); orb.style.cssText = it.css;
      card.append(orb, el('span', 'nm', it.rec ? it.name : '？？？'), el('span', 'ct', it.rec ? `${it.rec.n.toLocaleString('ja-JP')}${unit}` : '未発見'));
      card.addEventListener('click', () => { cardSel[key] = it.id; show(); });
      grid.appendChild(card);
    }
    pane.append(grid, d);
    show();
  }
  const orbOf = (c) => `background:radial-gradient(circle at 50% 32%,${rgb(mix(c, [255, 255, 255], 0.55))},${rgb(c)} 58%,${rgb(mix(c, [0, 0, 0], 0.55))});box-shadow:0 0 12px ${rgba(c, 0.4)}`;

  // ================= 薪の種類 =================
  PAL.drift = { core: [220, 250, 245], edge: [50, 170, 215], glow: [70, 180, 220] };
  PAL.sakura = { core: [255, 238, 225], edge: [255, 112, 112], glow: [255, 130, 120] };
  const WOODS = [
    { id: 'cedar',  name: '杉',         glyph: '杉', w: 30, col: [176, 112, 70],  len: 58, th: 13, fuel: 9,  flare: 0.22, sparks: 1.4, desc: 'よく乾いた杉。火つきがよく、パチパチとにぎやかにはぜる。' },
    { id: 'sakura', name: '桜',         glyph: '桜', w: 18, col: [128, 72, 66],   len: 56, th: 13, fuel: 9,  flare: 0.18, sparks: 0.8, desc: '甘い香りの煙が、淡い桜色のもやになって漂う。' },
    { id: 'cone',   name: '松ぼっくり', glyph: '松', w: 14, col: [118, 82, 50],   len: 24, th: 17, fuel: 4,  flare: 0.9,  sparks: 2.4, desc: '松やにで一気に燃え上がるが、すぐに落ち着く。' },
    { id: 'drift',  name: '流木',       glyph: '流', w: 12, col: [156, 152, 142], len: 60, th: 12, fuel: 8,  flare: 0.2,  sparks: 1,   desc: '海の塩がしみた木。炎がしばらく青みがかる。' },
    { id: 'oak',    name: '樫',         glyph: '樫', w: 16, col: [92, 62, 40],    len: 62, th: 15, fuel: 12, flare: 0.08, sparks: 0.6, desc: '重くて硬い木。静かに、長く燃えつづける。' },
    { id: 'bamboo', name: '竹',         glyph: '竹', w: 10, col: [124, 152, 84],  len: 66, th: 11, fuel: 7,  flare: 0.2,  sparks: 1,   desc: '少しおいて節がはぜ、パン！と大きな音を立てる。' },
  ];
  const WMAP = Object.fromEntries(WOODS.map((w) => [w.id, w]));
  def('wood', () => ({}));
  def('woodSel', () => 'random');
  fx.tint = 'fire'; fx.tintT = 0;
  const wfx = { crack: 0, slow: 0, haze: 0, pops: [], forced: null, preview: false };
  const hazes = [];
  const uncounted = () => wfx.preview || fx.uncounted; // プレビューと、おまかせの薪は記録に数えない
  HOOKS.thrown.push((L) => {
    let w = wfx.forced || WMAP[S.woodSel];
    if (!w) { let x = Math.random() * 100; w = WOODS.find((o) => (x -= o.w) < 0) || WOODS[0]; }
    Object.assign(L, { wood: w.id, col: w.col, len: w.len, th: w.th, fuel: w.fuel, flare: w.flare, sparks: w.sparks });
    if (uncounted()) return;
    const rec = S.wood[w.id] || (S.wood[w.id] = { n: 0, first: Date.now() });
    if (++rec.n === 1) { toast('', `はじめての薪：${w.name}`, '図鑑の「薪」に記録', 2600); S.unseen = true; syncButtons(); }
  });
  HOOKS.land.push((L) => {
    if (L.wood === 'cedar') wfx.crack = 5;
    else if (L.wood === 'sakura') { wfx.haze = 7; fx.tint = 'sakura'; fx.tintT = 5; }
    else if (L.wood === 'cone') { Sound.noise(0.25, 'bandpass', 900, 0.35, 0.8); Sound.crackle(2); }
    else if (L.wood === 'drift') { fx.tint = 'drift'; fx.tintT = 9; }
    else if (L.wood === 'oak') wfx.slow = Math.min(60, wfx.slow + 14);
    else if (L.wood === 'bamboo' && wfx.pops.length < 4) wfx.pops.push(rnd(0.9, 1.6));
  });
  BURN_MUL.push(() => (wfx.slow > 0 ? 0.55 : 1));
  HOOKS.update.push((dt) => {
    if (fx.tintT > 0) fx.tintT -= dt;
    if (wfx.slow > 0) wfx.slow -= dt;
    if (wfx.crack > 0) { // 杉: パチパチ
      wfx.crack -= dt;
      if (Math.random() < dt * 15) Sound.crackle(1.7);
      if (Math.random() < dt * 9) addSpark(cx + rnd(-24, 24) * U, baseY - rnd(6, 40) * U, rnd(-60, 60) * U, -rnd(80, 190) * U, rnd(0.5, 1.2), rnd(1, 2) * U, [255, 226, 150], 60);
    }
    if (wfx.haze > 0) { // 桜: 淡いもや
      wfx.haze -= dt;
      if (Math.random() < dt * 5 && hazes.length < 26) hazes.push({ x: cx + rnd(-30, 30) * U, y: baseY - flameH * rnd(0.3, 0.8), vx: rnd(-14, 14) * U, vy: -rnd(8, 20) * U, age: 0, life: rnd(4, 7), size: rnd(26, 44) * U });
    }
    for (let i = hazes.length - 1; i >= 0; i--) {
      const p = hazes[i];
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.age >= p.life) hazes.splice(i, 1);
    }
    for (let i = wfx.pops.length - 1; i >= 0; i--) { // 竹: 遅れてはぜる
      if ((wfx.pops[i] -= dt) > 0) continue;
      wfx.pops.splice(i, 1);
      emberBurst(cx, baseY - 14 * U, 26, 1.3); flare = Math.min(0.9, flare + 0.3);
      Sound.noise(0.12, 'bandpass', 1400, 0.8, 1.4); Sound.tone(220, 70, 0.12, 0.35);
      haptic(18);
    }
  });
  HOOKS.front.push(() => {
    for (const p of hazes) { const k = p.age / p.life; blob([255, 196, 214], p.x, p.y, p.size * (1 + k * 1.6), Math.sin(k * Math.PI) * 0.13); }
  });
  const woodLabel = (short) => (short ? '' : '薪：') + (WMAP[S.woodSel] ? WMAP[S.woodSel].name : 'おまかせ');
  function woodCycle() {
    const order = ['random'].concat(WOODS.map((w) => w.id));
    S.woodSel = order[(order.indexOf(S.woodSel) + 1) % order.length];
    save();
  }
  addChip('chipWood', woodLabel, woodCycle, () => opened('wood'));
  BOOK_PAGES.push({ id: 'wood', label: '薪', show: () => opened('wood'), render: (pane) => cardPage(pane, 'wood', '薪', WOODS.map((w) => ({
    id: w.id, name: w.name, glyph: w.glyph, css: orbOf(w.col), rec: S.wood[w.id], desc: w.desc, hint: 'まだくべたことのない薪。',
  })), '本') });
  for (const w of WOODS) {
    FX['wood-' + w.id] = () => { const n = S.totalLogs; wfx.forced = w; wfx.preview = true; lastThrow = 0; throwLog(cx); wfx.forced = null; wfx.preview = false; S.totalLogs = n; };
  }

  // ================= 火であぶる（マシュマロ・焼き芋） =================
  // 串を火にかざし、いい焼き色のときにタップして引き上げる。火が強いほど早く焼ける
  const ROASTS = {
    marsh: { name: 'マシュマロ', glyph: 'マ', time: 5.5, raw: 0.5, good: 0.78, perfect: 0.9 },
    imo:   { name: '焼き芋',     glyph: '芋', time: 11,  raw: 0.58, good: 0.84, perfect: 0.94 },
  };
  const RESULTS = { raw: ['生焼けの', [236, 228, 214]], good: ['こんがり', [226, 172, 96]], perfect: ['完璧な', [255, 206, 110]], burnt: ['黒焦げの', [58, 44, 38]] };
  def('roast', () => ({}));
  const roast = { on: false, item: 'marsh', p: 0, done: 0, res: null, preview: false, choosing: false };
  const roastResult = (it, p) => (p < it.raw ? 'raw' : p < it.good ? 'good' : p < it.perfect ? 'perfect' : 'burnt');
  function roastStart(item, preview) {
    Object.assign(roast, { on: true, item, p: 0, done: 0, res: null, preview: !!preview, choosing: false });
    toast('', `${ROASTS[item].name}をあぶる`, 'いい色になったら、画面をタップ', 2800);
    syncChips();
  }
  function roastPull() {
    if (roast.done) return;
    const it = ROASTS[roast.item], res = roastResult(it, roast.p);
    roast.res = res; roast.done = 0.001;
    let sub = 'プレビュー（記録されません）';
    if (!roast.preview) {
      const key = roast.item + '-' + res;
      const rec = S.roast[key] || (S.roast[key] = { n: 0, first: Date.now() });
      rec.n++; if (rec.n === 1) { S.unseen = true; syncButtons(); }
      sub = rec.n === 1 ? 'はじめて！ 図鑑の「あぶり」に記録' : `${rec.n}回目`;
      save();
    }
    toast('', RESULTS[res][0] + it.name, sub, 3600);
    if (res === 'perfect') { Sound.chime(2); haptic([20, 40, 20]); emberBurst(cx, baseY - 30 * U, 10, 0.8); }
    else if (res === 'burnt') Sound.tone(180, 70, 0.3, 0.2);
    else Sound.tone(660, 880, 0.18, 0.1);
  }
  TAP_GUARD.push(() => { if (!roast.on) return false; roastPull(); return true; });
  HOOKS.update.push((dt) => {
    if (roast.on) {
      if (roast.done) { roast.done += dt; if (roast.done > 1.6) { roast.on = false; syncChips(); } }
      else {
        roast.p += dt * fx.roastMul * (0.3 + 1.4 * Math.min(1, I)) / ROASTS[roast.item].time;
        if (roast.p >= 1.3 || S.fuel < 5) roastPull(); // 放っておくと黒焦げ／火が消えたらそこまで
      }
    }
    const can = S.fuel >= 20;
    if (can !== roast.can) { roast.can = can; if (!can) roast.choosing = false; syncChips(); }
  });
  function roastColor(item, p) {
    const stops = item === 'marsh'
      ? [[0, [250, 246, 236]], [0.45, [246, 232, 204]], [0.78, [226, 172, 96]], [0.9, [176, 110, 52]], [1.05, [44, 32, 26]]]
      : [[0, [150, 62, 92]], [0.55, [128, 52, 72]], [0.84, [112, 46, 58]], [0.94, [84, 40, 44]], [1.08, [34, 26, 24]]];
    for (let i = 1; i < stops.length; i++) if (p <= stops[i][0]) return mix(stops[i - 1][1], stops[i][1], (p - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
    return stops[stops.length - 1][1];
  }
  HOOKS.front.push(() => {
    if (!roast.on) return;
    const it = ROASTS[roast.item], k = roast.done ? Math.min(1, roast.done / 0.5) : 0, e = k * k * (3 - 2 * k);
    const tx = cx + (36 + 46 * e) * U, ty = baseY - (40 + 54 * e) * U + Math.sin(T * 2.2) * 2 * U, sx = cx + 170 * U, sy = baseY + 96 * U;
    g.strokeStyle = '#3a2a1c'; g.lineWidth = 3 * U; g.lineCap = 'round';
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(tx, ty); g.stroke();
    const p = roast.p, c = roastColor(roast.item, p), sc = 1 + 0.5 * e;
    g.save(); g.translate(tx, ty); g.rotate(-0.5); g.scale(sc, sc);
    g.fillStyle = rgb(c);
    if (roast.item === 'marsh') { rr(-11 * U, -9 * U, 22 * U, 18 * U, 6 * U); g.fill(); }
    else {
      g.beginPath(); g.ellipse(0, 0, 19 * U, 9 * U, 0, 0, TAU); g.fill();
      const open = clamp((p - 0.45) / 0.45, 0, 1) * (p > 1 ? Math.max(0, 1 - (p - 1) * 6) : 1); // 割れ目から黄金色がのぞく
      if (open > 0) { g.fillStyle = rgba([250, 200, 90], 0.95); g.beginPath(); g.ellipse(0, -1 * U, 13 * U * open, 3.4 * U * open, 0, 0, TAU); g.fill(); }
    }
    g.restore();
    g.globalCompositeOperation = 'lighter';
    blob(PAL[palName()].glow, tx, ty, 26 * U, 0.25 * lit); // 火の照り返し
    if (!roast.done && roastResult(it, p) === 'perfect') blob([255, 250, 220], tx - 6 * U, ty - 7 * U, (5 + 3 * Math.sin(T * 18)) * U, 0.9); // 食べごろのきらめき
    if (p > 1.02) for (let i = 0; i < 3; i++) blob([255, 140, 40], tx + rnd(-6, 6) * U, ty - rnd(4, 16) * U, rnd(5, 9) * U, 0.5); // 燃えてしまった
    g.globalCompositeOperation = 'source-over';
  });
  const ROAST_MENU = [], ROAST_ALSO = []; // うめる・ほりだす など、あとから足す選択肢
  function roastMenu() {
    const items = [];
    if (S.fuel >= 20) for (const id of Object.keys(ROASTS)) items.push([ROASTS[id].name, () => roastStart(id), 'chipR-' + id]);
    for (const fn of ROAST_MENU) fn(items);
    items.push(['やめる', () => {}, 'chipRBack']);
    openChipMenu(items);
  }
  const chipRoast = addChip('chipRoast', 'あぶる', roastMenu, () => opened('roast') && (roast.can || ROAST_ALSO.some((fn) => fn())));
  CHIP_OFF.push(() => roast.on);
  const ROAST_CARDS = [];
  const roastCards = () => Object.keys(ROASTS).flatMap((id) => Object.keys(RESULTS).map((res) => ({
    id: id + '-' + res, name: RESULTS[res][0] + ROASTS[id].name, glyph: ROASTS[id].glyph, css: orbOf(roastColor(id, { raw: 0.2, good: 0.75, perfect: 0.86, burnt: 1.2 }[res])),
    rec: S.roast[id + '-' + res], desc: { raw: 'まだ早かった。中は冷たい。', good: 'いい焼き色。ふつうにおいしい。', perfect: 'これ以上ない焼き加減。', burnt: '炭になった。これも思い出。' }[res],
    hint: '火であぶり、引き上げるタイミングで仕上がりが変わる。',
  })));
  BOOK_PAGES.push({ id: 'roast', label: 'あぶり', show: () => opened('roast'), render: (pane) => cardPage(pane, 'roast', 'あぶり', roastCards().concat(...ROAST_CARDS.map((fn) => fn())), '回') });
  for (const id of Object.keys(ROASTS)) FX['roast-' + id] = () => roastStart(id, true);

  // ================= 訪問者 =================
  // 火のそばに来て、しばらく座って、去っていく。火が大きいほど来やすい（確率 × 0.4〜1.0）
  const bigFire = () => 0.4 + 0.6 * S.fuel / 100;
  const VISITORS = [
    { id: 'kitsune',  name: 'キツネ',   star: 1, glyph: '狐', orb: ['#ffe9c8', '#f08a2c', '#8a3c0c'], sky: 'night', p: 0.012,
      desc: '森から出てきて、火のそばで丸くなる。目が合うと、そっぽを向く。', hint: '夜、火が大きいほど来やすい。' },
    { id: 'neko',     name: '猫',       star: 1, glyph: '猫', orb: ['#f2f2f6', '#8c8c9c', '#3c3c4a'], sky: 'day', p: 0.012,
      desc: 'どこからか来て、いちばん暖かい場所をとる。', hint: '朝、火が大きいほど来やすい。' },
    { id: 'fukurou',  name: 'フクロウ', star: 2, glyph: '梟', orb: ['#f4e6cc', '#a8804c', '#4a3018'], sky: 'night', p: 0.005,
      desc: '切り株にとまって、火をじっと見ている。ときどき、ホーと鳴く。', hint: '夜だけ。静かに火を守っていると…。' },
    { id: 'tabibito', name: '旅人',     star: 2, glyph: '旅', orb: ['#dfeef0', '#4f8794', '#1c3a44'], p: 0.004,
      desc: '「少し、あたらせてください」。手をかざして、黙って火を見て、礼を言って去る。', hint: '夜も朝も。火が大きいほど来やすい。' },
    { id: 'shika',    name: '白い鹿',   star: 3, glyph: '鹿', orb: ['#ffffff', '#dfe6f2', '#8a96b0'], p: 0.0012,
      desc: '森の奥に立つ、真っ白な鹿。こちらを見て、音もなく消える。', hint: '森の奥に、ごくまれに…。' },
  ];
  for (const v of VISITORS) {
    addRare({ ...v, on: 'amb', kind: 'visit', minFuel: 20, pf: bigFire });
    TRIG[v.id] = (record) => {
      fx.visitor = { kind: v.id, age: 0, stay: v.id === 'shika' ? 14 : rnd(22, 34), real: !!record, lv: 0 };
      if (v.id === 'fukurou') { Sound.tone(340, 300, 0.4, 0.07, 0.6, 'triangle'); Sound.tone(330, 290, 0.5, 0.07, 1.2, 'triangle'); }
      else Sound.tone(520, 620, 0.25, 0.05);
    };
  }
  fx.visitor = null;
  BUSY.visit = () => !!fx.visitor;
  HOOKS.update.push((dt) => {
    const v = fx.visitor;
    if (!v) return;
    v.age += dt;
    if (v.kind === 'fukurou' && Math.random() < dt * 0.12) { Sound.tone(340, 300, 0.4, 0.06, 0, 'triangle'); Sound.tone(330, 290, 0.5, 0.06, 0.6, 'triangle'); }
    if (v.age > v.stay + 3) fx.visitor = null;
  });
  const E = (x, y, rx, ry, rot) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); g.fill(); };
  const tri = (x1, y1, x2, y2, x3, y3) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.closePath(); g.fill(); };
  function drawVisitor(deerPass, day) {
    const v = fx.visitor;
    if (!v || (v.kind === 'shika') !== deerPass) return;
    const k = clamp(v.age / 2.6, 0, 1) * clamp((v.stay + 3 - v.age) / 2.6, 0, 1), e = k * k * (3 - 2 * k);
    const ge = v.lv >= 4 ? clamp((v.age - v.stay * 0.35) / 1.5, 0, 1) * clamp((v.stay * 0.75 - v.age) / 1.5, 0, 1) : 0; // いちばんなかよくなると増えるしぐさ
    const dark = 0.34 * (1 - day), sh = (c) => rgb(mix(c, [16, 14, 30], dark));
    const blink = Math.sin(T * 1.3 + 2) > 0.985 ? 0.15 : 1;
    g.save();
    g.globalAlpha = e;
    if (v.kind === 'shika') { // 森の奥に立つ
      g.globalCompositeOperation = 'lighter';
      blob([210, 225, 255], W * 0.25, horizon - 6 * U, 62 * U, 0.3 * e);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = e;
      g.translate(W * 0.25, horizon + 22 * U); g.scale(U * 0.95, U * 0.95);
      g.translate(20, 0); g.rotate(0.16 * ge); g.translate(-20, 0); // 一礼する
      g.fillStyle = sh([246, 247, 252]);
      for (const lx of [-13, -8, 9, 14]) g.fillRect(lx, -22, 2.6, 22);
      E(0, -27, 19, 9); // 胴
      g.beginPath(); g.moveTo(11, -32); g.lineTo(19, -48); g.lineTo(25, -46); g.lineTo(19, -24); g.closePath(); g.fill(); // 首
      E(24, -50, 7.5, 4.6, 0.25); tri(18, -54, 16, -61, 21, -55); // 頭と耳
      E(-19, -30, 3, 4);
      g.strokeStyle = sh([236, 238, 246]); g.lineWidth = 1.5; g.lineCap = 'round';
      g.beginPath();
      for (const d of [-1, 1]) { g.moveTo(21, -54); g.lineTo(21 + d * 4, -66); g.lineTo(21 + d * 9, -72); g.moveTo(21 + d * 4, -66); g.lineTo(21 + d * 1, -74); g.moveTo(21 + d * 6.5, -69); g.lineTo(21 + d * 11, -66); }
      g.stroke();
      g.fillStyle = '#26303c'; E(26, -51, 1.1, 1.1 * blink);
      g.restore(); return;
    }
    const owl = v.kind === 'fukurou';
    if (owl) g.translate(cx + 128 * U, baseY + 4 * U); else g.translate(cx + (120 - (v.close ? 14 : 0) + (1 - e) * 46) * U, baseY + 36 * U);
    g.scale(U * 1.25, U * 1.25);
    if (v.kind === 'kitsune') g.scale(1 + 0.14 * ge, 1 - 0.3 * ge);                  // 寝ころぶ
    else if (v.kind === 'neko') g.scale(1 + 0.025 * ge * Math.sin(T * 26), 1);      // のどを鳴らす
    if (owl) { // 切り株ごと現れて、上から舞い降りる
      g.fillStyle = sh([70, 50, 34]); g.fillRect(-9, -2, 18, 20); g.fillStyle = sh([150, 118, 80]); E(0, -2, 9, 3.4);
      g.translate(0, -(1 - e) * 70); g.rotate(0.24 * ge * Math.sin(T * 1.3)); // 首をかしげる
      g.fillStyle = sh([122, 92, 58]); E(0, -15, 10.5, 13.5);
      tri(-9, -25, -7, -32, -3, -26); tri(9, -25, 7, -32, 3, -26);
      g.fillStyle = sh([208, 184, 140]); E(0, -18, 8.4, 7.4); E(0, -8, 5.6, 6);
      g.fillStyle = '#ffd24a'; E(-3.6, -19, 3, 3 * blink); E(3.6, -19, 3, 3 * blink);
      g.fillStyle = '#1a1208'; E(-3.6, -19, 1.4, 1.4 * blink); E(3.6, -19, 1.4, 1.4 * blink);
      g.fillStyle = sh([230, 170, 60]); tri(-1.4, -16.4, 1.4, -16.4, 0, -13.4);
    } else if (v.kind === 'kitsune' || v.kind === 'neko') {
      const fox = v.kind === 'kitsune', body = fox ? [232, 128, 40] : [112, 112, 126], pale = fox ? [255, 244, 226] : [196, 196, 206];
      g.fillStyle = sh(body);
      if (fox) { g.save(); g.rotate(-0.5 + Math.sin(T * 1.4) * 0.08); E(15, -2, 6.5, 15, 0.5); g.fillStyle = sh(pale); E(20.5, -11.5, 4, 5.5, 0.5); g.restore(); g.fillStyle = sh(body); }
      else { g.strokeStyle = sh(body); g.lineWidth = 3.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(8, -3); g.quadraticCurveTo(22, -2, 18, -15 + Math.sin(T * 1.8) * 2); g.stroke(); }
      E(0, -11, 10, 13); // 胴
      g.fillStyle = sh(pale); E(-4.5, -9, 4.4, 8.5);
      g.fillStyle = sh(body); E(-5, -28, 8, 7.2); // 頭
      tri(-11, -32, -10.5, -42, -5, -34); tri(-1, -34, 1.5, -42, 3, -31);
      if (fox) { g.fillStyle = sh(pale); tri(-12, -29, -19, -25, -9, -23.5); g.fillStyle = '#20140c'; E(-18.2, -25.2, 1.3, 1.1); }
      g.fillStyle = fox ? '#20140c' : (day < 0.5 ? '#ffe36a' : '#2a2a30'); E(-8.4, -29, 1.3, 1.5 * blink); if (!fox) E(-3.2, -29, 1.3, 1.5 * blink);
    } else { // 旅人
      g.fillStyle = sh([70, 52, 36]); rr(12, -16, 13, 17, 4); g.fill(); // 荷物
      g.fillStyle = sh([58, 92, 104]);
      g.beginPath(); g.moveTo(-10, 2); g.lineTo(-7, -26); g.quadraticCurveTo(0, -33, 7, -26); g.lineTo(11, 2); g.closePath(); g.fill(); // 外套
      g.strokeStyle = sh([58, 92, 104]); g.lineWidth = 4.2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-5, -20); g.lineTo(-17, -14 + Math.sin(T * 1.1) * 1); g.stroke(); // 火にかざす手
      g.fillStyle = sh([236, 200, 164]); E(-18, -14 + Math.sin(T * 1.1) * 1, 2.2, 2.2); E(-1, -34, 6, 6.4);
      g.fillStyle = sh([190, 60, 50]); rr(-7, -30, 13, 4.4, 2); g.fill(); // 襟巻き
      g.fillStyle = sh([198, 168, 106]); E(-1, -39, 13, 3.2); E(-1, -42, 6.4, 4.4); // 笠
    }
    g.restore();
    if (!owl || e > 0.9) { g.globalCompositeOperation = 'lighter'; blob(PAL[palName()].glow, cx + 112 * U, baseY + 14 * U, 34 * U, 0.16 * e * lit * (1 - 0.5 * day)); g.globalCompositeOperation = 'source-over'; }
  }
  HOOKS.ground.push((day) => drawVisitor(true, day));
  HOOKS.front.push((day) => drawVisitor(false, day));

  // ================= 天気と季節 =================
  // 天気はときどき変わる（設定で固定もできる）。季節は端末の日付で決まる
  const WX_NAME = { clear: '晴れ', rain: '雨', snow: '雪', fog: '霧' };
  const SEASON_NAME = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
  def('weather', () => ({ kind: 'clear', until: Date.now() + 5 * 60000 }));
  def('wx', () => 'auto', true);
  const wxs = { rain: 0, snow: 0, fog: 0, ground: -1, afterRain: 0, force: null, season: null, check: 0, acc: 0, layers: {} };
  const wps = [], flies = [];
  const seasonNow = () => wxs.season || ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'][new Date().getMonth()];
  const wxKind = () => wxs.force || (S.set.wx !== 'auto' ? S.set.wx : S.weather.kind);
  function nextWeather() {
    const se = seasonNow();
    const w = { clear: 60, fog: 12, rain: { spring: 16, summer: 20, autumn: 16, winter: 4 }[se], snow: se === 'winter' ? 26 : 0 };
    let x = Math.random() * (w.clear + w.fog + w.rain + w.snow), kind = 'clear';
    for (const k of Object.keys(w)) { if ((x -= w[k]) < 0) { kind = k; break; } }
    S.weather = { kind, until: Date.now() + rnd(6, 18) * 60000 };
    dirty = true;
  }
  let lastKind = null;
  HOOKS.update.push((dt, real) => {
    wxs.check -= real;
    if (wxs.check <= 0) {
      wxs.check = 1;
      if (Date.now() > S.weather.until) nextWeather();
      const k = wxKind();
      if (lastKind === 'rain' && k !== 'rain') wxs.afterRain = 300; // 雨上がり
      lastKind = k;
      setStatus('wx', `${SEASON_NAME[seasonNow()]}・${WX_NAME[k]}`);
    }
    if (wxs.afterRain > 0) wxs.afterRain -= dt;
    const k = wxKind(), se = seasonNow(), ease = (v, to, r) => (to > v ? Math.min(to, v + dt * r) : Math.max(to, v - dt * r));
    wxs.rain = ease(wxs.rain, k === 'rain' ? 1 : 0, 0.3);
    wxs.snow = ease(wxs.snow, k === 'snow' ? 1 : 0, 0.3);
    wxs.fog = ease(wxs.fog, k === 'fog' ? 1 : 0, 0.2);
    const gt = k === 'snow' || se === 'winter' ? 1 : 0;
    wxs.ground = wxs.ground < 0 ? gt : ease(wxs.ground, gt, 0.12);

    // 降るもの・舞うもの（数に上限あり）
    const calm = k === 'clear';
    wxs.acc += dt;
    const spawn = (rate, make) => { let n = rate * Q() * dt + Math.random(); n = n >= 1 ? Math.floor(n) : 0; while (n-- > 0 && wps.length < 150) wps.push(make()); };
    if (wxs.rain > 0.05) spawn(110 * wxs.rain, () => ({ t: 'rain', x: rnd(-30, W + 80), y: -20, vx: -130 * U, vy: rnd(760, 980) * U, len: rnd(12, 22) * U, a: rnd(0.18, 0.4) }));
    if (wxs.snow > 0.05) spawn(22 * wxs.snow, () => ({ t: 'snow', x: rnd(-10, W + 10), y: -6, vx: 0, vy: rnd(36, 78) * U, s: rnd(1.2, 2.8) * U, ph: rnd(0, TAU), a: rnd(0.6, 1) }));
    if (calm && se === 'spring') spawn(1.4, () => ({ t: 'petal', x: rnd(-10, W + 40), y: -8, vx: -rnd(10, 30) * U, vy: rnd(26, 46) * U, s: rnd(2.6, 4) * U, ph: rnd(0, TAU), a: 0.9, c: pick([[255, 196, 214], [255, 220, 230], [250, 170, 196]]) }));
    if (calm && se === 'autumn') spawn(1.1, () => ({ t: 'leaf', x: rnd(-10, W + 40), y: -8, vx: -rnd(8, 34) * U, vy: rnd(34, 60) * U, s: rnd(3.2, 5) * U, ph: rnd(0, TAU), a: 0.95, c: pick([[214, 96, 34], [196, 60, 36], [226, 160, 50], [150, 84, 40]]) }));
    for (let i = wps.length - 1; i >= 0; i--) {
      const p = wps[i];
      if (p.t !== 'rain') { p.ph += dt * 2.2; p.x += Math.sin(p.ph) * 16 * U * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const inFire = Math.abs(p.x - cx) < (24 + 30 * I) * U && p.y > baseY - flameH && p.y < baseY; // 火に入ると消える
      if (p.y > (p.t === 'rain' ? H : H - 60) || inFire) { wps[i] = wps[wps.length - 1]; wps.pop(); }
    }
    // 夏の夜の蛍
    const wantFlies = se === 'summer' && dayTarget === 0 && calm ? 12 : 0;
    while (flies.length < wantFlies) flies.push({ x: rnd(0, W), y: rnd(horizon - 60 * U, baseY + 60 * U), ph: rnd(0, TAU), sp: rnd(0.4, 1), a: 0 });
    for (let i = flies.length - 1; i >= 0; i--) {
      const p = flies[i];
      p.ph += dt * p.sp;
      p.x += Math.cos(p.ph * 1.7) * 14 * U * dt; p.y += Math.sin(p.ph * 2.3) * 9 * U * dt;
      p.a = ease(p.a, i < wantFlies ? 1 : 0, 0.5);
      if (p.a <= 0 && i >= wantFlies) flies.splice(i, 1);
    }
    // 雨: 火に落ちた雨粒がじゅっと鳴り、湯気が立つ
    if (wxs.rain > 0.5 && lit > 0.3 && Math.random() < dt * 2.2) {
      Sound.noise(rnd(0.05, 0.14), 'highpass', rnd(3000, 6000), 0.07, 1.4);
      if (smokes.length < 60) smokes.push({ x: cx + rnd(-26, 26) * U, y: baseY - rnd(10, 40) * U, vx: rnd(-8, 8) * U, vy: -rnd(30, 50) * U, life: rnd(1.5, 2.6), age: 0, size: rnd(8, 14) * U });
    }
    if (fx.gekko) { fx.gekko.age += dt; if (fx.gekko.age > 28) fx.gekko = null; }
    if (fx.dustT > 0) {
      fx.dustT -= dt;
      if (Math.random() < dt * 34) addSpark(rnd(0, W), rnd(0, baseY), rnd(-6, 6) * U, rnd(4, 14) * U, rnd(0.7, 1.6), rnd(1, 2.2) * U, pick([[255, 255, 255], [220, 240, 255], [255, 244, 220]]), 6);
    }
  });
  BURN_MUL.push(() => 1 + 0.25 * wxs.rain); // 雨の日は薪の減りが少し早い
  HOOKS.sky.push((day) => {
    const cloud = Math.max(wxs.rain, wxs.fog * 0.7, wxs.snow * 0.8);
    if (cloud > 0.01) { g.globalAlpha = 0.6 * cloud; g.fillStyle = rgb(mix([10, 12, 22], [150, 158, 170], day)); g.fillRect(-9, -9, W + 18, horizon + 30); g.globalAlpha = 1; }
    if (fx.gekko) { // 月虹: 白っぽく淡い虹
      const a = clamp(fx.gekko.age / 4, 0, 1) * clamp((28 - fx.gekko.age) / 5, 0, 1);
      const cols = ['255,235,235', '255,246,226', '250,252,236', '232,250,240', '228,238,255', '236,232,255'], lw = 4.4 * U;
      g.lineWidth = lw + 0.6; g.lineCap = 'butt';
      cols.forEach((c, i) => { g.strokeStyle = `rgba(${c},${0.3 * a})`; g.beginPath(); g.arc(W * 0.5, horizon + 40 * U, W * 0.58 - i * lw, Math.PI, TAU); g.stroke(); });
    }
  });
  HOOKS.ground.push((day) => {
    if (wxs.ground <= 0.01) return;
    const get = (key, d) => wxs.layers[key] || (wxs.layers[key] = makeLayer(d, true));
    if (day < 1) { g.globalAlpha = wxs.ground; g.drawImage(get('n', false), 0, 0, W, H); }
    if (day > 0) { g.globalAlpha = wxs.ground * day; g.drawImage(get('d', true), 0, 0, W, H); }
    g.globalAlpha = 1;
  });
  HOOKS.resize.push(() => { for (const k of Object.keys(wxs.layers)) drop(wxs.layers[k]); wxs.layers = {}; wps.length = 0; flies.length = 0; });
  HOOKS.top.push((day) => {
    if (wxs.rain > 0.01) { g.globalAlpha = 0.2 * wxs.rain; g.fillStyle = '#04060e'; g.fillRect(-9, -9, W + 18, H + 18); }
    g.lineCap = 'round'; g.lineWidth = Math.max(1, 1.1 * U);
    for (const p of wps) {
      if (p.t === 'rain') { g.globalAlpha = p.a; g.strokeStyle = '#b4c6e4'; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + p.vx / p.vy * p.len, p.y + p.len); g.stroke(); }
      else if (p.t === 'snow') { g.globalAlpha = p.a; g.fillStyle = '#fff'; g.beginPath(); g.arc(p.x, p.y, p.s, 0, TAU); g.fill(); }
      else { g.globalAlpha = p.a; g.fillStyle = rgb(mix(p.c, [20, 18, 34], 0.35 * (1 - day))); g.beginPath(); g.ellipse(p.x, p.y, p.s, p.s * (0.25 + 0.3 * Math.abs(Math.sin(p.ph * 1.3))), p.ph, 0, TAU); g.fill(); }
    }
    if (flies.length) {
      g.globalCompositeOperation = 'lighter';
      for (const p of flies) blob([200, 255, 120], p.x, p.y, 6 * U, p.a * Math.max(0, Math.sin(p.ph * 3)) * 0.9);
      g.globalCompositeOperation = 'source-over';
    }
    if (wxs.fog > 0.01) { // 霧: ゆっくり流れる白い帯
      const fc = mix([70, 76, 92], [226, 230, 236], day), sp = sprite(fc);
      g.globalAlpha = 0.2 * wxs.fog; g.fillStyle = rgb(fc); g.fillRect(-9, -9, W + 18, H + 18);
      g.globalAlpha = 0.34 * wxs.fog;
      for (let i = 0; i < 4; i++) {
        const w = W * 1.5, x = ((T * (5 + i * 3) * U + i * W * 0.55) % (W + w)) - w, y = horizon - 60 * U + i * 58 * U;
        g.drawImage(sp, x, y - 70 * U, w, 140 * U);
      }
    }
    g.globalAlpha = 1;
  });
  addRare({ id: 'gekko', name: '月虹', star: 3, glyph: '虹', orb: ['#ffffff', '#b8c8e8', '#1c2444'], on: 'amb', kind: 'gekko', sky: 'night', p: 0.02,
    ok: () => wxs.afterRain > 0 && wxKind() === 'clear',
    desc: '雨上がりの夜、月の光がつくる白い虹。', hint: '夜、雨が上がったあとの数分だけ…。' });
  addRare({ id: 'dust', name: 'ダイヤモンドダスト', star: 2, glyph: '晶', orb: ['#ffffff', '#cfe8ff', '#6f9ccc'], on: 'amb', kind: 'dust', sky: 'day', p: 0.006,
    ok: () => wxs.ground > 0.8 && wxKind() !== 'rain' && wxKind() !== 'fog',
    desc: '凍った朝の空気が、光の粒になってきらめく。', hint: '雪景色の朝に、まれに…。' });
  fx.gekko = null; fx.dustT = 0;
  BUSY.gekko = () => !!fx.gekko;
  BUSY.dust = () => fx.dustT > 0;
  TRIG.gekko = () => { fx.gekko = { age: 0 }; };
  TRIG.dust = () => { fx.dustT = 22; };
  SET_ROWS.push(({ row, seg, head }) => {
    head('天気と季節');
    row('天気', seg(S.set.wx, [['auto', '自動'], ['clear', '晴れ'], ['rain', '雨'], ['snow', '雪'], ['fog', '霧']], (v) => { S.set.wx = v; wxs.check = 0; save(); })).classList.add('stack');
    row('季節（端末の日付）', el('span', 'val', SEASON_NAME[seasonNow()]));
  });
  for (const k of Object.keys(WX_NAME)) FX['wx-' + k] = () => { wxs.force = k; wxs.check = 0; };
  for (const k of Object.keys(SEASON_NAME)) FX['season-' + k] = () => { wxs.season = k; wxs.check = 0; wxs.force = wxs.force || 'clear'; };

  // ================= 留守のあいだに・今日の一本・称号 =================
  // 戻ってきたとき、離れていた間の火の様子と、その間に来た訪問者を短く伝える
  function awayReport(sec, f0) {
    if (sec < 180 || S.totalLogs === 0 || hid.quietBoot) return;
    const k = BURN_A / BURN_B;
    const burnT = burnTimeAway(sec, f0);
    const lines = [];
    if (f0 < 5) lines.push('火は熾火のまま、静かに待っていました。');
    else if (S.fuel >= 5) lines.push(`${fmtDur(sec)}のあいだ、火は燃えつづけていました。`);
    else lines.push(`火は${fmtDur(burnT)}ほど燃えて、熾火になりました。`);
    const came = [], sky = dayTarget ? 'day' : 'night';
    for (let tick = Math.min(3000, Math.floor(burnT / 10)); tick > 0 && came.length < 2; tick--) { // 燃えていた間の10秒ごとの抽選を、同じ確率でまとめて行う
      let x = Math.random();
      for (const v of VISITORS) {
        if (f0 < 20 || (v.sky && v.sky !== sky) || came.includes(v)) continue;
        if (x < v.p * 0.7) { came.push(v); break; }
        x -= v.p * 0.7;
      }
    }
    const when = Date.now() - sec * 500;
    for (const v of came) recordRare(v.id, when, true);
    if (came.length) lines.push(`${came.map((v) => v.name).join('と')}が、火にあたっていったようです。`);
    for (const v of came) { const gift = giftLeave(v, true); if (gift) lines.push(`${v.name}が、${gift}を置いていったようです。`); }
    for (const fn of AWAY_LINES) { const l = fn(); if (l) lines.push(l); }
    addLogText('留守のあいだに：' + lines.join(''));
    save();
    showNote('留守のあいだに', lines, { ms: 14000 });
  }
  HOOKS.boot.push(() => awayReport(awaySec, awayFuel0));
  HOOKS.back.push(awayReport);
  FX.away = () => showNote('留守のあいだに', ['火は12分ほど燃えて、熾火になりました。', 'キツネが、火にあたっていったようです。'], { ms: 14000 });

  // 今日の一本: その日に1本でもくべれば連続日数が伸びる。途切れても何も失わない（表示だけ）
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const TITLES = [[100000, '炎の主'], [10000, '火守り'], [1000, '焚き火番'], [100, '薪くべ人'], [0, '火おこし見習い']];
  const titleOf = (n) => TITLES.find((t) => n >= t[0])[1];
  def('streak', () => ({ day: '', n: 0, best: 0 }));
  const streakNow = () => (S.streak.day === dayKey(Date.now()) || S.streak.day === dayKey(Date.now() - 86400000) ? S.streak.n : 0);
  HOOKS.thrown.push(() => {
    const today = dayKey(Date.now()), st = S.streak;
    if (uncounted() || st.day === today) return;
    st.n = st.day === dayKey(Date.now() - 86400000) ? st.n + 1 : 1;
    st.day = today; st.best = Math.max(st.best, st.n);
    save();
    setTimeout(() => toast('', '今日の一本', st.n > 1 ? `連続 ${st.n}日目` : 'きょうも火がつきました', 3000), 2900);
  });
  STATS.push((stat) => {
    stat('称号', titleOf(S.totalLogs));
    stat('今日の一本（連続）', `${streakNow()}日`);
    stat('これまでの最長', `${S.streak.best}日`);
  });

  // ================= 寝落ちモード（タイマー） =================
  // 時間が来るまでに火と音をゆっくり小さくし、最後は熾火と静かな画面にする。保存はしない（その場かぎり）
  const slp = { end: 0, total: 0, asleep: false, dim: 0, f: 1 };
  function setSleep(min, sec) {
    slp.total = sec || min * 60; slp.end = slp.total ? Date.now() + slp.total * 1000 : 0; slp.asleep = false;
    if (!slp.total) { setStatus('sleep', ''); Sound.setFactor(1); slp.f = 1; }
    app.classList.remove('asleep');
  }
  HOOKS.update.push((dt, real) => {
    const target = slp.asleep ? 1 : 0;
    slp.dim += clamp(target - slp.dim, -real * 0.4, real * 0.4);
    if (!slp.end) return;
    const left = (slp.end - Date.now()) / 1000;
    if (left <= 0) { // おやすみなさい
      slp.end = 0; slp.asleep = true; S.fuel = 0; Sound.setFactor(0); slp.f = 0;
      setStatus('sleep', 'おやすみなさい'); app.classList.add('asleep');
      return;
    }
    const f = left / slp.total;
    S.fuel = Math.min(S.fuel, 100 * clamp(f / 0.5, 0, 1));                // 後半で火を絞っていく
    const vol = clamp(f / 0.7, 0, 1);
    if (Math.abs(vol - slp.f) > 0.02) { slp.f = vol; Sound.setFactor(vol); } // 音もいっしょに小さく
    const m = Math.floor(left / 60), s = Math.floor(left % 60);
    setStatus('sleep', `ねむりまで ${m}:${String(s).padStart(2, '0')}`);
  });
  HOOKS.top.push(() => { if (slp.dim > 0.01) { g.globalAlpha = 0.6 * slp.dim; g.fillStyle = '#000'; g.fillRect(-9, -9, W + 18, H + 18); g.globalAlpha = 1; } });
  TAP_GUARD.push(() => { // 眠ったあとのタップは、起こすだけ
    if (!slp.asleep) return false;
    slp.asleep = false; app.classList.remove('asleep'); setStatus('sleep', ''); Sound.setFactor(1); slp.f = 1;
    return true;
  });
  SET_ROWS.push(({ row, seg, head }) => {
    head('寝落ちモード');
    const cur = slp.end ? Math.round(slp.total / 60) : 0;
    row('タイマー', seg(cur, [[0, 'OFF'], [15, '15分'], [30, '30分'], [60, '60分']], (v) => setSleep(v))).classList.add('stack');
  });
  FX.sleep = () => setSleep(0, 20);

  // ================= 環境音ミックス =================
  // 焚き火の音に、川・虫の声・風・雨（天気と連動）を重ねる。音全体が OFF なら何も鳴らない
  const MIX = [['fire', '焚き火'], ['river', '川'], ['bugs', '虫の声'], ['wind', '風'], ['rain', '雨（雨の日だけ）']];
  def('mix', () => ({ fire: { on: true, vol: 0.8 }, river: { on: false, vol: 0.5 }, bugs: { on: false, vol: 0.5 }, wind: { on: false, vol: 0.5 }, rain: { on: true, vol: 0.6 } }), true);
  const amb = { g: null, t: 0, chirp: 0 };
  Sound.onBuild((ctx, out, buf) => {
    const layer = (b, filters) => {
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
      let node = s;
      const fs = filters.map(([type, freq, q]) => { const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = freq; if (q) fl.Q.value = q; node.connect(fl); node = fl; return fl; });
      const trem = ctx.createGain(), gn = ctx.createGain(); gn.gain.value = 0;
      node.connect(trem); trem.connect(gn); gn.connect(out); s.start(0, Math.random() * 2);
      return { gn, trem, fs };
    };
    const lfo = (freq, depth, param) => { const o = ctx.createOscillator(), d = ctx.createGain(); o.frequency.value = freq; d.gain.value = depth; o.connect(d); d.connect(param); o.start(); };
    const river = layer(buf.white, [['bandpass', 760, 0.7]]), river2 = layer(buf.white, [['highpass', 2600]]);
    lfo(0.19, 0.22, river.trem.gain); lfo(0.31, 0.3, river2.trem.gain); river2.gn.disconnect(); river2.gn.gain.value = 0.25; river2.gn.connect(river.gn);
    const wind = layer(buf.brown, [['bandpass', 430, 1.1]]);
    lfo(0.07, 190, wind.fs[0].frequency); lfo(0.11, 0.45, wind.trem.gain);
    const rain = layer(buf.white, [['highpass', 1700], ['lowpass', 7200]]);
    amb.g = { river: river.gn, wind: wind.gn, rain: rain.gn };
  });
  HOOKS.update.push((dt, real) => {
    if (!Sound.live() || !amb.g) return;
    const m = S.set.mix, now = Sound.ctx().currentTime;
    amb.t -= real;
    if (amb.t <= 0) {
      amb.t = 0.3;
      Sound.setFireVol(m.fire.on ? m.fire.vol * 1.25 : 0);
      amb.g.river.gain.setTargetAtTime(m.river.on ? m.river.vol * 0.2 : 0, now, 0.4);
      amb.g.wind.gain.setTargetAtTime(m.wind.on ? m.wind.vol * 0.42 : 0, now, 0.4);
      amb.g.rain.gain.setTargetAtTime(m.rain.on ? m.rain.vol * 0.26 * wxs.rain : 0, now, 0.4);
    }
    if (m.bugs.on) { // 虫の声: 高い音を3つずつ、間をおいて
      amb.chirp -= real;
      if (amb.chirp <= 0) {
        amb.chirp = rnd(0.7, 1.6);
        const f = rnd(4100, 4600), v = 0.035 * m.bugs.vol;
        for (let i = 0; i < 3; i++) Sound.tone(f, f, 0.05, v, i * 0.075);
      }
    }
  });
  SET_ROWS.push(({ pane, row, tog, head }) => {
    head('音のミックス');
    for (const [id, label] of MIX) {
      const m = S.set.mix[id], box = el('div', 'mixctl'), sl = el('input');
      sl.type = 'range'; sl.min = 0; sl.max = 100; sl.value = Math.round(m.vol * 100); sl.setAttribute('aria-label', label + 'の音量');
      sl.addEventListener('input', () => { m.vol = sl.value / 100; amb.t = 0; dirty = true; });
      box.append(sl, tog(m.on, (v) => { m.on = v; amb.t = 0; save(); }));
      row(label, box);
    }
    pane.appendChild(el('p', 'note', '下の「音」ボタンが OFF のあいだは、どの音も鳴りません。'));
  });

  // ================= 写真モード =================
  // UI をすべて隠す。もう一度タップすると、その瞬間の景色に本数と日付を小さく入れた画像を作って戻る
  const photo = { on: false, url: null };
  function photoEnter() {
    photo.on = true; endFeed(); closeNote(); app.classList.add('photo');
    toast('', '写真モード', '画面をタップすると撮って戻ります', 2200);
  }
  function photoShoot() {
    photo.on = false; app.classList.remove('photo');
    if (S.prog) { S.prog.photo = 1; dirty = true; }
    const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
    const x = c.getContext('2d'), k = c.width / W, d = new Date(), pad = (n) => String(n).padStart(2, '0');
    x.drawImage(cv, 0, 0);
    const font = (px) => `${px * k}px "Hiragino Mincho ProN", "Yu Mincho", YuMincho, "Noto Serif JP", serif`;
    x.textBaseline = 'alphabetic'; x.shadowColor = 'rgba(0,0,0,.75)'; x.shadowBlur = 6 * k; x.fillStyle = 'rgba(255,244,224,.92)';
    x.textAlign = 'right';
    x.font = font(13); x.fillText(`くべた薪 ${S.totalLogs.toLocaleString('ja-JP')}本`, c.width - 14 * k, c.height - 30 * k);
    x.font = font(10.5); x.fillText(`${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}${dayTarget ? '' : '　' + moonName()}`, c.width - 14 * k, c.height - 14 * k);
    x.textAlign = 'left'; x.fillStyle = 'rgba(255,244,224,.6)'; x.fillText('焚き火くべ', 14 * k, c.height - 14 * k);
    const name = `takibi-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.png`;
    c.toBlob((blob) => {
      if (!blob) { toast('', '画像を作れませんでした', '', 2400); return; }
      if (photo.url) URL.revokeObjectURL(photo.url);
      photo.url = URL.createObjectURL(blob);
      showNote('写真', ['この景色を残しますか？'], { img: photo.url, buttons: [['保存・共有', () => {
        const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: '焚き火くべ' }).catch(() => {}); return; }
        const a = document.createElement('a'); a.href = photo.url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); // 共有できない環境ではダウンロード
      }]] });
    }, 'image/png');
  }
  TAP_GUARD.unshift(() => { if (!photo.on) return false; photoShoot(); return true; });
  addChip('chipPhoto', '写真', photoEnter, () => opened('photo'));
  FX.photo = photoEnter;

  // ================= 気持ちよさ（コンボ・業火タイム・予兆・金の薪・節目） =================
  // --- くべコンボ: 0.3〜0.8秒のリズムで指でくべ続けると伸びる（長押しの連続くべは数えない） ---
  def('maxCombo', () => 0);
  const combo = { n: 0, last: 0, shown: -1 };
  const elCombo = app.appendChild(el('div')); elCombo.id = 'combo';
  HOOKS.thrown.push((L, auto) => {
    if (uncounted()) return;
    if (auto) { combo.n = 0; return; }
    const now = performance.now(), gap = (now - combo.last) / 1000;
    combo.n = combo.last && gap >= 0.3 && gap <= 0.8 ? combo.n + 1 : 1;
    combo.last = now;
    L.combo = combo.n;
    if (!calm()) L.sparks *= 1 + Math.min(1.5, combo.n / 40);
    if (combo.n > S.maxCombo) S.maxCombo = combo.n;
  });
  function comboBurst(n) {
    emberBurst(cx, baseY - 20 * U, Math.min(90, 30 + n * 0.6), 1.4); flare = 0.9;
    feel.chime(n >= 50 ? 3 : 2); haptic(n >= 100 ? [30, 40, 30, 40, 80] : 25);
    if (n >= 100) { feel.shake(3); feel.bright(0.18); }
  }
  HOOKS.land.push((L) => {
    if (!(L.combo >= 2) || calm()) return; // しずか: 音程の上昇も節目の弾けもなし（最高コンボの記録は続く）
    const f = 330 * Math.pow(2, Math.min(L.combo, 60) / 24); // コンボが伸びるほど音程が上がる
    Sound.tone(f, f, 0.14, 0.08, 0, 'triangle');
    if ([10, 30, 50, 100].includes(L.combo)) comboBurst(L.combo);
  });
  HOOKS.update.push(() => {
    if (combo.n && performance.now() - combo.last > 850) combo.n = 0; // リズムが途切れた
    const show = combo.n >= 3 && !calm() ? combo.n : 0;
    if (show === combo.shown) return;
    combo.shown = show;
    if (show) { elCombo.textContent = `${show} combo`; elCombo.classList.remove('bump'); void elCombo.offsetWidth; elCombo.classList.add('on', 'bump'); }
    else elCombo.classList.remove('on');
  });
  STATS.push((stat) => stat('最高コンボ', `${S.maxCombo}`));
  FX.combo = () => { combo.n = 100; combo.last = performance.now(); comboBurst(100); };

  // --- 業火タイム: 「天を焦がす炎」を保つと金色のゲージがたまり、満タンで15秒間のフィーバー ---
  PAL.gold = { core: [255, 250, 214], edge: [255, 186, 40], glow: [255, 200, 70] };
  def('flameColor', () => 'fire');
  const fever = { gauge: 0, t: 0, ring: -1 };
  const elFever = $('fever');
  function feverStart() {
    fever.t = 15; fever.gauge = 0;
    if (calm()) { setStatus('fever', '業火'); return; } // しずか: 中身は同じ。知らせは上部の小さな文字だけ
    flare = 0.9; feel.bright(0.2);
    btnFeed.classList.add('fever');
    toast('', '業火タイム', '15秒のあいだ、レアな出来事が3倍起きやすい', 3200);
    for (let i = 0; i < 5; i++) Sound.tone(392 * Math.pow(2, i / 5), 392 * Math.pow(2, i / 5), 0.5, 0.08, i * 0.07, 'triangle');
    haptic([30, 30, 30, 30, 60]);
  }
  function feverEnd() { // 火の粉が空へ一斉に舞い上がって締めくくる
    fever.t = 0; btnFeed.classList.remove('fever'); setStatus('fever', '');
    const quiet = calm();
    for (let i = 0; i < (quiet ? 22 : 90); i++) addSpark(cx + rnd(-50, 50) * U, baseY - rnd(0, flameH), rnd(-40, 40) * U, -rnd(160, 420) * U, rnd(1.6, 3.4), rnd(1.2, 2.6) * U, mix(PAL.gold.core, PAL.gold.edge, rnd(0, 1)), -30);
    if (!quiet) { Sound.tone(880, 220, 1.2, 0.07); Sound.crackle(2); }
  }
  RARE_MUL.push(() => (fever.t > 0 ? 3 : 1));
  HOOKS.update.push((dt) => {
    if (fever.t > 0) {
      fever.t -= dt;
      if (calm()) { fx.tint = 'gold'; fx.tintT = 0.4; } // しずか: 炎はうっすら金色。火の粉と音の上乗せなし
      else if (Math.random() < dt * 14) addSpark(cx + rnd(-1, 1) * 40 * U, baseY - rnd(6, flameH * 0.6), rnd(-24, 24) * U, -rnd(70, 190) * U, rnd(0.9, 2.4), rnd(1, 2.4) * U, mix(PAL.gold.core, PAL.gold.edge, rnd(0, 1)), -12); // 火の粉が倍に
      if (!calm() && Math.random() < dt * 9) Sound.crackle(1.5);                                                           // 音もにぎやかに
      if (!calm() && Math.random() < dt * 1.6) { const f = pick([1047, 1319, 1568, 2093]); Sound.tone(f, f, 0.4, 0.03); }
      if (fever.t <= 0) feverEnd();
    } else if (!fx.freeze) {
      fever.gauge = S.fuel >= 90 ? Math.min(1, fever.gauge + dt / 40) : Math.max(0, fever.gauge - dt / 90);
      if (fever.gauge >= 1) feverStart();
    }
    fx.base = fever.t > 0 && !calm() ? 'gold' : S.flameColor;
    const ring = Math.round((fever.t > 0 ? fever.t / 15 : fever.gauge) * 200);
    if (ring !== fever.ring) { fever.ring = ring; elFever.style.strokeDashoffset = (309.76 * (1 - ring / 200)).toFixed(1); }
  });
  FX.fever = feverStart;

  // --- 予兆: レアが出る直前に、まれに色つきの光で知らせる。白 ＜ 青 ＜ 赤 ＜ 金（★2以上確定）＜ 虹（★3確定） ---
  const OMEN = { white: [255, 255, 255], blue: [90, 160, 255], red: [255, 70, 60], gold: [255, 205, 80], rainbow: null };
  function omenShow(color, id) {
    fx.omen = { color, id, age: 0 };
    const base = { white: 587, blue: 698, red: 784, gold: 1047, rainbow: 1319 }[color];
    Sound.tone(base, base, 0.9, 0.06); if (color === 'gold' || color === 'rainbow') Sound.tone(base * 1.5, base * 1.5, 0.9, 0.05, 0.12);
    haptic(12);
  }
  omenFn = (id) => {
    const r = id && RMAP[id];
    if (r && r.kind === 'hidden') return false; // 隠し要素は前触れなしで起きる
    const x = Math.random(), y = Math.random();
    if (!r) { // ハズレ予兆（何も起きない）。金と虹は出さない
      if (x < 0.017) omenShow(x < 0.012 ? 'white' : x < 0.0158 ? 'blue' : 'red', null);
      return false;
    }
    if (x > 0.5) return false; // 半分は予兆なしで、いきなり起きる
    omenShow(r.star >= 3 ? (y < 0.2 ? 'red' : y < 0.55 ? 'gold' : 'rainbow') : r.star >= 2 ? (y < 0.25 ? 'blue' : y < 0.6 ? 'red' : 'gold') : (y < 0.45 ? 'white' : y < 0.85 ? 'blue' : 'red'), id);
    return true; // 結果はもう決まっている。1.5秒後に起こす
  };
  HOOKS.update.push((dt, real) => {
    const o = fx.omen;
    fx.hold = !!o && o.age < 0.32 && !calm(); // 火の粉が一瞬止まる
    if (!o) return;
    o.age += real * (calm() ? 1.55 : 1);       // しずか: 短く
    if (o.id && o.age >= 1.5) { const id = o.id; o.id = null; trigger(id, true); }
    if (o.age >= 2) fx.omen = null;
  });
  HOOKS.front.push(() => {
    const o = fx.omen;
    if (!o) return;
    const c = OMEN[o.color] || PAL[RAINBOW[Math.floor(o.age * 9) % RAINBOW.length]].edge, a = Math.sin(Math.min(1, o.age / 2) * Math.PI) * (calm() ? 0.4 : 1);
    g.globalCompositeOperation = 'lighter';
    blob(c, cx, baseY + 4 * U, (50 + 26 * Math.sin(o.age * 9)) * U, 0.75 * a);
    blob(c, cx + 38 * U, baseY + 11 * U, 13 * U, a); blob([255, 255, 255], cx + 38 * U, baseY + 11 * U, 6 * U, a); // 薪の切り口が光る
    g.globalAlpha = 0.8 * a * (1 - o.age / 2); g.strokeStyle = rgb(c); g.lineWidth = 2.4 * U;
    g.beginPath(); g.ellipse(cx, baseY + 8 * U, (40 + o.age * 90) * U, (11 + o.age * 25) * U, 0, 0, TAU); g.stroke();
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  });
  for (const k of Object.keys(OMEN)) FX['omen-' + k] = () => omenShow(k, null);

  // --- 金の薪: くべるたびに 1/500 で、次の一本が金色に光る ---
  addRare({ id: 'kinmaki', name: '金の薪', star: 2, glyph: '金', orb: ['#fffbe0', '#ffc83c', '#a86a08'], on: 'none', kind: 'gold', p: 0,
    desc: '手元の薪が金色に光っていた。くべた瞬間、火は天まで届いた。', hint: '薪をくべつづけていると、ごくまれに次の一本が金色に…。' });
  TRIG.kinmaki = () => {};
  const gold = { next: false, preview: false };
  function goldArm(preview) {
    gold.next = true; gold.preview = !!preview; btnFeed.classList.add('gold');
    toast('', '金の薪', '次の一本が、金色に光っている', 2800);
    Sound.tone(1568, 1568, 0.6, 0.06); Sound.tone(2093, 2093, 0.6, 0.05, 0.1);
  }
  HOOKS.thrown.push((L) => {
    if (uncounted()) return;
    if (gold.next) { gold.next = false; btnFeed.classList.remove('gold'); L.gold = gold.preview ? 'preview' : true; L.col = [255, 208, 70]; L.len = 60; L.th = 14; }
    else if (Math.random() < 1 / 500) goldArm(false);
  });
  HOOKS.land.push((L) => {
    if (!L.gold) return;
    S.fuel = 100; flare = 0.9; feel.bright(0.3); // 火力が一気に満タン
    if (calm()) Sound.tone(1318.5, 1318.5, 1.6, 0.05); // しずか: やわらかい光と、小さな音ひとつ
    else for (let i = 0; i < 80; i++) { const a = rnd(0, TAU), v = rnd(60, 300) * U; addSpark(cx, baseY - 20 * U, Math.cos(a) * v, Math.sin(a) * v - 120 * U, rnd(1, 2.6), rnd(1.4, 3) * U, mix(PAL.gold.core, PAL.gold.edge, rnd(0, 1)), 70); }
    if (!calm()) for (const [f, w] of [[1318.5, 0], [1975.5, 0.02], [2637, 0.04], [3951, 0.06]]) Sound.tone(f, f, 2.6, 0.07, w); // 澄んだ鐘の音
    trigger('kinmaki', L.gold !== 'preview');
  });
  HOOKS.update.push((dt) => { for (const L of flying) if (L.gold && Math.random() < dt * 40) addSpark(L.x, L.y, rnd(-20, 20) * U, rnd(-10, 30) * U, 0.5, 1.6 * U, [255, 226, 130], 40); });
  FX.gold = () => goldArm(true);

  // --- 節目: 100・1,000・10,000本と、777 や 1,111 のようなゾロ目 ---
  const isMilestone = (n) => [100, 1000, 10000, 100000].includes(n) || (n >= 111 && /^(\d)\1+$/.test(String(n)));
  function milestone(n) {
    elCount.classList.remove('pop'); void elCount.offsetWidth; elCount.classList.add('pop');
    feel.fireworks(3); feel.bright(0.25);
    setTimeout(() => toast('', `くべた薪 ${n.toLocaleString('ja-JP')}本`, TITLES.some((t) => t[0] === n) ? `称号「${titleOf(n)}」` : 'ゾロ目の一本', 3800), 60);
    feel.chime(3); haptic([30, 40, 30]);
  }
  HOOKS.thrown.push(() => { if (!uncounted() && isMilestone(S.totalLogs)) milestone(S.totalLogs); });
  FX.milestone = () => milestone(777);

  // --- 図鑑が埋まるたびに図鑑ボタンが光る。全部（？？？のひとつを除く）埋めると炎の色を選べる ---
  const bookDone = () => S.colorFree || RARES.every((r) => r.id === 'gameover' || S.col[r.id]);
  HOOKS.found.push(() => {
    const b = $('btnBook'); b.classList.remove('glow'); void b.offsetWidth; b.classList.add('glow');
    if (bookDone()) setTimeout(() => showNote('図鑑がそろいました', ['すべての出来事に出会いました。', '設定から、炎の色を自由に選べるようになりました。'], { ms: 16000 }), 6000);
  });
  SET_ROWS.push(({ pane, row, seg, head }) => {
    head('炎の色');
    if (!bookDone()) { pane.appendChild(el('p', 'note', '図鑑の「出来事」をすべて埋めると（最後の ？？？ を除く）、炎の色を自由に選べるようになります。')); return; }
    row('ふだんの炎', seg(S.flameColor, [['fire', '橙'], ['blue', '青'], ['green', '翠'], ['purple', '紫'], ['pink', '桜'], ['gold', '金'], ['rainbow', '虹']], (v) => { S.flameColor = v; save(); })).classList.add('stack');
  });

  // ================= 隠し要素: 擬似コンティニュー と 起こるはずのない「ゲームオーバー」 =================
  // どちらも既存の抽選タイミングごとに、ごく低い確率で起きる（1日に1回まで。同じ日に両方は起きない）。
  // 消えるのは見た目だけで、くべた本数・火の状態・図鑑・設定などの記録には一切触れない。
  def('lastHidden', () => '');
  def('pendingContinue', () => 0);
  def('pendingGameOver', () => 0);
  const hid = { busy: false, preview: false, taps: 0, timers: [], quietBoot: false, mode: '' };
  const hiddenOk = () => !hid.busy && !fx.steward && !S.pendingContinue && !S.pendingGameOver && S.lastHidden !== dayKey(Date.now());
  addRare({ id: 'continue', name: 'コンティニュー？', star: 3.5, stars: '★★★☆', glyph: '続', orb: ['#eeeef6', '#5c5c7c', '#0c0c18'], on: 'both', kind: 'hidden', p: 1 / 8192, ok: hiddenOk,
    desc: '続けますか、と聞かれた。答えなくても、火はまた灯った。……答えられないときも、あるのだろうか。', hint: 'まだ、だれも知らない。' });
  addRare({ id: 'gameover', name: '消えた焚き火', star: 4, stars: '★★★★', glyph: '消', orb: ['#ffffff', '#34343e', '#000000'], on: 'both', kind: 'hidden', p: 1 / 16384, ok: hiddenOk,
    desc: 'この焚き火に、終わりはない。……はずだった。あの日、火はたしかに一度消えた。それでも、くべた薪も記録も、何ひとつ失われてはいなかった。', hint: 'まだ、だれも知らない。' });
  const over = $('over'), crt = $('crt'), overT = $('overT'), overN = $('overN'), overS = $('overS');
  const later = (ms, fn) => { hid.timers.push(setTimeout(fn, ms)); };
  function hiddenBegin(mode, record, key) {
    wakeSet(false); // 画面をつけたままにする指定は、必ず外す
    hid.busy = true; hid.preview = !record; hid.taps = 0; hid.mode = mode;
    if (record) { S[key] = Date.now(); S.lastHidden = dayKey(Date.now()); save(); } // 演出の前に保留の印を保存する（途中で閉じられても記録が残る）
    endFeed(); closeSheet(); closeNote();
    overT.textContent = ''; overN.textContent = ''; overS.textContent = '';
  }
  function hiddenEnd() { // 元の画面に戻す（擬似コンティニューの終わりと、プレビューから抜けるとき）
    for (const t of hid.timers) clearTimeout(t);
    hid.timers.length = 0;
    over.className = ''; crt.className = ''; app.classList.remove('crt', 'off');
    fx.veil = false; fx.freeze = false; I = 0; // 熾火から、ふっと灯りなおす
    if (hid.mode === 'gameover') { Sound.revive(); if (halted) { halted = false; requestAnimationFrame(frame); } }
    hid.busy = false; hid.mode = '';
  }
  // 図鑑に記録して、特別な見た目のトーストで知らせ、保留の印を消す
  function hiddenSettle(id, key) {
    const c = recordRare(id, S[key]);
    S[key] = 0; save();
    announce(RMAP[id], c.n === 1 ? 'はじめて出会った！ 図鑑に記録' : `${c.n}回目`, 'special');
  }

  // --- 擬似コンティニュー ---
  function pseudoContinue(record) {
    if (hid.busy) return;
    hiddenBegin('continue', record, 'pendingContinue');
    fx.freeze = true; fx.veil = true;                       // 火がふっと弱まる（本数も火力も動かさない）
    over.className = 'on cont';
    later(30, () => over.classList.add('dark'));            // 1秒ほどで静かに暗くなる
    let n = 10;
    const tick = () => {
      overN.textContent = String(n);
      if (n > 0) Sound.tone(n <= 3 ? 990 : 880, n <= 3 ? 990 : 880, 0.07, 0.05, 0, 'square');
      if (n-- > 0) later(1000, tick);
      else later(900, () => {                                 // 0 になっても、何事もなかったように火が灯る
        hiddenEnd();
        if (record) later(1200, () => hiddenSettle('continue', 'pendingContinue'));
        else toast(RMAP.continue.stars, RMAP.continue.name, 'プレビュー（記録されません）', 4000, 'special');
      });
    };
    later(1300, () => { overT.textContent = 'CONTINUE?'; over.classList.add('text'); tick(); });
  }

  // --- ゲームオーバー ---
  function gameOver(record) {
    if (hid.busy) return;
    hiddenBegin('gameover', record, 'pendingGameOver');
    halted = true;                                          // 1) 何の前触れもなく、炎と火の粉が止まる（描画ループも止める）
    over.className = 'on';
    later(320, () => {                                      // 2) プチュン: 縦につぶれて白い線 → 点 → 消える
      Sound.puchun();
      app.classList.add('crt'); crt.className = 'on';
      later(170, () => app.classList.add('off'));
      later(600, () => { crt.className = ''; over.classList.add('black'); });
    });
    later(320 + 600 + 2000, () => {                         // 3) 真っ暗なまま2秒 → 4) 静かに文字が出る。あとは何も起きない
      overT.textContent = 'GAME OVER'; overS.textContent = '火は、消えた。';
      over.classList.add('text', 'slow');
    });
  }
  TRIG.continue = pseudoContinue; TRIG.gameover = gameOver;
  FX.continue = () => pseudoContinue(false); FX.gameover = () => gameOver(false);

  // 演出のあいだは、タップ・長押し・スワイプ・キー入力をすべて受け取って無視する。
  // 抜け出せるのは再読み込みかアプリを閉じたときだけ（プレビューのときだけ、5回タップで抜けられる）
  for (const ev of ['pointerdown', 'pointerup', 'pointermove', 'touchstart', 'touchmove', 'touchend', 'click', 'dblclick', 'contextmenu', 'wheel']) {
    over.addEventListener(ev, (e) => {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      if (ev !== 'pointerdown') return;
      if (hid.mode === 'continue') { overN.classList.remove('shake'); void overN.offsetWidth; overN.classList.add('shake'); } // 数字が揺れるだけ。カウントは止まらない
      else if (hid.mode === 'gameover' && hid.preview && ++hid.taps >= 5) hiddenEnd();
    }, { passive: false });
  }
  window.addEventListener('keydown', (e) => { // 再読み込みなどブラウザ自身の操作（F5、Ctrl/⌘ との組み合わせ）は止めない
    if (!hid.busy || e.ctrlKey || e.metaKey || /^F\d+$/.test(e.key)) return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);

  // 次に起動したとき、保留の印があれば図鑑を解除する（印はすぐ消すので、二重には記録されない）
  HOOKS.boot.unshift(() => {
    if (S.pendingGameOver) {
      hid.quietBoot = true; I = 0;
      app.classList.add('reborn');                          // 一瞬だけ暗い画面から始まり、熾火がふっと灯る
      setTimeout(() => { app.classList.remove('reborn'); hiddenSettle('gameover', 'pendingGameOver'); }, 2600);
    } else if (S.pendingContinue) {
      hid.quietBoot = true;
      setTimeout(() => hiddenSettle('continue', 'pendingContinue'), 1500);
    }
  });

  // ================= 記録を守る（書き出し・読み込み） =================
  // 記録は localStorage にしかないので、1行の文字列にして手元に残せるようにする。
  // 読み込むときは、知っているキーだけを型を確かめながら写し取る（知らないキーや壊れた値は捨てる）
  const V = {
    num: (min, max, int) => (v) => (typeof v === 'number' && isFinite(v) ? (int ? Math.round(clamp(v, min, max)) : clamp(v, min, max)) : undefined),
    bool: (v) => (typeof v === 'boolean' ? v : undefined),
    str: (max, re) => (v) => (typeof v === 'string' && v.length <= max && (!re || re.test(v)) ? v : undefined),
    oneOf: (list) => (v) => (list.includes(v) ? v : undefined),
    obj: (shape) => (v) => { // すべての項目が正しいときだけ通す
      if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
      const o = {};
      for (const k of Object.keys(shape)) { const c = shape[k](v[k]); if (c === undefined) return undefined; o[k] = c; }
      return o;
    },
    rec: (ids, item) => (v) => { // 決まった ID ごとの記録。知らない ID は捨てる
      if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
      const o = {};
      for (const id of ids()) { const c = v[id] == null ? undefined : item(v[id]); if (c !== undefined) o[id] = c; }
      return o;
    },
  };
  V.time = V.num(0, 4e12, true);
  V.count = V.num(0, 1e9, true);
  V.day = V.str(10, /^(\d{4}-\d{2}-\d{2})?$/);
  V.nfirst = (v) => { const o = V.obj({ n: V.num(1, 1e9, true), first: V.time })(v); if (o && V.time(v.last) !== undefined) o.last = V.time(v.last); return o; };
  const CHECK = { // 保存データの項目ごとの検査。あとから足す機能は、ここに自分の項目を足す
    fuel: V.num(0, 100), lastSeen: V.time, firstDay: V.time, totalLogs: V.count, burnSec: V.num(0, 1e10), unseen: V.bool,
    col: V.rec(() => RARES.map((r) => r.id), V.nfirst),
    log: (v) => (Array.isArray(v) ? v.slice(0, 100).map((e) => {
      if (!e || typeof e !== 'object' || V.time(e.t) === undefined) return null;
      if (RMAP[e.id]) return { id: e.id, t: V.time(e.t) };
      return V.str(200)(e.txt) ? { t: V.time(e.t), txt: e.txt } : null;
    }).filter(Boolean) : undefined),
    wood: V.rec(() => WOODS.map((w) => w.id), V.nfirst),
    woodSel: V.oneOf(['random'].concat(WOODS.map((w) => w.id))),
    roast: V.rec(() => roastKeys(), V.nfirst),
    weather: V.obj({ kind: V.oneOf(Object.keys(WX_NAME)), until: V.time }),
    streak: V.obj({ day: V.day, n: V.count, best: V.count }),
    maxCombo: V.count, flameColor: V.oneOf(['fire', 'blue', 'green', 'purple', 'pink', 'gold', 'rainbow']), lastHidden: V.day,
  };
  const CHECK_SET = {
    sound: V.bool, vib: V.bool, sky: V.oneOf(['auto', 'night', 'day']), wx: V.oneOf(['auto'].concat(Object.keys(WX_NAME))),
    mix: V.obj(Object.fromEntries(MIX.map(([id]) => [id, V.obj({ on: V.bool, vol: V.num(0, 1) })]))),
  };
  const roastKeys = () => Object.keys(ROASTS).flatMap((id) => Object.keys(RESULTS).map((r) => id + '-' + r)).concat(Object.keys(BURY).flatMap((id) => Object.keys(BRES).map((r) => id + '-' + r)));
  function sanitize(src) {
    const out = fresh();
    for (const k of Object.keys(CHECK)) { const c = CHECK[k](src[k]); if (c !== undefined) out[k] = c; }
    if (src.set && typeof src.set === 'object') for (const k of Object.keys(CHECK_SET)) { const c = CHECK_SET[k](src.set[k]); if (c !== undefined) out.set[k] = c; }
    return fillDefs(out); // 通らなかった項目・足りない項目は初期値で補う
  }
  const b64 = {
    enc(str) {
      const bytes = new TextEncoder().encode(str); // 日本語を含むので UTF-8 にしてから
      let bin = '';
      for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    dec(s) {
      const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    },
  };
  const PREFIX = 'TKB1.';
  function exportText() { // その場かぎりの状態と、隠し要素の保留の印は含めない（sanitize が知っているキーだけを写すので自然に落ちる）
    const o = sanitize(S);
    delete o.pendingContinue; delete o.pendingGameOver;
    o.lastSeen = Date.now(); o.exportedAt = Date.now();
    return PREFIX + b64.enc(JSON.stringify(o));
  }
  function importParse(text) { // 通らなければ null。何も変えない
    try {
      text = String(text).trim();
      if (text.length > 200000 || !text.startsWith(PREFIX)) return null;
      const o = JSON.parse(b64.dec(text.slice(PREFIX.length)));
      if (!o || typeof o !== 'object' || Array.isArray(o) || o.v !== 1 || typeof o.totalLogs !== 'number' || !isFinite(o.totalLogs) || o.totalLogs < 0) return null;
      const s = sanitize(o);
      return { state: s, at: V.time(o.exportedAt) || 0 };
    } catch (e) { if (DEBUG) console.warn('import: ' + e.message); return null; }
  }
  function replaceState(json) { // いまの記録を1世代だけ控えに残して置き換え、読み込み直す
    try {
      const cur = localStorage.getItem(KEY);
      if (cur) localStorage.setItem(KEY + '.bak', cur);
      localStorage.setItem(KEY, json);
    } catch (e) { toast('', '保存できませんでした', '', 2600); return; }
    noSave = true; location.reload();
  }
  function shareOrDownload(blob, name) { // Web Share が使えればそれで、だめならダウンロード
    const file = typeof File === 'function' ? new File([blob], name, { type: blob.type }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: '焚き火くべ' }).catch(() => {}); return; }
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  let recView = '', recArm = 0, recParsed = null;
  REC_ROWS.push((pane) => {
    const box = el('div', 'recbox');
    const btn = (label, fn, cls) => { const b = el('button', 'plain' + (cls ? ' ' + cls : ''), label); b.addEventListener('click', fn); return b; };
    const go = (v) => { recView = v; recArm = 0; recParsed = null; renderSet(); };
    let hasBak = false;
    try { hasBak = !!localStorage.getItem(KEY + '.bak'); } catch (e) { /* 読めなければ出さない */ }
    if (recView === 'out') {
      const text = exportText(), ta = el('textarea'); ta.value = text; ta.readOnly = true; ta.rows = 3;
      box.append(el('p', 'note', 'この1行が、いまの記録のすべてです。メモやメールなど、なくさない場所に残してください。'), ta);
      box.append(btn('コピー', () => {
        const manual = () => { ta.focus(); ta.select(); toast('', '全体を選択しました', 'コピーして、どこかに貼りつけてください', 3000); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('', 'コピーしました', '', 2000), manual); else manual();
      }), btn('ファイルで保存・共有', () => {
        const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
        shareOrDownload(new Blob([text], { type: 'text/plain' }), `takibi-kiroku-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}.txt`);
      }), btn('とじる', () => go('')));
    } else if (recView === 'in') {
      const ta = el('textarea'); ta.rows = 3; ta.placeholder = 'TKB1. で始まる文字列を貼りつけ';
      const msg = el('p', 'note');
      box.append(el('p', 'note', '書き出した文字列を貼りつけてください。いまの記録は、読み込んだ記録に置き換わります。'), ta, msg);
      const apply = btn('この記録に置き換える', () => {
        if (!recParsed) return;
        if (Date.now() < recArm) { replaceState(JSON.stringify(recParsed.state)); return; }
        recArm = Date.now() + 5000; apply.textContent = '本当に置き換える（もう一度タップ）'; apply.classList.add('arm');
      }, 'warn');
      apply.hidden = true;
      box.append(btn('たしかめる', () => {
        recParsed = importParse(ta.value); recArm = 0; apply.classList.remove('arm'); apply.textContent = 'この記録に置き換える';
        apply.hidden = !recParsed;
        msg.textContent = recParsed
          ? `くべた薪 ${recParsed.state.totalLogs.toLocaleString('ja-JP')}本 ／ 図鑑 ${Object.keys(recParsed.state.col).length}種 ／ 書き出した日 ${recParsed.at ? fmtDay(recParsed.at) : '不明'}`
          : '読み込めませんでした';
      }), apply, btn('とじる', () => go('')));
    } else {
      box.append(btn('記録を書き出す', () => {
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); // 消されにくくしてもらう（結果は表示しない）
        go('out');
      }), btn('記録を読み込む', () => go('in')));
      if (hasBak) {
        const back = btn('ひとつ前の記録に戻す', () => {
          if (Date.now() < recArm) { let bak = null; try { bak = localStorage.getItem(KEY + '.bak'); } catch (e) { /* 何もしない */ } if (bak) replaceState(bak); return; }
          recArm = Date.now() + 5000; back.textContent = '本当に戻す（もう一度タップ）'; back.classList.add('arm');
        }, 'warn');
        box.appendChild(back);
      }
    }
    pane.appendChild(box);
  });
  // iPhone の Safari は、ホーム画面に追加していないサイトの記録を、しばらく開かないと消すことがある。長く遊んだ人に1度だけ知らせる
  def('a2hs', () => false);
  CHECK.a2hs = V.bool;
  HOOKS.sec.push(() => {
    if (S.a2hs || navigator.standalone !== false || S.totalLogs <= 300 || app.classList.contains('noting')) return;
    S.a2hs = true; save();
    showNote('記録について', ['ホーム画面に追加すると、記録が消えにくくなります。', '設定から書き出しもできます。'], { ms: 16000 });
  });
  FX.a2hs = () => showNote('記録について', ['ホーム画面に追加すると、記録が消えにくくなります。', '設定から書き出しもできます。'], { ms: 16000 });

  // ================= 演出のつよさ（設定） =================
  def('calm', () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches), true); // 「視差効果を減らす」の端末だけ、初期値を しずか に
  CHECK_SET.calm = V.bool;
  SET_TOP.push(({ row, seg }) => row('演出', seg(calm(), [[true, 'しずか'], [false, 'にぎやか']], (v) => { S.set.calm = v; if (v) setStatus('fever', fever.t > 0 ? '業火' : ''); else setStatus('fever', ''); save(); })));
  FX['calm-on'] = () => { S.set.calm = true; };
  FX['calm-off'] = () => { S.set.calm = false; setStatus('fever', ''); };

  // ================= ながめる（おまかせ火の番） =================
  // 何もしなくても火が続く。おまかせの薪は、手でくべた薪とは分けて数える（本数・コンボ・今日の一本・図鑑・抽選に入れない）
  def('watchLogs', () => 0);
  def('wake', () => true, true);
  CHECK.watchLogs = V.count; CHECK_SET.wake = V.bool;
  const watch = { end: 0, peek: 0, fed: 0 };
  // 画面を消さない（Screen Wake Lock）。使えない端末・失敗したときは黙って続ける
  const wake = { lock: null, want: false, failed: false, asking: false };
  function wakeAsk() {
    if (!wake.want || wake.lock || wake.asking || !S.set.wake || !navigator.wakeLock || document.hidden) return;
    wake.asking = true;
    navigator.wakeLock.request('screen').then((l) => {
      wake.asking = false;
      if (!wake.want) { l.release().catch(() => {}); return; }
      wake.lock = l; wake.failed = false;
      l.addEventListener('release', () => { if (wake.lock === l) wake.lock = null; }); // 画面を離れると OS が外す。戻ったら取り直す
    }, () => { wake.asking = false; wake.failed = true; });
  }
  function wakeSet(want) {
    wake.want = want;
    if (want) wakeAsk();
    else if (wake.lock) { const l = wake.lock; wake.lock = null; l.release().catch(() => {}); }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wakeAsk(); });
  window.addEventListener('pagehide', () => wakeSet(false));
  const watching = () => watch.end > 0;
  const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  function watchStart(min) {
    watch.end = now() + Math.min(60, min) * 60000; watch.peek = 0; // 1回は最長60分（つけっぱなしを防ぐ）
    app.classList.add('watching'); app.classList.remove('peek');
    wakeSet(true); // 始めるときのタップの中で頼む
    toast('', 'ながめる', '火の番はおまかせください。画面をタップすると操作にもどれます', 3400);
    tickWatch();
  }
  function watchStop(done) {
    watch.end = 0; app.classList.remove('watching', 'peek'); setStatus('watch', '');
    if (done) toast('', '火の番を終わりました', '', 3200);
    tickWatch();
  }
  function tickWatch() {
    if (watching() && now() >= watch.end) { watchStop(true); return; }
    const sleepLeft = slp.end ? (slp.end - Date.now()) / 1000 / slp.total : 0;
    fx.steward = watching() || sleepLeft > 0.3; // 寝落ちタイマーの前半（残り3割まで）も、おまかせ火の番が働く
    fx.ambGap = fx.steward ? 20 : 10;
    if (watching()) setStatus('watch', `ながめる 残り ${mmss(span(now(), watch.end))}`);
    const want = (watching() || (slp.end > 0 && !slp.asleep)) && !hid.busy;
    if (want !== wake.want) wakeSet(want);
    if (fx.steward && S.fuel < 42 && !fx.freeze && !hid.busy && performance.now() - watch.fed >= 4000) { // 火力が42を下回ったら1本（4秒に1本まで）
      watch.fed = performance.now(); lastThrow = 0;
      throwLog(cx + rnd(-40, 40) * U, false, true);
    }
  }
  HOOKS.sec.push(tickWatch);
  HOOKS.update.push(() => { if (watch.peek && performance.now() > watch.peek) { watch.peek = 0; app.classList.remove('peek'); } });
  TAP_GUARD.splice(1, 0, () => { // 1回目のタップは UI を5秒もどすだけ（薪はくべない）。UI が出ている間は、ふつうにくべられる
    if (wake.want) wakeAsk();
    if (!watching()) return false;
    const hidden = !watch.peek;
    watch.peek = performance.now() + 5000; app.classList.add('peek');
    return hidden;
  });
  LOW_RATE.push(() => (watching() && !watch.peek) || slp.asleep);
  function watchMenu() {
    if (watching()) { openChipMenu([['ながめるのをやめる', () => watchStop(false), 'chipWStop'], ['もどる', () => {}]]); return; }
    openChipMenu([[15, 30, 60].map((m) => [`${m}分`, () => watchStart(m), 'chipW' + m]), [['やめる', () => {}]]].flat());
    if (S.set.wake && (!navigator.wakeLock || wake.failed)) toast('', 'ながめる', 'この端末では、画面が自動で消えることがあります', 3600);
  }
  addChip('chipWatch', 'ながめる', watchMenu, () => opened('watch'));
  SET_ROWS.push(({ row, tog }) => row('ながめる・寝落ちの間は画面をつけたままにする', tog(S.set.wake, (v) => { S.set.wake = v; if (!v) wakeSet(false); save(); })));
  STATS.push((stat) => stat('おまかせでくべた薪', `${S.watchLogs.toLocaleString('ja-JP')}本`));
  FX.watch = () => watchStart(15);
  FX['watch-end'] = () => watchStop(true);

  // ================= はじめは火とボタンだけ（少しずつひらく） =================
  // ひらく前でも機能の中身（確率など）は同じ。ボタンが見えないだけ。すでに遊んでいる人は最初から全部ひらく
  const OPENS = [
    ['wood',   '薪の種類', () => S.totalLogs >= 10],
    ['roast',  'あぶる',   () => S.totalLogs >= 20 && S.peak >= 20],
    ['watch',  'ながめる', () => S.totalLogs >= 30],
    ['shiori', 'しおり',   () => S.totalLogs >= 30],
    ['photo',  '写真',     () => S.totalLogs >= 50],
    ['stack',  '組み方',   () => S.totalLogs >= 100],
    ['ember',  '熾',       () => (S.ember || 0) > 10],
  ];
  def('peak', () => (S.totalLogs >= 20 ? 100 : S.fuel)); // これまでに届いたいちばん大きな火力
  def('open', () => { const all = S.totalLogs >= 30 || Object.keys(S.wood).length > 0; return Object.fromEntries(OPENS.map(([k]) => [k, all])); });
  def('view', () => 'full', true);
  def('news2', () => false);
  CHECK.peak = V.num(0, 100); CHECK.open = V.rec(() => OPENS.map(([k]) => k), V.bool); CHECK.news2 = V.bool; CHECK_SET.view = V.oneOf(['full', 'slim']);
  // 静かなトーストを、間をあけて順に出す
  const quietToasts = [];
  let quietAt = 0;
  function quietToast(title, sub, gap) { if (quietToasts.length < 12) quietToasts.push([title, sub, gap || 4000]); }
  HOOKS.sec.push(() => {
    if (S.fuel > S.peak) { S.peak = S.fuel; dirty = true; }
    for (const [k, name, ok] of OPENS) {
      if (S.open[k] || !ok()) continue;
      S.open[k] = true; save(); syncChips();
      quietToast(`「${name}」ができるようになりました`, '', 20000); // 重なったら20秒あけて順に
    }
    if (quietToasts.length && performance.now() >= quietAt && !app.classList.contains('toasting') && !hid.busy) {
      const [title, sub, gap] = quietToasts.shift();
      quietAt = performance.now() + gap;
      toast('', title, sub, 3600);
    }
  });
  // すっきり表示: チップ・コンボ・熾・上部の天気やタイマーの文字を隠す。隠した機能は設定の「火のしたく」から使える
  const applyView = () => app.classList.toggle('slim', S.set.view === 'slim');
  HOOKS.boot.push(applyView);
  SET_TOP.push(({ row, seg }) => row('表示', seg(S.set.view, [['full', 'ふつう'], ['slim', 'すっきり']], (v) => { S.set.view = v; applyView(); save(); })));
  const mini = (label, fn) => { const b = el('button', 'mini', label); b.addEventListener('click', () => { Sound.unlock(); fn(); }); return b; };
  const few = (...btns) => { const d = el('div', 'few'); d.append(...btns); return d; };
  PREP.push(({ row }) => { if (opened('wood')) row('薪の種類', mini(woodLabel(true), () => { woodCycle(); renderSet(); })); });
  PREP.push(({ row }) => {
    if (!opened('watch')) return;
    row('ながめる', watching() ? mini('やめる', () => { watchStop(false); renderSet(); }) : few(...[15, 30, 60].map((m) => mini(`${m}分`, () => { closeSheet(); watchStart(m); })))).classList.add('stack');
  });
  PREP.push(({ row }) => { if (opened('roast') && (roast.can || ROAST_ALSO.some((fn) => fn()))) row('あぶる', mini('えらぶ', () => { closeSheet(); roastMenu(); })); });
  PREP.push(({ row }) => { if (opened('photo')) row('写真', mini('写真モードへ', () => { closeSheet(); photoEnter(); })); });
  SET_ROWS.unshift((api) => {
    if (S.set.view !== 'slim') return;
    api.head('火のしたく');
    for (const fn of PREP) fn(api);
  });
  // あそびかた（ひらいた機能だけ載せる）
  HOWTO.push([null, '画面のどこか、または「くべる」をタップで薪を1本。長押しで連続。火は時間とともに小さくなり、ボタンの外周の輪が今の火力です。']);
  HOWTO.push([null, '下のボタン：図鑑（出会った出来事）／空（朝と夜）／音（初期はOFF）／設定。アプリを閉じても熾火は消えません。']);
  HOWTO.push(['wood', '薪：チップをタップすると種類が変わります。燃え方がそれぞれ違います。']);
  HOWTO.push(['roast', 'あぶる：串を火にかざし、いい焼き色になったら画面をタップ。']);
  HOWTO.push(['watch', 'ながめる：火の番をおまかせして、ただ眺めます。画面をタップすると操作にもどれます。']);
  HOWTO.push(['photo', '写真：UIを隠します。もう一度タップで、その景色を画像に残せます。']);
  SET_END.push(({ pane }) => {
    const d = el('details', 'howto'); d.appendChild(el('summary', '', 'あそびかた'));
    for (const [k, text] of HOWTO) if (!k || opened(k)) d.appendChild(el('p', '', text));
    pane.appendChild(d);
  });
  // アップデート後の最初の起動で1回だけ（はじめての人には出さない）
  NEWS.push(() => '演出のつよさを「しずか／にぎやか」から選べます。');
  NEWS.push(() => '「ながめる」で、何もしなくても火が続きます。');
  NEWS.push(() => '設定から、記録を書き出して手元に残せます。');
  HOOKS.boot.push(() => {
    if (S.news2 || hid.quietBoot) return;
    S.news2 = true; save();
    if (S.totalLogs > 0) setTimeout(() => showNote('あたらしくなりました', NEWS.map((fn) => fn()).filter(Boolean), { ms: 24000 }), 1600);
  });
  FX.news = () => showNote('あたらしくなりました', NEWS.map((fn) => fn()).filter(Boolean), { ms: 24000 });
  FX['open-all'] = () => { for (const [k] of OPENS) S.open[k] = true; syncChips(); };
  FX['open-none'] = () => { for (const [k] of OPENS) S.open[k] = false; syncChips(); };

  // ================= 熾（おき）と、うめて焼く =================
  // 熾: ほどよい火を保つとゆっくりたまる2つ目の量。火持ちがよくなり、たまると「うめて焼く」ができる
  const EMBER_UP = 100 / 480, EMBER_DOWN = 100 / 21600; // 焚き火〜大きな焚き火で約8分で満ちる ／ 熾火の間、約6時間かけて0へ
  def('ember', () => 0);
  def('bury', () => null);
  fx.emberMul = 1; // 組み方による、たまりやすさ
  const BURY = {
    kuri:  { name: '焼き栗',       glyph: '栗', min: 8,  col: [150, 92, 50] },
    ringo: { name: '焼きりんご',   glyph: '林', min: 12, col: [206, 70, 56] },
    hoil:  { name: 'ホイル焼き芋', glyph: '芋', min: 20, col: [196, 200, 208] },
  };
  const BRES = {
    hard: ['まだ硬い', 'まだ早かった。もう少し、熾にまかせればよかった。', 0.35],
    hoku: ['ほくほくの', '湯気が立つ。じゅうぶんおいしい。', 0],
    best: ['最高の', '熾がゆっくり仕上げた、これ以上ない焼き上がり。', -0.25],
    sumi: ['炭になった', '忘れていた。これも思い出。', 0.8],
  };
  CHECK.ember = V.num(0, 100);
  CHECK.bury = (v) => (v === null ? null : V.obj({ item: V.oneOf(Object.keys(BURY)), at: V.time, heat: V.num(0, 1e7) })(v));
  const buryRate = (e) => (e >= 20 ? 0.4 + 0.6 * (e - 20) / 80 : 0); // 熾が20以上の間だけ進む。量で速さが変わる（0.4〜1.0倍）
  const buryRatio = () => (S.bury ? S.bury.heat / (BURY[S.bury.item].min * 60) : 0);
  const buryResult = (r) => (r < 0.7 ? 'hard' : r < 1 ? 'hoku' : r <= 1.6 ? 'best' : 'sumi'); // 最高の幅を広く取る（時計を見張らなくてよい）
  const buryReady = () => { const r = buryRatio(); return !!S.bury && r >= 1 && r <= 1.6; };
  HOOKS.update.push((dt) => {
    if (fx.freeze) return; // 隠し要素の演出中は増減させない
    const f = S.fuel;
    if (f >= 20) S.ember = Math.min(100, S.ember + dt * EMBER_UP * (f >= 40 && f < 90 ? 1 : 0.5) * fx.emberMul); // 強すぎる火は灰にしてしまう
    else if (f < 5) S.ember = Math.max(0, S.ember - dt * EMBER_DOWN);
    if (S.bury) S.bury.heat += dt * buryRate(S.ember);
  });
  // 離れていた間: 熾は増えない。火が熾火になってからのぶんだけ減らす。うめたものは、その間の熾で進む（くり返しは最大300回）
  function emberAway(sec, f0) {
    sec = clamp(sec, 0, 30 * 86400); // 時計がずれていても、負の時間や極端に長い時間は使わない
    const burnT = burnTimeAway(sec, f0), rest = Math.max(0, sec - burnT);
    if (S.bury) S.bury.heat += burnT * buryRate(S.ember);
    const n = Math.min(300, Math.ceil(rest / 60)), step = n ? rest / n : 0;
    for (let i = 0; i < n; i++) {
      S.ember = Math.max(0, S.ember - EMBER_DOWN * step);
      if (S.bury) S.bury.heat += step * buryRate(S.ember);
    }
  }
  HOOKS.boot.unshift(() => emberAway(awaySec, awayFuel0));
  HOOKS.back.unshift(emberAway);
  BURN_MUL.push(() => 1 - 0.35 * S.ember / 100);                                                   // 火持ち: 最大35%ゆっくり
  HOOKS.land.push((L) => { if (L.from < 5 && S.ember >= 30) S.fuel = Math.min(100, S.fuel + 6); }); // 火つき: 熾火からの最初の1本
  // 見た目: 火元の赤い光が強く広くなり、小さな熾の粒が明滅する（粒は最大12個・位置は固定）
  const SPECKS = (() => { const R = seeded(31), out = []; for (let i = 0; i < 12; i++) { const a = R() * TAU, d = Math.sqrt(R()); out.push({ x: Math.cos(a) * d * 52, y: Math.sin(a) * d * 12, sp: 1.5 + R() * 3, ph: R() * TAU }); } return out; })();
  const steam = [];
  HOOKS.ground.push(() => {
    const e = S.ember / 100;
    if (e > 0.02) {
      g.globalCompositeOperation = 'lighter';
      g.save(); g.translate(cx, baseY + 10 * U); g.scale(1, 0.32);
      blob([255, 70, 20], 0, 0, (64 + 60 * e) * U, (0.08 + 0.3 * e) * (0.85 + 0.15 * Math.sin(T * 1.7)));
      g.restore();
      const n = Math.ceil(12 * e);
      for (let i = 0; i < n; i++) { const s = SPECKS[i]; blob([255, 150, 50], cx + s.x * U, baseY + 10 * U + s.y * U, 3.2 * U, e * (0.45 + 0.55 * Math.sin(T * s.sp + s.ph))); }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    if (S.bury) { g.globalAlpha = 0.85; g.fillStyle = '#2a211c'; g.beginPath(); g.ellipse(cx - 34 * U, baseY + 20 * U, 13 * U, 4.6 * U, 0, 0, TAU); g.fill(); g.globalAlpha = 1; } // うめた場所の小さな盛り上がり
  });
  HOOKS.front.push(() => { for (const p of steam) { const k = p.age / p.life; blob([236, 236, 240], p.x, p.y, (5 + 9 * k) * U, Math.sin(k * Math.PI) * 0.16); } });
  HOOKS.update.push((dt) => {
    if (buryReady() && steam.length < 3 && Math.random() < dt * 1.1) steam.push({ x: cx - 34 * U + rnd(-4, 4) * U, y: baseY + 16 * U, age: 0, life: rnd(1.8, 2.8) }); // 食べごろの淡い湯気
    for (let i = steam.length - 1; i >= 0; i--) { const p = steam[i]; p.age += dt; p.y -= 14 * U * dt; p.x += Math.sin(p.age * 2 + i) * 4 * U * dt; if (p.age >= p.life) steam.splice(i, 1); }
  });
  const elDots = $('stage').insertAdjacentElement('afterend', el('div')); elDots.id = 'emberDots';
  let dotsNow = null, hotNow = null;
  HOOKS.sec.push(() => {
    const n = S.ember >= 10 && opened('ember') ? clamp(Math.ceil(S.ember / 20), 1, 5) : 0;
    if (n !== dotsNow) { dotsNow = n; elDots.textContent = n ? '●'.repeat(n) + '○'.repeat(5 - n) : ''; }
    const hot = buryReady();
    if (hot !== hotNow) { hotNow = hot; chipRoast.classList.toggle('hot', hot); } // 食べごろに入ると、あぶるチップがほんのり光る
  });
  function buryStart(id) {
    if (S.bury || S.ember < 40) return;
    S.bury = { item: id, at: now(), heat: 0 }; save();
    toast('', `${BURY[id].name}をうめました`, '熾にまかせて、気が向いたら ほりだします', 3400);
  }
  function buryDig() {
    if (!S.bury) return;
    const it = BURY[S.bury.item], res = buryResult(buryRatio()), key = S.bury.item + '-' + res;
    const rec = S.roast[key] || (S.roast[key] = { n: 0, first: Date.now() });
    rec.n++; if (rec.n === 1) { S.unseen = true; syncButtons(); }
    S.bury = null; steam.length = 0; save();
    toast('', BRES[res][0] + it.name, rec.n === 1 ? 'はじめて！ 図鑑の「あぶり」に記録' : `${rec.n}回目`, 3800);
    if (res === 'best') { feel.chime(2); haptic([20, 40, 20]); } else Sound.tone(res === 'sumi' ? 180 : 620, res === 'sumi' ? 80 : 760, 0.2, 0.09);
  }
  ROAST_ALSO.push(() => !!S.bury || S.ember >= 40);
  ROAST_MENU.push((items) => {
    if (S.bury) items.push(['ほりだす', buryDig, 'chipDig']);
    else if (S.ember >= 40) items.push(['うめる', () => openChipMenu(Object.keys(BURY).map((id) => [BURY[id].name, () => buryStart(id), 'chipB-' + id]).concat([['やめる', () => {}]])), 'chipBury']);
  });
  ROAST_CARDS.push(() => Object.keys(BURY).flatMap((id) => Object.keys(BRES).map((res) => ({
    id: id + '-' + res, name: BRES[res][0] + BURY[id].name, glyph: BURY[id].glyph, css: orbOf(mix(BURY[id].col, res === 'sumi' ? [30, 26, 24] : [255, 220, 150], Math.abs(BRES[res][2]))),
    rec: S.roast[id + '-' + res], desc: BRES[res][1], hint: '熾にうめて、ほりだすまでの時間で仕上がりが変わる。',
  }))));
  AWAY_LINES.push(() => (buryReady() ? `うめた${BURY[S.bury.item].name}が、いい香りをさせています。` : null));
  HOWTO.push(['ember', '熾：「焚き火」くらいの火を保つと、ゆっくりたまります（●の数）。火持ちがよくなり、たまると あぶる から「うめる」が選べます。うめたものは時間をかけて焼け、いつ ほりだしても失敗にはなりません。']);
  for (const res of Object.keys(BRES)) FX['bury-' + res] = () => toast('', BRES[res][0] + BURY.kuri.name, 'プレビュー（記録されません）', 3000);

  // ================= 薪の組み方 =================
  // 炎の形と、火力・減り・火の粉・熾のたまり方が変わる。レアの確率は組み方では変わらない
  const STACKS = [
    { id: 'gassho', name: '合掌型', short: '合掌', h: 1, w: 1, fuel: 1, burn: 1, sparks: 1, ember: 1, roast: 1, slots: SLOTS,
      desc: '立てかけて組む、ふだんの形。' },
    { id: 'igeta', name: '井桁型', short: '井桁', h: 1.15, w: 1.15, fuel: 1.25, burn: 1.35, sparks: 1.3, ember: 0.7, roast: 1,
      desc: '井の字に積む。高く太い炎がすぐ上がるが、薪の減りは早い。',
      slots: [{ x: -28, y: -21, a: 0, l: 18, at: 62 }, { x: 28, y: -21, a: 0, l: 18, at: 26 }, { x: 0, y: -10, a: 0.02, l: 82, at: 44 }, { x: -29, y: 1, a: 0, l: 18, at: -10 }, { x: 29, y: 1, a: 0, l: 18, at: -10 }, { x: 0, y: 12, a: -0.02, l: 88, at: 10 }] },
    { id: 'heiretsu', name: '並列型', short: '並列', h: 0.75, w: 1.35, fuel: 1, burn: 0.7, sparks: 0.7, ember: 1.5, roast: 0.8,
      desc: '横に並べる。低く広い炎でゆっくり長く燃え、熾がよく育つ。あぶりも狙いやすい。',
      slots: [{ x: 0, y: -7, a: 0.03, l: 60, at: 62 }, { x: -26, y: 0, a: -0.04, l: 62, at: 26 }, { x: 27, y: 0, a: 0.05, l: 60, at: 44 }, { x: -46, y: 9, a: 0.04, l: 60, at: -10 }, { x: 46, y: 9, a: -0.05, l: 60, at: -10 }, { x: 0, y: 12, a: 0, l: 66, at: 10 }] },
  ];
  const STMAP = Object.fromEntries(STACKS.map((s) => [s.id, s]));
  def('stack', () => 'gassho');
  def('stackRec', () => ({})); // 組み方ごとの、はじめて使った日と燃やした時間
  CHECK.stack = V.oneOf(STACKS.map((s) => s.id));
  CHECK.stackRec = V.rec(() => STACKS.map((s) => s.id), V.obj({ first: V.time, sec: V.num(0, 1e10) }));
  const stk = { cur: STMAP[S.stack] || STACKS[0], from: null, t: 1, preview: false };
  function stackApply() { const c = stk.cur; fx.sparkMul = c.sparks; fx.emberMul = c.ember; fx.roastMul = c.roast; if (stk.t >= 1) { fx.fw = c.w; fx.fh = c.h; fx.slots = c.slots; } }
  function stackSet(id, preview) { // 約3秒かけて組み変わる（火力は変えない）
    if (!STMAP[id] || STMAP[id] === stk.cur) return;
    stk.from = { w: fx.fw, h: fx.fh, slots: fx.slots || SLOTS }; stk.cur = STMAP[id]; stk.t = 0; stk.preview = !!preview;
    if (!preview) { S.stack = id; save(); }
    stackApply();
    toast('', stk.cur.name, stk.cur.desc, 3200);
  }
  stackApply();
  HOOKS.thrown.push((L) => { L.fuel *= stk.cur.fuel; L.sparks *= stk.cur.sparks; });
  BURN_MUL.push(() => stk.cur.burn);
  HOOKS.update.push((dt) => {
    if (stk.t < 1) {
      stk.t = Math.min(1, stk.t + dt / 3);
      const e = stk.t * stk.t * (3 - 2 * stk.t), c = stk.cur, o = stk.from;
      fx.fw = lerp(o.w, c.w, e); fx.fh = lerp(o.h, c.h, e);
      fx.slots = stk.t >= 1 ? c.slots : c.slots.map((s, i) => { const p = o.slots[i]; return { x: lerp(p.x, s.x, e), y: lerp(p.y, s.y, e), a: lerp(p.a, s.a, e), l: lerp(p.l, s.l, e), at: s.at }; });
    }
    if (S.fuel >= 5 && !fx.freeze && !stk.preview) {
      const rec = S.stackRec[stk.cur.id] || (S.stackRec[stk.cur.id] = { first: Date.now(), sec: 0 });
      rec.sec += dt;
    }
  });
  function stackCycle() { stackSet(STACKS[(STACKS.indexOf(stk.cur) + 1) % STACKS.length].id); }
  addChip('chipStack', (short) => (short ? '' : '組み：') + stk.cur.short, stackCycle, () => opened('stack'));
  PREP.splice(1, 0, ({ row }) => { if (opened('stack')) row('組み方', mini(stk.cur.name, () => { stackCycle(); renderSet(); })); });
  HOWTO.push(['stack', '組み方：合掌型（ふだん）／井桁型（すぐ大きな火に。減りは早い）／並列型（低くゆっくり。熾がよく育つ）。チップで切り替えます。']);
  { // 図鑑「薪」のページの下に、組み方の記録
    const pg = BOOK_PAGES.find((x) => x.id === 'wood'), base = pg.render;
    pg.render = (pane) => {
      base(pane);
      if (!opened('stack')) return;
      const box = el('div', 'stacks'); box.appendChild(el('h2', '', '組み方'));
      for (const s of STACKS) {
        const rec = S.stackRec[s.id], r = el('div', 'stackrow');
        r.append(el('b', '', s.name), el('span', '', s.desc), el('small', '', rec ? `はじめて：${fmtDate(rec.first)}　／　燃やした時間 ${fmtDur(rec.sec)}` : 'まだ試していない'));
        box.appendChild(r);
      }
      pane.insertBefore(box, pane.querySelector('#detail'));
    };
  }
  for (const s of STACKS) FX['stack-' + s.id] = () => stackSet(s.id, true);

  // ================= 訪問者となかよく（おみやげ） =================
  // 会った回数でなかよし度が4段階に上がる。来る確率は変えない
  const FRIEND = { 1: [3, 7, 15, 30], 2: [2, 4, 8, 15], 3: [1, 2, 3, 5] }; // ★ごとのしきい値（回）
  const GIFTS = {
    kitsune:  [['donguri', 'どんぐり'], ['ha', '色づいた葉'], ['suzu', '古い鈴']],
    neko:     [['hane', '鳥の羽根'], ['matatabi', 'またたびの実'], ['koishi', 'きれいな小石']],
    fukurou:  [['kazakiri', '風切り羽'], ['kurumi', 'くるみ'], ['tsukiishi', '月色の石']],
    tabibito: [['hagaki', '絵はがき'], ['coin', '古いコイン'], ['chizu', '手書きの地図']],
    shika:    [['ke', '白い毛'], ['kessho', '雪の結晶'], ['tsuno', '角のかけら']],
  };
  const WORDS = ['いい火ですね。', '薪のはぜる音は、どこで聞いても同じだ。', '山の向こうは、もう雪でした。', '火を見ていると、急ぐ理由を忘れますね。', 'この先の峠で、きれいな星を見ました。', '湯をわかすには、熾がいちばんです。',
    'また寄らせてください。', '昔、ここと似た火を囲んだことがあります。', '道に迷っても、煙は見えるものです。', 'おかげで、手があたたまりました。'];
  def('gifts', () => ({}));
  const giftIds = () => Object.keys(GIFTS).flatMap((v) => GIFTS[v].map(([id]) => v + '-' + id));
  CHECK.gifts = V.rec(giftIds, V.time);
  const friendLv = (v) => { const n = S.col[v.id] ? S.col[v.id].n : 0; return FRIEND[v.star].filter((t) => n >= t).length; };
  // 2〜4段目で、おみやげを1つずつ。すでに回数に達しているぶんも、1回の訪問につき1つ
  function giftLeave(v, quiet) {
    const list = GIFTS[v.id], has = list.filter(([id]) => S.gifts[v.id + '-' + id]).length;
    if (has >= Math.min(3, friendLv(v) - 1)) return null;
    const [id, name] = list[has];
    S.gifts[v.id + '-' + id] = Date.now(); S.unseen = true; save(); syncButtons();
    if (!quiet) { toast('', `${v.name}が、${name}を置いていった`, '図鑑の「おみやげ」に記録', 4400); Sound.tone(784, 1047, 0.3, 0.06); }
    return name;
  }
  HOOKS.update.push((dt) => {
    const v = fx.visitor;
    if (!v) return;
    const r = RMAP[v.kind];
    if (!v.setup) { // 1段目から: 火の少し近くに座り、いる時間が3割のびる
      v.setup = true; v.lv = v.real ? friendLv(r) : v.lv;
      if (v.lv >= 1) { v.close = true; v.stay *= 1.3; }
    }
    if (v.lv >= 4 && v.kind === 'tabibito' && !v.said && v.age > 7) { // 旅人は、ひとこと残す
      v.said = true;
      const w = pick(WORDS);
      toast('', '旅人', `「${w}」`, 5000);
      if (v.real) addLogText(`旅人のひとこと：「${w}」`);
    }
    if (v.lv >= 4 && v.kind === 'neko' && v.age > v.stay * 0.35 && v.age < v.stay * 0.75 && Math.random() < dt * 5) Sound.tone(58, 52, 0.16, 0.05, 0, 'triangle');
    if (v.real && !v.gave && v.age > v.stay) { v.gave = true; giftLeave(r, false); } // 帰りぎわに
  });
  BOOK_PAGES.push({ id: 'gift', label: 'おみやげ', show: () => VISITORS.some((v) => S.col[v.id]), render: (pane) => {
    const box = el('div', 'stacks'); box.appendChild(el('h2', '', 'なかよし'));
    for (const v of VISITORS) {
      const n = S.col[v.id] ? S.col[v.id].n : 0;
      if (!n) continue;
      const lv = friendLv(v), next = FRIEND[v.star][lv], r = el('div', 'stackrow');
      r.append(el('b', '', `${v.name}　${'●'.repeat(lv)}${'○'.repeat(4 - lv)}`), el('small', '', `会った回数 ${n}回` + (next ? `　／　あと${next - n}回で、もっとなかよく` : '　／　いちばんのなかよし')));
      box.appendChild(r);
    }
    pane.appendChild(box);
    cardPage(pane, 'gift', 'おみやげ', VISITORS.flatMap((v) => GIFTS[v.id].map(([id, name]) => ({
      id: v.id + '-' + id, name, glyph: v.glyph, css: orbCss(v), rec: S.gifts[v.id + '-' + id] ? { n: 1, first: S.gifts[v.id + '-' + id] } : undefined,
      desc: `${v.name}が、帰りぎわに置いていった。`, hint: `${v.name}と、もっとなかよくなると…。`,
    }))), 'つ');
  } });
  for (const v of VISITORS) FX['friend-' + v.id] = () => { trigger(v.id, false); Object.assign(fx.visitor, { lv: 4, setup: true, close: true }); }; // いちばんなかよくなったときのしぐさ
  FX.gift = () => toast('', 'キツネが、どんぐりを置いていった', 'プレビュー（記録されません）', 3600);

  // ================= 月の夜（月の満ち欠けにともなう景色とレア） =================
  // 炎の色をすでに解放している人は取り消さない: 追加前の21種がそろっていれば、解放済みの印を残す
  const OLD21 = ['blue', 'green', 'purple', 'pink', 'rainbow', 'hanabi', 'tairin', 'star', 'meteor', 'niji', 'hinoko', 'tsuyu', 'kitsune', 'neko', 'fukurou', 'tabibito', 'shika', 'gekko', 'dust', 'kinmaki', 'continue'];
  def('colorFree', () => OLD21.every((id) => S.col[id]));
  CHECK.colorFree = V.bool;
  const mw = { cv: null, tick: 0 };
  fx.milkyT = 0; fx.haloT = 0;
  const skyClear = () => 1 - Math.max(wxs.rain, wxs.fog, wxs.snow);
  function moonRefresh() { const p = moonPhase(now()); if (Math.abs(p - fx.moonP) > 0.002) { fx.moonP = p; paintMoon(); } fx.starDark = isNewMoon(); }
  fx.moonP = moonPhase(now()); fx.starDark = isNewMoon();
  HOOKS.sec.push(() => { if (++mw.tick >= 600) { mw.tick = 0; moonRefresh(); } }); // 10分に1回たしかめる
  HOOKS.resize.push(() => { // 天の川は動かない絵として1度だけ描く（等倍・空の範囲だけ）
    drop(mw.cv);
    const c = mw.cv = document.createElement('canvas'); c.width = Math.max(2, W); c.height = Math.max(2, horizon);
    const x = c.getContext('2d'), R = seeded(77), gauss = () => (R() + R() + R() + R() - 2) / 2;
    for (let i = 0; i < 26; i++) { const t = R(), px = W * (0.05 + 0.9 * t), py = horizon * (0.82 - 0.74 * t), r = (40 + R() * 46) * U; const gr = x.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, 'rgba(190,200,255,.07)'); gr.addColorStop(1, 'rgba(190,200,255,0)'); x.fillStyle = gr; x.fillRect(px - r, py - r, r * 2, r * 2); }
    for (let i = 0; i < 520; i++) { const t = R(), d = gauss() * 34 * U; x.fillStyle = `rgba(${225 + R() * 30 | 0},${225 + R() * 30 | 0},255,${0.25 + R() * 0.6})`; const s = 0.5 + R() * 0.9; x.fillRect(W * (0.05 + 0.9 * t) + d * 0.64, horizon * (0.82 - 0.74 * t) + d * 0.77, s, s); }
  });
  HOOKS.update.push((dt) => { if (fx.milkyT > 0) fx.milkyT -= dt; if (fx.haloT > 0) fx.haloT -= dt; });
  HOOKS.sky.push((day) => {
    const night = (1 - day) * skyClear();
    if (night <= 0.02) return;
    const fade = (t) => clamp(t / 4, 0, 1) * clamp((30 - t) / 4, 0, 1);
    const a = Math.max(fx.milkyT > 0 ? fade(30 - fx.milkyT) : 0, isNewMoon() ? 0.3 : 0); // 新月のころはうっすら、レアのときははっきり
    if (a > 0.01 && mw.cv) { g.globalAlpha = a * night; g.drawImage(mw.cv, 0, 0, W, horizon); g.globalAlpha = 1; }
    if (fx.haloT > 0) { // 月暈: 月のまわりの光の輪
      const h = fade(30 - fx.haloT) * (1 - day), mx = W * 0.78, my = Math.max(H * 0.15, 96);
      g.strokeStyle = `rgba(226,234,255,${0.26 * h})`; g.lineWidth = 6 * U; g.beginPath(); g.arc(mx, my, 50 * U, 0, TAU); g.stroke();
      g.strokeStyle = `rgba(255,236,214,${0.2 * h})`; g.lineWidth = 2 * U; g.beginPath(); g.arc(mx, my, 46 * U, 0, TAU); g.stroke();
    }
  });
  HOOKS.ground.push((day) => { // 満月のころ: 夜の地面がほんのり明るい
    if (!isFullMoon() || day > 0.9) return;
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.075 * (1 - day) * skyClear(); g.fillStyle = '#a9bcff'; g.fillRect(0, horizon, W, H - horizon);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  });
  addRare({ id: 'amanogawa', name: '天の川', star: 2, glyph: '河', orb: ['#ffffff', '#8f9cf0', '#10143c'], on: 'amb', kind: 'milky', sky: 'night', p: 0.01,
    ok: () => isNewMoon() && wxKind() === 'clear',
    desc: '月のない夜、空を横切る光の川が、はっきりと見える。', hint: '新月のころの、晴れた夜に…。' });
  addRare({ id: 'tsukigasa', name: '月暈', star: 2, glyph: '暈', orb: ['#ffffff', '#d6dcf4', '#3a4470'], on: 'amb', kind: 'halo', sky: 'night', p: 0.01,
    ok: () => isFullMoon() && (wxKind() === 'clear' || wxKind() === 'fog'),
    desc: '満月のまわりに、大きな光の輪がかかる。月暈（つきがさ）。', hint: '満月のころの、晴れか霧の夜に…。' });
  BUSY.milky = () => fx.milkyT > 0; BUSY.halo = () => fx.haloT > 0;
  TRIG.amanogawa = () => { fx.milkyT = 30; };
  TRIG.tsukigasa = () => { fx.haloT = 30; };

  // ================= 焚き火のしおり（やってみたいこと）と小物 =================
  // 期限なし・順番なし・日替わりなし。やらなくても何も困らない、ゆるい道しるべ
  const shioriNew = S.shiori === undefined; // アップデート後の最初の起動か
  def('shiori', () => ({}));                // できた日時
  def('props', () => ({}));                 // 小物を片づけているとき false
  def('prog', () => ({}));                  // 途中経過（秒数など）
  const PG = () => S.prog;
  const SHIORI = [
    ['first',   'はじめの一歩', 'はじめての一本', '薪を1本くべる',                               () => S.totalLogs >= 1],
    ['takibi',  'はじめの一歩', '焚き火らしく',   '火を「焚き火」まで育てる',                     () => S.peak >= 40],
    ['woods',   'はじめの一歩', '木のちがい',     '6種類の薪をぜんぶくべる',                     () => WOODS.every((w) => S.wood[w.id])],
    ['marsh',   'はじめの一歩', 'きつね色',       'マシュマロを「完璧」に焼く',                   () => !!S.roast['marsh-perfect']],
    ['daynight', 'はじめの一歩', '朝の火、夜の火', '朝と夜、それぞれ1分ずつ火を焚く',             () => PG().day >= 60 && PG().night >= 60],
    ['photo',   'はじめの一歩', '一枚のこす',     '写真モードで1枚撮る',                         () => !!PG().photo],
    ['ember',   '火となかよく', '熾をそだてる',   '熾をいっぱいまでためる',                       () => !!PG().emberFull],
    ['stacks',  '火となかよく', '組みかえる',     '3つの組み方をぜんぶ試す',                     () => STACKS.every((s) => S.stackRec[s.id])],
    ['bury',    '火となかよく', '待つ楽しみ',     'うめて焼いたものを、最高の焼き上がりで掘り出す', () => Object.keys(BURY).some((id) => S.roast[id + '-best'])],
    ['rain',    '火となかよく', '雨やどり',       '雨の中で10分、火を絶やさない',                 () => PG().rain >= 600],
    ['keep',    '火となかよく', '火の番',         '1時間、火を絶やさない',                       () => PG().keep >= 3600],
    ['gift',    '火となかよく', '置きみやげ',     '訪問者からおみやげをもらう',                   () => Object.keys(S.gifts).length > 0],
    ['seasons', 'ながいつきあい', '四季の火',     '春夏秋冬すべての季節に火を焚く',               () => Object.keys(SEASON_NAME).every((k) => PG().se && PG().se[k])],
    ['moon',    'ながいつきあい', '月の夜',       '新月のころと満月のころ、どちらの夜にも火を焚く', () => !!PG().moonNew && !!PG().moonFull],
    ['wx',      'ながいつきあい', 'どんな空でも', '晴れ・雨・雪・霧すべての天気で火を焚く',       () => Object.keys(WX_NAME).every((k) => PG().wx && PG().wx[k])],
    ['faces',   'ながいつきあい', '火を囲む顔ぶれ', '5組の訪問者すべてに会う',                   () => VISITORS.every((v) => S.col[v.id])],
    ['seven',   'ながいつきあい', '七日の火',     '今日の一本を7日つづける',                     () => S.streak.best >= 7],
    ['scholar', 'ながいつきあい', '物知り',       '図鑑の「出来事」を20種見つける',               () => foundCount() >= 20],
  ];
  const PROPS = [[2, 'isu', '丸太のいす'], [4, 'yakan', 'やかん'], [6, 'lantern', 'ランタン'], [9, 'mug', 'マグカップ'], [12, 'tana', '薪棚'], [15, 'tent', '小さなテント']];
  const flags = (ids) => (v) => { if (!v || typeof v !== 'object') return {}; const o = {}; for (const k of ids) if (v[k] === true) o[k] = true; return o; };
  CHECK.shiori = V.rec(() => SHIORI.map((s) => s[0]), V.time);
  CHECK.props = V.rec(() => PROPS.map((p) => p[1]), V.bool);
  CHECK.prog = (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
    const n = (x) => V.num(0, 1e7, true)(x) || 0;
    return { day: n(v.day), night: n(v.night), rain: n(v.rain), keep: n(v.keep), photo: n(v.photo) ? 1 : 0, emberFull: n(v.emberFull) ? 1 : 0, moonNew: n(v.moonNew) ? 1 : 0, moonFull: n(v.moonFull) ? 1 : 0,
      se: flags(Object.keys(SEASON_NAME))(v.se), wx: flags(Object.keys(WX_NAME))(v.wx) };
  };
  { const p = S.prog; for (const k of ['day', 'night', 'rain', 'keep', 'photo', 'emberFull', 'moonNew', 'moonFull']) if (typeof p[k] !== 'number') p[k] = 0; if (!p.se) p.se = {}; if (!p.wx) p.wx = {}; }
  const stamps = () => SHIORI.filter((s) => S.shiori[s[0]]).length;
  const propOn = (th, id) => (sp.all || stamps() >= th) && S.props[id] !== false && !sp.none;
  const sp = { cvN: null, cvD: null, all: false, none: false, x0: 0, y0: 0, w: 0, h: 0, steamK: [], pre: 0 };
  function shioriCheck(silent) {
    let got = 0;
    for (const [id, , title, , ok] of SHIORI) {
      if (S.shiori[id] || !ok()) continue;
      const before = stamps();
      S.shiori[id] = Date.now(); got++;
      if (silent) continue;
      quietToast(`しおり：${title}`, 'スタンプをひとつ', 5000);
      for (const [th, , name] of PROPS) if (before < th && before + 1 >= th) quietToast(`小物「${name}」を置けるようになりました`, 'しおりのページで出し入れできます', 6000);
      if (before + 1 === SHIORI.length) quietToast('しおりが、ぜんぶうまりました', '称号「焚き火の友」', 6000);
    }
    if (got) { save(); paintProps(); }
    return got;
  }
  HOOKS.sec.push(() => {
    const p = PG(), lit5 = S.fuel >= 5 && !fx.freeze;
    if (lit5) {
      if (dayTarget) p.day = Math.min(1e6, p.day + 1); else p.night = Math.min(1e6, p.night + 1);
      p.keep = Math.min(1e6, p.keep + 1);                                           // 火を絶やさない: 火力5以上が続くこと（ながめる中も数える）
      const autoWx = S.set.wx === 'auto' && !wxs.force;                             // 天気を固定している間は数えない
      p.rain = autoWx && wxKind() === 'rain' ? p.rain + 1 : 0;
      if (autoWx) p.wx[wxKind()] = true;
      if (!wxs.season) p.se[seasonNow()] = true;
      if (!dayTarget && moonForce == null) { if (isNewMoon()) p.moonNew = 1; if (isFullMoon()) p.moonFull = 1; }
    } else { p.keep = 0; p.rain = 0; }
    if (S.ember >= 99.5) p.emberFull = 1;
    shioriCheck(false);
  });
  HOOKS.back.push((sec) => { const p = PG(); if (S.fuel >= 5) p.keep = Math.min(1e6, p.keep + Math.round(sec)); else { p.keep = 0; p.rain = 0; } }); // 離れている間も燃えつづけていたら、続きとして数える
  HOOKS.boot.unshift(() => { if (S.fuel < 5) { PG().keep = 0; PG().rain = 0; } if (shioriNew) sp.pre = shioriCheck(true); }); // すでにある記録から判定できるものは、まとめて達成に（トーストなし）
  NEWS.push(() => (sp.pre ? `しおり（やってみたいこと）が${sp.pre}個、もううまっていました。` : null));
  STATS.push((stat) => { if (opened('shiori')) stat('しおり', `${stamps()} / ${SHIORI.length}` + (stamps() === SHIORI.length ? '　焚き火の友' : '')); });
  HOWTO.push(['shiori', 'しおり：図鑑の「しおり」に、やってみたいことが18個あります。期限も順番もありません。うまると、焚き火のまわりに小物が増えます。']);

  // --- 小物: 動かない絵として、朝用と夜用を1度だけ描きためる ---
  function drawProps(x, day) {
    const sh = (c) => rgb(mix(c, [14, 13, 28], day ? 0.06 : 0.52));
    const E2 = (px, py, rx, ry) => { x.beginPath(); x.ellipse(px, py, rx, ry, 0, 0, TAU); x.fill(); };
    const by = baseY - sp.y0, hz = horizon - sp.y0, mx = cx - sp.x0; // バッファ内の座標
    x.save(); x.translate(mx, 0); x.scale(U, U); x.translate(0, by / U);
    if (propOn(15, 'tent')) { // 小さなテント（右奥）
      const ty = (hz - by) / U + 22;
      x.fillStyle = sh([172, 146, 92]); x.beginPath(); x.moveTo(96, ty); x.lineTo(122, ty - 36); x.lineTo(150, ty); x.closePath(); x.fill();
      x.fillStyle = sh([120, 98, 60]); x.beginPath(); x.moveTo(122, ty - 36); x.lineTo(150, ty); x.lineTo(134, ty); x.closePath(); x.fill();
      x.fillStyle = sh([44, 36, 30]); x.beginPath(); x.moveTo(114, ty); x.lineTo(121, ty - 20); x.lineTo(128, ty); x.closePath(); x.fill();
    }
    if (propOn(12, 'tana')) { // 薪棚（左奥）
      x.fillStyle = sh([74, 54, 38]); x.fillRect(-174, -40, 3, 26); x.fillRect(-140, -40, 3, 26); x.fillRect(-174, -17, 37, 3);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { x.fillStyle = sh([150 + ((r * 7 + c * 13) % 3) * 16, 108, 66]); E2(-166 + c * 8.2, -21 - r * 7, 3.9, 3.4); }
    }
    if (propOn(6, 'lantern')) { // ランタン
      x.fillStyle = sh([56, 56, 62]); x.fillRect(-153, -7, 10, 3); x.fillRect(-152, 6, 8, 2.4);
      x.fillStyle = day ? 'rgba(255,236,190,.75)' : '#ffd98a'; x.fillRect(-151.5, -4, 7, 10);
      x.strokeStyle = sh([56, 56, 62]); x.lineWidth = 1.2; x.beginPath(); x.arc(-148, -8, 4.2, Math.PI, TAU); x.stroke();
    }
    if (propOn(2, 'isu')) { // 丸太のいす
      x.fillStyle = sh([116, 80, 50]); x.beginPath(); x.moveTo(-152, 24); x.lineTo(-112, 24); x.arcTo(-106, 24, -106, 30.5, 6.5); x.arcTo(-106, 37, -112, 37, 6.5); x.lineTo(-152, 37); x.arcTo(-158, 37, -158, 30.5, 6.5); x.arcTo(-158, 24, -152, 24, 6.5); x.fill();
      x.fillStyle = sh([206, 166, 112]); E2(-110, 30.5, 3, 5.6);
    }
    if (propOn(4, 'yakan')) { // やかん
      x.fillStyle = sh([58, 58, 64]); E2(-102, 14, 8.4, 6.6); x.fillRect(-106, 6.4, 8, 2.6);
      x.beginPath(); x.moveTo(-94.5, 13); x.lineTo(-88, 8.5); x.lineTo(-87, 10.4); x.lineTo(-94, 16); x.closePath(); x.fill();
      x.strokeStyle = sh([58, 58, 64]); x.lineWidth = 1.4; x.beginPath(); x.arc(-102, 8.4, 6.4, Math.PI * 1.08, Math.PI * 1.92); x.stroke();
    }
    if (propOn(9, 'mug')) { // マグカップ
      x.fillStyle = sh([232, 222, 200]); x.fillRect(-103, 30, 6.4, 7); x.strokeStyle = sh([232, 222, 200]); x.lineWidth = 1.2; x.beginPath(); x.arc(-96.2, 33.4, 2.3, -Math.PI / 2, Math.PI / 2); x.stroke();
    }
    x.restore();
  }
  function paintProps() { // 描き直すのは resize と、内容が変わったときだけ
    sp.x0 = cx - 185 * U; sp.y0 = horizon - 24 * U; sp.w = 370 * U; sp.h = baseY + 44 * U - sp.y0;
    for (const day of [false, true]) {
      const key = day ? 'cvD' : 'cvN';
      if (!sp[key]) sp[key] = document.createElement('canvas');
      const c = sp[key], w = Math.max(2, Math.ceil(sp.w * DPR)), h = Math.max(2, Math.ceil(sp.h * DPR));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const x = c.getContext('2d'); x.setTransform(DPR, 0, 0, DPR, 0, 0); x.clearRect(0, 0, sp.w, sp.h);
      drawProps(x, day);
    }
  }
  HOOKS.resize.push(paintProps);
  HOOKS.ground.push((day) => {
    if (!sp.cvN) return;
    if (day < 1) { g.globalAlpha = 1; g.drawImage(sp.cvN, sp.x0, sp.y0, sp.w, sp.h); }
    if (day > 0) { g.globalAlpha = day; g.drawImage(sp.cvD, sp.x0, sp.y0, sp.w, sp.h); }
    g.globalAlpha = 1;
    if (propOn(6, 'lantern') && day < 0.95) { g.globalCompositeOperation = 'lighter'; blob([255, 196, 104], cx - 148 * U, baseY + 1 * U, 24 * U, 0.5 * (1 - day) * (0.9 + 0.1 * Math.sin(T * 7))); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; } // 夜のランタンの灯
  });
  HOOKS.update.push((dt) => { // やかんの湯気（粒は2個まで）
    const k = sp.steamK;
    if (propOn(4, 'yakan') && lit > 0.5 && k.length < 2 && Math.random() < dt * 0.9) k.push({ x: cx - 88 * U, y: baseY + 8 * U, age: 0, life: rnd(1.6, 2.4) });
    for (let i = k.length - 1; i >= 0; i--) { const p = k[i]; p.age += dt; p.y -= 12 * U * dt; p.x += 3 * U * dt; if (p.age >= p.life) k.splice(i, 1); }
  });
  HOOKS.front.push(() => { for (const p of sp.steamK) { const k = p.age / p.life; blob([236, 236, 240], p.x, p.y, (3 + 6 * k) * U, Math.sin(k * Math.PI) * 0.2); } });
  BOOK_PAGES.push({ id: 'shiori', label: 'しおり', show: () => opened('shiori'), render: (pane) => {
    const h = el('h2', '', 'しおり'); h.appendChild(el('small', '', `${stamps()} / ${SHIORI.length}`)); pane.appendChild(h);
    pane.appendChild(el('p', 'note', 'やってみたいこと。期限も順番もありません。'));
    let chap = '';
    for (const [id, ch, title, desc] of SHIORI) {
      if (ch !== chap) { chap = ch; pane.appendChild(el('h3', 'chap', ch)); }
      const done = S.shiori[id], r = el('div', 'shiori' + (done ? ' done' : ''));
      r.append(el('i', '', done ? '済' : ''), el('b', '', title), el('span', '', desc + (done ? `（${fmtDay(done)}）` : '')));
      pane.appendChild(r);
    }
    pane.appendChild(el('h3', 'chap', '小物'));
    for (const [th, id, name] of PROPS) {
      const have = stamps() >= th, r = el('div', 'row');
      const ctl = have ? el('button', 'tog' + (S.props[id] !== false ? ' on' : '')) : el('span', 'val', `スタンプ ${th}個で`);
      if (have) { ctl.setAttribute('role', 'switch'); ctl.setAttribute('aria-checked', String(S.props[id] !== false)); ctl.addEventListener('click', () => { S.props[id] = S.props[id] === false; save(); paintProps(); renderBook(); }); }
      r.append(el('span', '', name), ctl); pane.appendChild(r);
    }
  } });
  FX.shiori = () => quietToast('しおり：はじめての一本', 'プレビュー（記録されません）', 4000);
  FX['props-all'] = () => { sp.all = true; sp.none = false; paintProps(); };
  FX['props-none'] = () => { sp.all = false; sp.none = true; paintProps(); };

  // ================= 起動 =================
  let lastT = 0, halted = false;
  function frame(ts) {
    if (halted) { lastT = 0; return; } // 描画ループを完全に止める（電池を使わない）
    requestAnimationFrame(frame);
    // 120Hz の端末でも毎秒60回まで。シートを開いている間や眺めるだけの場面は毎秒30回
    const low = app.classList.contains('sheet') || LOW_RATE.some((fn) => fn());
    if (lastT && ts - lastT < (low ? 31 : 15)) return;
    const gap = lastT ? ts - lastT : 16.7, real = Math.min(0.05, gap / 1000);
    lastT = ts;
    let scale = 1;
    if (fx.slowT > 0) { fx.slowT -= real; scale = 0.3; } // ★3の一瞬のスローモーション
    const dt = real * scale;
    T += dt;
    const t0 = performance.now();
    update(dt, real); draw();
    if (!low && gap < 200) watchPerf(gap, performance.now() - t0, real);
  }
  // フレーム間隔のならし平均が 22ms を3秒超えたら1段落とし、余裕のある状態が20秒続いたら1段戻す。切り替えは何も表示しない
  function watchPerf(gap, work, real) {
    perf.avg += (gap - perf.avg) * 0.05; perf.work += (work - perf.work) * 0.05; perf.fps = 1000 / perf.avg;
    if (perf.avg > 22) { perf.under = 0; perf.over += real; } else { perf.over = 0; perf.under = perf.avg < 18.5 && perf.work < 14 ? perf.under + real : 0; }
    if (perf.over > 3 && perf.q < 2) {
      perf.q++; perf.over = 0;
      perf.wait = performance.now() - perf.lastUp < 30000 ? Math.min(320, perf.wait * 2) : 20; // 戻してすぐまた重くなる端末では、戻すのを急がない
    } else if (perf.under > perf.wait && perf.q > 0) { perf.q--; perf.under = 0; perf.lastUp = performance.now(); }
  }
  FX['q-low'] = () => { perf.forced = 2; };
  FX['q-auto'] = () => { perf.forced = -1; };

  resize();
  dayTarget = skyTarget(); dayness = dayTarget;
  I = clamp(Math.pow(S.fuel / 100, 0.8) * 0.92, 0, 1);
  syncButtons(); updHud();
  run('boot');
  if (S.totalLogs > 0) {
    hideHint();
    if (awaySec > 120) toast('', 'おかえりなさい', S.fuel < 5 ? '熾火が、まだ赤く残っています' : '火はまだ燃えています', 3600);
  }
  if (DEBUG) { // ?debug を付けると演出をコンソールから試せる（記録には残らない）
    window.takibi = { moon: (v) => { moonForce = v == null ? null : clamp(v, 0, 0.9999); moonRefresh(); paintMoon(); return moonName(); }, moonAt: (t) => { const d = (t - Date.UTC(2000, 0, 6, 18, 14)) / 86400000 / SYNODIC; return d - Math.floor(d); }, fx: (id) => (FX[id] ? FX[id]() : trigger(id, false)), fuel: (n) => { S.fuel = clamp(n, 0, 100); }, sky: setSky, ids: [...new Set(RARES.map((r) => r.id).concat(Object.keys(FX)))], state: () => S, ember: (n) => { S.ember = clamp(n, 0, 100); }, endVisit: () => { if (fx.visitor) fx.visitor.age = Math.max(fx.visitor.age, fx.visitor.stay + 0.01); }, pick: pickRare,
      skip: (min) => { const sec = clamp(min * 60, 0, 30 * 86400), f0 = S.fuel; clockSkew += min * 60000; decayAway(sec); run('back', sec, f0); }, // 時計を進める（その間アプリを閉じていたものとして扱う）
      counts: () => ({ fps: Math.round(perf.fps), quality: Q(),
        canvases: (() => { const cs = [layerN, layerD, fBuf && fBuf.c, sBuf && sBuf.c, moonCv, mw.cv, sp.cvN, sp.cvD].concat(Object.values(wxs.layers)).filter(Boolean); return { n: cs.length, screens: +(cs.reduce((a, c) => a + c.width * c.height, 0) / (cv.width * cv.height)).toFixed(2), added: +([mw.cv, sp.cvN, sp.cvD].filter(Boolean).reduce((a, c) => a + c.width * c.height, 0) / (cv.width * cv.height)).toFixed(2), sprites: spriteCache.size }; })(),
        extra: steam.length + sp.steamK.length + 12, bytes: JSON.stringify(S).length, visitor: fx.visitor ? fx.visitor.kind : null, wake: wake.lock ? 'held' : wake.want ? 'wanted' : 'off', watching: watching(), steward: fx.steward, ambGap: fx.ambGap, shake: fx.shake, slow: fx.slowT, bright: fx.bright, hold: fx.hold, omen: !!fx.omen, rockets: rockets.length, flames: flames.length, sparks: sparks.length, smokes: smokes.length, fireworks: fw.length, weather: wps.length, hazes: hazes.length, flies: flies.length, flying: flying.length }) };
  }
  requestAnimationFrame(frame);
})();
