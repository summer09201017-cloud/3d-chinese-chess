import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { GameEngine } from './game/logic';
import { getBestMoveAlphaBeta } from './game/ai';
import { Board } from './components/Board';
import { Piece } from './components/Piece';

export function ValidMoveIndicator({ x, y, onClick }) {
  const px = x - 4;
  const pz = y - 4.5;
  return (
    <mesh position={[px, 0.05, pz]} rotation={[-Math.PI / 2, 0, 0]} onClick={onClick}>
      <circleGeometry args={[0.2, 32]} />
      <meshBasicMaterial color="#4CAF50" transparent opacity={0.6} depthWrite={false} />
    </mesh>
  );
}

function App() {
  const [engine] = useState(() => new GameEngine());
  const [boardState, setBoardState] = useState(engine.board);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [difficulty, setDifficulty] = useState(2); // Depth 2 is fast, depth 3 is medium
  const [openingStyle, setOpeningStyle] = useState('auto'); // Opening book selection
  const [playerColor, setPlayerColor] = useState('w');
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [is2D, setIs2D] = useState(false);
  const controlsRef = useRef();

  useEffect(() => {
    if (controlsRef.current) {
      if (is2D) {
        controlsRef.current.object.position.set(0, 16, 0.01);
      } else {
        controlsRef.current.object.position.set(0, 10, 10);
      }
      controlsRef.current.update();
    }
  }, [is2D]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  // Compute available moves for the selected piece
  const availableMoves = useMemo(() => {
    if (!selectedPiece) return [];
    return engine.getPieceMoves(selectedPiece[0], selectedPiece[1]);
  }, [selectedPiece, boardState]);

  // Sync state to trigger re-renders
  const syncBoard = () => {
    setBoardState(engine.board.map(row => [...row]));

    let redAlive = false, blackAlive = false;
    engine.board.forEach(row => {
      if (row.includes('K')) redAlive = true;
      if (row.includes('k')) blackAlive = true;
    });

    if (!redAlive) {
      setTimeout(() => alert('紅方帥被吃，黑方獲勝！遊戲結束。'), 100);
      return false;
    }
    if (!blackAlive) {
      setTimeout(() => alert('黑方將被吃，紅方獲勝！遊戲結束。'), 100);
      return false;
    }

    if (engine.isCheckmate()) {
      const winner = engine.turn === 'w' ? '黑方 (AI)' : '紅方 (玩家)';
      setTimeout(() => alert(`絕殺無解！${winner}獲勝！遊戲結束。`), 100);
      return false;
    }

    if (engine.boardMap.get(engine.zobristHash) >= 3) {
      const loser = engine.turn === 'w' ? '黑方 (AI)' : '紅方 (玩家)';
      const winner = engine.turn === 'w' ? '紅方 (玩家)' : '黑方 (AI)';
      setTimeout(() => alert(`重複走法追追追達三次！${loser}犯規，${winner}獲勝！遊戲結束。`), 100);
      return false;
    }

    return true;
  };

  const handlePieceClick = (x, y) => {
    const p = engine.board[y][x];
    const isRed = p >= 'A' && p <= 'Z';
    const pColor = isRed ? 'w' : 'b';

    if (pColor === engine.turn && engine.turn === playerColor) {
      setSelectedPiece([x, y]);
    } else if (selectedPiece) {
      // Check if clicked to capture
      tryMove(selectedPiece, [x, y]);
    }
  };

  const handleBoardClick = (evt) => {
    if (!selectedPiece) return;
    // We scaled the group by 1.2, so divide world point by 1.2
    const localPoint = evt.point;
    const nx = Math.round(localPoint.x / 1.2 + 4);
    const nz = Math.round(localPoint.z / 1.2 + 4.5);
    tryMove(selectedPiece, [nx, nz]);
  };

  const tryMove = (from, to) => {
    const moves = engine.getPieceMoves(from[0], from[1]);
    const isValid = moves.some(m => m[0] === to[0] && m[1] === to[1]);
    if (isValid) {
      engine.move(from, to);
      const continues = syncBoard();
      setSelectedPiece(null);
      // Trigger AI
      if (continues) {
        setTimeout(makeAIMove, 150);
      }
    } else {
      setSelectedPiece(null);
    }
  };

  const makeAIMove = () => {
    if (engine.turn === playerColor) return;
    const best = getBestMoveAlphaBeta(engine, difficulty, openingStyle);
    if (best) {
      engine.move(best.from, best.to);
      syncBoard();
    } else {
      alert('AI has no moves left! Game Over.');
    }
  };

  const undo = () => {
    engine.undo();
    if (engine.turn !== playerColor) engine.undo(); // Undo AI move too
    syncBoard();
    setSelectedPiece(null);
  };

  const saveGame = () => {
    // In a full implementation we'd export FEN and history
    localStorage.setItem('xiangqiSave', JSON.stringify({
      board: engine.board,
      turn: engine.turn,
      history: engine.history
    }));
    alert('Game Saved!');
  };

  const loadGame = () => {
    const data = localStorage.getItem('xiangqiSave');
    if (data) {
      const parsed = JSON.parse(data);
      engine.board = parsed.board;
      engine.turn = parsed.turn;
      engine.history = parsed.history;
      engine.recalculateHash();
      syncBoard();
      alert('Game Loaded!');
    }
  };

  const installApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      alert('無法安裝。這可能代表您的瀏覽器不支援 PWA，或者您已經安裝過了。');
    }
  };

  const restartGame = () => {
    const newEngine = new GameEngine();
    engine.board = newEngine.board;
    engine.turn = newEngine.turn;
    engine.history = newEngine.history;
    syncBoard();
    setSelectedPiece(null);
  };

  const resetCamera = () => {
    if (controlsRef.current) {
      if (is2D) {
        controlsRef.current.object.position.set(0, 16, 0.01);
      } else {
        controlsRef.current.object.position.set(0, 10, 10);
      }
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  return (
    <div className="app-container">
      <div className="ui-overlay glass">
        <h1>3D 象棋</h1>
        <div className="controls">
          <label>難度 (Difficulty):
            <select value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))}>
              <option value={1}>1 - 新手 (Beginner)</option>
              <option value={2}>2 - 入門 (Novice)</option>
              <option value={3}>3 - 簡單 (Easy)</option>
              <option value={4}>4 - 業餘 (Amateur)</option>
              <option value={5}>5 - 普通 (Normal)</option>
              <option value={6}>6 - 困難 (Hard)</option>
              <option value={7}>7 - 專家 (Expert)</option>
              <option value={8}>8 - 大師 (Master)</option>
              <option value={9}>9 - 宗師 (Grandmaster)</option>
              <option value={10}>10 - 棋聖 (Legendary)</option>
            </select>
          </label>
          <label style={{ display: 'block', marginTop: '10px' }}>AI 棋譜 (Opening):
            <select value={openingStyle} onChange={(e) => setOpeningStyle(e.target.value)} style={{ marginTop: '5px', display: 'block', width: '100%' }}>
              <option value="auto">全譜庫 (Auto)</option>
              <option value="cannon">中炮局 (Central Cannon)</option>
              <option value="elephant">飛相局 (Elephant)</option>
              <option value="screen_horse">起馬 (Knight)</option>
              <option value="pawn">仙人指路 (Pawn)</option>
              <option value="none">純搜尋 (Pure Search)</option>
            </select>
          </label>
        </div>
        <div className="buttons">
          <button onClick={restartGame} style={{ background: '#FF5722' }}>重新開局 (Restart)</button>
          <button onClick={undo}>悔棋 (Undo)</button>
          <button onClick={saveGame}>存檔 (Save)</button>
          <button onClick={loadGame}>讀檔 (Load)</button>
          <button onClick={resetCamera} style={{ background: '#607D8B' }}>重置視角 (Reset View)</button>
          <button onClick={installApp} style={{ background: '#4CAF50' }}>安裝 APP (Install)</button>
          <button onClick={() => setIs2D(!is2D)} style={{ background: '#2196F3' }}>切換 {is2D ? '3D' : '2D'} 視角</button>
        </div>
      </div>

      <Canvas shadows camera={{ position: [0, 8, 8], fov: 45 }}>
        <color attach="background" args={['#2c3e50']} />
        <ambientLight intensity={0.5} />
        <directionalLight
          castShadow
          position={[5, 10, 5]}
          intensity={1.5}
          shadow-mapSize={1024}
        />
        <group scale={[1.2, 1.2, 1.2]}>
          <Board onBoardClick={handleBoardClick} />
          {boardState.map((row, y) =>
            row.map((p, x) => {
              if (p === '.') return null;
              const isSelected = selectedPiece && selectedPiece[0] === x && selectedPiece[1] === y;
              return (
                <Piece
                  key={`${x}-${y}-${p}`}
                  x={x} y={y} type={p}
                  selected={isSelected}
                  onClick={(e) => { e.stopPropagation(); handlePieceClick(x, y); }}
                />
              )
            })
          )}
          {availableMoves.map(([mx, my]) => (
            <ValidMoveIndicator
              key={`move-${mx}-${my}`}
              x={mx}
              y={my}
              onClick={(e) => { e.stopPropagation(); tryMove(selectedPiece, [mx, my]); }}
            />
          ))}
        </group>
        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          enableRotate={true}
          minPolarAngle={is2D ? 0.01 : Math.PI / 6}
          maxPolarAngle={is2D ? 0.01 : Math.PI / 2.5}
          minDistance={5}
          maxDistance={25}
        />
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}

export default App;
