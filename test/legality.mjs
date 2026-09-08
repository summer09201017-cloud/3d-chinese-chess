/* 🔬 走法合法性:不准送將(R1)+ 飛將(R2)。2026-09-09 立。
 *
 * 由來(0909 讀原始碼查到的兩個規則層缺陷,不是缺功能、是判定錯):
 *   R1 `getLegalMoves()` 原本是**純幾何**的,自己的註解還寫著
 *      「we do not check if move leaves king in check」—— 而 UI 就是拿它畫可走點、
 *      拿它驗玩家的點擊 ⇒ 玩家**走得出送將的棋**,然後被電腦把帥吃掉判負。
 *      象棋規則裡那種走法是**不合法、不准走**,不是「走了就輸」。孩子會莫名輸掉一盤。
 *   R2 王的走法那裡留了一行 `// Flying general: check line of sight to other king`
 *      但**沒有實作** ⇒ 允許兩王照面的非法局面,也漏掉「飛將」這種殺法。
 *
 * ★ 這支測試的重點是「**會咬**」:每一條都先確認純幾何版本會產生那一步,
 *   再確認合法版本把它濾掉。只斷言「合法步數 > 0」是抓不到回歸的。
 *
 * 跑法:node test/legality.mjs
 */
import { GameEngine } from '../src/game/logic.js';
import { getBestMoveAlphaBeta } from '../src/game/ai.js';

let pass = 0, fail = 0;
const ok = (cond, msg, note = '') => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ ' + msg + (note ? ' → ' + note : '')); }
};

const EMPTY = () => Array.from({ length: 10 }, () => Array(9).fill('.'));
/** 擺一個局面。pieces = { 'x,y': '棋子' };turn 預設紅方 */
function pos(pieces, turn = 'w') {
  const e = new GameEngine();
  e.board = EMPTY();
  for (const [k, v] of Object.entries(pieces)) {
    const [x, y] = k.split(',').map(Number);
    e.board[y][x] = v;
  }
  e.turn = turn;
  e.history = [];
  e.recalculateHash();
  return e;
}
const has = (moves, fx, fy, tx, ty) =>
  moves.some((m) => m.from[0] === fx && m.from[1] === fy && m.to[0] === tx && m.to[1] === ty);
const hasTo = (tos, tx, ty) => tos.some((t) => t[0] === tx && t[1] === ty);

console.log('── R1 不准走出「送將」的棋 ──');
{
  /* 紅帥 (4,9);紅炮 (4,8) 是唯一的擋子;黑車 (4,0) 直線瞄著同一路。
     紅炮往旁邊走(4,8)→(3,8) 幾何上合法,但走完帥就被黑車將到 ⇒ 不准走。
     ⚠ 這裡原本擺「仕」是錯的 —— 仕只能**斜走**,根本產生不出 (4,8)→(3,8),
       那條「先證明測試會咬」當場就紅了。測試會咬的價值就在這:它先咬到我自己。 */
  const e = pos({ '4,9': 'K', '4,8': 'C', '4,0': 'r', '0,0': 'k' });
  const pseudo = e.getPseudoMoves();
  const legal = e.getLegalMoves();
  ok(has(pseudo, 4, 8, 3, 8), '純幾何版**產生**了那一步送將的棋(先證明測試會咬)');
  ok(!has(legal, 4, 8, 3, 8), '★ 合法版把送將那一步濾掉了');
  ok(legal.length < pseudo.length,
    `★ 合法步數 < 幾何步數(${legal.length} < ${pseudo.length})`);
  ok(!hasTo(e.getLegalPieceMoves(4, 8), 3, 8),
    '★ UI 的可走點也不再畫那一格(getLegalPieceMoves)');
}
{
  // 被將軍時,只有「解將」的棋算合法
  const e = pos({ '4,9': 'K', '4,0': 'r', '0,0': 'k', '8,9': 'R' });
  ok(e.isInCheck('w'), '紅方確實正被將軍(黑車直線瞄著帥)');
  const legal = e.getLegalMoves();
  ok(legal.length > 0, `被將軍時仍有解法(${legal.length} 步)`);
  for (const m of legal) {
    e.move(m.from, m.to);
    const still = e.isInCheck('w');
    e.undo();
    if (still) { ok(false, '★ 每一個合法步都必須解掉將軍', JSON.stringify(m)); break; }
  }
  ok(true, '★ 每一個合法步都真的解掉了將軍');
}

