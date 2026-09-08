import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { GameEngine } from './game/logic';
import { getBestMoveAlphaBeta, getHintMove } from './game/ai';
import { Board } from './components/Board';
import { Piece } from './components/Piece';
import { VERSION, DATE, CHANGELOG } from './version';

/* 💡 提示的標記:紫色。
   綠色已經是「這格我可以走」(ValidMoveIndicator)、選中的棋子也有自己的樣子 ——
   撞色的話提示跟合法目標在畫面上分不出來,提示就白給。
   起點畫**空心環**(圈住那顆棋,不擋住它的字)、終點畫**實心盤**(要去的地方)。 */
export function HintIndicator({ x, y, kind }) {
  const px = x - 4;
  const pz = y - 4.5;
  return (
    <mesh position={[px, 0.06, pz]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      {kind === 'from'
        ? <ringGeometry args={[0.34, 0.46, 32]} />
        : <circleGeometry args={[0.3, 32]} />}
      <meshBasicMaterial color="#a855f7" transparent opacity={0.9} depthWrite={false} />
    </mesh>
  );
}

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
  const [panelOpen, setPanelOpen] = useState(true);

  /* 🏷 右下角版本徽章:10 秒後淡出(它是 fixed,會蓋住按鈕的字)。
     ⚠ 內容從 src/version.js 來,不在這裡寫死版號 —— 寫死的那份一定會漂。 */
  useEffect(() => {
    const el = document.getElementById('appVerBadge');
    if (!el) return;
    el.textContent = `🏷️ 版本 ${VERSION}(${DATE})`;
    el.style.transition = 'opacity .8s';
    const t = setTimeout(() => { el.style.opacity = '0'; }, 10000);
    return () => clearTimeout(t);
  }, []);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  /* 💡 AI 提示:{ from, to, hash } —— hash 是算它的時候那個局面的 zobrist。
     局面一變 hash 就對不上 ⇒ 舊建議自己失效,不必去每個動棋盤的地方補一行清除
     (逐處補漏一處就是「提示指著一格早就過期的棋」,而且不會有任何東西報錯)。 */
  const [hint, setHint] = useState(null);
  const [hintThinking, setHintThinking] = useState(false);
  const controlsRef = useRef();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  /* 🔬 冒煙驗收的把手 —— **只讀**,不改任何遊戲行為。
     沒有 deps 陣列是刻意的:每次 render 都換上最新的一份,
     測試才不會抓到上一輪的 hint。 */
  useEffect(() => {
    window.__anchess = {
      engine,
      get hint() { return hint; },
      get thinking() { return hintThinking; },
      get selected() { return selectedPiece; },
    };
  });

  // Compute available moves for the selected piece
  const availableMoves = useMemo(() => {
    if (!selectedPiece) return [];
    /* ★ 用**合法**走法畫可走點:純幾何那份會把「走了會被將」的格子也畫出來,
       玩家點下去就等於送將(0909 之前就是這樣輸掉的)。 */
    return engine.getLegalPieceMoves(selectedPiece[0], selectedPiece[1]);
  }, [selectedPiece, boardState]);

  // Sync state to trigger re-renders
  // 📡 完賽 beacon:一局分出結果(帥/將被吃、絕殺、三次重複犯規)= 一次 -done。打點函式住在 index.html;統計是配菜,失敗靜默。
  const psDone = () => { try { window.psDone && window.psDone(); } catch { /* noop */ } };

  const syncBoard = () => {
    setBoardState(engine.board.map(row => [...row]));

    let redAlive = false, blackAlive = false;
    engine.board.forEach(row => {
      if (row.includes('K')) redAlive = true;
      if (row.includes('k')) blackAlive = true;
    });

    if (!redAlive) {
      setTimeout(() => alert('紅方帥被吃，黑方獲勝！遊戲結束。'), 100);
      psDone();
      return false;
    }
    if (!blackAlive) {
      setTimeout(() => alert('黑方將被吃，紅方獲勝！遊戲結束。'), 100);
      psDone();
      return false;
    }

    if (engine.isCheckmate()) {
      const winner = engine.turn === 'w' ? '黑方 (AI)' : '紅方 (玩家)';
      setTimeout(() => alert(`絕殺無解！${winner}獲勝！遊戲結束。`), 100);
      psDone();
      return false;
    }

    if (engine.boardMap.get(engine.zobristHash) >= 3) {
      const loser = engine.turn === 'w' ? '黑方 (AI)' : '紅方 (玩家)';
      const winner = engine.turn === 'w' ? '紅方 (玩家)' : '黑方 (AI)';
      setTimeout(() => alert(`重複走法追追追達三次！${loser}犯規，${winner}獲勝！遊戲結束。`), 100);
      psDone();
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
    // ★ 驗證也要用合法走法,否則畫面上不畫、但硬點還是走得動
    const moves = engine.getLegalPieceMoves(from[0], from[1]);
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

  /* 💡 AI 提示(2026-09-07 改用 getHintMove;與對手共用同一支 searchAlphaBeta,只是根層規矩不同)
     使用者退件:「提示常叫我吃掉某顆,吃完又被吃回,等於交換被吃」。舊寫法
     getBestMoveAlphaBeta(engine, max(difficulty,6), 'none') 有三個問題:
       ① 根層 moves.sort(() => Math.random() - 0.5) + 「分數嚴格變好才換人」⇒ 同分隨機挑,
          而舊評估只算子力、中局九成走法都是 0 分平手 ⇒ 等價交換就這樣被抽中;
       ② 深度跟著玩家選的難度走 —— 選「簡單」時提示只有 depth 2,等於隨便給;
       ③ 深度 3 是奇數層,「我吃→他回吃→我再吃」看起來賺,第 4 步被吃回看不到。
     現在 getHintMove():固定深度、零隨機、葉子有 quiescence,而且吃子要「交換算到底真的賺到子」
     + 「比最好的安靜手多賺半個兵」兩關都過才建議,否則建議走位。
     ★ 速度反而更快(本機 test/ai.mjs:30 個隨機中局平均 57ms、最慢 130ms),
       因為 MVV-LVA 排序讓 alpha-beta 剪得動;仍然保留 setTimeout 讓畫面先畫「想一手…」。 */
  const showHint = () => {
    if (hintThinking) return;
    if (engine.turn !== playerColor) return;      // 不是你的回合

    if (hint && hint.hash === engine.zobristHash) return;   // 同局面 ⇒ 同一手,不重算

    setHintThinking(true);
    // 讓瀏覽器先把「想一手…」畫出來,再進同步搜尋
    setTimeout(() => {
      let best = null;
      try {
        best = getHintMove(engine);
      } catch (error) {
        console.error('[hint] getHintMove threw:', error);
        setHintThinking(false);
        alert('💡 這一手算不出來,先自己走走看。');
        return;
      }
      // 用真正的走法規則驗一次:提示一手玩家點不動的棋,比沒有提示更糟
      const legal = best
        && engine.getPieceMoves(best.from[0], best.from[1])
          .some((m) => m[0] === best.to[0] && m[1] === best.to[1]);
      setHintThinking(false);
      if (!legal) {
        alert('💡 找不到可走的棋了。');
        return;
      }
      setHint({ from: best.from, to: best.to, hash: engine.zobristHash });
      setSelectedPiece(best.from);   // 順手選起來:接著點紫盤就走完
    }, 30);
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
      <div className={`ui-overlay glass ${panelOpen ? '' : 'panel-collapsed'}`}>
        <button className="panel-toggle" onClick={() => setPanelOpen(!panelOpen)}>
          {panelOpen ? '▲ 收起' : '▼ 展開'}
        </button>
        {panelOpen && (
          <>
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
            {/* 🏷 版本與改版簡歷(艦隊鐵則⑦)。預設收合 —— 攤開會把下面的鈕擠出畫面
                 (撞球 0907 實錄:1202 字的簡歷裸放,選單直接被推出第一屏)。
                 收合時 summary 那行仍寫著版本與日期 ⇒ 收起來也看得到「我開到的是哪一版」。
                 ★ 內容只有一份,在 src/version.js;test/version.mjs 守它不漂。 */}
            <details className="ver-fold">
              <summary>版本 {VERSION}({DATE})・看看前幾版做了什麼</summary>
              <div className="ver-tag">
                {CHANGELOG.map((c) => (
                  <p key={c.v}><b>{c.v}</b>({c.date}) {c.text}</p>
                ))}
              </div>
            </details>
            <div className="buttons">
              <button
                id="hintButton"
                onClick={showHint}
                disabled={hintThinking}
                title="讓 AI 幫你想一手"
                style={{ background: '#a855f7' }}
              >
                {hintThinking ? '💡 想一手…' : '💡 提示 (Hint)'}
              </button>
              <button onClick={() => setIs2D(!is2D)} style={{ background: '#2196F3' }}>切換 {is2D ? '3D' : '2D'} 視角</button>
              <button onClick={restartGame} style={{ background: '#FF5722' }}>重新開局 (Restart)</button>
              <button onClick={undo}>悔棋 (Undo)</button>
              <button onClick={saveGame}>存檔 (Save)</button>
              <button onClick={loadGame}>讀檔 (Load)</button>
              <button onClick={resetCamera} style={{ background: '#607D8B' }}>重置視角 (Reset View)</button>
              <button onClick={installApp} style={{ background: '#4CAF50' }}>安裝 APP (Install)</button>
            </div>
          </>
        )}
      </div>

      <Canvas shadows camera={{ position: [0, 8, 8], fov: isMobile ? 55 : 45 }}>
        <color attach="background" args={['#2c3e50']} />
        <ambientLight intensity={0.5} />
        <directionalLight
          castShadow
          position={[5, 10, 5]}
          intensity={1.5}
          shadow-mapSize={1024}
        />
        <group scale={isMobile ? [1.0, 1.0, 1.0] : [1.2, 1.2, 1.2]}>
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
          {/* 💡 提示:hash 對得上才畫 —— 局面一變它自己就不見了,不必逐處清 */}
          {hint && hint.hash === engine.zobristHash && (
            <>
              <HintIndicator key="hint-from" x={hint.from[0]} y={hint.from[1]} kind="from" />
              <HintIndicator key="hint-to" x={hint.to[0]} y={hint.to[1]} kind="to" />
            </>
          )}
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
