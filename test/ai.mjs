// 🔬 AI 提示品質測試(2026-09-07):提示不可以叫人做「虧本或等價的交換」
// 跑法:node test/ai.mjs
//
// 背景:使用者退件「提示常叫我吃掉某顆,吃完就被吃回,等於交換被吃」(先在 3dchess-an 抓到,
// 全棋類體檢後確認本站兩條病因都有):
//   ① evaluateBoard 只算子力 ⇒ 中局九成的走法 0 分平手,而根層 sort(random) + 「嚴格變好才換人」
//      ⇒ 一堆平手裡隨機挑一個,等價交換就被當成建議送出來;
//   ② 提示深度 3 是奇數層,「我吃→他回吃→我再吃」看起來賺,第 4 步他再吃回來看不到(水平線)。
// 修法:PST 位置分 + 葉子 quiescence + 提示走 getHintMove(固定深度、零隨機、半兵門檻)。
//
// ★ 判準用「獨立裁判」refQuiesce:只看子力、只走吃子、算到沒得吃為止,和被測的
//   evaluateBoard/PST/門檻沒有共用一行邏輯(只共用走法產生器,那是全站唯一真相)。
import { GameEngine } from '../src/game/logic.js';
import { getHintMove, getBestMoveAlphaBeta, HINT_TRADE_MARGIN } from '../src/game/ai.js';

let pass = 0, fail = 0;
const ok = (name, cond, note = '') => {
  if (cond) { pass++; console.log(`  🟢 ${name}`); }
  else { fail++; console.log(`  🔴 ${name}${note ? ' → ' + note : ''}`); }
};

const REF_VALUES = { k: 10000, r: 900, c: 450, n: 400, b: 200, a: 200, p: 100 };

/** 從 10 列字串蓋出一個局面(y=0 最上=黑方底線,y=9 最下=紅方底線;大寫=紅) */
function makeEngine(rows, turn = 'w') {
  const e = new GameEngine();
  e.board = rows.map((r) => r.split(''));
  e.turn = turn;
  e.history = [];
  e.recalculateHash();
  return e;
}
const at = (e, m) => e.board[m.to[1]][m.to[0]];
const show = (m) => `${m.piece}(${m.from[0]},${m.from[1]})→(${m.to[0]},${m.to[1]})`;

function refMaterial(engine) {
  let total = 0;
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = engine.board[y][x];
      if (p === '.') continue;
      total += engine.isRed(p) ? (REF_VALUES[p.toLowerCase()] || 0) : -(REF_VALUES[p.toLowerCase()] || 0);
    }
  }
  return total;
}

/** 獨立裁判:只走吃子、算到沒人想再吃(紅方為正) */
function refQuiesce(engine, a, b, maximizing, depth) {
  const h = engine.history.length;
  if (h > 0) {
    const lastCap = engine.history[h - 1].captured;
    if (lastCap === 'k') return 100000;
    if (lastCap === 'K') return -100000;
  }
  const stand = refMaterial(engine);
  if (depth <= 0) return stand;

  let best = stand;
  if (maximizing) { if (best >= b) return best; if (best > a) a = best; }
  else { if (best <= a) return best; if (best < b) b = best; }

  for (const m of engine.getLegalMoves()) {
    if (engine.board[m.to[1]][m.to[0]] === '.') continue;
    engine.move(m.from, m.to);
    const ev = refQuiesce(engine, a, b, !maximizing, depth - 1);
    engine.undo();
    if (maximizing) { if (ev > best) best = ev; if (best > a) a = best; }
    else { if (ev < best) best = ev; if (best < b) b = best; }
    if (b <= a) break;
  }
  return best;
}

/** 走了 move 之後,把交換算到底,對走棋方的淨子力變化(>0 賺、=0 等價、<0 虧) */
function netAfter(engine, move) {
  const sign = engine.turn === 'w' ? 1 : -1;
  const before = refMaterial(engine) * sign;
  engine.move(move.from, move.to);
  const after = refQuiesce(engine, -Infinity, Infinity, engine.turn === 'w', 8) * sign;
  engine.undo();
  return after - before;
}

