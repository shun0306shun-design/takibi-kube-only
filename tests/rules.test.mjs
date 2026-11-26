// Security Rules のテスト（Firebase Local Emulator Suite）。
// 実行: cd tests && npm install && npm test
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, set, get, update, remove, serverTimestamp } from 'firebase/database';

const ROOM = '0123456789abcdef0123456789abcdef';
const TS = serverTimestamp();
let env;
const dbOf = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).database();
const seat = (uid, i, extra = {}) => set(ref(dbOf(uid), `rooms/${ROOM}/seats/${i}`), { uid, t: TS, mark: 1, sit: i, ...extra });
const fire = (over = {}) => ({ fuel: 9, t: TS, total: 1, fever: 0, ftime: 0, last: TS, ...over });
// ルールを通さずに、テスト用の状態を直接つくる
const admin = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.database()));

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-takibi',
    database: { host: '127.0.0.1', port: 9000, rules: readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8') },
  });
});
after(() => env.cleanup());
beforeEach(() => env.clearDatabase());

test('ログインしていない人は、席も火も読めず、書けない', async () => {
  await assertFails(get(ref(dbOf(null), `rooms/${ROOM}/seats`)));
  await assertFails(get(ref(dbOf(null), `rooms/${ROOM}/fire`)));
  await assertFails(set(ref(dbOf(null), `rooms/${ROOM}/seats/0`), { uid: 'x', t: TS, mark: 0, sit: 0 }));
});

test('ルートや部屋の一覧は読めない（部屋のIDを知らないと何も取れない）', async () => {
  await assertFails(get(ref(dbOf('alice'), '/')));
  await assertFails(get(ref(dbOf('alice'), 'rooms')));
  await assertFails(get(ref(dbOf('alice'), `rooms/${ROOM}`)));
  await assertSucceeds(get(ref(dbOf('alice'), `rooms/${ROOM}/seats`)));
  await assertSucceeds(get(ref(dbOf('alice'), `rooms/${ROOM}/fire`)));
  await assertSucceeds(get(ref(dbOf('alice'), `rooms/${ROOM}/bc`)));
});

test('部屋のIDは16進32文字だけ', async () => {
  await assertFails(set(ref(dbOf('alice'), 'rooms/ひみつ/seats/0'), { uid: 'alice', t: TS, mark: 0, sit: 0 }));
  await assertFails(set(ref(dbOf('alice'), 'rooms/ABCDEF0123456789ABCDEF0123456789/seats/0'), { uid: 'alice', t: TS, mark: 0, sit: 0 }));
  await assertFails(set(ref(dbOf('alice'), `rooms/${ROOM}0/seats/0`), { uid: 'alice', t: TS, mark: 0, sit: 0 }));
});

test('5人まで席を取れる。6人目の席はない', async () => {
  for (let i = 0; i < 5; i++) await assertSucceeds(seat('u' + i, i));
  await assertFails(seat('u5', 5));
  await assertFails(seat('u5', 6));
  for (let i = 0; i < 5; i++) await assertFails(seat('u5', i)); // 埋まっている席は取れない
});

test('他人の席は書き換えられない・消せない。自分の席は更新でき、空けられる', async () => {
  await seat('alice', 0);
  await assertFails(seat('bob', 0));
  await assertFails(update(ref(dbOf('bob'), `rooms/${ROOM}/seats/0`), { mark: 3 }));
  await assertFails(update(ref(dbOf('bob'), `rooms/${ROOM}/seats/0`), { t: TS }));
  await assertFails(remove(ref(dbOf('bob'), `rooms/${ROOM}/seats/0`)));
  await assertSucceeds(update(ref(dbOf('alice'), `rooms/${ROOM}/seats/0`), { t: TS }));
  await assertSucceeds(update(ref(dbOf('alice'), `rooms/${ROOM}/seats/0`), { mark: 5 }));
  await assertSucceeds(remove(ref(dbOf('alice'), `rooms/${ROOM}/seats/0`)));
  await assertSucceeds(seat('bob', 0)); // 空いたので取れる
});

