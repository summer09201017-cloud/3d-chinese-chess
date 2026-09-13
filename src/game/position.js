/* 🧩 局面的序列化與合法性(2026-09-13 立,給「自訂殘局」用)。
 *
 * 由來:使用者「3d-chinese-chess 增加自訂殘局功能」——老師/家長自己擺一個局面,存起來、
 *   分享連結給全班,或直接跟電腦從這個局面下起。
 * ★ 這支刻意**不碰畫面、不碰 React**:純函式 ⇒ Node 直接跑 test/position.mjs。
 * ★ 兩件事分開:
 *     toFen / fromFen —— 局面 ↔ 字串(存檔、分享連結用)。格式照象棋常用的 FEN 寫法:
 *       從黑方底線(本站 y=0 那一列)開始、`/` 分列、數字=連續空格、最後 w/b 是輪到誰。
 *       大寫紅 KABNRCP / 小寫黑 kabnrcp,和 logic.js 的棋子字元**同一套**,不另外翻譯。
 *     validatePosition —— 這個局面**合不合象棋規則**。不合的局面一開始就不准下:
 *       提示引擎與 AI 都假設「王一定在、一定各一個」,擺兩個帥或沒有將會讓它們算出鬼東西
 *       (logic.js findKing 回 null ⇒ isInCheck 直接當成被將軍)。
 * ⚠ fromFen 收到的是**網址裡的字串**,什麼都可能;格式不對一律回 null、不丟例外。
 */
import { GameEngine } from './logic.js';

export const FILES = 9;
export const RANKS = 10;

export const EMPTY_BOARD = () => Array.from({ length: RANKS }, () => Array(FILES).fill('.'));

/** 棋子的中文名(給錯誤訊息與編輯器的調色盤用;和 Piece.jsx 同一套字) */
export const PIECE_NAME = {
  K: '帥', A: '仕', B: '相', N: '傌', R: '俥', C: '炮', P: '兵',
  k: '將', a: '士', b: '象', n: '馬', r: '車', c: '砲', p: '卒',
};

/** board → FEN 字串 */
export function toFen(board, turn = 'w') {
  const rows = board.map((row) => {
    let s = '';
    let empty = 0;
    for (const c of row) {
      if (c === '.') { empty++; continue; }
      if (empty) { s += empty; empty = 0; }
      s += c;
    }
    if (empty) s += empty;
    return s;
  });
  return rows.join('/') + ' ' + (turn === 'b' ? 'b' : 'w');
}

/** FEN → { board, turn };格式不對回 null */
export function fromFen(fen) {
  if (typeof fen !== 'string') return null;
  const parts = fen.trim().split(/\s+/);
  if (!parts[0]) return null;
  const rows = parts[0].split('/');
  if (rows.length !== RANKS) return null;
  const board = [];
  for (const r of rows) {
    const row = [];
    for (const ch of r) {
      if (/^[1-9]$/.test(ch)) { for (let i = 0; i < Number(ch); i++) row.push('.'); }
      else if (/^[KABNRCPkabnrcp]$/.test(ch)) row.push(ch);
      else return null;
      if (row.length > FILES) return null;
    }
    if (row.length !== FILES) return null;
    board.push(row);
  }
  const turn = parts[1] === 'b' ? 'b' : 'w';
  return { board, turn };
}

/* 各兵種「規則上站得到」的位置。
   座標系:board[y][x],y=0 黑方底線、y=9 紅方底線(和 logic.js 一致;⚠ 姊妹站相反)。 */
const inRedPalace = (x, y) => x >= 3 && x <= 5 && y >= 7 && y <= 9;
const inBlackPalace = (x, y) => x >= 3 && x <= 5 && y >= 0 && y <= 2;
const RED_ADVISOR = new Set(['3,7', '5,7', '4,8', '3,9', '5,9']);
const BLACK_ADVISOR = new Set(['3,0', '5,0', '4,1', '3,2', '5,2']);
const RED_ELEPHANT = new Set(['2,9', '6,9', '0,7', '4,7', '8,7', '2,5', '6,5']);
const BLACK_ELEPHANT = new Set(['2,0', '6,0', '0,2', '4,2', '8,2', '2,4', '6,4']);
/** 每一方各兵種的上限(帥/將各 1) */
export const MAX_COUNT = { k: 1, a: 2, b: 2, n: 2, r: 2, c: 2, p: 5 };

