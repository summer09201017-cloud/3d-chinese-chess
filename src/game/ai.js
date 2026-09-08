// src/game/ai.js
import { GameEngine } from './logic.js';

// Piece values for evaluation
const PIECE_VALUES = {
    'k': 10000,
    'r': 900,
    'c': 450,
    'n': 400,
    'b': 200,
    'a': 200,
    'p': 100
};

/* ══════════ 位置價值表(PST,2026-09-07)══════════
   使用者退件:「提示常叫我吃掉某顆,吃完又被吃回,等於交換被吃」。病因之一——
   舊的 evaluateBoard 只加總子力,中局九成的走法都是「0 分平手」;而根層是
   `moves.sort(() => Math.random() - 0.5)` 之後「分數嚴格變好才換人」⇒ 一堆平手裡
   隨機挑一個,等價交換就這樣被當成建議送出來。
   加上位置分之後,「馬走盤河、車出直線、卒過河」都拿得到幾十分,平手大幅變少,
   安靜的好棋贏得過沒賺頭的交換。
   表沿用姊妹站 3D-Xiangqi/js/ai.js(2026-09-04 已實戰驗證的那組)。
   ★ 座標差異:那站紅方在 row 0-4、往 row 增加走;本站紅方在 y=6~9、往 y 減少走
     (INITIAL_BOARD 第 9 列是大寫紅子,getPieceMoves 裡紅兵 dy=-1)。
     所以紅子查 PST[9-y][x]、黑子查 PST[y][x] —— 兩邊都是「越前進、索引越大」。
   ★ 士象王不給位置分(留家守宮,亂加分會把它們趕出九宮)。 */
const PST = {
    p: [
        [  0,  0,  0,  0,  0,  0,  0,  0,  0],
        [  0,  0,  0,  0,  0,  0,  0,  0,  0],
        [  0,  0,  0,  0,  0,  0,  0,  0,  0],
        [  6,  0, 10,  0, 14,  0, 10,  0,  6],
        [ 10,  0, 16,  0, 20,  0, 16,  0, 10],
        [ 30, 34, 40, 46, 50, 46, 40, 34, 30],
        [ 40, 46, 56, 66, 70, 66, 56, 46, 40],
        [ 50, 60, 72, 84, 90, 84, 72, 60, 50],
        [ 46, 54, 66, 78, 84, 78, 66, 54, 46],
        [ 30, 36, 44, 52, 56, 52, 44, 36, 30],
    ],
    n: [
        [ -6,  0,  0,  2,  0,  2,  0,  0, -6],
        [  0,  2,  6,  8,  4,  8,  6,  2,  0],
        [  4,  8, 14, 14, 16, 14, 14,  8,  4],
        [  6, 12, 16, 20, 20, 20, 16, 12,  6],
        [  8, 14, 20, 24, 26, 24, 20, 14,  8],
        [  8, 16, 22, 26, 28, 26, 22, 16,  8],
        [ 10, 18, 24, 28, 30, 28, 24, 18, 10],
        [  8, 14, 20, 24, 26, 24, 20, 14,  8],
        [  4,  8, 12, 16, 18, 16, 12,  8,  4],
        [  0,  2,  4,  8, 10,  8,  4,  2,  0],
    ],
    c: [
        [  6,  4,  0, -6, -8, -6,  0,  4,  6],
        [  6,  2,  0, -4, -6, -4,  0,  2,  6],
        [  6,  2,  0, -8,-10, -8,  0,  2,  6],
        [  6,  4,  2,  2,  2,  2,  2,  4,  6],
        [  6,  4,  4,  4,  4,  4,  4,  4,  6],
        [  0,  0,  2,  6,  6,  6,  2,  0,  0],
        [  4,  0,  8,  6, 10,  6,  8,  0,  4],
        [  0,  2,  4,  6,  6,  6,  4,  2,  0],
        [  0,  0,  0,  2,  4,  2,  0,  0,  0],
        [  0,  0,  0,  2,  4,  2,  0,  0,  0],
    ],
    r: [
        [ -2, 10,  6, 14, 12, 14,  6, 10, -2],
        [  8,  4,  8, 16,  8, 16,  8,  4,  8],
        [  4,  8,  6, 14, 12, 14,  6,  8,  4],
        [  6, 10,  8, 14, 14, 14,  8, 10,  6],
        [ 12, 16, 14, 20, 20, 20, 14, 16, 12],
        [ 12, 14, 12, 18, 18, 18, 12, 14, 12],
        [ 12, 18, 16, 22, 22, 22, 16, 18, 12],
        [ 12, 12, 12, 18, 18, 18, 12, 12, 12],
        [ 16, 20, 18, 24, 26, 24, 18, 20, 16],
        [ 14, 14, 12, 18, 16, 18, 12, 14, 14],
    ],
};