test('90秒更新のない席は、ほかの人が取ってよい（それより新しい席は取れない）', async () => {
  await admin((db) => set(ref(db, `rooms/${ROOM}/seats/0`), { uid: 'alice', t: Date.now() - 60000, mark: 0, sit: 0 }));
  await assertFails(seat('bob', 0));
  await admin((db) => set(ref(db, `rooms/${ROOM}/seats/0`), { uid: 'alice', t: Date.now() - 95000, mark: 0, sit: 0 }));
  await assertSucceeds(seat('bob', 0));
});

test('他人の uid を名乗って席は取れない。時刻はサーバー時刻だけ', async () => {
  await assertFails(set(ref(dbOf('bob'), `rooms/${ROOM}/seats/1`), { uid: 'alice', t: TS, mark: 0, sit: 1 }));
  await assertFails(set(ref(dbOf('bob'), `rooms/${ROOM}/seats/1`), { uid: 'bob', t: Date.now() + 9e6, mark: 0, sit: 1 }));
  await assertFails(set(ref(dbOf('bob'), `rooms/${ROOM}/seats/1`), { uid: 'bob', t: 12345, mark: 0, sit: 1 }));
});

test('席: 範囲外の値・足りない項目・知らない項目・文字列は弾かれる', async () => {
  const s = (v) => set(ref(dbOf('alice'), `rooms/${ROOM}/seats/2`), v);
  await assertFails(s({ uid: 'alice', t: TS, mark: 8, sit: 2 }));
  await assertFails(s({ uid: 'alice', t: TS, mark: -1, sit: 2 }));
  await assertFails(s({ uid: 'alice', t: TS, mark: 1.5, sit: 2 }));
  await assertFails(s({ uid: 'alice', t: TS, mark: 'red', sit: 2 }));
  await assertFails(s({ uid: 'alice', t: TS, mark: 1, sit: 5 }));
  await assertFails(s({ uid: 'alice', t: TS, mark: 1 }));
  await assertFails(s({ uid: 'alice', t: TS, mark: 1, sit: 2, msg: 'こんにちは' }));
  await assertSucceeds(s({ uid: 'alice', t: TS, mark: 7, sit: 2 }));
});

test('呼び名: 6文字までの文字列だけ。無くてもよい。他人の呼び名は書き換えられない', async () => {
  const s = (v) => set(ref(dbOf('alice'), `rooms/${ROOM}/seats/2`), v);
  await assertSucceeds(s({ uid: 'alice', t: TS, mark: 1, sit: 2 }));
  await assertSucceeds(s({ uid: 'alice', t: TS, mark: 1, sit: 2, name: 'アリス' }));
  await assertSucceeds(s({ uid: 'alice', t: TS, mark: 1, sit: 2, name: '123456' }));
  await assertSucceeds(s({ uid: 'alice', t: TS, mark: 1, sit: 2, name: '' }));
  await assertFails(s({ uid: 'alice', t: TS, mark: 1, sit: 2, name: '1234567' }));
  await assertFails(s({ uid: 'alice', t: TS, mark: 1, sit: 2, name: 'ながいなまえです' }));
  await assertFails(s({ uid: 'alice', t: TS, mark: 1, sit: 2, name: 12 }));
  await assertFails(s({ uid: 'alice', t: TS, mark: 1, sit: 2, name: { a: 'x' } }));
  await assertFails(update(ref(dbOf('bob'), `rooms/${ROOM}/seats/2`), { name: 'わるもの' }));
});

test('席の ev: 番号と本数の範囲だけ。文字や知らない項目は送れない', async () => {
  await seat('alice', 0);
  const ev = (v) => update(ref(dbOf('alice'), `rooms/${ROOM}/seats/0`), { ev: v });
  await assertSucceeds(ev({ k: 0, n: 7, t: TS }));
  await assertSucceeds(ev({ k: 15, n: 20, t: TS }));
  await assertFails(ev({ k: 16, n: 1, t: TS }));
  await assertFails(ev({ k: 0, n: 0, t: TS }));
  await assertFails(ev({ k: 0, n: 21, t: TS }));
  await assertFails(ev({ k: 0, n: 1, t: 1 }));
  await assertFails(ev({ k: 0, n: 1 }));
  await assertFails(ev({ k: 'hello', n: 1, t: TS }));
  await assertFails(ev({ k: 0, n: 1, t: TS, text: 'やあ' }));
  await assertFails(update(ref(dbOf('bob'), `rooms/${ROOM}/seats/0`), { ev: { k: 0, n: 1, t: TS } }));
});

