/* 🧩 test/position.mjs — 守「自訂殘局」的兩根柱子(2026-09-13 立)
 *
 *   ① FEN 往返:存檔 / 分享連結靠它;壞字串一律回 null(那是網址來的,什麼都可能)。
 *   ② 局面合法性:不合規則的局面**一開始就不准下**——提示引擎與 AI 都假設王各一個,
 *      擺兩個帥或沒有將會讓它們算出鬼東西(findKing 回 null ⇒ isInCheck 直接當成被將軍)。
 *
 * ★ 每一條「會咬」:先確認合法版本 ok,再確認只差一顆的版本被擋、而且擋的理由講對。
 * 跑法:node test/position.mjs
 */
import { GameEngine, INITIAL_BOARD } from '../src/game/logic.js';
import { toFen, fromFen, validatePosition, EMPTY_BOARD, MAX_COUNT } from '../src/game/position.js';

let pass = 0, fail = 0;
const ok = (cond, msg, note = '') => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ ' + msg + (note ? ' → ' + note : '')); }
};

/** 擺一個局面:pieces = { 'x,y': '棋子' } */
const pos = (pieces) => {
  const b = EMPTY_BOARD();
  for (const [k, v] of Object.entries(pieces)) { const [x, y] = k.split(',').map(Number); b[y][x] = v; }
  return b;
};
const hasErr = (v, frag) => v.errors.some((e) => e.includes(frag));
/** 合法的最小骨架:紅帥 (4,9)、黑將 (3,0)(不同直線,不照面) */
const BASE = { '4,9': 'K', '3,0': 'k' };

console.log('\n── ① FEN 往返 ──');
{
  const fen = toFen(INITIAL_BOARD, 'w');
  ok(fen === 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w',
    '開局盤面的 FEN 就是象棋通用的那一串', fen);
  const back = fromFen(fen);
  ok(back && JSON.stringify(back.board) === JSON.stringify(INITIAL_BOARD) && back.turn === 'w',
    '★ toFen → fromFen 回得到一模一樣的盤面與輪到誰');
  const b2 = fromFen(toFen(pos(BASE), 'b'));
  ok(b2 && b2.turn === 'b' && b2.board[9][4] === 'K' && b2.board[0][3] === 'k', '輪到黑方也記得住(b)');
  ok(toFen(EMPTY_BOARD(), 'w') === '9/9/9/9/9/9/9/9/9/9 w', '空盤 = 十個 9');
}

console.log('\n── ② 壞字串一律回 null,不丟例外 ──');
for (const [label, s] of [
  ['空字串', ''], ['亂字', 'abc'], ['只有 9 列', '9/9/9/9/9/9/9/9/9 w'],
  ['一列 10 格', '9/9/9/9/9/9/9/9/9/RNBAKABNRR w'], ['一列只有 8 格', '8/9/9/9/9/9/9/9/9/9 w'],
  ['不認得的棋子 x', 'x8/9/9/9/9/9/9/9/9/9 w'], ['null', null], ['數字', 42], ['undefined', undefined],
]) {
  let r; let threw = false;
  try { r = fromFen(s); } catch { threw = true; }
  ok(!threw && r === null, `${label} → null`, threw ? '丟例外了' : JSON.stringify(r));
}

console.log('\n── ③ 合法局面 ok ──');
ok(validatePosition(INITIAL_BOARD, 'w').ok, '開局盤面合法');
ok(validatePosition(pos(BASE), 'w').ok, '只有帥與將(不同直線)合法');
ok(validatePosition(pos({ ...BASE, '0,1': 'R' }), 'w').ok, '紅俥 vs 黑將 合法');
ok(validatePosition(pos({ ...BASE, '4,3': 'P', '1,2': 'P' }), 'w').ok, '過了河的兵可以站任何一路');
ok(validatePosition(pos({ ...BASE, '6,5': 'B', '4,7': 'B', '2,4': 'b' }), 'w').ok, '相在相位、象在象位 合法');

console.log('\n── ④ 帥/將的數量 ──');
{
  const two = validatePosition(pos({ ...BASE, '3,8': 'K' }), 'w');
  ok(!two.ok && hasErr(two, '只能有一個帥'), '兩個帥 → 擋,理由講對', two.errors.join(';'));
  const none = validatePosition(pos({ '4,9': 'K' }), 'w');
  ok(!none.ok && hasErr(none, '要有一個將'), '沒有將 → 擋', none.errors.join(';'));
  const noRed = validatePosition(pos({ '3,0': 'k' }), 'w');
  ok(!noRed.ok && hasErr(noRed, '要有一個帥'), '沒有帥 → 擋', noRed.errors.join(';'));
}