/** 靜態評估:子力 + 位置分。一律「紅方為正」。 */
function evaluateBoard(engine) {
    let score = 0;
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 9; x++) {
            const piece = engine.board[y][x];
            if (piece === '.') continue;
            const type = piece.toLowerCase();
            const red = engine.isRed(piece);
            let value = PIECE_VALUES[type] || 0;
            const table = PST[type];
            if (table) value += table[red ? 9 - y : y][x];
            score += red ? value : -value;
        }
    }
    return score;
}

/** MVV-LVA:吃大子、用小子吃的排前面。好手先搜,alpha-beta 才剪得動(不改變分數,只改快慢)。 */
function orderMovesInPlace(engine, moves) {
    for (const m of moves) {
        const victim = engine.board[m.to[1]][m.to[0]];
        m._ord = victim === '.'
            ? 0
            : 10000 + (PIECE_VALUES[victim.toLowerCase()] || 0)
                    - (PIECE_VALUES[m.piece.toLowerCase()] || 0) / 10;
    }
    moves.sort((x, y) => y._ord - x._ord);
    return moves;
}

/* 靜態搜尋(quiescence):葉子不可以停在「吃到一半」的局面。
   這是使用者退件的第二個病因 —— 提示深度 3 是奇數層,「我吃 → 他回吃 → 我再吃」
   到此為止看起來賺,第 4 步他再吃回來看不到(水平線效應),所以連虧本的交換也會被建議。
   作法:到達葉子後只繼續走「吃子」的變化,直到沒得吃(或 qdepth 用完)。
   stand pat = 現在就收手的分數,是下限(輪到的人不必非吃不可)。
   ★ 走法一律借 engine.getLegalMoves(),不自己抄一份吃法規則 —— 抄一份就會和 UI 分岔,
     症狀是「提示叫我走這步,但棋子點不動」。
   ★ 本引擎的終局語意是「王被吃掉」(見 searchAlphaBeta 的 lastCap 檢查),這裡照抄同一套。 */
const QUIESCE_DEPTH = 4;

function quiescence(engine, a, b, maximizing, qdepth) {
    const histLen = engine.history.length;
    if (histLen > 0) {
        const lastCap = engine.history[histLen - 1].captured;
        if (lastCap === 'k') return 10000;
        if (lastCap === 'K') return -10000;
    }

    const stand = evaluateBoard(engine);
    if (qdepth <= 0) return stand;

    let best = stand;
    if (maximizing) {
        if (best >= b) return best;
        if (best > a) a = best;
    } else {
        if (best <= a) return best;
        if (best < b) b = best;
    }

    const caps = [];
    /* 搜尋內部用純幾何走法(快十倍);合法性只在根節點做一次,
       語意由「吃到王 = 直接贏」(下面的 lastCap === 'k')補上。 */
    for (const m of engine.getPseudoMoves()) {
        if (engine.board[m.to[1]][m.to[0]] !== '.') caps.push(m);
    }
    if (caps.length === 0) return best;
    orderMovesInPlace(engine, caps);

    for (const m of caps) {
        engine.move(m.from, m.to);
        const ev = quiescence(engine, a, b, !maximizing, qdepth - 1);
        engine.undo();
        if (maximizing) {
            if (ev > best) best = ev;
            if (best > a) a = best;
        } else {
            if (ev < best) best = ev;
            if (best < b) b = best;
        }
        if (b <= a) break;
    }
    return best;
}