test('席のない人は火に書けない。席のある人は書ける', async () => {
  await seat('alice', 3);
  await assertFails(set(ref(dbOf('bob'), `rooms/${ROOM}/fire`), fire()));
  await assertSucceeds(set(ref(dbOf('alice'), `rooms/${ROOM}/fire`), fire()));
  await assertSucceeds(get(ref(dbOf('bob'), `rooms/${ROOM}/fire`))); // 読むのは、IDを知っていればできる
  await assertFails(set(ref(dbOf('bob'), `rooms/${ROOM}/fire`), fire({ total: 2 })));
  await assertFails(remove(ref(dbOf('alice'), `rooms/${ROOM}/fire`))); // 火は消せない
});

test('火: total は減らせない・1回に20本まで。fuel は 0〜120。時刻はサーバー時刻', async () => {
  await seat('alice', 0);
  const f = (over) => set(ref(dbOf('alice'), `rooms/${ROOM}/fire`), fire(over));
  await assertSucceeds(f({ total: 20 }));
  await assertSucceeds(f({ total: 40 }));
  await assertFails(f({ total: 61 }));
  await assertFails(f({ total: 39 }));
  await assertFails(f({ total: 40.5 }));
  await assertSucceeds(f({ total: 40, fuel: 120 }));
  await assertFails(f({ total: 40, fuel: 120.1 }));
  await assertFails(f({ total: 40, fuel: -1 }));
  await assertFails(f({ total: 40, fuel: '100' }));
  await assertFails(f({ total: 40, fever: 1.2 }));
  await assertFails(f({ total: 40, t: 5 }));
  await assertFails(f({ total: 40, ftime: Date.now() + 9e6 }));
  await assertFails(f({ total: 40, last: Date.now() + 9e6 }));
  await assertFails(f({ total: 40, memo: 'x' }));
  await assertFails(set(ref(dbOf('alice'), `rooms/${ROOM}/fire`), { fuel: 1, t: TS }));
  await assertFails(update(ref(dbOf('alice'), `rooms/${ROOM}/fire`), { total: 1000 }));
});

test('bc: 席のある人だけ。番号の範囲、by は自分の席だけ', async () => {
  await seat('alice', 1);
  await seat('bob', 2);
  const bc = (uid, v) => set(ref(dbOf(uid), `rooms/${ROOM}/bc`), v);
  await assertSucceeds(bc('alice', { k: 31, a: 255, t: TS, by: 1 }));
  await assertFails(bc('carol', { k: 1, a: 0, t: TS, by: 1 }));
  await assertFails(bc('alice', { k: 1, a: 0, t: TS, by: 2 })); // 他人の席を名乗れない
  await assertFails(bc('alice', { k: 32, a: 0, t: TS, by: 1 }));
  await assertFails(bc('alice', { k: 1, a: 256, t: TS, by: 1 }));
  await assertFails(bc('alice', { k: 1, a: 0, t: 7, by: 1 }));
  await assertFails(bc('alice', { k: 1, a: 0, t: TS, by: 1, text: 'やあ' }));
  await assertFails(bc('alice', { k: 'x', a: 0, t: TS, by: 1 }));
  await assertFails(remove(ref(dbOf('alice'), `rooms/${ROOM}/bc`)));
});

test('部屋の下に、決められた3つ以外は置けない', async () => {
  await seat('alice', 0);
  await assertFails(set(ref(dbOf('alice'), `rooms/${ROOM}/chat`), { m: 'hello' }));
  await assertFails(set(ref(dbOf('alice'), `rooms/${ROOM}/name`), 'わたしの部屋'));
  await assertFails(set(ref(dbOf('alice'), 'other'), 1));
});
