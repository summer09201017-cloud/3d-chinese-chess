/* 📐 相機距離**照畫布長寬比算**,不可以寫死(2026-09-09 使用者實機退件:
     「3d-chinese-chess 直向兩側被切,邊路的砲馬只剩半顆」)。

   病根:原本三個地方都寫死座標 —— Canvas 初值 `[0,8,8]`、2D `(0,16,0.01)`、3D `(0,10,10)`
   —— 只有寬螢幕剛好裝得下。手機直向 390×844(aspect 0.46)時,水平視角只剩
   `atan(tan(55°/2) × 0.46)` ≈ **13.5°**,而棋盤半寬 4.5 需要 4.5/tan(13.5°) ≈ **18.7** 的距離,
   寫死的 8~10 差了一倍 ⇒ 左右各被切掉一路多。

   ⚠ **修好之後棋盤會「略小」** —— 那是正確的:九路全看得到 > 中間幾路很大。
     (姊妹站 0909 同一條:別為了「棋子大一點」把相機推近,那是用切掉邊路換來的。)

   ★ 這支刻意**不 import three**:純陣列數學 ⇒ 可以在 Node 直接跑測試
     (`test/fit.mjs` 對每個裝置尺寸斷言「整張盤都在視錐內」),不必開瀏覽器。
*/

import { BOARD_W, BOARD_D } from './boardLayout.js';

/** 棋盤在世界座標的半尺寸(和 Board.jsx 的 boxGeometry 同一組數字,盤面在 y=0)。 */
export const BOARD = {
  halfX: BOARD_W / 2,   // 9 寬 ÷ 2
  /* 2026-09-10:深度從 10 改成 8.5(行距 0.85,對齊姊妹站的視覺比例)——
     橫式的 fit 是被深度卡住的,深度短了鏡頭才靠得近、寬度才填得滿。
     2026-09-13:行距再拉到 0.92(棋子前後不再貼著),深度 9.2;見 boardLayout.js。 */
  halfZ: BOARD_D / 2,
  top: 0.55,    // 棋子最高處(底座 -0.175 ~ 頂面 0.125,再留一點餘裕)
  bottom: -0.4, // 盤的厚度(boxGeometry 中心在 y=-0.2,厚 0.4)
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** 兩個標準方向(取代原本三處寫死的座標)。2D 是幾乎正上方,留一點 z 避開萬向鎖。 */
export const DIR_2D = norm([0, 1, 0.001]);
/* 2026-09-10 使用者:「重置視角還需要朝上順時鐘再轉 30 度」——從原本 45° 俯角加 30°
   變成 75°(更接近正上方)。順手解決了另一條反映:「後排黑色棋子的字太小,看不清楚」——
   文字是平貼在棋子頂面朝上的(rotation={[-Math.PI/2,0,0]}),45° 斜看時越遠的那排字
   被壓得越扁;角度越接近正上方,近排跟遠排的字被壓扁的程度差距越小,遠排字自然變清楚。
   ⚠ 角度變陡,「剛好不裁切」需要的距離也會跟著變(横式螢幕變長,直向螢幕反而變短),
   不是純粹的「棋盤變大」,是「用同一份安全鐵則,換一個角度重新算」。 */
/* 2026-09-10 曾定在 62°,是「兩個要求同時滿足」算出來的:
     · 使用者先要「俯角再陡一點」(為了後排的字看得清楚)
     · 後來又要「橫式棋盤至少跟 3d-xiangqi / xiangqi-arena 一樣寬」
   這兩件事**方向相反**:角度越陡,①fit 需要的距離越長 ②最靠近鏡頭那排的透視放大越少
   ⇒ 棋盤看起來越窄。62° 是當時「還能達到寬度要求的最陡角度」。
   2026-09-13 使用者:「手機版橫式棋盤再朝玩家轉 5 度」⇒ 62° → **57°**(鏡頭放低 5 度,
   更像坐在棋盤前面看;姊妹站是 atan(90/60)=56.3°,三站從此幾乎同一個角度)。
   ★ 放低 5 度會讓後排字再扁一點 —— 這一輪同時把鏡頭拉近了 20%+(見 fitLandscape),
     後排相鄰直線的螢幕間距從 36px 變 39px,字反而比 62° 那版**更大**,兩邊都沒犧牲。
   ★ 這個數字設了不代表生效——見下面 minPolarAngle 那段警告。 */
export const DIR_3D_ELEVATION_DEG = 57;
export const DIR_3D = norm([0, Math.tan((DIR_3D_ELEVATION_DEG * Math.PI) / 180), 1]);

/* ⚠⚠ 2026-09-10 血淋淋的教訓:這個角度設了**不代表生效**。
   OrbitControls 的 `minPolarAngle` 會把相機的極角夾住(極角 = 90° − 俯角),
   App.jsx 原本寫 `minPolarAngle={Math.PI/6}`(30° 極角 = 俯角最多 60°)
   ⇒ 我上一輪把這裡設成 75°,實際渲染出來量到的是 **60.0°**,使用者看到的是被夾過的角度,
     而 test/fit.mjs 只斷言「常數是 75」所以全綠 —— 測到的是「我寫了什麼」不是「畫出來什麼」。
   ⇒ 改這個角度時**一定要同步檢查 App.jsx 的 minPolarAngle 容不容得下**,
     並且用 scripts/check-mobile-ui.mjs 那條真瀏覽器斷言量 `window.__anchess.camElevation`。 */

/** 相機的三軸(right / up / 由注視點指向相機的 d)。正上方視角 dir ∥ worldUp 時換參考軸,避免 NaN。 */
function axes(dir) {
  const d = norm(dir);
  const worldUp = [0, 1, 0];
  /* ⚠ 正上方視角時 dir ∥ worldUp ⇒ cross 幾乎是零向量,normalize 會炸成 NaN
       (而 NaN 的相機位置**不會報錯**,只會讓畫面整片空白 —— 最難查的那種)。
       ⇒ 長度太小就換一個參考軸。 */
  let right = cross(worldUp, d);
  if (len(right) < 1e-6) right = [1, 0, 0];
  right = norm(right);
  const up = norm(cross(d, right));
  return { d, right, up };
}

/** 棋盤外接盒的 8 個角(乘上場景縮放) */
function corners(board, scale) {
  const out = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [board.bottom, board.top]) {
    out.push([sx * board.halfX * scale, y * scale, sz * board.halfZ * scale]);
  }
  return out;
}