/** alpha-beta 主搜尋(紅方為正的絕對分,不是 negamax)。提示與 AI 對手共用同一支。 */
function searchAlphaBeta(engine, currentDepth, maximizing, a, b) {
    // Fast-fail repetition (O(1))
    const repCount = engine.boardMap.get(engine.zobristHash) || 0;
    if (repCount >= 3) {
        // Player who JUST MOVED caused this 3rd repetition.
        return maximizing ? 5000 : -5000;
    }

    // Fast-fail terminal nodes (O(1) win condition)
    const histLen = engine.history.length;
    if (histLen > 0) {
        const lastCap = engine.history[histLen - 1].captured;
        if (lastCap === 'k') return 10000;
        if (lastCap === 'K') return -10000;
    }

    if (currentDepth === 0) {
        return quiescence(engine, a, b, maximizing, QUIESCE_DEPTH);
    }

    /* 搜尋內部:純幾何(快);沒棋可走在這裡是「被吃光/困住」,由分數表達 */
    const moves = engine.getPseudoMoves();
    if (moves.length === 0) return maximizing ? -10000 : 10000;
    orderMovesInPlace(engine, moves);

    if (maximizing) {
        let maxEval = -Infinity;
        for (const move of moves) {
            engine.move(move.from, move.to);
            const ev = searchAlphaBeta(engine, currentDepth - 1, false, a, b);
            engine.undo();
            maxEval = Math.max(maxEval, ev);
            a = Math.max(a, ev);
            if (b <= a) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of moves) {
            engine.move(move.from, move.to);
            const ev = searchAlphaBeta(engine, currentDepth - 1, true, a, b);
            engine.undo();
            minEval = Math.min(minEval, ev);
            b = Math.min(b, ev);
            if (b <= a) break;
        }
        return minEval;
    }
}

/* ══════════ 💡 提示專用搜尋(2026-09-07)══════════
   和 AI 對手的 getBestMoveAlphaBeta 三點不同:
   ① 固定深度、零隨機 —— 以前提示是 getBestMoveAlphaBeta(engine, max(difficulty,6)),
      根層 `moves.sort(() => Math.random() - 0.5)` 之後同分隨機挑,等價交換就這樣被抽中。
   ② 兩段式:先搜「不吃子」的手拿到最好的安靜手(精確分),再搜吃子,而且視窗直接
      開在「安靜手 + 半個兵」之上 —— 贏不過這個門檻的交換一律不建議。
      等價交換 = 吃完被吃回、什麼都沒賺,對孩子是壞示範(使用者 2026-09-07 拍板;
      西洋棋兩站 3dchess-an v9 / 3dchesscodex v24 同一條規則)。
   ③ 葉子有 quiescence,虧本交換在葉子就看穿。
   ★ 缺點誠實寫下來:少數「換掉對方關鍵防守子」的等價交換也會被跳過,提示因此偏保守;
     這是為了「不教壞初學者」刻意付的代價。 */
/* 純子力(不含位置分)—— 給「這筆交換到底有沒有賺到子」用。
   為什麼要另外算一份:整體評估裡有位置分,一筆「子力打平、但位置好看一點」的交換
   有可能靠位置分越過半兵門檻被推薦出去(2026-09-07 隨機中局測試 20 手裡抓到 1 手)。
   而使用者要的規矩很白話:**吃完被吃回、子力沒賺,就不要叫我吃**。 */