console.log('── ① 手工局面 ──');
{
  // 紅車能吃 (4,5) 的黑卒,但黑車在同一直線上會回吃 ⇒ 100 換 900,大虧
  const e = makeEngine([
    '...kr....', '.........', '.........', '.........', '.........',
    '....p....', '.........', '.........', '.........', '...KR....',
  ]);
  const h = getHintMove(e);
  ok('有黑車守著的卒,不用車去吃(100 換 900)', !(h.to[0] === 4 && h.to[1] === 5), `建議了 ${show(h)}`);
  ok('  且建議的那一手交換算到底不虧', netAfter(e, h) >= 0, `淨 ${netAfter(e, h)}`);
}
{
  // 紅車吃黑車、另一支黑車回吃 ⇒ 900 換 900 的等價交換;有安靜手可走 ⇒ 不該建議
  const e = makeEngine([
    '...k.r..r', '.........', '.........', '.........', '.........',
    '.........', '.........', '.........', '.........', '...K.R...',
  ]);
  const h = getHintMove(e);
  ok('等價交換(車換車)不主動建議', !(h.to[0] === 5 && h.to[1] === 0), `建議了 ${show(h)}`);
}
{
  // 沒人保護的黑車 ⇒ 一定要白吃
  const e = makeEngine([
    '...k.r...', '.........', '.........', '.........', '.........',
    '.........', '.........', '.........', '.........', '...K.R...',
  ]);
  const h = getHintMove(e);
  ok('沒人保護的車要白吃', h.to[0] === 5 && h.to[1] === 0 && at(e, h) === 'r', `建議了 ${show(h)}`);
}
{
  // 開局:沒有任何吃子,提示應該是「出子」(馬/車/炮/兵),不是把士象在九宮裡挪來挪去
  const e = new GameEngine();
  const h = getHintMove(e);
  const dev = ['N', 'R', 'C', 'P'].includes(h.piece);
  ok(`開局建議是出子而不是動士象將(${show(h)})`, dev);
}

console.log('── ② 隨機中局 ×30:提示的手,交換算到底不可以虧 ──');
{
  let seed = 20260907;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const kingsAlive = (e) => {
    let red = false, black = false;
    for (const row of e.board) for (const p of row) { if (p === 'K') red = true; if (p === 'k') black = true; }
    return red && black;
  };

  let checked = 0, bad = [], tradeSuggested = 0, captures = 0, tMax = 0, tSum = 0;
  for (let g = 0; g < 30; g++) {
    const plies = 8 + Math.floor(rnd() * 14);
    const e2 = new GameEngine();
    for (let i = 0; i < plies; i++) {
      const ms = e2.getLegalMoves();
      if (!ms.length || !kingsAlive(e2)) break;
      const m = ms[Math.floor(rnd() * ms.length)];
      e2.move(m.from, m.to);
    }
    const moves = e2.getLegalMoves();
    if (!kingsAlive(e2) || moves.length === 0) continue;

    const t0 = Date.now();
    const h = getHintMove(e2);
    const dt = Date.now() - t0; tSum += dt; tMax = Math.max(tMax, dt);
    if (!h) continue;
    checked++;

    const isCap = at(e2, h) !== '.';
    const net = netAfter(e2, h);
    if (isCap) { captures++; if (net <= 0) tradeSuggested++; }

    /* ★ 判準不可以是「淨 ≥ 0」——局面本來就在挨打時,每一手都會是負的,那不是提示的錯
         (第一版就這樣假紅了三筆,其中兩筆還是安靜手)。
       要問的是:**提示有沒有比場上最好的那一手明顯虧?**
       安靜手放寬一個兵的量:裁判只看子力,看不出「棄一兵換位置」這種正當的取捨。 */
    const bestNet = Math.max(...moves.map((m) => netAfter(e2, m)));
    const slack = isCap ? 0 : 100;
    if (net < bestNet - slack) bad.push(`${show(h)} 淨 ${net},場上最好的是 ${bestNet}`);
  }
  ok(`${checked} 個局面的提示,都沒有比場上最好的一手明顯虧`, bad.length === 0, bad.slice(0, 3).join(' | '));
  ok(`建議吃子的 ${captures} 手裡,沒有一手是「等價交換」(淨 0)`, tradeSuggested === 0, `${tradeSuggested} 手`);
  console.log(`  ⏱ 提示耗時:平均 ${Math.round(tSum / Math.max(checked, 1))}ms,最慢 ${tMax}ms`);
  ok('最慢的一手 < 3000ms(同步搜尋,超過就會卡畫面)', tMax < 3000, `${tMax}ms`);
}

console.log('── ③ 同局面按兩次給同一手 + AI 對手照舊能走 ──');
{
  const e = new GameEngine();
  e.move([4, 6], [4, 5]);            // 紅兵進一,換黑方
  e.move([4, 3], [4, 4]);            // 黑卒進一,換回紅方
  const a = getHintMove(e), b = getHintMove(e);
  ok('提示零隨機:同局面兩次同一手', a.from[0] === b.from[0] && a.from[1] === b.from[1]
    && a.to[0] === b.to[0] && a.to[1] === b.to[1], `${show(a)} vs ${show(b)}`);
  ok('門檻是半個兵(50)', HINT_TRADE_MARGIN === 50, String(HINT_TRADE_MARGIN));
  ok('AI 對手三檔都給得出合法一手', [2, 6, 10].every((d) => {
    const g = new GameEngine();
    const m = getBestMoveAlphaBeta(g, d);
    return m && g.getPieceMoves(m.from[0], m.from[1]).some((t) => t[0] === m.to[0] && t[1] === m.to[1]);
  }));
}

console.log(`\n🔬 ai:${pass} 過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