/**
 * 算「要退多遠才裝得下整張棋盤」(注視點固定在原點)。
 * 作法 = 把棋盤外接盒的 8 個角投到相機的三軸上,對每個角算它各自需要的距離,取最大。
 * 這比「用外接球」精準(外接球在斜視角會保守 15~20%),而且對任何視角都成立。
 *
 * @param {object} o
 * @param {number} o.fovDeg  垂直視角(度)
 * @param {number} o.aspect  畫布寬 ÷ 高
 * @param {number[]} o.dir   從注視點指向相機的**單位**向量
 * @param {number} [o.scale] 場景 group 的縮放(本站桌機 1.2 / 手機 1.0)
 * @param {number} [o.margin] 邊界餘裕(1.04 = 留 4%)
 * @returns {number} 距離
 */
export function requiredDistance({ fovDeg, aspect, dir, scale = 1, margin = 1.04, board = BOARD }) {
  const { d, right, up } = axes(dir);
  const tanV = Math.tan((fovDeg * Math.PI) / 180 / 2);
  const tanH = tanV * aspect;

  let need = 0;
  for (const c of corners(board, scale)) {
    const v = sub(c, [0, 0, 0]);          // 注視點固定在原點
    const X = Math.abs(dot(v, right));
    const Y = Math.abs(dot(v, up));
    const Z = dot(v, d);                   // 正 = 朝相機那一側(比較近 ⇒ 需要退更多)
    need = Math.max(need, X / tanH + Z, Y / tanV + Z);
  }
  return need * margin;
}

/**
 * 8 個角投到相機平面後,最外側那一個佔畫面半寬/半高的比例(1 = 剛好碰到邊,>1 = 被裁)。
 * 和 test/fit.mjs 的 project() 是同一套算法 —— 這裡是「拿它來找距離」,那裡是「拿它來驗」。
 */
export function worstCorner({ fovDeg, aspect, dir, dist, target = [0, 0, 0], scale = 1, board = BOARD }) {
  const { d, right, up } = axes(dir);
  const cam = [target[0] + d[0] * dist, target[1] + d[1] * dist, target[2] + d[2] * dist];
  const tanV = Math.tan((fovDeg * Math.PI) / 180 / 2);
  const tanH = tanV * aspect;
  let worst = 0;
  for (const c of corners(board, scale)) {
    const v = sub(c, cam);
    const depth = -dot(v, d);              // 相機看的方向是 -d
    if (depth <= 1e-6) return Infinity;    // 在相機後面 = 一定看不到
    worst = Math.max(worst, Math.abs(dot(v, right)) / (depth * tanH), Math.abs(dot(v, up)) / (depth * tanV));
  }
  return worst;
}