function materialOnly(engine) {
    let score = 0;
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 9; x++) {
            const piece = engine.board[y][x];
            if (piece === '.') continue;
            const value = PIECE_VALUES[piece.toLowerCase()] || 0;
            score += engine.isRed(piece) ? value : -value;
        }
    }
    return score;
}

/** 只走吃子、只看子力,算到沒人想再吃(紅方為正) */
function materialQuiesce(engine, a, b, maximizing, depth) {
    const histLen = engine.history.length;
    if (histLen > 0) {
        const lastCap = engine.history[histLen - 1].captured;
        if (lastCap === 'k') return 100000;
        if (lastCap === 'K') return -100000;
    }
    const stand = materialOnly(engine);
    if (depth <= 0) return stand;

    let best = stand;
    if (maximizing) { if (best >= b) return best; if (best > a) a = best; }
    else { if (best <= a) return best; if (best < b) b = best; }

    const caps = [];
    /* 搜尋內部用純幾何走法(快十倍);合法性只在根節點做一次,
       語意由「吃到王 = 直接贏」(下面的 lastCap === 'k')補上。 */
    for (const m of engine.getPseudoMoves()) {
        if (engine.board[m.to[1]][m.to[0]] !== '.') caps.push(m);
    }
    if (caps.length === 0) return best;
    orderMovesInPlace(engine, caps);

    for (const m of caps) {
        engine.move(m.from, m.to);
        const ev = materialQuiesce(engine, a, b, !maximizing, depth - 1);
        engine.undo();
        if (maximizing) { if (ev > best) best = ev; if (best > a) a = best; }
        else { if (ev < best) best = ev; if (best < b) b = best; }
        if (b <= a) break;
    }
    return best;
}

/** 走了這一手吃子之後,把交換算到底,對走棋方的淨子力(>0 賺、=0 等價、<0 虧) */
function captureGain(engine, move) {
    const sign = engine.turn === 'w' ? 1 : -1;
    const before = materialOnly(engine) * sign;
    engine.move(move.from, move.to);
    const after = materialQuiesce(engine, -Infinity, Infinity, engine.turn === 'w', 6) * sign;
    engine.undo();
    return after - before;
}

export const HINT_TRADE_MARGIN = 50;   // 半個兵(兵=100)
export const HINT_DEPTH = 3;           // 本機實測 depth 3 + quiescence 約 0.3~1 秒;同步搜尋不能再深

/** 搜一批走法,回「相對分(越大越好)最高」的那一手;低於 floorRel 的一律不收 */
function searchHintList(engine, list, depth, maximizing, floorRel) {
    const sign = maximizing ? 1 : -1;
    let best = null;
    let bestRel = floorRel;
    let a = maximizing ? floorRel : -Infinity;
    let b = maximizing ? Infinity : -floorRel;

    for (const move of list) {
        engine.move(move.from, move.to);
        const score = searchAlphaBeta(engine, depth - 1, !maximizing, a, b);
        engine.undo();
        const rel = score * sign;
        if (rel > bestRel) {
            bestRel = rel;
            best = move;
            if (maximizing) a = score; else b = score;
        }
    }
    return { best, bestRel };
}

