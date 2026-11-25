/* 焚き火くべ — 囲む火（マルチ）。
 * 部屋に入るときに初めて読み込まれる。ひとりで遊ぶあいだは、このファイルも Firebase も読み込まれない。
 * 送るのは「数字と、決められた選択肢の番号」だけ。名前・文字・合言葉そのものは送らない。 */

// ================= 番号の表（送るデータはこれで全部） =================
// seats/{0-4}/ev = { k, n, t }
export const EV = {
  FEED: 0,   // くべた。n = まとめた本数（1〜20）
  GEST: 1,   // 1〜5 = しぐさ（手をかざす／うなずく／空を指さす／あくび／おじぎ）。n = 1
  GIFT: 6,   // 6〜9 = おすそわけ（k - 6 = 焼き加減の番号）。n = 1 + 相手の席 × 2 + 食べ物の番号
  STAR: 10,  // 流れ星をタップした。n = 1
};
// bc = { k, a, t, by }  部屋の出来事。by = 送った人の席
export const BC = {
  RARE: 0,   // 0〜20 = レアな出来事・訪問者（RARE_IDS の番号）。a = 0〜255 の乱数（重複よけ）
  MULTI: 24, // 24〜31 = 囲む火の出来事（MEV の番号）。a = かかわった席のビット
};
const RARE_IDS = ['blue', 'green', 'purple', 'pink', 'rainbow', 'hanabi', 'tairin', 'star', 'meteor', 'niji', 'hinoko', 'tsuyu',
  'kitsune', 'neko', 'fukurou', 'tabibito', 'shika', 'gekko', 'dust', 'amanogawa', 'tsukigasa'];
const GESTS = ['手をかざす', 'うなずく', '空を指さす', 'あくび', 'おじぎ'];
const MARKS = [[255, 110, 90], [255, 168, 70], [255, 222, 96], [130, 220, 124], [110, 184, 255], [182, 142, 255], [255, 150, 204], [240, 240, 230]]; // 灯りの色（8色から選ぶ番号）
const MARK_NAMES = ['あか', 'だいだい', 'きいろ', 'みどり', 'あお', 'むらさき', 'もも', 'しろ'];
const ITEMS = ['marsh', 'imo'], RES = ['raw', 'good', 'perfect', 'burnt'];

const SDK = 'https://www.gstatic.com/firebasejs/13.4.0/'; // Firebase 公式 SDK（app / auth / database）。部屋に入るときだけ読み込む
const SEATS = 5, STALE = 90000, BEAT = 30000, DAY = 86400000;
const NOW = { '.now': 1 }; // 「サーバー時刻」を入れる場所の印

let A = null; // app.js の窓口

// ================= 合言葉と部屋のID =================
const W1 = 'あかい あおい しろい くろい きいろい ちいさな おおきな まるい ながい みじかい あつい さむい ぬるい やさしい しずかな にぎやかな ねむい はやい おそい あまい からい にがい うすい こい ふるい わかい かるい おもい やわい かたい とおい ちかい ひろい せまい たかい ひくい あかるい くらい まぶしい すずしい ぬくい まじめな のんきな げんきな ひみつの さいしょの さいごの いつもの'.split(' ');
const W2 = 'きつね ねこ ふくろう しか たぬき うさぎ くま りす とり さかな かえる ほたる つき ほし そら くも あめ ゆき かぜ もり やま かわ うみ いし はな このは きのこ どんぐり まつ さくら たきぎ ひばな けむり おき やかん まめ いも くり りんご おちゃ ぱん すーぷ てんと らんたん いす みち たび ゆめ'.split(' ');
const W3 = 'ねむる わらう あるく はしる とぶ およぐ うたう おどる まつ みる きく はなす やすむ おきる たべる のむ やく にる あそぶ かくれる さがす みつける ひろう あつめる つくる なおす あらう ほす たたむ はこぶ のぼる おりる わたる まがる とまる すすむ もどる かえる であう わかれる おもう ねがう いのる まもる そだつ ひかる ゆれる もえる'.split(' ');
const pickOf = (arr) => { const u = new Uint32Array(1); crypto.getRandomValues(u); return arr[u[0] % arr.length]; };
export const suggest = () => pickOf(W1) + pickOf(W2) + pickOf(W3);
// 正規化: NFKC、前後の空白の削除、カタカナ → ひらがな、英字 → 小文字
export const normalize = (s) => String(s).normalize('NFKC').trim().replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).toLowerCase();
export const validPass = (norm) => /^[ぁ-ゖー0-9a-z]{4,24}$/.test(norm);
export async function roomIdOf(norm) { // 合言葉そのものは送らない。SHA-256 の先頭32文字だけが部屋のIDになる
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('takibi-room:' + norm));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// ================= つなぐ先（Firebase） =================
async function firebaseNet(cfg, emu) {
  const [fa, fauth, fdb] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-database.js')]);
  const app = fa.getApps().length ? fa.getApp() : fa.initializeApp(cfg);
  // 匿名ログインだけを使うので、ポップアップ用の部品（apis.google.com の読み込み）は付けない
  if (!firebaseNet.auth) firebaseNet.auth = fauth.initializeAuth(app, { persistence: [fauth.indexedDBLocalPersistence, fauth.browserLocalPersistence] });
  const auth = firebaseNet.auth, db = fdb.getDatabase(app);
  if (emu && !firebaseNet.emu) { firebaseNet.emu = true; fauth.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); fdb.connectDatabaseEmulator(db, '127.0.0.1', 9000); }
  fdb.goOnline(db);
  // 匿名ログイン: 「その席の持ち主だけが書ける」をルールで確かめるためだけに使う
  if (auth.authStateReady) await auth.authStateReady(); // 前に使った匿名の利用者がいれば、それを使う
  const uid = (auth.currentUser || (await fauth.signInAnonymously(auth)).user).uid;
  let offset = 0, room = '', seat = -1, seatRef = null;
  const offs = [];
  offs.push(fdb.onValue(fdb.ref(db, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; }));
  const stamp = (o) => { const r = {}; for (const k of Object.keys(o)) r[k] = o[k] === NOW ? fdb.serverTimestamp() : o[k]; return r; };
  const net = {
    uid, kind: 'firebase',
    now: () => Date.now() + offset,
    async join(roomId, mark) { // 空いている席（または90秒更新のない席）を1つ、トランザクションで取る
      room = roomId;
      for (let i = 0; i < SEATS; i++) {
        const r = fdb.ref(db, `rooms/${room}/seats/${i}`);
        let res = null;
        try {
          res = await fdb.runTransaction(r, (cur) => (cur === null || cur.uid === uid || cur.t < net.now() - STALE ? { uid, t: fdb.serverTimestamp(), mark, sit: i } : undefined), { applyLocally: false });
        } catch (e) { res = null; } // その席は、もうだれかのもの
        if (res && res.committed) {
          seat = i; seatRef = r;
          await fdb.onDisconnect(r).remove(); // 接続が切れたら席を空ける
          return i;
        }
      }
      return -1;
    },
    watch(onSeats, onFire, onBc) {
      offs.push(fdb.onValue(fdb.ref(db, `rooms/${room}/seats`), (s) => onSeats(s.val()), () => onSeats(null, true)));
      offs.push(fdb.onValue(fdb.ref(db, `rooms/${room}/fire`), (s) => onFire(s.val())));
      offs.push(fdb.onValue(fdb.ref(db, `rooms/${room}/bc`), (s) => onBc(s.val())));
    },
    beat: () => fdb.update(seatRef, { t: fdb.serverTimestamp() }),
    setMark: (mark) => fdb.update(seatRef, { mark }),
    sendEv: (k, n) => fdb.update(seatRef, { ev: { k, n, t: fdb.serverTimestamp() } }),
    sendBc: (k, a) => fdb.set(fdb.ref(db, `rooms/${room}/bc`), { k, a, t: fdb.serverTimestamp(), by: seat }),
    async fireTx(fn) { const res = await fdb.runTransaction(fdb.ref(db, `rooms/${room}/fire`), (cur) => { const v = fn(cur, net.now()); return v ? stamp(v) : undefined; }); return res.committed; },
    offline() { fdb.goOffline(db); },
    online() { fdb.goOnline(db); },
    async leave() { // 出たら、すぐに席を空ける
      for (const off of offs.splice(1)) off();
      try { if (seatRef) { await fdb.onDisconnect(seatRef).cancel(); await fdb.remove(seatRef); } } catch (e) { /* 切れていれば、サーバーが席を空ける */ }
      seatRef = null; seat = -1;
      fdb.goOffline(db);
    },
  };
  return net;
}

