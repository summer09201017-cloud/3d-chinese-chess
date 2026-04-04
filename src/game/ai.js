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

function evaluateBoard(engine) {
    let score = 0;
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 9; x++) {
            const piece = engine.board[y][x];
            if (piece !== '.') {
                const value = PIECE_VALUES[piece.toLowerCase()] || 0;
                if (engine.isRed(piece)) {
                    score += value;
                } else {
                    score -= value;
                }
            }
        }
    }
    return score;
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

    function minimax(currentDepth, maximizing, a, b) {
        // Fast-fail repetition (O(1))
        const repCount = engine.boardMap.get(engine.zobristHash) || 0;
        if (repCount >= 3) {
            // Player who JUST MOVED caused this 3rd repetition.
            // If maximizing is true, Black just moved. Penalize Black.
            // If maximizing is false, Red just moved. Penalize Red.
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
            return evaluateBoard(engine);
        }
        const moves = engine.getLegalMoves();
        if (moves.length === 0) return maximizing ? -10000 : 10000;

        if (maximizing) {
            let maxEval = -Infinity;
            for (const move of moves) {
                engine.move(move.from, move.to);
                const ev = minimax(currentDepth - 1, false, a, b);
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
                const ev = minimax(currentDepth - 1, true, a, b);
                engine.undo();
                minEval = Math.min(minEval, ev);
                b = Math.min(b, ev);
                if (b <= a) break;
            }
            return minEval;
        }
    }

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