export function getHintMove(engine, depth = HINT_DEPTH) {
    const moves = engine.getLegalMoves();
    if (moves.length === 0) return null;

    const maximizing = engine.turn === 'w';
    const isCapture = (m) => engine.board[m.to[1]][m.to[0]] !== '.';
    const quiet = moves.filter((m) => !isCapture(m));
    const allNoisy = orderMovesInPlace(engine, moves.filter(isCapture));

    /* 兩道關卡,缺一不可:
       ① 子力關(這裡):交換算到底要真的賺到子。吃王例外——那是直接贏,一定要推薦。
       ② 分數關(下面的 floor):還要比最好的安靜手多賺半個兵,否則寧可建議走位。
       ★ 只有「還有安靜手可退」時才敢把沒賺頭的吃子濾光;不然沒棋可推薦了。 */
    const winning = allNoisy.filter((m) => {
        const victim = engine.board[m.to[1]][m.to[0]];
        if (victim.toLowerCase() === 'k') return true;
        return captureGain(engine, m) > 0;
    });
    const noisy = (winning.length || quiet.length) ? winning : allNoisy;

    const q = searchHintList(engine, quiet, depth, maximizing, -Infinity);
    // 沒有安靜手可走(只剩吃子)時門檻無意義
    const floor = q.best ? q.bestRel + HINT_TRADE_MARGIN : -Infinity;
    const n = searchHintList(engine, noisy, depth, maximizing, floor);

    return n.best || q.best || moves[0];
}

export function searchBestMove(engine, depth, isMaximizing) {
    if (depth === 0) {
        return { score: evaluateBoard(engine) };
    }

    const moves = engine.getLegalMoves();
    if (moves.length === 0) {
        return { score: isMaximizing ? -10000 : 10000 };
    }

    let bestMove = null;
    let bestScore = isMaximizing ? -Infinity : Infinity;

    // Simple shuffle to add variety
    moves.sort(() => Math.random() - 0.5);

    for (const move of moves) {
        engine.move(move.from, move.to);
        const result = searchBestMove(engine, depth - 1, !isMaximizing);
        engine.undo();

        if (isMaximizing) {
            if (result.score > bestScore) {
                bestScore = result.score;
                bestMove = move;
            }
        } else {
            if (result.score < bestScore) {
                bestScore = result.score;
                bestMove = move;
            }
        }
    }

    return { move: bestMove, score: bestScore };
}

