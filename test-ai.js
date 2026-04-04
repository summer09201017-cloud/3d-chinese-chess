import { GameEngine } from './src/game/logic.js';
import { getBestMoveAlphaBeta } from './src/game/ai.js';

const engine = new GameEngine();
console.log("Initial Turn:", engine.turn);
console.log("Legal Moves for Red:", engine.getLegalMoves().length);

// Make a move for red
engine.move([4, 6], [4, 5]); // move red pawn
console.log("Turn after red move:", engine.turn);
console.log("Legal Moves for Black:", engine.getLegalMoves().length);

// Calculate AI move
console.time("AI");
const best = getBestMoveAlphaBeta(engine, 2);
console.timeEnd("AI");

console.log("AI Best Move:", best);
