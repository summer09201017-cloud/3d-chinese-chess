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

  getLegalMoves() {
    const moves = [];
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 9; x++) {
        const piece = this.board[y][x];
        if (piece !== '.' && this.getColor(piece) === this.turn) {
          const pieceMoves = this.getPieceMoves(x, y);
          for (const m of pieceMoves) {
            // simplified: we do not check if move leaves king in check for this basic version
            // in a real engine you would verify this.board state after move.
            moves.push({ from: [x, y], to: m, piece });
          }
        }
      }
    }
    return moves;
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

  isCheckmate() {
    const moves = this.getLegalMoves();
    if (moves.length === 0) return true;
    for (const move of moves) {
      this.move(move.from, move.to);
      let kingEaten = false;
      const oppMoves = this.getLegalMoves();
      for (const opm of oppMoves) {
        const targetPiece = this.board[opm.to[1]][opm.to[0]];
        if (targetPiece.toLowerCase() === 'k') {
          kingEaten = true;
          break;
        }
      }
      this.undo();
      if (!kingEaten) {
        return false;
      }
    }
    return true;
  }
}