// Alpha beta pruning version for actual usage
export function getBestMoveAlphaBeta(engine, difficulty, openingStyle = 'auto') {
    // Map 10 difficulty levels to depth
    let depth = 2;
    if (difficulty <= 3) depth = 2;
    else if (difficulty <= 6) depth = 3;
    else if (difficulty <= 8) depth = 4;
    else depth = 5; // Difficulty 9 and 10 use massive depth 5 search

    let isMaximizing = engine.turn === 'w'; // Red tries to maximize, Black minimizes
    let alpha = -Infinity;
    let beta = Infinity;

    // Opening Book logic for Black up to early game (First 2 full moves roughly equivalent to history <= 3)
    if (openingStyle !== 'none' && !isMaximizing && engine.history.length <= 3) {
        let targetMove = null;
        let moveIndex = Math.floor(engine.history.length / 2); // 0, 1, 2, ...

        if (openingStyle === 'auto' && moveIndex === 0) {
            const openings = [
                { from: [1, 2], to: [4, 2] }, // Central Cannon (Left)
                { from: [7, 2], to: [4, 2] }, // Central Cannon (Right)
                { from: [2, 0], to: [4, 2] }, // Elephant Opening
                { from: [6, 0], to: [4, 2] }, // Elephant Opening 2
                { from: [1, 0], to: [2, 2] }, // Knight Opening
                { from: [7, 0], to: [6, 2] }, // Knight Opening 2
            ];
            openings.sort(() => Math.random() - 0.5);
            targetMove = openings[0];
        } else if (openingStyle === 'cannon') {
            const seq = [
                { from: [1, 2], to: [4, 2] }, // 炮8平5
                { from: [1, 0], to: [2, 2] }, // 馬8進7
                { from: [0, 0], to: [1, 0] }, // 車9平8
                { from: [1, 0], to: [1, 4] }, // 車8進4
                { from: [7, 0], to: [6, 2] }, // 馬2進3
                { from: [1, 4], to: [7, 4] }, // 車8平2
                { from: [7, 2], to: [7, 5] }, // 炮2進3
                { from: [8, 0], to: [8, 1] }, // 車1進1
            ];
            targetMove = seq[moveIndex];
        } else if (openingStyle === 'screen_horse') {
            const seq = [
                { from: [7, 0], to: [6, 2] }, // 馬2進3
                { from: [1, 0], to: [2, 2] }, // 馬8進7
                { from: [6, 3], to: [6, 4] }, // 卒3進1
                { from: [1, 2], to: [0, 2] }, // 炮8平9
                { from: [0, 0], to: [1, 0] }, // 車9平8
                { from: [7, 2], to: [7, 5] }, // 炮2進3
                { from: [8, 0], to: [7, 0] }, // 車1平2
                { from: [7, 0], to: [7, 4] }, // 車2進4
            ];
            targetMove = seq[moveIndex];
        } else if (openingStyle === 'elephant') {
            const seq = [
                { from: [6, 0], to: [4, 2] }, // 相3進5
                { from: [7, 0], to: [6, 2] }, // 馬2進3
                { from: [2, 3], to: [2, 4] }, // 卒7進1
                { from: [8, 0], to: [7, 0] }, // 車1平2
                { from: [7, 2], to: [7, 5] }, // 炮2進3
                { from: [1, 0], to: [2, 2] }, // 馬8進7
                { from: [0, 0], to: [1, 0] }, // 車9平8
                { from: [1, 2], to: [1, 4] }, // 炮8進2
            ];
            targetMove = seq[moveIndex];
        } else if (openingStyle === 'pawn') {
            const seq = [
                { from: [6, 3], to: [6, 4] }, // 卒3進1
                { from: [7, 0], to: [6, 2] }, // 馬2進3
                { from: [1, 0], to: [2, 2] }, // 馬8進7
                { from: [1, 2], to: [0, 2] }, // 炮8平9
                { from: [0, 0], to: [1, 0] }, // 車9平8
                { from: [7, 2], to: [7, 5] }, // 炮2進3
                { from: [8, 0], to: [8, 1] }, // 車1進1
                { from: [8, 1], to: [4, 1] }, // 車1平5
            ];
            targetMove = seq[moveIndex];
        }

        if (targetMove) {
            const moves = engine.getLegalMoves();
            const isValid = moves.some(m => m.from[0] === targetMove.from[0] && m.from[1] === targetMove.from[1] && m.to[0] === targetMove.to[0] && m.to[1] === targetMove.to[1]);
            if (isValid) {
                // Verify move isn't suicidal (Wait 3 moves ahead)
                engine.move(targetMove.from, targetMove.to);
                const safetyScore = minimax(3, true, -Infinity, Infinity);
                engine.undo();
                if (safetyScore < 5000) return targetMove;
            }
        }
    }

    /* 本地包裝:實作已抽到模組層的 searchAlphaBeta(提示也要用同一支)。
       簽名刻意保持 (depth, maximizing, a, b),下面開局書與根層的呼叫一字不用改。 */
    const minimax = (currentDepth, maximizing, a, b) => searchAlphaBeta(engine, currentDepth, maximizing, a, b);

    const moves = engine.getLegalMoves();
    if (moves.length === 0) return null;

    // Shuffle moves to add enormous variety across games for equal-scored moves
    moves.sort(() => Math.random() - 0.5);

    let bestMove = moves[0];
    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const move of moves) {
            engine.move(move.from, move.to);
            const ev = minimax(depth - 1, false, alpha, beta);
            engine.undo();
            if (ev > maxEval) {
                maxEval = ev;
                bestMove = move;
            }
            alpha = Math.max(alpha, ev);
        }
    } else {
        let minEval = Infinity;
        for (const move of moves) {
            engine.move(move.from, move.to);
            const ev = minimax(depth - 1, true, alpha, beta);
            engine.undo();
            if (ev < minEval) {
                minEval = ev;
                bestMove = move;
            }
            beta = Math.min(beta, ev);
        }
    }

    return bestMove;
}
