// src/game/logic.js

export const INITIAL_BOARD = [
  ['r', 'n', 'b', 'a', 'k', 'a', 'b', 'n', 'r'],
  ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
  ['.', 'c', '.', '.', '.', '.', '.', 'c', '.'],
  ['p', '.', 'p', '.', 'p', '.', 'p', '.', 'p'],
  ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
  ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
  ['P', '.', 'P', '.', 'P', '.', 'P', '.', 'P'],
  ['.', 'C', '.', '.', '.', '.', '.', 'C', '.'],
  ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
  ['R', 'N', 'B', 'A', 'K', 'A', 'B', 'N', 'R']
];

function LCG(seed) {
  return function () {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed;
  }
}
const rng = LCG(12345);
const PIECES = ['K', 'A', 'B', 'N', 'R', 'C', 'P', 'k', 'a', 'b', 'n', 'r', 'c', 'p'];
export const ZOBRIST = {};
for (let y = 0; y < 10; y++) {
  ZOBRIST[y] = {};
  for (let x = 0; x < 9; x++) {
    ZOBRIST[y][x] = {};
    for (const p of PIECES) {
      ZOBRIST[y][x][p] = rng();
    }
  }
}
ZOBRIST.blackToMove = rng();

export class GameEngine {
  constructor() {
    this.board = INITIAL_BOARD.map(row => [...row]);
    this.turn = 'w'; // 'w' for Red (uppercase), 'b' for Black (lowercase)
    this.history = [];
    this.zobristHash = 0;
    this.boardMap = new Map();
    this.recalculateHash();
  }