/* 📱 橫式(3D、aspect ≥ 1)的 fit(2026-09-13 重寫)。
   ─ 由來 ─
   0910 使用者拿三站截圖比對「這站橫式棋盤比較小」,當時改用姊妹站那款「棋盤攤平配 fov」
   的簡化公式 × 1.10 margin,底排寬度做到 47.0%(剛好贏過姊妹站的 46.8%)。
   0913 使用者再要:「棋盤再寬一點、高一點、大一點,棋子間的距離再拉大一點」。
   ─ 真因 ─
   斜著看的棋盤,**靠鏡頭那一排投影得大、遠那一排投影得小**;注視點釘在棋盤幾何中心
   ⇒ 畫面上「棋盤的中心」其實偏上:上面留一大片空白、下面卻頂到邊。量 844×390:
   注視原點時上下留白差了約 2.4 倍,而 fit 是被「最貼近鏡頭那一排的棋子頂面」卡住的。
   ─ 修法 ─
   注視點沿棋盤深度方向(世界 z,朝玩家這一側)掃一遍,對每個注視點二分搜「8 個角都不裁」
   的最小距離,取距離最小的那一組 ⇒ 投影後的棋盤在畫面裡上下平均,鏡頭就能靠近。
   實測 844×390(行距 0.92、俯角 57°):
     注視原點        距離 11.8 → 底排寬 46.7% / 棋盤高 72% / 後排直線間距 36px
     注視偏移 +1.0   距離  9.5 → 底排寬 58%   / 棋盤高 83% / 後排直線間距 39px
   ⇒ 更寬、更高、更大、後排字也更大,而且 8 個角一個都沒裁(比舊的簡化公式還安全:
     那一款在極端橫式尺寸下 worst≈1.03,這一款每一個尺寸都 ≤ 1/margin)。
   ★ margin 1.03 留 3% —— 貼近鏡頭那一排的棋子頂面邊角不該貼著螢幕邊。
   ★ 直向(aspect < 1)與 2D **不走這裡**:直向是寬度卡住,上下本來就有餘裕,
     注視點偏移只會讓棋盤在畫面上偏下;0909「邊路砲馬只剩半顆」的 8 角精算法照舊。 */
export const LANDSCAPE_MARGIN = 1.03;
export const LANDSCAPE_SHIFT_MAX = 2.5;     // 注視點最多往玩家這側偏多少(掃描上限;844×390 落在 +1.0、1024×768 約 +1.6)

export function fitLandscape({ fovDeg, aspect, dir, scale = 1, board = BOARD, margin = LANDSCAPE_MARGIN }) {
  let best = null;
  const step = 0.05 * scale;
  for (let tz = 0; tz <= LANDSCAPE_SHIFT_MAX * scale + 1e-9; tz += step) {
    const target = [0, 0, tz];
    let lo = 0.5, hi = 80;                 // 二分搜「worst ≤ 1」的最小距離
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      if (worstCorner({ fovDeg, aspect, dir, dist: mid, target, scale, board }) <= 1) hi = mid;
      else lo = mid;
    }
    if (!best || hi < best.dist) best = { dist: hi, tz };
  }
  return { dist: best.dist * margin, target: [0, 0, best.tz] };
}

/** controls.target 可能是 THREE.Vector3(有 set)也可能是測試用的 {x,y,z} */
function setTarget(controls, t) {
  if (!controls || !controls.target) return;
  if (typeof controls.target.set === 'function') controls.target.set(t[0], t[1], t[2]);
  else { controls.target.x = t[0]; controls.target.y = t[1]; controls.target.z = t[2]; }
}

/**
 * 把相機擺到「剛好裝得下」的位置。只動距離、注視點與(必要時)方向。
 * @param {object} camera  THREE.PerspectiveCamera
 * @param {object} controls OrbitControls(可為 null)
 * @param {object} o
 * @param {boolean} o.is2D
 * @param {number} o.aspect
 * @param {number} [o.scale]
 * @param {boolean} [o.keepDirection] true = 保留使用者轉到的角度,只重算距離(resize 用)
 */
export function fitCamera(camera, controls, { is2D, aspect, scale = 1, keepDirection = false }) {
  if (!camera) return null;
  const target = controls && controls.target ? controls.target : { x: 0, y: 0, z: 0 };

  let dir;
  if (keepDirection) {
    const v = [camera.position.x - target.x, camera.position.y - target.y, camera.position.z - target.z];
    dir = len(v) > 1e-6 ? norm(v) : (is2D ? DIR_2D : DIR_3D);
  } else {
    dir = is2D ? DIR_2D : DIR_3D;
  }

  /* fov 也在這裡設定:R3F 的 `camera={{ fov }}` **只在掛載時套用一次**(它自己會警告
     camera 不是 reactive 的)⇒ 手機↔桌機跨過 768px 時 fov 不會跟著變。
     在這裡明確設 ⇒ 轉向、拖窗、換裝置都一致。 */
  camera.fov = is2D ? 45 : (aspect < 1 ? 55 : 45);

  let d;
  let tgt;
  if (!is2D && aspect >= 1) {
    const r = fitLandscape({ fovDeg: camera.fov, aspect, dir, scale });
    d = r.dist;
    tgt = r.target;
  } else {
    d = requiredDistance({ fovDeg: camera.fov, aspect, dir, scale });
    tgt = [0, 0, 0];                       // 直向 / 2D:注視棋盤中心(從橫式轉回來時把偏移收掉)
  }
  setTarget(controls, tgt);

  camera.position.set(tgt[0] + dir[0] * d, tgt[1] + dir[1] * d, tgt[2] + dir[2] * d);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();

  if (controls) {
    /* ⚠ maxDistance 若比算出來的距離小,`controls.update()` 會把相機**拉回來**
         ⇒ 又切掉邊路,而且看起來像「fit 沒生效」。⇒ 上限跟著放寬。 */
    if (typeof controls.maxDistance === 'number' && controls.maxDistance < d * 1.25) {
      controls.maxDistance = d * 1.25;
    }
    controls.update();
  }
  return d;
}