// ================= つなぐ先（通信なしの、架空の仲間。?debug の takibi.room.fake(人数)） =================
function fakeNet(bots) {
  const st = { seats: [null, null, null, null, null], fire: null, bc: null, cb: null, acc: 0 };
  const push = () => { if (st.cb) { st.cb[0](st.seats.map((s) => (s ? { ...s, ev: s.ev ? { ...s.ev } : undefined } : null))); st.cb[1](st.fire ? { ...st.fire } : null); } };
  const net = {
    uid: 'me', kind: 'fake', now: () => Date.now(),
    async join(roomId, mark) {
      st.seats[0] = { uid: 'me', t: Date.now(), mark, sit: 0 };
      for (let i = 1; i <= Math.min(4, bots); i++) st.seats[i] = { uid: 'bot' + i, t: Date.now(), mark: (mark + i * 3) % 8, sit: i, bot: { next: 3 + Math.random() * 4, gest: 8 + Math.random() * 20 } };
      return 0;
    },
    watch(onSeats, onFire, onBc) { st.cb = [onSeats, onFire, onBc]; push(); onBc(null); },
    beat: async () => { st.seats[0].t = Date.now(); },
    setMark: async (mark) => { st.seats[0].mark = mark; push(); },
    sendEv: async (k, n) => { st.seats[0].ev = { k, n, t: Date.now() }; push(); net.react(k); },
    sendBc: async (k, a) => { st.bc = { k, a, t: Date.now(), by: 0 }; st.cb[2]({ ...st.bc }); },
    async fireTx(fn) { const v = fn(st.fire, Date.now()); if (!v) return false; const r = {}; for (const k of Object.keys(v)) r[k] = v[k] === NOW ? Date.now() : v[k]; st.fire = r; push(); return true; },
    offline() {}, online() {},
    async leave() { st.cb = null; },
    botEv(i, k, n) { const s = st.seats[i]; if (!s) return; s.ev = { k, n, t: Date.now() }; s.t = Date.now(); push(); },
    botFeed(i, n) { // 架空の仲間も、同じ式で火に足す
      net.fireTx((cur, now) => feedValue(cur, now, n, false));
      net.botEv(i, EV.FEED, n);
    },
    react(k) { // こちらの動きに、ときどき合わせてくれる（同時くべ・同じ星の確認用）
      for (let i = 1; i < SEATS; i++) {
        if (!st.seats[i]) continue;
        if (k === EV.FEED && Math.random() < 0.45) setTimeout(() => st.cb && net.botFeed(i, 1), 80 + Math.random() * 500);
        if (k === EV.STAR && Math.random() < 0.7) setTimeout(() => st.cb && net.botEv(i, EV.STAR, 1), 200 + Math.random() * 900);
      }
    },
    tick(dt) { // 自動でくべる・しぐさをする
      if (!st.cb) return;
      for (let i = 1; i < SEATS; i++) {
        const s = st.seats[i]; if (!s) continue;
        const b = s.bot;
        if ((b.next -= dt) <= 0) { b.next = 2.5 + Math.random() * 7; if (fireAt(st.fire, Date.now()).fuel < capNow() - 12) net.botFeed(i, 1 + (Math.random() * 3 | 0)); }
        if ((b.gest -= dt) <= 0) { b.gest = 14 + Math.random() * 30; net.botEv(i, EV.GEST + (Math.random() * 5 | 0), 1); }
      }
    },
  };
  return net;
}