console.log('── R2 飛將(兩王照面) ──');
{
  /* 紅帥 (4,9)、黑將 (4,0) 同一路;中間只有紅兵 (4,5)。
     紅兵往前走 (4,5)→(4,4) 仍在同一路(不照面,合法);
     但紅兵**斜不走**,所以要讓它離開這一路得用別的子 —— 這裡改用紅炮測。 */
  const e = pos({ '4,9': 'K', '4,0': 'k', '4,5': 'C', '0,9': 'R' });
  ok(!e.kingsFaceEachOther(), '中間有子時不算照面');
  const pseudo = e.getPseudoMoves();
  const legal = e.getLegalMoves();
  ok(has(pseudo, 4, 5, 3, 5), '純幾何版**產生**了「炮讓開、兩王照面」那一步');
  ok(!has(legal, 4, 5, 3, 5), '★ 合法版把它濾掉了(飛將)');
  // 把中間的子直接拿掉,照面判定要成立
  const e2 = pos({ '4,9': 'K', '4,0': 'k' });
  ok(e2.kingsFaceEachOther(), '★ 中間無子且同一路 ⇒ 判定為照面');
  const e3 = pos({ '3,9': 'K', '4,0': 'k' });
  ok(!e3.kingsFaceEachOther(), '不同路不算照面');
}

console.log('── 將死 / 困斃都算輸(象棋沒有和局) ──');
{
  /* 真的將死:黑將 (4,0) 孤王。
     紅車 (4,5) 沿 4 路照著將(不相鄰 ⇒ 將吃不到它)⇒ (4,1) 不能去;
     紅車 (0,0) 橫掃第 0 排 ⇒ (3,0)(5,0) 也不能去。黑方一步都沒有 ⇒ 將死。
     ★ 這一條**會咬**:少了任一台車就不是將死,legal 會 > 0、isCheckmate 變 false。 */
  const e = pos({ '4,0': 'k', '4,5': 'R', '0,0': 'R', '4,9': 'K' }, 'b');
  ok(e.getLegalMoves().length === 0, `★ 這個局面黑方一步都走不了(${e.getLegalMoves().length})`);
  ok(e.isCheckmate() === true, '★ isCheckmate 判成將死');

  // 拿掉橫掃那台車 ⇒ 將可以往旁邊逃 ⇒ 就**不是**將死(證明上面那條不是恆真)
  const e2 = pos({ '4,0': 'k', '4,5': 'R', '4,9': 'K' }, 'b');
  ok(e2.getLegalMoves().length > 0, `★ 少一台車就有活路(${e2.getLegalMoves().length} 步)`);
  ok(e2.isCheckmate() === false, '★ 那時 isCheckmate 就是 false(不是恆真)');
}
{
  // 開局不可能是將死
  const e = new GameEngine();
  ok(!e.isCheckmate(), '開局不是將死');
  ok(e.getLegalMoves().length === e.getPseudoMoves().length,
    '開局沒有任何一步會送將 ⇒ 兩種走法數量相同(44)');
}

console.log('── AI 交出去的那一手必須是合法的(根節點走嚴格版) ──');
{
  /* 紅仕是唯一擋子的局面,換黑方走:AI(黑)不可以走出讓自己被將的棋。
     這裡直接驗「AI 回的那一手在合法清單裡」。 */
  const e = pos({ '4,0': 'k', '4,1': 'a', '4,9': 'K', '4,8': 'R', '0,0': 'r' }, 'b');
  const legal = e.getLegalMoves();
  const mv = getBestMoveAlphaBeta(e, 2, 'none');
  ok(!!mv, 'AI 給得出一手');
  ok(!!mv && has(legal, mv.from[0], mv.from[1], mv.to[0], mv.to[1]),
    '★★ AI 交出去的那一手在合法清單裡(不會走出送將的棋)',
    mv ? JSON.stringify(mv) : 'null');
}

console.log((fail ? '🔴' : '🟢') + ` legality:${pass} 過 / ${fail} 失敗`);
if (fail) process.exitCode = 1;