console.log('\n── ⑤ 擺法 ──');
{
  const v1 = validatePosition(pos({ '2,9': 'K', '3,0': 'k' }), 'w');
  ok(!v1.ok && hasErr(v1, '帥要在自己的九宮'), '帥跑出九宮 → 擋', v1.errors.join(';'));
  const v2 = validatePosition(pos({ ...BASE, '4,9': 'K', '4,7': 'A' }), 'w');
  ok(!v2.ok && hasErr(v2, '仕只能站在'), '仕站在九宮中央的正上方(不是斜線點)→ 擋', v2.errors.join(';'));
  ok(validatePosition(pos({ ...BASE, '3,7': 'A', '5,9': 'A' }), 'w').ok, '仕站斜線點 ok');
  const v3 = validatePosition(pos({ ...BASE, '2,3': 'B' }), 'w');
  ok(!v3.ok && hasErr(v3, '相只能站在'), '相過河 → 擋', v3.errors.join(';'));
  const v4 = validatePosition(pos({ ...BASE, '0,8': 'P' }), 'w');
  ok(!v4.ok && hasErr(v4, '兵不會出現在自己這邊的後三排'), '兵在自己底線那三排 → 擋', v4.errors.join(';'));
  const v5 = validatePosition(pos({ ...BASE, '1,6': 'P' }), 'w');
  ok(!v5.ok && hasErr(v5, '沒過河的兵只能站在兵線的五個位置'), '沒過河的兵站奇數路 → 擋', v5.errors.join(';'));
  ok(validatePosition(pos({ ...BASE, '2,5': 'P' }), 'w').ok, '沒過河的兵站偶數路(進一步)ok');
  const v6 = validatePosition(pos({ ...BASE, '1,4': 'p' }), 'w');
  ok(!v6.ok && hasErr(v6, '沒過河的卒只能站在卒線'), '黑卒同一條規則(鏡射)→ 擋', v6.errors.join(';'));
  const v7 = validatePosition(pos({ ...BASE, '4,1': 'p' }), 'w');
  ok(!v7.ok && hasErr(v7, '卒不會出現在自己這邊的後三排'), '卒在黑方後三排 → 擋', v7.errors.join(';'));
}

console.log('\n── ⑥ 數量上限 ──');
{
  const v = validatePosition(pos({ ...BASE, '0,0': 'R', '8,0': 'R', '0,5': 'R' }), 'w');
  ok(!v.ok && hasErr(v, '俥最多 2 個'), '三個俥 → 擋', v.errors.join(';'));
  const five = { ...BASE, '0,6': 'P', '2,6': 'P', '4,6': 'P', '6,6': 'P', '8,6': 'P' };
  ok(validatePosition(pos(five), 'w').ok, '五個兵 ok');
  const six = validatePosition(pos({ ...five, '3,4': 'P' }), 'w');
  ok(!six.ok && hasErr(six, `兵最多 ${MAX_COUNT.p} 個`), '六個兵 → 擋', six.errors.join(';'));
}

console.log('\n── ⑦ 用引擎判的三條(擺法都對了才問)──');
{
  const face = validatePosition(pos({ '4,9': 'K', '4,0': 'k' }), 'w');
  ok(!face.ok && hasErr(face, '照面'), '將帥照面 → 擋', face.errors.join(';'));
  ok(validatePosition(pos({ '4,9': 'K', '4,0': 'k', '4,5': 'P' }), 'w').ok, '中間隔一顆就不算照面');
  // 紅俥 (3,5) 直線瞄著黑將 (3,0):輪紅走 ⇒ 黑方「還沒輪到卻被將軍」不合規則;輪黑走 ⇒ 合法(黑要應將)
  // ⚠ 帥擺 (5,9) 不擺 (4,9):將要有路可逃((3,0)→(4,0)),帥在第 4 路的話那一步是照面、黑就被將死了
  //   (第一版測試就這樣寫錯,是測試錯不是程式錯 —— 留著這句免得下一手再踩)。
  const b = pos({ '5,9': 'K', '3,0': 'k', '3,5': 'R' });
  const wrong = validatePosition(b, 'w');
  ok(!wrong.ok && hasErr(wrong, '還沒輪到走的黑方正被將軍'), '非走方被將軍 → 擋', wrong.errors.join(';'));
  ok(validatePosition(b, 'b').ok, '★ 同一個盤面輪黑走就合法(被將軍的一方先走)', validatePosition(b, 'b').errors.join(';'));
  // 黑將被雙俥困死:(3,0) 將,紅俥 (3,5) 將軍、另一俥 (4,3) 封住 (4,0)/(4,1),(3,1)(2,x 不在九宮)
  const mated = pos({ '4,9': 'K', '3,0': 'k', '3,5': 'R', '4,4': 'R' });
  const e = new GameEngine(); e.loadPosition(mated, 'b');
  const legal = e.getLegalMoves().length;
  const m = validatePosition(mated, 'b');
  ok(legal === 0 ? (!m.ok && hasErr(m, '一開始就分出勝負')) : m.ok,
    legal === 0 ? '走方已被將死 → 擋(一開始就分出勝負)' : '(這個盤面黑方還有路,合法)', m.errors.join(';'));
}

console.log('\n── ⑧ loadPosition ──');
{
  const e = new GameEngine();
  e.move([1, 2], [4, 2]);                       // 先走一步,製造歷史
  const src = pos(BASE);
  e.loadPosition(src, 'b');
  ok(e.history.length === 0, '歷史清空(不然悔棋會回到「不存在的上一局」)');
  ok(e.turn === 'b', '輪到誰照給的');
  const h = e.zobristHash; e.recalculateHash();
  ok(e.zobristHash === h, 'hash 重算過(和再算一次相同)');
  src[9][4] = '.';
  ok(e.board[9][4] === 'K', '★ 盤面是複製的,改原陣列不會動到引擎');
  ok(e.boardMap.size === 1 && e.boardMap.get(e.zobristHash) === 1, '重複局面計數歸零重來(不會把上一局的三次重複帶進來)');
}

console.log('\n── ⑨ 錯誤訊息去重 ──');
{
  const v = validatePosition(pos({ ...BASE, '4,7': 'A', '4,9': 'K', '3,8': 'A' }), 'w');
  ok(v.errors.filter((e) => e.includes('仕只能站在')).length === 1, '兩顆仕都擺錯只講一句', v.errors.join(';'));
}

console.log(`\n${fail === 0 ? '🟢' : '🔴'} position:${pass} 過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
