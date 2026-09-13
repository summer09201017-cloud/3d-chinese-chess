import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { fitCamera as applyFit } from './fitCamera';
import { gridToWorld, worldToGrid } from './boardLayout.js';

/* 📝 改版簡歷的文案用 `**粗體**` 標重點,但這裡是 React 的 `{c.text}` = **純文字**
     ⇒ 星號會原封不動印在畫面上(0909 實查:v2 那則從上線就這樣,而且
       **沒有任何測試會紅、畫面也沒有錯誤** —— 只有人去看才發現)。
   ⇒ 用 split('**') 交替加粗:偶數段普通、奇數段粗體。
   ⚠ 星號數量不成對時,最後多出來的那一段會被當成粗體 —— 所以 test/version.mjs
     另外守「每一則的 ** 必須成對」,不然只是把「印出星號」換成「半句變粗體」。 */
const richText = (t) => String(t).split('**').map((seg, i) => (i % 2 ? <b key={i}>{seg}</b> : seg));

/* 📱 內建瀏覽器偵測(守門 #30)—— **教會的連結都走 LINE 發**。
     從 LINE 訊息點進來 = LINE 自己的 WebView,`beforeinstallprompt` **永遠不會觸發**
     ⇒ 「安裝 APP」那顆鈕按了**完全沒有反應**,而使用者在手機設定裡怎麼調都沒用
     (那不是網站權限、也不是系統開關)⇒ 任何「請去設定裡打開」的文案在這個情境下都是**錯的指引**。
   ★ 三條分寸(姊妹站 3D-Xiangqi / xiangqi-arena 同一套,本站一直漏了):
     ① **只提醒不擋** —— LINE 偶爾拿得到,擋掉會誤傷;而且遊戲本身在 WebView 裡完全能玩。
     ② 命中時**只講「換瀏覽器」那一條** —— 三條並列會讓他先去試沒用的那兩條。
     ③ **開場就講**,不要等他按下去才失敗 ⇒ 提示直接畫在控制面板裡,同時把安裝鈕收起來
        (留一顆按了沒反應的鈕,比沒有鈕更糟)。
   ⚠⚠ **不可以用 `/line/i` 比對** —— "offline"、"Baseline"、"inline" 都會中,要用 `\bLine\/`。
   ★ 模組層只算一次:UA 在一個分頁裡不會變,放進 render 只是每幀重算同一個答案。 */
/* 🖐 觸控裝置?(2026-09-10 使用者:「棋盤旋轉太快太靈敏」)
   ★ `pointer: coarse` 是**裝置能力**,不是視窗寬度——Playwright 用 setViewportSize
     改不出來,要驗這條得另開 hasTouch 的 context(姊妹站 0909 踩過這個坑)。
   ★ 模組層只算一次:同一個分頁裡輸入裝置不會變,放進 render 只是每幀重算同一個答案。 */
const IS_COARSE_POINTER = typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(pointer: coarse)').matches;

const IN_APP = (() => {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (/\bLine\//i.test(ua) || /\bLIFF\b/i.test(ua)) return { n: 'LINE', m: '右上角「⋯」→「用其他瀏覽器開啟」' };
  if (/FBAN|FBAV|FB_IAB|FB4A/i.test(ua)) return { n: 'Facebook', m: '右上角「⋯」→「在外部瀏覽器中開啟」' };
  if (/Instagram/i.test(ua)) return { n: 'Instagram', m: '右上角「⋯」→「在瀏覽器中開啟」' };
  if (/MicroMessenger/i.test(ua)) return { n: '微信', m: '右上角「⋯」→「在瀏覽器中開啟」' };
  return null;
})();

/* 📐 相機距離照畫布長寬比算(2026-09-09 使用者實機退件:「直向兩側被切,邊路砲馬只剩半顆」)。
   ★ 為什麼要做成 Canvas 裡的元件:R3F 的相機與畫布尺寸只有 `useThree` 拿得到,
     而且尺寸一變它會自己重新 render ⇒ 不必自己聽 window resize(元素全螢幕、側欄收合
     這些「視窗沒變但畫布變了」的情況,window 的 resize 根本不響)。
   ★ 兩個 effect 刻意分開,因為兩種情況要的行為不同:
       · 2D/3D 切換 ⇒ 角度要**歸位**(keepDirection: false)
       · 只是尺寸變了(轉向、拖窗)⇒ **保留使用者轉到的角度**,只重算距離
         (轉了半天結果一轉向就被拉回正面 = 比不 fit 還討厭)
   ⚠ 一個 effect 用 [size, is2D] 當 deps 是分不出「誰變了」的 —— 那正是會寫錯的地方。 */
function FitCamera({ is2D, scale, controlsRef, fitRef }) {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);

  const run = (keepDirection) => applyFit(camera, controlsRef.current, {
    is2D, scale, aspect: width / Math.max(1, height), keepDirection,
  });

  // 角度歸位:掛載時 + 2D/3D 切換時。
  useEffect(() => { run(false); }, [camera, is2D]);

  // 只重算距離:畫布尺寸或場景縮放變了(轉向、拖窗、跨過手機/桌機斷點)
  useEffect(() => { run(true); }, [width, height, scale]);

  /* 0910 補:「重置視角」鈕按下去棋盤變扁(使用者實機退件:「橫向重置視角後,棋盤太扁,
       這角度看不到棋子」)。病根是 fitRef.current 曾經**只在 [camera, is2D] 這個 effect 裡賦值**,
       轉向(width/height 變了但 camera、is2D 都沒變)不會讓那個 effect 重跑,於是按鈕綁的
       還是轉向**之前**那個 run 閉包 —— 裡面關住的是舊的 width/height。按下重置視角時,
       fitCamera() 會把 camera.aspect 強制寫回那個舊比例,跟畫布**現在**真正的寬高對不上,
       畫面因此整個被拉扁。改成每次 render 完都刷新 fitRef.current(不放進上面那個
       只認 [camera, is2D] 的 effect),按鈕永遠拿得到當下最新的 width/height/is2D。 */
  useEffect(() => { if (fitRef) fitRef.current = () => run(false); });

  return null;
}
import { GameEngine, INITIAL_BOARD } from './game/logic';
import { getBestMoveAlphaBeta, getHintMove } from './game/ai';
import { toFen, fromFen, validatePosition, EMPTY_BOARD, PIECE_NAME } from './game/position.js';