  recalculateHash() {
    let h = 0;
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 9; x++) {
        const p = this.board[y][x];
        if (p !== '.') h ^= ZOBRIST[y][x][p];
      }
    }
    if (this.turn === 'b') h ^= ZOBRIST.blackToMove;
    this.zobristHash = h;
    this.boardMap = new Map();
    this.boardMap.set(h, 1);
  }

  isRed(piece) { return piece >= 'A' && piece <= 'Z'; }
  isBlack(piece) { return piece >= 'a' && piece <= 'z'; }
  getColor(piece) {
    if (piece === '.') return null;
    return this.isRed(piece) ? 'w' : 'b';
  }

  /* 純幾何走法(不管走完會不會被將軍)。
     ★ 這一份**故意**保留:alpha-beta 搜尋每個節點都要產生走法,
       每一步都做一次完整的王安全檢查會慢十倍(姊妹站量過)。
       搜尋內部用它 + 「吃到王 = 直接贏」在語意上等價(ai.js 的 lastCap === 'k' 就是這個),
       真正的合法性只在**根節點**做一次(見 getLegalMoves)。
     ⚠ 原本這支就叫 getLegalMoves,而且自己的註解寫著「we do not check if move leaves king
       in check」—— 名字說謊了很久:UI 拿它畫可走點、拿它驗玩家的點擊,
       所以玩家**走得出送將的棋**,然後被電腦吃掉帥判負。2026-09-09 改名並補上真的合法性。 */
  getPseudoMoves() {
    const moves = [];
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 9; x++) {
        const piece = this.board[y][x];
        if (piece !== '.' && this.getColor(piece) === this.turn) {
          const pieceMoves = this.getPieceMoves(x, y);
          for (const m of pieceMoves) {
            moves.push({ from: [x, y], to: m, piece });
          }
        }
      }
    }
    return moves;
  }

  /** 找某一方的王;找不到回 null(搜尋中王被吃掉的局面會出現) */
  findKing(color) {
    const want = color === 'w' ? 'K' : 'k';
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 9; x++) if (this.board[y][x] === want) return [x, y];
    }
    return null;
  }

  /* ⑥ 飛將:兩個王在同一直線、中間沒有任何子 ⇒ 這個局面**不合法**。
     ★ 做成「局面判定」而不是「王的一種走法」:誰走出這個局面,誰那一步就不准走。
       這樣紅黑兩邊自動對稱,而且「把對方逼到每一步都會照面」就成立為殺法 —— 不用另外寫。
     ⚠ logic.js 原本在王的走法那裡留了一行註解
       `// Flying general: check line of sight to other king` 但**沒有實作**。 */
  kingsFaceEachOther() {
    const r = this.findKing('w');
    const b = this.findKing('b');
    if (!r || !b || r[0] !== b[0]) return false;
    const x = r[0];
    const lo = Math.min(r[1], b[1]) + 1;
    const hi = Math.max(r[1], b[1]);
    for (let y = lo; y < hi; y++) if (this.board[y][x] !== '.') return false;
    return true;
  }

  /** (x,y) 這一格有沒有被 byColor 攻擊到(用純幾何走法問,夠用且不會遞迴) */
  isAttacked(x, y, byColor) {
    const turn = this.turn;
    this.turn = byColor;
    let hit = false;
    const moves = this.getPseudoMoves();
    for (const m of moves) {
      if (m.to[0] === x && m.to[1] === y) { hit = true; break; }
    }
    this.turn = turn;
    return hit;
  }

  /** color 是否正被將軍 */
  isInCheck(color) {
    const k = this.findKing(color);
    if (!k) return true;                       // 王已經不在 = 最糟的情況
    return this.isAttacked(k[0], k[1], color === 'w' ? 'b' : 'w');
  }

  /* 真正的合法走法:純幾何 → 逐一試走 → 丟掉「走完自己被將」與「走完兩王照面」的。
     ★ 只給**根節點與 UI** 用(每一步都 make/undo + 掃全盤,成本高)。 */
  getLegalMoves() {
    const me = this.turn;
    const out = [];
    for (const m of this.getPseudoMoves()) {
      this.move(m.from, m.to);
      const bad = this.isInCheck(me) || this.kingsFaceEachOther();
      this.undo();
      if (!bad) out.push(m);
    }
    return out;
  }

  /** UI 用:某一顆棋子**合法**能去的格子(回傳 [x,y] 陣列,和 getPieceMoves 同形狀) */
  getLegalPieceMoves(cx, cy) {
    const piece = this.board[cy][cx];
    if (piece === '.' || this.getColor(piece) !== this.turn) return [];
    const me = this.turn;
    const out = [];
    for (const to of this.getPieceMoves(cx, cy)) {
      this.move([cx, cy], to);
      const bad = this.isInCheck(me) || this.kingsFaceEachOther();
      this.undo();
      if (!bad) out.push(to);
    }
    return out;
  }

  getPieceMoves(cx, cy) {
    const piece = this.board[cy][cx];
    const type = piece.toLowerCase();
    const color = this.getColor(piece);
    const moves = [];

    const addIfValid = (nx, ny) => {
      if (nx >= 0 && nx < 9 && ny >= 0 && ny < 10) {
        const target = this.board[ny][nx];
        if (target === '.' || this.getColor(target) !== color) {
          moves.push([nx, ny]);
        }
      }
    };

    const addPawnIfValid = (nx, ny) => {
      if (nx >= 0 && nx < 9 && ny >= 0 && ny < 10) {
        const target = this.board[ny][nx];
        if (target === '.' || this.getColor(target) !== color) {
          moves.push([nx, ny]);
        }
      }
    };

    if (type === 'k') { // King (帥/將)
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      const isRed = this.isRed(piece);
      // Palaces: Red y:7-9, x:3-5. Black y:0-2, x:3-5
      for (let [dx, dy] of dirs) {
        let nx = cx + dx;
        let ny = cy + dy;
        if (nx >= 3 && nx <= 5) {
          if (isRed && ny >= 7 && ny <= 9) addIfValid(nx, ny);
          if (!isRed && ny >= 0 && ny <= 2) addIfValid(nx, ny);
        }
      }
      // Flying general: check line of sight to other king
    } else if (type === 'a') { // Advisor (仕/士)
      const dirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
      const isRed = this.isRed(piece);
      for (let [dx, dy] of dirs) {
        let nx = cx + dx;
        let ny = cy + dy;
        if (nx >= 3 && nx <= 5) {
          if (isRed && ny >= 7 && ny <= 9) addIfValid(nx, ny);
          if (!isRed && ny >= 0 && ny <= 2) addIfValid(nx, ny);
        }
      }
    } else if (type === 'b') { // Elephant (相/象)
      const dirs = [[2, 2], [2, -2], [-2, 2], [-2, -2]];
      const isRed = this.isRed(piece);
      for (let [dx, dy] of dirs) {
        let nx = cx + dx;
        let ny = cy + dy;
        let ey = cy + dy / 2;
        let ex = cx + dx / 2;
        if (nx >= 0 && nx <= 8 && ny >= 0 && ny <= 9 && this.board[ey][ex] === '.') {
          if (isRed && ny >= 5 && ny <= 9) addIfValid(nx, ny);
          if (!isRed && ny >= 0 && ny <= 4) addIfValid(nx, ny);
        }
      }
    } else if (type === 'n') { // Knight (馬)
      const dirs = [
        [[1, 2], [0, 1]], [[-1, 2], [0, 1]], [[1, -2], [0, -1]], [[-1, -2], [0, -1]],
        [[2, 1], [1, 0]], [[2, -1], [1, 0]], [[-2, 1], [-1, 0]], [[-2, -1], [-1, 0]]
      ];
      for (let [move, block] of dirs) {
        let nx = cx + move[0];
        let ny = cy + move[1];
        let bx = cx + block[0];
        let by = cy + block[1];
        if (nx >= 0 && nx < 9 && ny >= 0 && ny < 10) {
          if (this.board[by][bx] === '.') addIfValid(nx, ny);
        }
      }
    } else if (type === 'r') { // Rook (車)
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (let [dx, dy] of dirs) {
        let nx = cx + dx;
        let ny = cy + dy;
        while (nx >= 0 && nx < 9 && ny >= 0 && ny < 10) {
          if (this.board[ny][nx] === '.') {
            addIfValid(nx, ny);
          } else {
            addIfValid(nx, ny); // capture
            break;
          }
          nx += dx; ny += dy;
        }
      }
    } else if (type === 'c') { // Cannon (炮)
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (let [dx, dy] of dirs) {
        let nx = cx + dx;
        let ny = cy + dy;
        let jumped = false;
        while (nx >= 0 && nx < 9 && ny >= 0 && ny < 10) {
          if (!jumped) {
            if (this.board[ny][nx] === '.') {
              addIfValid(nx, ny);
            } else {
              jumped = true;
            }
          } else {
            if (this.board[ny][nx] !== '.') {
              addIfValid(nx, ny);
              break;
            }
          }
          nx += dx; ny += dy;
        }
      }
    } else if (type === 'p') { // Pawn (步/卒)
      const isRed = this.isRed(piece);
      const dy = isRed ? -1 : 1;
      addIfValid(cx, cy + dy);
      // After crossing river, can move horizontally
      if ((isRed && cy < 5) || (!isRed && cy > 4)) {
        addIfValid(cx - 1, cy);
        addIfValid(cx + 1, cy);
      }
    }

    return moves;
  }

  move(from, to) {
    const [fx, fy] = from;
    const [tx, ty] = to;
    const piece = this.board[fy][fx];
    const captured = this.board[ty][tx];

    let h = this.zobristHash;
    h ^= ZOBRIST[fy][fx][piece];
    if (captured !== '.') {
      h ^= ZOBRIST[ty][tx][captured];
    }
    h ^= ZOBRIST[ty][tx][piece];
    h ^= ZOBRIST.blackToMove;

    this.history.push({
      from, to, piece, captured, turn: this.turn, hash: this.zobristHash
    });

    this.zobristHash = h;
    this.boardMap.set(h, (this.boardMap.get(h) || 0) + 1);

    this.board[ty][tx] = piece;
    this.board[fy][fx] = '.';
    this.turn = this.turn === 'w' ? 'b' : 'w';
  }

  undo() {
    const state = this.history.pop();
    if (!state) return;

    const count = this.boardMap.get(this.zobristHash) || 0;
    if (count === 1) this.boardMap.delete(this.zobristHash);
    else if (count > 1) this.boardMap.set(this.zobristHash, count - 1);

    const { from, to, piece, captured, turn, hash } = state;
    const [fx, fy] = from;
    const [tx, ty] = to;

    this.board[fy][fx] = piece;
    this.board[ty][tx] = captured;
    this.turn = turn;
    this.zobristHash = hash;
  }

  /* 沒有任何**合法**著法 = 這一方輸了。
     ★ 象棋的「將死」與「困斃(無棋可走)」**都算輸**(和西洋棋的和局不同),所以同一個判斷。
     ⚠ 舊版是「試每一步,看對手能不能吃到我的王」——那在沒有合法性過濾時是近似解,
       現在有了真的合法走法,直接數就好,也不會再把「送將之後被吃」當成正常結局。 */
  isCheckmate() {
    return this.getLegalMoves().length === 0;
    }
}