// ================= 部屋の状態 =================
const R = {
  on: false, net: null, id: '', pass: '', seat: -1, ready: false, offline: false,
  seats: [null, null, null, null, null], evSeen: [0, 0, 0, 0, 0],
  sh: Array.from({ length: SEATS }, () => ({ on: false, k: 0, mark: 0, gest: 0, gt: 0 })), // 席の影
  fire: null, fireReady: false, queue: 0, evQueue: 0, fill: false, tokens: 5, lastFire: 0, lastEv: 0, txBusy: false,
  people: 1, keeper: false, beatAt: 0, ftimeSeen: 0, lastBc: null,
  feedT: [0, 0, 0, 0, 0], simAt: 0, simLast: 0, starUntil: 0, starT0: 0, starDone: false, starTaps: [0, 0, 0, 0, 0], iTapped: false,
  ringLast: -1e9, talk: 0, ghosts: [], gestAt: 0, giftAt: -1e9, roast: null, wx: null, hideT: 0, rejoining: false,
};
const live = (s, now) => !!s && now - s.t < STALE + 5000;
const capNow = () => 100 + 5 * (R.people - 1);                 // 火力の最大は人数で少し上がる（2人=105 … 5人=120）
const feverSec = () => 40 - 3.75 * (R.people - 1);              // 業火のゲージ: 1人=40秒、5人=25秒で満タン
const blank = () => ({ fuel: 0, t: 0, total: 0, fever: 0, ftime: 0, last: 0 });
// 火の減り方は、ひとりのときと同じ式。t からの経過時間で計算するので、だれの画面でも同じ値になる
function fireAt(f, now) {
  if (!f) return { fuel: 0, gauge: 0 };
  const K = A.BURN.A / A.BURN.B, B = A.BURN.B, sec = Math.max(0, (now - f.t) / 1000);
  const fuel = Math.max(0, (f.fuel + K) * Math.exp(-B * sec) - K);
  const hot = f.fuel > 90 ? Math.min(sec, Math.log((f.fuel + K) / (90 + K)) / B) : 0; // 火力90以上だった時間
  return { fuel, gauge: A.clamp(f.fever + hot / feverSec() - (sec - hot) / 90, 0, 1) };
}
// くべたぶんを足した、新しい火の値（トランザクションの中で使う）
function feedValue(cur, now, n, fill, meta) {
  const f = cur || blank(), st = fireAt(f, now), cap = capNow();
  let fever = st.gauge, ftime = f.ftime || 0;
  if (fever >= 1 && now - ftime > 20000) { fever = 0; ftime = NOW; }                 // 満タン → みんなの業火
  if (meta) { meta.long = f.last > 0 && now - f.last >= 7 * DAY && n > 0; meta.sen = (f.total || 0) < 1000 && (f.total || 0) + n >= 1000; }
  const fuel = fill ? cap : Math.min(cap, st.fuel + n * A.BURN.LOG);
  return { fuel: Math.round(Math.min(120, fuel) * 100) / 100, t: NOW, total: (f.total || 0) + n, fever: Math.round(fever * 1000) / 1000, ftime, last: n > 0 ? NOW : (f.last || 0) };
}
// 天気は、部屋のIDと時刻から決まる（部屋の全員で同じ）
function wxFor(id, t) {
  let h = 2166136261;
  for (const ch of id + ':' + Math.floor(t / 600000)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const se = A.seasonNow(), w = [['clear', 60], ['fog', 12], ['rain', { spring: 16, summer: 20, autumn: 16, winter: 4 }[se]], ['snow', se === 'winter' ? 26 : 0]];
  let x = ((h >>> 0) % 10000) / 10000 * w.reduce((a, b) => a + b[1], 0);
  for (const [k, v] of w) if ((x -= v) < 0) return k;
  return 'clear';
}

// ================= 入る・出る =================
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const dbg = (...a) => { if (A.DEBUG) console.warn('room:', ...a); }; // エラーの中身は画面に出さない
async function enter(pass) {
  const norm = normalize(pass);
  if (!validPass(norm)) { panelMsg('合言葉は、ひらがな・カタカナ・英数字の4〜24文字です'); return; }
  if (!crypto.subtle) { fail(); return; }
  panel('busy');
  let net = null;
  try {
    const id = await roomIdOf(norm);
    const emu = A.DEBUG && /[?&]emu\b/.test(location.search);
    net = await withTimeout(firebaseNet(emu ? { apiKey: 'demo', projectId: 'demo-takibi', appId: 'demo', databaseURL: 'http://127.0.0.1:9000?ns=demo-takibi' } : A.cfg(), emu), 10000);
    const seat = await withTimeout(net.join(id, A.S.room.mark), 10000);
    if (seat < 0) { net.leave(); panel('home'); panelMsg('この火は、いまいっぱいです（5人）'); return; }
    start(net, id, norm, seat);
  } catch (e) {
    dbg(e && e.message);
    if (net) net.leave().catch(() => {});
    fail();
  }
}
function fail() { // 10秒たってもつながらない・接続できない（無料プランの同時接続の上限に届いたときも、これと同じ）
  panel(null);
  A.showNote('部屋', ['いまは部屋につながりません。', 'ひとりの焚き火で待っていてください。'], { ms: 9000 });
}
function start(net, id, pass, seat) {
  Object.assign(R, { on: true, net, id, pass, seat, ready: false, offline: false, fire: null, fireReady: false, queue: 0, evQueue: 0, fill: false, tokens: 5, people: 1, keeper: false,
    beatAt: performance.now() + BEAT, ftimeSeen: 0, lastBc: null, simAt: 0, starUntil: 0, talk: 0, ringLast: -1e9, roast: null, wx: null, rejoining: false });
  R.seats.fill(null); R.evSeen.fill(0); R.feedT.fill(0); R.starTaps.fill(0); R.ghosts.length = 0;
  for (const s of R.sh) Object.assign(s, { on: false, k: 0, gest: 0 });
  A.roomMode(true);
  A.setRoll((on) => on !== 'amb' || R.keeper, shareRare);   // 燃えている間の抽選と訪問者は「火の番」（いちばん小さい席）の端末だけ
  A.setRoastShare(roastDone);
  A.setPhotoNote(() => `囲む火 ${R.people}人`);
  if (pass) { A.S.room.last = pass; }
  A.S.room.told = true; A.save();
  net.watch(onSeats, onFire, onBc);
  panel(null);
  A.toast('', '部屋に入りました', '同じ火を、囲んでいます', 3200);
  A.syncChips();
}
export async function leave(quiet) {
  if (!R.on) return;
  const net = R.net;
  R.on = false; R.net = null; clearTimeout(R.hideT);
  A.roomMode(false); // ひとりの焚き火の火力・熾・うめたものは、入る前のまま
  elDots.textContent = '';
  if (!quiet) A.toast('', '部屋を出ました', 'ひとりの焚き火にもどりました', 3000);
  try { await net.leave(); } catch (e) { dbg(e && e.message); }
}
async function rejoin() { // 接続が切れて席が空いたあと、戻ってきたとき
  if (!R.on || R.rejoining || R.net.kind === 'fake') return;
  R.rejoining = true;
  try {
    R.net.online();
    const seat = await withTimeout(R.net.join(R.id, A.S.room.mark), 10000);
    if (seat < 0) { await leave(true); A.showNote('部屋', ['この火は、いまいっぱいです（5人）。', 'ひとりの焚き火にもどりました。'], { ms: 9000 }); return; }
    R.seat = seat; R.offline = false;
  } catch (e) { dbg(e && e.message); await leave(true); fail(); } finally { R.rejoining = false; }
}

// ================= 受け取る =================
function onSeats(v, err) {
  if (!R.on) return;
  if (err) { dbg('seats listener cancelled'); return; }
  const now = R.net.now();
  for (let i = 0; i < SEATS; i++) {
    const s = (v && v[i]) || null, sh = R.sh[i];
    R.seats[i] = s;
    if (s) sh.mark = s.mark;
    if (i === R.seat) { sh.on = true; continue; }
    const here = live(s, now);
    if (here && !sh.on) { sh.on = true; if (R.ready) { A.addLogText('だれかが火のそばに座りました'); A.quietToast('だれかが火のそばに座りました', '', 3000); A.Sound.tone(520, 620, 0.25, 0.05); } }
    else if (!here && sh.on) { sh.on = false; if (R.ready) A.addLogText('だれかが席を立ちました'); }
    if (s && s.ev && s.ev.t !== R.evSeen[i]) { // ほかの人の動き
      const fresh = R.ready && Math.abs(s.ev.t - R.evSeen[i]) > 400 && now - s.ev.t < 8000;
      R.evSeen[i] = s.ev.t;
      if (fresh) onEv(i, s.ev);
    }
  }
  const mine = v && v[R.seat];
  if (R.ready && !R.offline && (!mine || mine.uid !== R.net.uid)) rejoin(); // 席がなくなっていたら、取り直す
  R.ready = true;
  countPeople();
}
function countPeople() {
  const now = R.net.now();
  let n = 0, low = -1;
  for (let i = 0; i < SEATS; i++) if (i === R.seat || live(R.seats[i], now)) { n++; if (low < 0) low = i; }
  R.keeper = low === R.seat; // 火の番: 席の番号がいちばん小さい人。抜けたら、次に小さい人が引き継ぐ
  if (n !== R.people || elDots.childElementCount !== n) {
    R.people = n;
    elDots.textContent = '';
    for (let i = 0; i < SEATS; i++) if (i === R.seat || live(R.seats[i], now)) { const d = A.el('i'); d.style.background = A.rgb(MARKS[R.sh[i].mark] || MARKS[0]); if (i === R.seat) d.className = 'me'; elDots.appendChild(d); }
    panelRefresh();
  }
}
function onEv(i, ev) {
  const k = ev.k;
  if (k === EV.FEED) { R.ghosts.push({ seat: i, n: Math.min(20, ev.n), at: 0 }); R.feedT[i] = ev.t; R.simAt = performance.now() + 700; }
  else if (k >= EV.GEST && k < EV.GEST + 5) { R.sh[i].gest = k; R.sh[i].gt = performance.now(); }
  else if (k >= EV.GIFT && k < EV.GIFT + 4) {
    const to = Math.floor((ev.n - 1) / 2), item = ITEMS[(ev.n - 1) % 2], res = RES[k - EV.GIFT];
    R.sh[i].gest = EV.GEST; R.sh[i].gt = performance.now();
    if (to === R.seat && item && res) { // おすそわけが届いた（焼き加減もそのまま、図鑑「あぶり」に「もらった○○」として残る）
      A.roastRecord(item, res, true);
      A.toast('', 'おすそわけが届きました', 'もらった' + A.RESULTS[res][0] + A.ROASTS[item].name, 4600);
      A.feel.chime(2); A.haptic([20, 40, 20]);
    }
  } else if (k === EV.STAR) { R.starTaps[i] = ev.t; sameStar(); }
}
function onFire(v) {
  if (!R.on) return;
  const now = R.net.now(), first = !R.fireReady;
  R.fire = v || blank(); R.fireReady = true;
  if (first && v && v.last) { // 部屋の記憶: 間があいていれば、ひとことだけ
    const gap = now - v.last, total = (v.total || 0).toLocaleString('ja-JP');
    if (gap >= 30 * DAY) R.net.fireTx((cur) => (cur ? { fuel: 0, t: NOW, total: cur.total || 0, fever: 0, ftime: 0, last: cur.last || 0 } : undefined)).catch(() => {}); // 30日だれも来なかった部屋は、本数の合計以外を初期化
    if (gap >= 3600000) A.noteLater('部屋', [`${gap >= DAY ? Math.floor(gap / DAY) + '日' : Math.floor(gap / 3600000) + '時間'}ぶりの火です。`, `部屋の薪は ${total} 本になりました。`], { ms: 10000 });
  }
  if (v && v.ftime && v.ftime !== R.ftimeSeen && Math.abs(v.ftime - R.ftimeSeen) > 400) { // みんなの業火（15秒・確率3倍は、ひとりのときと同じ）
    const left = 15 - (now - v.ftime) / 1000;
    R.ftimeSeen = v.ftime;
    if (left > 1 && !first && A.fever.state.t <= 0) { A.fever.start(); A.fever.state.t = left; }
  }
}
function onBc(v) {
  if (!R.on) return;
  const first = R.lastBc === null, at = performance.now();
  const dup = !v || (R.lastBc && R.lastBc.k === v.k && R.lastBc.by === v.by && at - R.lastBc.at < 2500); // 同じ出来事は1度だけ（時刻の確定で2度届く）
  if (v && !dup) R.lastBc = { k: v.k, by: v.by, at }; else if (first) R.lastBc = { k: -1, by: -1, at: 0 };
  if (!v || dup || first || R.net.now() - v.t > 10000) return; // 入ったときに残っていた古い出来事は出さない
  if (v.k < RARE_IDS.length) {
    const id = RARE_IDS[v.k];
    A.trigger(id, true, 'みんなで見た'); // そのとき部屋にいた全員が見て、全員の図鑑に残る
    if (id === 'star' || id === 'meteor') { R.starUntil = at + (id === 'meteor' ? 15000 : 5000); R.starT0 = v.t; R.starDone = false; R.iTapped = false; R.starTaps.fill(0); }
  } else if (v.k >= BC.MULTI && v.k < BC.MULTI + A.MEV.length) multiEvent(v.k - BC.MULTI, v.a, true);
}

// ================= 送る =================
function shareRare(id) { // 抽選の結果を部屋に送る。自分の画面にも、部屋から届いた出来事として出る
  const i = RARE_IDS.indexOf(id);
  if (i < 0 || !R.on) return false;
  R.net.sendBc(BC.RARE + i, Math.random() * 256 | 0).catch((e) => dbg(e && e.message));
  return true;
}
function flush(at) { // 書き込みは平均で毎秒1回まで（くべた本数はまとめて送る）
  if (R.offline || !R.fireReady) return;
  const others = R.people > 1;
  if (!others) R.evQueue = 0; // ひとりのときは、くべた時刻を送らなくてよい
  const evDue = R.evQueue > 0 && at - R.lastEv >= 1000, fireDue = (R.queue > 0 || R.fill) && at - R.lastFire >= 1000 && !R.txBusy;
  if (R.tokens < 1 || (!evDue && !fireDue)) return;
  if (evDue && (!fireDue || R.lastEv <= R.lastFire)) { // 同時くべの判定のため、くべた時刻（サーバー時刻）を席に書く
    const n = Math.min(20, R.evQueue);
    R.evQueue = 0; R.lastEv = at; R.tokens--;
    R.feedT[R.seat] = R.net.now(); R.simAt = at + 700;
    R.net.sendEv(EV.FEED, n).catch((e) => dbg(e && e.message));
    return;
  }
  const n = Math.min(20, R.queue), fill = R.fill, meta = {};
  R.queue -= n; R.fill = false; R.lastFire = at; R.tokens--; R.txBusy = true;
  R.net.fireTx((cur, now) => feedValue(cur, now, n, fill, meta)).then((ok) => {
    R.txBusy = false;
    if (!ok || !R.on) return;
    if (meta.long) R.net.sendBc(BC.MULTI + 6, 1 << R.seat).catch(() => {});      // ひさしぶりの火
    else if (meta.sen) R.net.sendBc(BC.MULTI + 7, 1 << R.seat).catch(() => {});  // 千の薪
  }, (e) => { R.txBusy = false; dbg(e && e.message); });
}

// ================= 火の番の仕事（判定して、部屋に送る） =================
function judgeFeeds() { // 同時くべ: 各自のくべた時刻（サーバー時刻）が1秒以内に重なった人数
  let newest = 0, bits = 0, c = 0;
  const now = R.net.now();
  for (let i = 0; i < SEATS; i++) if (R.feedT[i] > newest) newest = R.feedT[i];
  for (let i = 0; i < SEATS; i++) if (R.feedT[i] && newest - R.feedT[i] <= 1000 && (i === R.seat || live(R.seats[i], now))) { bits |= 1 << i; c++; }
  if (c < 2 || !R.keeper || performance.now() - R.simLast < 5000) return;
  R.simLast = performance.now();
  for (let i = 0; i < SEATS; i++) if (bits & (1 << i)) R.feedT[i] = 0;
  R.net.sendBc(BC.MULTI + (c >= 5 ? 2 : c >= 3 ? 1 : 0), bits).catch(() => {});
}
function sameStar() { // 同じ星: 流れ星が流れているあいだに、2人以上がタップした
  if (!R.keeper || R.starDone || performance.now() > R.starUntil + 1500) return;
  let bits = 0, c = 0;
  for (let i = 0; i < SEATS; i++) if (R.starTaps[i] >= R.starT0 - 1000) { bits |= 1 << i; c++; }
  if (c >= 2) { R.starDone = true; R.net.sendBc(BC.MULTI + 4, bits).catch(() => {}); }
}
function keeperTick(fuel, gauge) { // 1秒に1回
  if (!R.keeper || R.offline) return;
  const at = performance.now();
  if (R.people >= 5 && fuel >= 110 && at - R.ringLast > 600000) { R.ringLast = at; R.net.sendBc(BC.MULTI + 3, 31).catch(() => {}); } // 火の輪
  R.talk = R.people >= 3 && fuel >= 5 ? R.talk + 1 : 0;                                                                              // 語らいの夜: 3人以上で30分、火を絶やさない
  if (R.talk >= 1800) { R.talk = 0; R.net.sendBc(BC.MULTI + 5, 31).catch(() => {}); }
  if (gauge >= 1 && R.net.now() - (R.fire.ftime || 0) > 20000 && !R.txBusy && R.queue === 0 && R.tokens >= 1) { // だれもくべていなくても、満タンなら業火を始める
    R.tokens--; R.txBusy = true;
    R.net.fireTx((cur, now) => (cur ? feedValue(cur, now, 0, false) : undefined)).then(() => { R.txBusy = false; }, () => { R.txBusy = false; });
  }
}

// ================= 囲む火の出来事 =================
function multiEvent(i, bits, record) {
  const m = A.MEV[i];
  if (!m) return;
  const [id, name, star] = m, g = A.geo();
  let sub = 'プレビュー（記録されません）';
  if (record) {
    const col = A.S.room.col, rec = col[id] || (col[id] = { n: 0, first: Date.now() });
    rec.n++; rec.last = Date.now();
    if (rec.n === 1) { A.S.unseen = true; A.syncButtons(); }
    A.addLogText('囲む火：' + name); A.save();
    sub = rec.n === 1 ? 'はじめて！ 図鑑の「囲む火」に記録' : `${rec.n}回目`;
  }
  A.announce({ name, star, stars: '★'.repeat(star) }, sub);
  if (A.calm()) { A.feel.bright(0.3); return; } // しずか: 光だけ
  if (i <= 2) { // 重なる手・三つの火の粉・五つの手: かかわった席から薪が同時に飛ぶ
    if (i === 2) for (let s = 0; s < SEATS; s++) { const p = seatPos(s, g); A.throwGhost(p.x, p.y - 24 * g.U * p.s, MARKS[R.sh[s].mark]); }
    const n = i === 2 ? 5 : i === 1 ? 3 : 2;
    for (let s = 0, c = 0; s < SEATS && c < n; s++) { // 火の粉が、その人たちの灯りの色の輪になって空へ上がる
      if (!(bits & (1 << s)) && i !== 2) continue;
      const col = MARKS[R.sh[s].mark] || MARKS[0], a0 = (c++ / n) * Math.PI * 2;
      for (let j = 0; j < (i === 2 ? 16 : 10); j++) { const a = a0 + j * 0.08; A.addSpark(g.cx + Math.cos(a) * 26 * g.U, g.baseY - 30 * g.U, Math.cos(a) * (60 + j * 4) * g.U, -(200 + j * 10) * g.U + Math.sin(a) * 40 * g.U, 1.6 + j * 0.06, 2.2 * g.U, col, -26); }
    }
    A.feel.bright(i === 2 ? 0.3 : 0.14); if (i === 2) A.feel.shake(3);
  } else if (i === 3) { // 火の輪
    for (let j = 0; j < 40; j++) { const a = (j / 40) * Math.PI * 2; A.addSpark(g.cx + Math.cos(a) * 80 * g.U, g.baseY + 8 * g.U + Math.sin(a) * 20 * g.U, Math.cos(a) * 20 * g.U, -(90 + (j % 5) * 22) * g.U, 1.8, 2 * g.U, [255, 190, 90], -20); }
    A.feel.bright(0.22);
  } else A.feel.bright(0.18);
}

// ================= おすそわけ =================
function roastDone(item, res) { // 焼き上がったら「自分で食べる」か「おすそわけ」
  if (!R.on || R.people < 2 || performance.now() - R.giftAt < 60000) return false; // 1人あたり、1分に1回まで
  R.roast = { item, res, until: performance.now() + 20000 };
  setTimeout(roastMenu, 1700); // 串を引き上げる演出のあとに
  return true;
}
function roastSelf() { const r = R.roast; if (!r) return; R.roast = null; A.toast('', A.RESULTS[r.res][0] + A.ROASTS[r.item].name, A.roastRecord(r.item, r.res), 3200); }
function roastMenu() {
  if (!R.roast || !R.on) { roastSelf(); return; }
  A.openChipMenu([['自分で食べる', roastSelf, 'chipEat'], ['おすそわけ', () => {
    const now = R.net.now(), items = [];
    for (let i = 0; i < SEATS; i++) if (i !== R.seat && live(R.seats[i], now)) items.push([`${MARK_NAMES[R.sh[i].mark]}の灯りの人へ`, () => roastGive(i), 'chipGive' + i]);
    items.push(['やめる', roastSelf]);
    A.openChipMenu(items);
  }, 'chipShare']]);
}
function roastGive(to) {
  const r = R.roast; if (!r || !R.on) return;
  R.roast = null; R.giftAt = performance.now();
  R.net.sendEv(EV.GIFT + RES.indexOf(r.res), 1 + to * 2 + ITEMS.indexOf(r.item)).catch(() => {});
  R.sh[R.seat].gest = EV.GEST; R.sh[R.seat].gt = performance.now();
  A.toast('', 'おすそわけしました', A.RESULTS[r.res][0] + A.ROASTS[r.item].name, 3200);
}

// ================= しぐさ =================
function gesture(k) { // 3秒に1回まで。送るのは番号だけ
  const at = performance.now();
  if (!R.on || at - R.gestAt < 3000) return;
  R.gestAt = at; R.sh[R.seat].gest = EV.GEST + k; R.sh[R.seat].gt = at;
  R.net.sendEv(EV.GEST + k, 1).catch(() => {});
}

// ================= 席と影の絵 =================
// 自分の席は手前。ほかの人は、席の番号の順に 左 → 火の向こう左 → 火の向こう右 → 右
const SPOT = [[-74, 40, 1.3], [-116, 4, 1], [-60, -27, 0.84], [60, -27, 0.84], [116, 4, 1]];
function seatPos(i, g) { const [x, y, s] = SPOT[(i - R.seat + SEATS) % SEATS]; return { x: g.cx + x * g.U, y: g.baseY + y * g.U, s, dir: x < 0 ? 1 : -1, r: (i - R.seat + SEATS) % SEATS }; }
function drawSeat(i, g, c) {
  const sh = R.sh[i];
  if (sh.k <= 0.01) return;
  const p = seatPos(i, g), u = g.U * p.s, k = sh.k, at = performance.now();
  const gp = sh.gest ? (at - sh.gt) / 1800 : 1, gk = gp < 1 ? Math.sin(gp * Math.PI) : 0, ge = gp < 1 ? sh.gest - EV.GEST + 1 : 0;
  if (gp >= 1) sh.gest = 0;
  const lit = g.lit * (0.5 + 0.5 * Math.min(1, g.I)), body = A.rgb(A.mix([14, 12, 16], [74, 44, 28], 0.3 * lit * (g.night ? 1 : 0.5) + (g.night ? 0 : 0.12)));
  c.save();
  c.globalAlpha = Math.min(1, k * 1.4);
  c.translate(p.x, p.y + 2 * u); c.scale(u, u * (1 + 0.22 * (1 - k))); // 闇から現れて、ゆっくり腰を下ろす
  c.translate(0, -9 * (1 - k));
  c.fillStyle = body;
  c.beginPath(); c.ellipse(p.dir * 3, 0, 12, 4.6, 0, 0, Math.PI * 2); c.fill(); // ひざ
  c.save();
  if (ge === 5) c.rotate(p.dir * 0.42 * gk);                                     // おじぎ
  c.beginPath(); c.moveTo(-8, 0); c.quadraticCurveTo(-9, -17, -5.5, -21); c.quadraticCurveTo(0, -24, 5.5, -21); c.quadraticCurveTo(9, -17, 8, 0); c.closePath(); c.fill(); // 胴
  const hy = -28 + (ge === 2 ? Math.abs(Math.sin(gp * Math.PI * 3)) * 2.6 : 0) - (ge === 4 ? 1.6 * gk : 0), hx = (ge === 4 ? -p.dir * 2.4 * gk : 0) + p.dir * 1;
  c.beginPath(); c.arc(hx, hy, 5.4, 0, Math.PI * 2); c.fill();                   // 頭（顔は描かない）
  c.strokeStyle = body; c.lineWidth = 3.2; c.lineCap = 'round';
  if (ge === 1) { c.beginPath(); c.moveTo(p.dir * 4, -17); c.lineTo(p.dir * (4 + 13 * gk), -15 - 2 * gk); c.stroke(); }                 // 手をかざす
  if (ge === 3) { c.beginPath(); c.moveTo(p.dir * 4, -18); c.lineTo(p.dir * (4 + 7 * gk), -18 - 17 * gk); c.stroke(); }                 // 空を指さす
  if (ge === 4) { c.beginPath(); c.moveTo(-5, -18); c.lineTo(-9 * gk - 3, -18 - 12 * gk); c.moveTo(5, -18); c.lineTo(9 * gk + 3, -18 - 12 * gk); c.stroke(); } // あくび
  c.restore();
  // 足もとの小さなランタン（その人の灯りの色）
  const lx = -p.dir * 13, col = MARKS[sh.mark] || MARKS[0];
  c.fillStyle = '#2a2622'; c.fillRect(lx - 2.6, -8.4, 5.2, 1.6); c.fillRect(lx - 2.2, -0.6, 4.4, 1.4);
  c.fillStyle = A.rgb(col); c.fillRect(lx - 1.9, -6.8, 3.8, 6.2);
  c.restore();
  c.globalCompositeOperation = 'lighter';
  A.blob(col, p.x + lx * u, p.y - 2 * u, 13 * u, 0.42 * k * (g.night ? 1 : 0.5));
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
}

// ================= 画面（入口のカード・人数の点） =================
let elPanel = null, elDots = null, view = null, draft = '', msgText = '';
const shareText = (pass) => `${location.origin}${location.pathname}\n合言葉：${pass}\n（合言葉を知っている人はだれでも入れます）`; // ゲームの URL と合言葉だけ
function copy(text, done) {
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => A.toast('', done, '', 1800), () => panelMsg('コピーできませんでした。合言葉を書き写してください'));
  else panelMsg('コピーできませんでした。合言葉を書き写してください');
}
function panelMsg(t) { msgText = t; panelRefresh(); }
function panelRefresh() { if (view) panel(view, true); }
function panel(v, keep) {
  view = v;
  if (!keep) msgText = '';
  A.app.classList.toggle('rooming', !!v);
  if (!v) return;
  const p = elPanel, el = A.el, S = A.S;
  p.textContent = '';
  const btn = (label, fn, cls) => { const b = el('button', cls || '', label); b.addEventListener('click', fn); return b; };
  const row = (...bs) => { const d = el('div', 'btns'); d.append(...bs); p.appendChild(d); };
  const text = (t, cls) => p.appendChild(el('p', cls || '', t));
  const marks = () => { // 灯りの色（8色から選ぶ）
    const d = el('div', 'marks');
    MARKS.forEach((c, i) => { const b = el('button', i === S.room.mark ? 'on' : ''); b.style.background = A.rgb(c); b.setAttribute('aria-label', MARK_NAMES[i] + 'の灯り'); b.addEventListener('click', () => { S.room.mark = i; A.save(); if (R.on) { R.sh[R.seat].mark = i; R.net.setMark(i).catch(() => {}); } panelRefresh(); }); d.appendChild(b); });
    text('灯りの色', 'cap'); p.appendChild(d);
  };
  const input = () => { const i = el('input'); i.type = 'text'; i.maxLength = 24; i.value = draft; i.placeholder = '合言葉（4〜24文字）'; i.autocapitalize = 'off'; i.autocomplete = 'off'; i.spellcheck = false; i.addEventListener('input', () => { draft = i.value; }); p.appendChild(i); return i; };
  p.appendChild(el('b', '', '囲む火'));
  if (v === 'busy') { text('部屋につないでいます…'); return; }
  if (v === 'in') {
    text(`${R.people}人で、同じ火を囲んでいます。`);
    if (R.pass) { text('合言葉', 'cap'); text(R.pass, 'pass'); row(btn('コピー', () => copy(R.pass, '合言葉をコピーしました')), btn('共有', () => share(R.pass))); text('合言葉を知っている人はだれでも入れます。', 'cap'); }
    marks();
    if (msgText) text(msgText, 'msg');
    row(btn('部屋を出る', () => { panel(null); leave(); }, 'warn'), btn('とじる', () => panel(null)));
    return;
  }
  if (v === 'home') {
    if (!S.room.told) text('同じ合言葉を入れた人と、最大5人で1つの火を囲めます。名前や言葉は送られません。送られるのは、くべた本数・しぐさ・灯りの色だけです。'); // はじめて使うときに1度だけ
    else text('合言葉で、同じ火を囲みます。', 'cap');
    if (msgText) text(msgText, 'msg');
    if (S.room.last) p.appendChild(btn(`前回の部屋に入る（${S.room.last}）`, () => enter(S.room.last), 'main'));
    row(btn('部屋をつくる', () => { draft = suggest(); panel('make'); }), btn('合言葉で入る', () => { draft = ''; panel('join'); }));
    row(btn('とじる', () => panel(null)));
    return;
  }
  // つくる／入る
  text(v === 'make' ? '合言葉を決めて、いっしょに囲みたい人に伝えてください（書き換えてもかまいません）。' : '教えてもらった合言葉を入れてください。');
  input();
  if (v === 'make') { row(btn('別の合言葉', () => { draft = suggest(); panelRefresh(); }), btn('コピー', () => copy(draft, '合言葉をコピーしました')), btn('共有', () => share(draft))); text('合言葉を知っている人はだれでも入れます。', 'cap'); }
  marks();
  if (msgText) text(msgText, 'msg');
  row(btn(v === 'make' ? 'この合言葉で入る' : '入る', () => enter(draft), 'main'), btn('もどる', () => panel('home')));
}
function share(pass) { // Web Share が使えなければ、コピーだけ
  const norm = normalize(pass);
  if (!validPass(norm)) { panelMsg('合言葉は、ひらがな・カタカナ・英数字の4〜24文字です'); return; }
  if (navigator.share) navigator.share({ text: shareText(norm) }).catch(() => {}); else copy(shareText(norm), '文面をコピーしました');
}
export function openPanel() { panel(R.on ? 'in' : 'home'); }