/* 🧩 自訂殘局(2026-09-13 使用者:「3d-chinese-chess 增加自訂殘局功能」)。
   ★ 調色盤兩排:紅 帥仕相傌俥炮兵 / 黑 將士象馬車砲卒,再加一顆 🗑(拿掉棋子)。
   ★ 存在 localStorage(這台裝置的瀏覽器裡),最多留 50 筆;讀寫都包 try/catch
     (Safari 私密模式會丟例外,不是回 null)。
   ★ 分享 = 把局面編成網址 `?fen=…&me=w|b`,打開就直接從那個局面開打(見下面 useEffect)。 */
const PALETTE_RED = ['K', 'A', 'B', 'N', 'R', 'C', 'P'];
const PALETTE_BLACK = ['k', 'a', 'b', 'n', 'r', 'c', 'p'];
const PUZZLE_STORE_KEY = 'xiangqiCustomPuzzles';
const loadPuzzles = () => {
  try { const v = JSON.parse(localStorage.getItem(PUZZLE_STORE_KEY) || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
};
const savePuzzles = (list) => {
  try { localStorage.setItem(PUZZLE_STORE_KEY, JSON.stringify(list)); return true; }
  catch { return false; }
};
import { Board } from './components/Board';
import { Piece } from './components/Piece';
import { VERSION, DATE, CHANGELOG } from './version';

/* 💡 提示的標記:紫色。
   綠色已經是「這格我可以走」(ValidMoveIndicator)、選中的棋子也有自己的樣子 ——
   撞色的話提示跟合法目標在畫面上分不出來,提示就白給。
   起點畫**空心環**(圈住那顆棋,不擋住它的字)、終點畫**實心盤**(要去的地方)。 */
export function HintIndicator({ x, y, kind }) {
  const [px, pz] = gridToWorld(x, y);
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
  const [px, pz] = gridToWorld(x, y);
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
  const [selectedPiece, setSelectedPieceState] = useState(null);
  /* ★ 選中的棋子也要一份 ref(0913 線上驗收抓到的):棋盤 mesh 的 onClick 在 R3F 的另一個 root,
       外層剛 setSelectedPiece 完、下一個點擊若在它換閉包之前進來(線上比本機慢一拍就會),
       handleBoardClick 讀到的 selectedPiece 還是 null ⇒ 「選了俥、點目標格沒反應」。
       handler 一律讀 ref,state 只管畫可走點。 */
  const selectedPieceRef = useRef(null);
  const setSelectedPiece = (v) => { selectedPieceRef.current = v; setSelectedPieceState(v); };
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
  /* 📱 手機版面?要和 index.css 的斷點**同一條**:`(max-width:768px), (max-height:500px)`。
     以前只認寬度 ⇒ 手機轉橫(844 寬)JS 當桌機、CSS 當手機,兩邊各講各的(0910 那顆
     「展開/收起 DISABLE」就是這種分岔)。 */
  const isMobileLayout = () => window.innerWidth <= 768 || window.innerHeight <= 500;
  const [isMobile, setIsMobile] = useState(isMobileLayout);
  /* 📐 手機上的頂部選單列有多高 → 3D 舞台從它**下面**開始(2026-09-13)。
     由來:選單列是蓋在畫布上的浮層;棋盤照整個畫布算「剛好裝滿」之後,最上面那一排
     (黑方的車馬象士將)正好躲在收起的選單列底下。以前是 CSS 偷偷把畫布往下推 20px、
     縮成九成來避開它(見 index.css 那段),但那是沒人算進去的第二層 margin,棋盤永遠比算的小。
     ⇒ 改成量選單列的真實高度,畫布從那裡開始 ⇒ 棋盤照「看得到的區域」剛好裝滿,一排都不被蓋;
       選單展開時棋盤自動縮進剩下的空間(整張看得到),收起時再放大。編輯殘局時尤其重要:
       調色盤展開著也要點得到最上面一排。桌機的選單是左上角小卡,不推。 */
  const overlayRef = useRef(null);
  const [overlayH, setOverlayH] = useState(0);
  useEffect(() => {
    const el = overlayRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => setOverlayH(Math.round(el.getBoundingClientRect().height));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  /* 💡 AI 提示:{ from, to, hash } —— hash 是算它的時候那個局面的 zobrist。
     局面一變 hash 就對不上 ⇒ 舊建議自己失效,不必去每個動棋盤的地方補一行清除
     (逐處補漏一處就是「提示指著一格早就過期的棋」,而且不會有任何東西報錯)。 */
  const [hint, setHint] = useState(null);
  const [hintThinking, setHintThinking] = useState(false);
  const controlsRef = useRef();

  /* 🧩 自訂殘局編輯器的狀態 */
  const [editing, setEditingState] = useState(false);
  const [editTool, setEditToolState] = useState('R');   // 調色盤選中的棋子,或 'erase'
  /* ★ 棋盤上的點擊是 R3F 場景裡 mesh 的 onClick —— 那是**另一個 React root**,外層 state 改了,
       裡面的 handler 要晚一拍才換成新閉包(實測:調色盤按完馬上點棋盤,放上去的是**上一顆**)。
       真手指兩下之間有幾百毫秒通常追得上,但自動化驗收與快手會踩到 ⇒ 工具與「編輯中」
       都同時放進 ref,handler 一律讀 ref、state 只管畫面。 */
  const editToolRef = useRef('R');
  const editingRef = useRef(false);
  const setEditTool = (t) => { editToolRef.current = t; setEditToolState(t); };
  const setEditing = (v) => { editingRef.current = v; setEditingState(v); };
  const [editTurn, setEditTurn] = useState('w');        // 開始時誰先走
  const [editMe, setEditMe] = useState('w');            // 玩家執哪一方
  const [editMsg, setEditMsg] = useState({ text: '', bad: false });
  const [puzzles, setPuzzles] = useState(loadPuzzles);
  const [puzzleName, setPuzzleName] = useState('');
  const [pickId, setPickId] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const editBackupRef = useRef(null);                   // 進編輯器前的那一局,按「離開」時還回去
  /* ★ 玩家顏色與「這是自訂局」放進 ref:makeAIMove 是用 setTimeout 排進去的,
       跑的時候拿到的是**排進去那一刻**那一輪 render 的閉包 —— 剛 setPlayerColor 完馬上
       排 AI 走,閉包裡還是舊的顏色,AI 會以為輪到玩家而不走。ref 永遠是最新值。 */
  const playerColorRef = useRef('w');
  const customGameRef = useRef(false);
  useEffect(() => { playerColorRef.current = playerColor; }, [playerColor]);

  useEffect(() => {
    const handleResize = () => setIsMobile(isMobileLayout());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /* 📐 2D/3D 切換時的相機由 <FitCamera> 統一算(見 src/fitCamera.js)。
       ⚠ 這裡原本寫死 `(0,16,0.01)` / `(0,10,10)` —— 那是 0909 使用者退件
         「直向兩側被切、邊路砲馬只剩半顆」的病根之一(寫死的距離只有寬螢幕裝得下)。
         **不要再把座標寫回來**;要改角度請改 fitCamera.js 的 DIR_2D / DIR_3D。 */
  const fitRef = useRef(null);   // <FitCamera> 掛上來的「重新 fit」函式,給 resetCamera 用

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  /* 🔄 拿新版(0910 使用者實機退件:「在手機無法用手指下滑,來重新整理成為最新版」)。
       ★ 為什麼不去「把下拉更新打開」:本站 body/#root 是 `height:100vh; overflow:hidden`,
         整個視窗讓給 3D 棋盤。瀏覽器的下拉更新只在「文件本身可捲動且捲到最頂」時才會觸發,
         要打開它就得讓頁面可捲 —— 那樣手指拖棋盤轉視角時會整頁跟著捲,換一個更糟的病。
         ⇒ 正解是「不必下拉也會拿到新版」:①自動偵測 ②畫面上給一顆看得到的更新鈕。
       ★ SW 是 registerType:'autoUpdate'(skipWaiting + clientsClaim)⇒ 新版一裝好就接管,
         但**接管不等於畫面換新**:目前這個分頁還是舊的那份 JS/CSS,一定要 reload 才會換。
         ⇒ 這裡聽 controllerchange(新 SW 接管的那一刻)自動 reload 一次。
       ⚠ reload 迴圈是這個作法的經典坑:reloaded 這個旗標保證每次載入最多只自動重整一次。 */
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    /* 主動問「有沒有新版」:剛打開時問一次、每次從背景切回前景再問一次
       (手機使用者幾乎不關分頁,只切走再切回來 ⇒ 沒有這一條就永遠不會去問)。 */
    const check = () => navigator.serviceWorker.getRegistration()
      .then((reg) => reg && reg.update())
      .catch(() => { /* 拿新版失敗不可以影響下棋 */ });
    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, 30 * 60 * 1000);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);

  /* 🔄 手動更新鈕:等同「下拉重新整理」,但不需要頁面可捲。
       先叫 SW 去抓一次新版再 reload —— 只 reload 的話,拿到的還是快取裡那份舊的。 */
  const forceRefresh = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update();
      }
    } catch { /* 沒 SW / 離線也要能重整,往下走 */ }
    window.location.reload();
  };

  /* 🔬 冒煙驗收的把手 —— **只讀**,不改任何遊戲行為。
     沒有 deps 陣列是刻意的:每次 render 都換上最新的一份,
     測試才不會抓到上一輪的 hint。 */
  useEffect(() => {
    window.__anchess = {
      engine,
      get hint() { return hint; },
      get thinking() { return hintThinking; },
      get selected() { return selectedPiece; },
      /* 🧩 自訂殘局(0913):編輯中?/ 目前局面的 FEN / 玩家執哪一方 —— 驗收腳本用真點擊擺子後對這三個對賬 */
      get editing() { return editing; },
      get fen() { return toFen(engine.board, engine.turn); },
      get playerColor() { return playerColor; },
      /* 🎥 相機的長寬比 vs 畫布真正的長寬比 —— 0910「重置視角把棋盤壓扁」那個 bug 的量法:
         病發時 camera.aspect 會停在轉向**之前**的舊值,和畫布現在的比例對不上,畫面就被拉扁。
         兩個都讀得到,測試才問得出「它們一不一致」(只看畫面截圖看不出是哪一邊錯)。 */
      get camAspect() { return controlsRef.current?.object?.aspect ?? null; },
      get canvasAspect() {
        const c = document.querySelector('canvas');
        return c ? c.clientWidth / Math.max(1, c.clientHeight) : null;
      },
      // 0910 補:診斷「橫式棋盤比姊妹站小」用——距離與 fov 才看得出是不是退太遠。
      get camDistance() {
        const p = controlsRef.current?.object?.position;
        return p ? Math.hypot(p.x, p.y, p.z) : null;
      },
      get camFov() { return controlsRef.current?.object?.fov ?? null; },
      /* 0910 補:相機的**實際**俯角(度)。fitCamera 設的角度會被 OrbitControls 的
         min/maxPolarAngle 夾住 —— 設了不代表生效,一定要量真的。 */
      /* 0910 補:實際生效的旋轉靈敏度(觸控應該是 0.4、滑鼠 1.0)。
         同樣是「設了不代表生效」那一族 —— 要量 controls 上真正的值。 */
      get rotateSpeed() { return controlsRef.current?.rotateSpeed ?? null; },
      get camElevation() {
        const p = controlsRef.current?.object?.position;
        if (!p) return null;
        /* 0913:俯角要對**注視點**量,不是對原點 —— 橫式的注視點現在偏在 z=+1 左右(fitLandscape),
           對原點量會少掉 4~5 度,看起來像「角度沒生效」,其實是量錯基準。 */
        const t = controlsRef.current?.target || { x: 0, y: 0, z: 0 };
        return (Math.atan2(p.y - t.y, Math.hypot(p.x - t.x, p.z - t.z)) * 180) / Math.PI;
      },
      /* 0913:注視點(fitLandscape 會把它沿 z 往玩家這側偏)—— 驗「真的偏了」用 */
      get camTarget() {
        const t = controlsRef.current?.target;
        return t ? { x: t.x, y: t.y, z: t.z } : null;
      },
      /* 🖱 格座標 → 螢幕像素(2026-09-10 補,查「炮吃炮沒有屏風」那批 bug 用)。
         驗收腳本要用**真滑鼠點擊**(page.mouse.click)才會走到真正的 raycast onClick,
         不能用 page.evaluate 直接呼叫函式繞過去 —— 那樣「畫面上點不到」這種病照樣全綠。
         真滑鼠點擊需要真實螢幕像素,這裡借相機的投影矩陣算給它,不必在測試腳本裡
         重寫一份透視投影(那份和 renderer 實際用的很容易兜不起來)。 */
      screenPosFor(x, y) {
        const cam = controlsRef.current?.object;
        const c = document.querySelector('canvas');
        if (!cam || !c) return null;
        const scale = isMobile ? 1.0 : 1.2;
        const [wx, wz] = gridToWorld(x, y);
        const v = new THREE.Vector3(wx * scale, 0.25 * scale, wz * scale);
        v.project(cam);
        const rect = c.getBoundingClientRect();
        return {
          x: rect.left + ((v.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - v.y) / 2) * rect.height,
        };
      },
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

  /* 誰是玩家、誰是 AI,照 playerColorRef 講(自訂殘局可以執黑;以前寫死「紅=玩家、黑=AI」) */
  const sideLabel = (c) => (c === 'w' ? '紅方' : '黑方') + (c === playerColorRef.current ? ' (玩家)' : ' (AI)');

  const syncBoard = () => {
    setBoardState(engine.board.map(row => [...row]));

    let redAlive = false, blackAlive = false;
    engine.board.forEach(row => {
      if (row.includes('K')) redAlive = true;
      if (row.includes('k')) blackAlive = true;
    });

    if (!redAlive) {
      setTimeout(() => alert(`紅方帥被吃，${sideLabel('b')}獲勝！遊戲結束。`), 100);
      psDone();
      return false;
    }
    if (!blackAlive) {
      setTimeout(() => alert(`黑方將被吃，${sideLabel('w')}獲勝！遊戲結束。`), 100);
      psDone();
      return false;
    }

    if (engine.isCheckmate()) {
      const winner = sideLabel(engine.turn === 'w' ? 'b' : 'w');
      setTimeout(() => alert(`絕殺無解！${winner}獲勝！遊戲結束。`), 100);
      psDone();
      return false;
    }

    if (engine.boardMap.get(engine.zobristHash) >= 3) {
      const loser = sideLabel(engine.turn === 'w' ? 'b' : 'w');
      const winner = sideLabel(engine.turn);
      setTimeout(() => alert(`重複走法追追追達三次！${loser}犯規，${winner}獲勝！遊戲結束。`), 100);
      psDone();
      return false;
    }

    return true;
  };

  /* 🧩 編輯中:點哪一格就把調色盤選中的棋子放上去(🗑 = 拿掉)。
     ★ 直接改 engine.board 再 setBoardState —— 編輯中沒有「走法」可言,不走 syncBoard
       (那支會在少了帥/將時跳「獲勝」的 alert)。 */
  const editPlace = (x, y) => {
    if (x < 0 || x > 8 || y < 0 || y > 9) return;
    const tool = editToolRef.current;
    engine.board[y][x] = tool === 'erase' ? '.' : tool;
    setBoardState(engine.board.map((row) => [...row]));
    if (editMsg.text) setEditMsg({ text: '', bad: false });
  };

  const handlePieceClick = (x, y) => {
    if (editingRef.current) { editPlace(x, y); return; }
    const p = engine.board[y][x];
    const isRed = p >= 'A' && p <= 'Z';
    const pColor = isRed ? 'w' : 'b';

    if (pColor === engine.turn && engine.turn === playerColorRef.current) {
      setSelectedPiece([x, y]);
    } else if (selectedPieceRef.current) {
      // Check if clicked to capture
      tryMove(selectedPieceRef.current, [x, y]);
    }
  };

  const handleBoardClick = (evt) => {
    /* 世界座標 → 格座標。⚠ 這裡原本寫死 `/1.2`(桌機那一檔的 group scale),
       手機是 1.0 ⇒ 點空格會算到隔壁格(既有 bug,2026-09-10 一併修掉)。
       縮放與行距一律交給 boardLayout.worldToGrid,和畫格線/擺棋子共用同一組數字。 */
    const scale = isMobile ? 1.0 : 1.2;
    const [nx, nz] = worldToGrid(evt.point.x, evt.point.z, scale);
    if (editingRef.current) { editPlace(nx, nz); return; }
    if (!selectedPieceRef.current) return;
    tryMove(selectedPieceRef.current, [nx, nz]);
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
    if (engine.turn === playerColorRef.current) return;
    /* 🧩 自訂殘局不用開局書:書裡的手是「開局盤面」的手,殘局裡就算剛好合法也只是瞎走一步。
         (getBestMoveAlphaBeta 只看 history.length ≤ 3 判「開局」,殘局一開始 history 就是空的。) */
    const best = getBestMoveAlphaBeta(engine, difficulty, customGameRef.current ? 'none' : openingStyle);
    if (best) {
      engine.move(best.from, best.to);
      syncBoard();
    } else {
      alert('AI has no moves left! Game Over.');
    }
  };

  const undo = () => {
    if (editing) return;
    engine.undo();
    if (engine.turn !== playerColorRef.current) engine.undo(); // Undo AI move too
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
      engine.loadPosition(parsed.board, parsed.turn);
      engine.history = Array.isArray(parsed.history) ? parsed.history : [];
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
    } else if (IN_APP) {
      /* 保險道:正常情況下這顆鈕在內建瀏覽器裡根本不會出現(上面直接換成提示文字),
         但萬一有人從舊快取的殼層進來,文案也不可以說「瀏覽器不支援」——
         真正的原因是「這是 App 內建的瀏覽器」,而修法只有換瀏覽器一條。 */
      alert(`在 ${IN_APP.n} 的內建瀏覽器裡沒辦法安裝。請先點${IN_APP.m},再回來按這顆。`);
    } else {
      alert('無法安裝。這可能代表您的瀏覽器不支援 PWA，或者您已經安裝過了。');
    }
  };

  const restartGame = () => {
    engine.loadPosition(INITIAL_BOARD, 'w');
    customGameRef.current = false;
    setPlayerColor('w'); playerColorRef.current = 'w';
    setEditing(false);
    setHint(null);
    syncBoard();
    setSelectedPiece(null);
  };

  /* ══════════ 🧩 自訂殘局編輯器 ══════════ */
  const say = (text, bad = false) => setEditMsg({ text, bad });

  const startEditor = () => {
    editBackupRef.current = {
      board: engine.board.map((row) => [...row]), turn: engine.turn, history: [...engine.history],
      me: playerColorRef.current, custom: customGameRef.current,
    };
    setSelectedPiece(null);
    setHint(null);
    setShareUrl('');
    setEditTurn(engine.turn);
    setEditing(true);
    say('先點下面一顆棋子,再點棋盤把它放上去;點 🗑 再點棋子可以拿掉。擺好按「▶ 開始對弈」。');
  };

  /* 「✕ 離開」= 不採用這次的擺法,回到進來之前那一局 */
  const exitEditor = () => {
    const b = editBackupRef.current;
    if (b) {
      engine.loadPosition(b.board, b.turn);
      engine.history = b.history;
      customGameRef.current = b.custom;
      setPlayerColor(b.me); playerColorRef.current = b.me;
      setBoardState(engine.board.map((row) => [...row]));
    }
    setEditing(false);
    setShareUrl('');
  };

  const editClear = () => { engine.board = EMPTY_BOARD(); setBoardState(engine.board.map((r) => [...r])); say('盤面清空了。'); };
  const editInitial = () => { engine.board = INITIAL_BOARD.map((r) => [...r]); setBoardState(engine.board.map((r) => [...r])); say('放回開局盤面,可以在上面拿掉或移動棋子。'); };

  /** 從一個局面開打(編輯器「開始」/ 載入 / 分享連結都走這裡) */
  const beginCustomGame = (board, turn, me) => {
    engine.loadPosition(board, turn);
    customGameRef.current = true;
    setPlayerColor(me); playerColorRef.current = me;
    setEditing(false);
    setShareUrl('');
    setSelectedPiece(null);
    setHint(null);
    setBoardState(engine.board.map((row) => [...row]));
    if (engine.turn !== me) setTimeout(makeAIMove, 300);   // 先走的是電腦 ⇒ 它先走
  };

  const startFromEditor = () => {
    const v = validatePosition(engine.board, editTurn);
    if (!v.ok) { say('⚠ ' + v.errors.join(';'), true); return; }
    beginCustomGame(engine.board, editTurn, editMe);
  };

  const savePuzzle = () => {
    const v = validatePosition(engine.board, editTurn);
    if (!v.ok) { say('⚠ 先把局面擺對再存:' + v.errors[0], true); return; }
    const name = (puzzleName.trim() || `殘局 ${new Date().toLocaleDateString('zh-TW')}`).slice(0, 30);
    const item = { id: Date.now().toString(36), name, fen: toFen(engine.board, editTurn), me: editMe, at: new Date().toISOString().slice(0, 10) };
    const list = [item, ...puzzles].slice(0, 50);
    if (savePuzzles(list)) { setPuzzles(list); setPickId(item.id); say(`💾 已存「${name}」(存在這台裝置的瀏覽器裡;要給別人用「🔗 分享」)。`); }
    else say('⚠ 存不進去:瀏覽器不讓這個網頁存資料(私密瀏覽常見)。', true);
  };

  const loadPuzzle = () => {
    const p = puzzles.find((q) => q.id === pickId);
    if (!p) return;
    const parsed = fromFen(p.fen);
    if (!parsed) { say('⚠ 這一筆殘局的資料壞了,讀不出來。', true); return; }
    engine.board = parsed.board;
    setEditTurn(parsed.turn);
    if (p.me === 'w' || p.me === 'b') setEditMe(p.me);
    setPuzzleName(p.name);
    setBoardState(engine.board.map((r) => [...r]));
    say(`📂 已載入「${p.name}」——可以再改,或直接按「▶ 開始對弈」。`);
  };

  const deletePuzzle = () => {
    const p = puzzles.find((q) => q.id === pickId);
    if (!p) return;
    if (!window.confirm(`要刪掉「${p.name}」嗎?`)) return;
    const list = puzzles.filter((q) => q.id !== pickId);
    savePuzzles(list);
    setPuzzles(list);
    setPickId('');
    say(`🗑 已刪掉「${p.name}」。`);
  };

  const sharePuzzle = async () => {
    const v = validatePosition(engine.board, editTurn);
    if (!v.ok) { say('⚠ 先把局面擺對再分享:' + v.errors[0], true); return; }
    const url = `${location.origin}${location.pathname}?fen=${encodeURIComponent(toFen(engine.board, editTurn))}&me=${editMe}`;
    setShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      say('🔗 連結已複製!傳給別人,打開就是這個局面(下面那格也可以手動複製)。');
    } catch {
      say('🔗 連結在下面那一格,長按/全選複製後傳給別人,打開就是這個局面。');
    }
  };

  /* 🔗 ?fen= 深連結:別人分享的殘局,打開直接從那個局面開打(和姊妹站 ?daily 同一種「一打開就進去」)。
     ⚠ 字串來自網址,格式不對或不合規則就講一句、留在正常開局,不炸。 */
  useEffect(() => {
    let q;
    try { q = new URLSearchParams(window.location.search); } catch { return; }
    const fen = q.get('fen');
    if (!fen) return;
    const parsed = fromFen(fen);
    if (!parsed) { setTimeout(() => alert('連結裡的殘局資料讀不出來,改開一般對局。'), 300); return; }
    const v = validatePosition(parsed.board, parsed.turn);
    if (!v.ok) { setTimeout(() => alert('連結裡的殘局不合規則:' + v.errors[0] + '。改開一般對局。'), 300); return; }
    beginCustomGame(parsed.board, parsed.turn, q.get('me') === 'b' ? 'b' : 'w');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 🎥 重置視角。★ 一定要**連 target 一起歸零** —— 兩指平移會把注視點拖走,
       只搬相機位置會變成「從新位置看著被拖歪的中心」,比原本更亂(0909 姊妹站同一條)。
     ★ 距離交給 fitCamera 重算,不寫死座標(見上面那段註解)。 */
  const resetCamera = () => {
    if (controlsRef.current) controlsRef.current.target.set(0, 0, 0);
    if (fitRef.current) fitRef.current();
    else if (controlsRef.current) controlsRef.current.update();
  };

  return (
    <div className="app-container">
      <div className={`ui-overlay glass ${panelOpen ? '' : 'panel-collapsed'}`} ref={overlayRef}>
        <button className="panel-toggle" onClick={() => setPanelOpen(!panelOpen)}>
          {panelOpen ? '▲ 收起' : '▼ 展開'}
        </button>
        {panelOpen && (
          <>
            <h1>3D 象棋</h1>
            {editing ? (
              /* 🧩 自訂殘局編輯器(取代平常的控制列,省手機上的高度) */
              <div className="editor" id="editor">
                <div className="editor-row pal" aria-label="調色盤">
                  {PALETTE_RED.map((p) => (
                    <button key={p} type="button" className={`pal-btn red ${editTool === p ? 'on' : ''}`}
                      data-piece={p} title={`放一顆${PIECE_NAME[p]}`} onClick={() => setEditTool(p)}>{PIECE_NAME[p]}</button>
                  ))}
                  {PALETTE_BLACK.map((p) => (
                    <button key={p} type="button" className={`pal-btn ${editTool === p ? 'on' : ''}`}
                      data-piece={p} title={`放一顆${PIECE_NAME[p]}`} onClick={() => setEditTool(p)}>{PIECE_NAME[p]}</button>
                  ))}
                  <button type="button" className={`pal-btn ${editTool === 'erase' ? 'on' : ''}`}
                    data-piece="erase" title="拿掉棋子" onClick={() => setEditTool('erase')}>🗑</button>
                </div>
                <div className="editor-row">
                  <label>先走
                    <select value={editTurn} onChange={(e) => setEditTurn(e.target.value)} aria-label="誰先走">
                      <option value="w">紅方</option><option value="b">黑方</option>
                    </select>
                  </label>
                  <label>我執
                    <select value={editMe} onChange={(e) => setEditMe(e.target.value)} aria-label="我執哪一方">
                      <option value="w">紅方</option><option value="b">黑方</option>
                    </select>
                  </label>
                  <button type="button" onClick={editClear}>清空</button>
                  <button type="button" onClick={editInitial}>開局盤面</button>
                </div>
                <div className="editor-row">
                  <input value={puzzleName} onChange={(e) => setPuzzleName(e.target.value)} maxLength={30}
                    placeholder="殘局名稱(存檔用)" aria-label="殘局名稱" />
                  <button type="button" onClick={savePuzzle}>💾 存</button>
                  <button type="button" onClick={sharePuzzle}>🔗 分享</button>
                </div>
                {puzzles.length > 0 && (
                  <div className="editor-row">
                    <select value={pickId} onChange={(e) => setPickId(e.target.value)} aria-label="我存的殘局">
                      <option value="">— 我存的殘局({puzzles.length})—</option>
                      {puzzles.map((p) => <option key={p.id} value={p.id}>{p.name}({p.at})</option>)}
                    </select>
                    <button type="button" onClick={loadPuzzle} disabled={!pickId}>📂 載入</button>
                    <button type="button" className="danger" onClick={deletePuzzle} disabled={!pickId}>🗑 刪</button>
                  </div>
                )}
                {editMsg.text && <p className={`edit-msg ${editMsg.bad ? 'bad' : ''}`} id="editMsg">{editMsg.text}</p>}
                {shareUrl && <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} aria-label="分享連結" />}
                <div className="editor-row">
                  <button type="button" id="editorStart" className="primary" onClick={startFromEditor}>▶ 開始對弈</button>
                  <button type="button" id="editorExit" onClick={exitEditor}>✕ 離開編輯</button>
                </div>
              </div>
            ) : (
            <>
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
                  <p key={c.v}><b>{c.v}</b>({c.date}) {richText(c.text)}</p>
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
              {/* 🧩 自訂殘局(2026-09-13):自己擺局面 → 存 / 分享 / 跟電腦從這裡下起 */}
              <button id="editorButton" onClick={startEditor} style={{ background: '#b8860b' }} title="自己擺一個局面,存起來、分享,或直接跟電腦下">🧩 自訂殘局</button>
              <button onClick={undo}>悔棋 (Undo)</button>
              <button onClick={saveGame}>存檔 (Save)</button>
              <button onClick={loadGame}>讀檔 (Load)</button>
              <button onClick={resetCamera} style={{ background: '#607D8B' }}>重置視角 (Reset View)</button>
              {/* 🔄 手機上沒有下拉更新可用(整個視窗給了棋盤、頁面不可捲)⇒ 用這顆代替。 */}
              <button onClick={forceRefresh} style={{ background: '#009688' }} title="抓取最新版本並重新整理">🔄 更新 (Refresh)</button>
              {/* 📱 內建瀏覽器(LINE/FB/IG/微信)裡裝不了 ⇒ 不留一顆按了沒反應的鈕,
                     直接換成「怎麼換瀏覽器」的一句話(見上面 IN_APP 那段的三條分寸)。 */}
              {IN_APP ? (
                <p className="in-app-hint">
                  📱 你正用 <b>{IN_APP.n}</b> 的內建瀏覽器開啟 —— 要「安裝 APP」請先點{IN_APP.m}。
                  <b>遊戲本身可以直接玩,不用換!</b>
                </p>
              ) : (
                <button onClick={installApp} style={{ background: '#4CAF50' }}>安裝 APP (Install)</button>
              )}
            </div>
            </>
            )}
          </>
        )}
      </div>

      {/* ⚠ 這裡的 position/fov 只是**掛載時的種子值**;真正的距離與 fov 由下面的
            <FitCamera> 照畫布長寬比重算(R3F 的 camera prop 不是 reactive 的,
            改了 isMobile 它也不會跟著變 —— 別把版面邏輯放在這一行)。 */}
      {/* 📐 舞台:手機上從選單列底下開始(top = 選單列高度),桌機整個畫面。
            R3F 的 Canvas 填滿這個 div,尺寸一變 <FitCamera> 就重算 —— 不必自己聽 resize。 */}
      <div className="stage" id="stage" style={{ top: isMobile ? overlayH : 0 }}>
      <Canvas shadows camera={{ position: [0, 8, 8], fov: isMobile ? 55 : 45 }}>
        <FitCamera is2D={is2D} scale={isMobile ? 1.0 : 1.2} controlsRef={controlsRef} fitRef={fitRef} />
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
              /* 🔴 「這顆吃得到」= 它站在我選中的那顆子的合法落點上,或它就是 AI 提示要吃的那一顆。
                 ⚠ 提示要**連 hash 一起比**(和下面 HintIndicator 同一條):局面一變 hash 就對不上,
                   舊建議自己失效 —— 不然會有一顆棋子在局面變了之後還紅著。 */
              const hintLive = hint && hint.hash === engine.zobristHash;
              const isCapturable =
                availableMoves.some(([mx, my]) => mx === x && my === y)
                || Boolean(hintLive && hint.to[0] === x && hint.to[1] === y);
              return (
                <Piece
                  key={`${x}-${y}-${p}`}
                  x={x} y={y} type={p}
                  selected={isSelected}
                  capturable={isCapturable}
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
        {/* ⚠⚠ minPolarAngle 會把 fitCamera 設的俯角**夾住**(極角 = 90° − 俯角)。
              2026-09-10 實錘:這裡原本是 Math.PI/6(30° 極角 = 俯角上限 60°),
              而 fitCamera 設的是 75° ⇒ 實際渲染出來量到 60.0°,使用者看到的是被夾過的角度,
              測試卻只斷言「常數寫了 75」所以全綠。改俯角時這一行一定要一起看。
              現在放寬到 5° 極角(= 俯角上限 85°),容得下 DIR_3D_ELEVATION_DEG=82,
              也還留一點手動再轉陡的空間;不設 0 是為了離正上方的萬向鎖遠一點。
            🖐 rotateSpeed:預設 1.0 在手機上太快(使用者:「棋盤旋轉太快太靈敏」)——
              旋轉量 = 2π × 拖曳像素 ÷ 容器高 × rotateSpeed,直向手機劃 150px 就轉掉 64°。
              觸控裝置降到 0.2(2026-09-10 使用者第二次反映「降靈敏都過高」,從 0.4 再砍半;那邊實測
              150px 從 64° 降到 25°);滑鼠維持 1.0,桌機按著拖有精度,一起調慢反而難用。 */}
        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          enableRotate={true}
          rotateSpeed={IS_COARSE_POINTER ? 0.2 : 1.0}
          minPolarAngle={is2D ? 0.01 : Math.PI / 36}
          maxPolarAngle={is2D ? 0.01 : Math.PI / 2.5}
          minDistance={5}
          maxDistance={25}
        />
        <Environment preset="city" />
      </Canvas>
      </div>
    </div>
  );
}

export default App;