/**
 * 這個局面合不合規則。回 { ok, errors } —— errors 是**寫給人看的**一句話清單(去重)。
 * 檢查的順序刻意「先擺法、再規則」:棋子數與位置錯了,後面用引擎算的將軍/照面就沒有意義。
 */
export function validatePosition(board, turn = 'w') {
  const errors = new Set();
  if (!Array.isArray(board) || board.length !== RANKS || board.some((r) => !Array.isArray(r) || r.length !== FILES)) {
    return { ok: false, errors: ['盤面資料的形狀不對(要 10 列 × 9 行)'] };
  }
  const count = {};
  for (let y = 0; y < RANKS; y++) {
    for (let x = 0; x < FILES; x++) {
      const p = board[y][x];
      if (p === '.') continue;
      if (!PIECE_NAME[p]) { errors.add(`盤上有不認得的棋子「${p}」`); continue; }
      count[p] = (count[p] || 0) + 1;
      const key = `${x},${y}`;
      switch (p) {
        case 'K': if (!inRedPalace(x, y)) errors.add('帥要在自己的九宮裡'); break;
        case 'k': if (!inBlackPalace(x, y)) errors.add('將要在自己的九宮裡'); break;
        case 'A': if (!RED_ADVISOR.has(key)) errors.add('仕只能站在九宮的五個斜線點上'); break;
        case 'a': if (!BLACK_ADVISOR.has(key)) errors.add('士只能站在九宮的五個斜線點上'); break;
        case 'B': if (!RED_ELEPHANT.has(key)) errors.add('相只能站在己方的七個相位(不能過河)'); break;
        case 'b': if (!BLACK_ELEPHANT.has(key)) errors.add('象只能站在己方的七個象位(不能過河)'); break;
        case 'P':
          if (y > 6) errors.add('兵不會出現在自己這邊的後三排(兵線之後)');
          else if (y >= 5 && x % 2 === 1) errors.add('沒過河的兵只能站在兵線的五個位置(隔一路一個)');
          break;
        case 'p':
          if (y < 3) errors.add('卒不會出現在自己這邊的後三排(卒線之後)');
          else if (y <= 4 && x % 2 === 1) errors.add('沒過河的卒只能站在卒線的五個位置(隔一路一個)');
          break;
        default: break;
      }
    }
  }
  if ((count.K || 0) !== 1) errors.add(count.K ? '紅方只能有一個帥' : '紅方要有一個帥');
  if ((count.k || 0) !== 1) errors.add(count.k ? '黑方只能有一個將' : '黑方要有一個將');
  for (const t of Object.keys(MAX_COUNT)) {
    if (t === 'k') continue;
    const R = t.toUpperCase();
    if ((count[R] || 0) > MAX_COUNT[t]) errors.add(`紅方的${PIECE_NAME[R]}最多 ${MAX_COUNT[t]} 個`);
    if ((count[t] || 0) > MAX_COUNT[t]) errors.add(`黑方的${PIECE_NAME[t]}最多 ${MAX_COUNT[t]} 個`);
  }

  /* 擺法都對了才問引擎(它假設王各一個) */
  if (errors.size === 0) {
    const e = new GameEngine();
    e.loadPosition(board, turn);
    const mover = turn === 'b' ? '黑方' : '紅方';
    const other = turn === 'b' ? 'w' : 'b';
    const otherName = turn === 'b' ? '紅方' : '黑方';
    if (e.kingsFaceEachOther()) {
      errors.add('帥和將在同一直線上、中間沒有棋子(照面),這種局面不合規則');
    } else if (e.isInCheck(other)) {
      errors.add(`還沒輪到走的${otherName}正被將軍——不合規則(應該是被將軍的一方先走)`);
    } else if (e.getLegalMoves().length === 0) {
      errors.add(`輪到走的${mover}已經沒有合法著法,這個局面一開始就分出勝負了`);
    }
  }
  return { ok: errors.size === 0, errors: [...errors] };
}