// ================= はじめに1度だけ: 差し込み口につなぐ =================
export function init(api) {
  A = api;
  const { HOOKS, TAP_GUARD, FX } = A;
  elPanel = A.app.appendChild(A.el('div')); elPanel.id = 'room';
  elDots = A.$('stage').insertAdjacentElement('afterend', A.el('div')); elDots.id = 'roomDots';

  HOOKS.thrown.push((L) => { // 自分の手でくべた薪: 本数はひとりのときと同じく数え、火力は部屋の火に足す
    if (!R.on || L.stew || L.ghost) return;
    L.fuel = 0; R.queue++; R.evQueue++;
    if (!A.fx.uncounted) { A.S.room.logs++; A.markDirty(); }
  });
  HOOKS.land.push((L) => { if (R.on && L.gold === true) R.fill = true; }); // 金の薪は、部屋の火も満タンにする
  HOOKS.update.push((dt, real) => {
    if (!R.on) return;
    const at = performance.now(), now = R.net.now(), g = A.geo();
    R.tokens = Math.min(5, R.tokens + real);
    if (R.net.tick) R.net.tick(real);
    // 部屋の火: 届いた値から計算し、まだ送っていないぶんは先に足して見せる
    const st = fireAt(R.fire, now), f = Math.min(capNow(), st.fuel + R.queue * A.BURN.LOG + (R.fill ? 120 : 0));
    A.S.fuel = Math.min(100, f);
    A.fx.wide = 1 + Math.max(0, f - 100) / 100 * 1.6; // 100を超えた分は、炎が横に広がる
    if (A.fever.state.t <= 0) A.fever.state.gauge = st.gauge;
    R.fuelNow = f; R.gaugeNow = st.gauge;
    flush(at);
    if (R.simAt && at >= R.simAt) { R.simAt = 0; judgeFeeds(); }
    for (const sh of R.sh) sh.k = A.clamp(sh.k + (sh.on ? real / 2.6 : -real / 2), 0, 1);
    for (let i = R.ghosts.length - 1; i >= 0; i--) { // ほかの人の薪が、その人の席から弧を描いて飛んでくる
      const q = R.ghosts[i];
      if (at < q.at) continue;
      const p = seatPos(q.seat, g);
      A.throwGhost(p.x + p.dir * 8 * g.U, p.y - 22 * g.U * p.s, MARKS[R.sh[q.seat].mark]);
      q.at = at + 140; if (--q.n <= 0) R.ghosts.splice(i, 1);
    }
    if (R.roast && at > R.roast.until) roastSelf(); // 選ばなければ、自分で食べたことにする
  });
  HOOKS.sec.push(() => {
    if (!R.on) return;
    const at = performance.now();
    countPeople();
    const wx = wxFor(R.id || 'fake', R.net.now());
    if (wx !== R.wx) { R.wx = wx; A.setWeather(wx); }
    if (!R.offline && at >= R.beatAt) { R.beatAt = at + BEAT; R.net.beat().catch((e) => dbg(e && e.message)); } // 30秒ごとに「生きている」印
    keeperTick(R.fuelNow || 0, R.gaugeNow || 0);
  });
  HOOKS.ground.push(() => { if (!R.on && !R.sh.some((s) => s.k > 0.01)) return; const g = A.geo(), c = A.ctx(); for (let i = 0; i < SEATS; i++) if (i !== R.seat) drawSeat(i, g, c); });
  HOOKS.front.push(() => { if (R.on) drawSeat(R.seat, A.geo(), A.ctx()); });
  TAP_GUARD.splice(1, 0, (e) => { // 流れ星が流れているあいだの、空へのタップ（同じ星）
    if (!R.on || R.iTapped || performance.now() > R.starUntil || !e || e.clientY == null) return false;
    const g = A.geo(), rect = A.app.getBoundingClientRect();
    if (e.clientY - rect.top > g.horizon * 0.9) return false;
    R.iTapped = true; R.starTaps[R.seat] = R.net.now();
    A.addSpark(e.clientX - rect.left, e.clientY - rect.top, 0, -10 * g.U, 1, 2.4 * g.U, [220, 236, 255], 4);
    R.net.sendEv(EV.STAR, 1).catch(() => {}); sameStar();
    return true;
  });
  A.addChip('chipGest', 'しぐさ', () => A.openChipMenu(GESTS.map((n, i) => [n, () => gesture(i), 'chipG' + i]).concat([['やめる', () => {}]])), () => R.on);
  A.addChip('chipLeave', '部屋を出る', () => leave(), () => R.on); // いつでも1タップで
  document.addEventListener('visibilitychange', () => { // アプリが裏に回って2分たったら切断し、戻ったら再接続する
    if (!R.on) return;
    clearTimeout(R.hideT);
    if (document.hidden) R.hideT = setTimeout(() => { if (R.on && document.hidden) { R.offline = true; R.net.offline(); } }, 120000);
    else if (R.offline) rejoin();
  });
  window.addEventListener('pagehide', () => { if (R.on && R.net.kind !== 'fake') R.net.leave().catch(() => {}); });
  A.MEV.forEach((m, i) => { FX['m-' + m[0]] = () => multiEvent(i, 31, false); });
  GESTS.forEach((n, i) => { FX['gest-' + (i + 1)] = () => { if (R.on) { R.gestAt = 0; gesture(i); } }; });
  A.syncChips();
}

// ================= ?debug =================
export async function fake(n) { // 通信せずに、架空の仲間と囲む
  if (R.on) await leave(true);
  const net = fakeNet(A.clamp(n | 0, 0, 4));
  start(net, '', '', await net.join('', A.S.room.mark));
  return R.people;
}
export const debugState = () => ({ on: R.on, seat: R.seat, people: R.people, keeper: R.keeper, fuel: R.fuelNow, gauge: R.gaugeNow, queue: R.queue, total: R.fire ? R.fire.total : 0, offline: R.offline,
  seats: R.seats.map((s) => (s ? { mark: s.mark, ev: s.ev ? s.ev.k : null } : null)), gest: R.sh.map((s) => s.gest), fever: A.fever.state.t, wx: R.wx, kind: R.net ? R.net.kind : null, id: R.id });
export const debugNet = () => R.net;
