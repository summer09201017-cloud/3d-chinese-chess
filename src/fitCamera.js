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

/** 棋盤在世界座標的半尺寸(Board.jsx 的 boxGeometry 是 [9, 0.4, 10],盤面在 y=0)。 */
export const BOARD = {
  halfX: 4.5,   // 9 寬 ÷ 2
  halfZ: 5.0,   // 10 深 ÷ 2
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
   ⚠ 角度變陡,「剛好不裁切」需要的距離也會跟著變(横式螢幕變長,直向螢幕反而變短
   ——見下面 fitCamera 橫式那段的 margin 為什麼跟著調),不是純粹的「棋盤變大」,
   是「用同一份安全鐵則,換一個角度重新算」。 */
/* 2026-09-10 使用者最後拍板 75°。★ 這個數字之前「設了沒生效」——被 OrbitControls 的
   minPolarAngle 夾成 60°(見下面那段警告),所以使用者看到的一直不是 75°。
   這一輪把 App.jsx 的夾角放寬到 5° 極角(俯角上限 85°),75° 才真的畫得出來。 */
export const DIR_3D_ELEVATION_DEG = 75;
export const DIR_3D = norm([0, Math.tan((DIR_3D_ELEVATION_DEG * Math.PI) / 180), 1]);

/* ⚠⚠ 2026-09-10 血淋淋的教訓:這個角度設了**不代表生效**。
   OrbitControls 的 `minPolarAngle` 會把相機的極角夾住(極角 = 90° − 俯角),
   App.jsx 原本寫 `minPolarAngle={Math.PI/6}`(30° 極角 = 俯角最多 60°)
   ⇒ 我上一輪把這裡設成 75°,實際渲染出來量到的是 **60.0°**,使用者看到的是被夾過的角度,
     而 test/fit.mjs 只斷言「常數是 75」所以全綠 —— 測到的是「我寫了什麼」不是「畫出來什麼」。
   ⇒ 改這個角度時**一定要同步檢查 App.jsx 的 minPolarAngle 容不容得下**,
     並且用 scripts/check-mobile-ui.mjs 那條真瀏覽器斷言量 `window.__anchess.camElevation`。 */

/**
 * 算「要退多遠才裝得下整張棋盤」。
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
  const d = norm(dir);
  const worldUp = [0, 1, 0];
  /* ⚠ 正上方視角時 dir ∥ worldUp ⇒ cross 幾乎是零向量,normalize 會炸成 NaN
       (而 NaN 的相機位置**不會報錯**,只會讓畫面整片空白 —— 最難查的那種)。
       ⇒ 長度太小就換一個參考軸。 */
  let right = cross(worldUp, d);
  if (len(right) < 1e-6) right = [1, 0, 0];
  right = norm(right);
  const up = norm(cross(d, right));

  const tanV = Math.tan((fovDeg * Math.PI) / 180 / 2);
  const tanH = tanV * aspect;

  let need = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (const y of [board.bottom, board.top]) {
        const c = [sx * board.halfX * scale, y * scale, sz * board.halfZ * scale];
        const v = sub(c, [0, 0, 0]);          // 注視點固定在原點
        const X = Math.abs(dot(v, right));
        const Y = Math.abs(dot(v, up));
        const Z = dot(v, d);                   // 正 = 朝相機那一側(比較近 ⇒ 需要退更多)
        need = Math.max(need, X / tanH + Z, Y / tanV + Z);
      }
    }
  }
  return need * margin;
}

/**
 * 把相機擺到「剛好裝得下」的位置。只動距離與(必要時)方向,不動注視點以外的東西。
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
  /* 📱 橫式棋盤比姊妹站(3D-Xiangqi / xiangqi-arena)小(2026-09-10 使用者拿三站截圖比對出來的)。
     量出來的真因:8 角精算法(下面 requiredDistance)是對的——它保證連「最貼近鏡頭那顆棋子的
     頂面邊角」都不會被切,這件事在**直向**極窄畫面(0909 那次「邊路砲馬只剩半顆」的退件)
     非常重要,不能動。但橫式時它比姊妹站那種「棋盤攤平當 2D 矩形去配 fov」的簡化算法保守
     不少,保守到肉眼看得出「同樣棋子,這站比較小」。
     ⇒ 只在「3D + 橫式(aspect≥1)」改用姊妹站那款簡化公式,直向與 2D 模式完全不動
       (那兩種情況原本就沒有這個「太保守」的抱怨,亂動反而會把 0909 那個舊病引回來)。
     ⚠ 這個簡化公式**確實**比 8 角精算法少留一點餘裕(test/fit.mjs 量到橫向極端尺寸下
       worst≈1.03,即約 3% 的角落理論上會超出視錐一點點)——跟姊妹站长期使用、没人反映
       裁切的那個算法是**同一條公式**,同一等級的風險,不是憑空降低標準。 */
  let d;
  if (!is2D && aspect >= 1) {
    const halfFovFlat = (camera.fov * Math.PI) / 180 / 2;
    const boardWFlat = BOARD.halfX * 2 * scale;
    const boardHFlat = BOARD.halfZ * 2 * scale;
    const distForH = (boardHFlat / 2) / Math.tan(halfFovFlat);
    const distForW = (boardWFlat / 2) / Math.tan(halfFovFlat) / aspect;
    /* ⚠ 2026-09-10 俯角從 45° 改到 75° 之後,這個 margin 從 1.04 補到 1.10——
       角度變陡,8 角精算法量到的「剛好不裁切」距離在橫式螢幕會跟著變長(844×390 從
       12.47 變 13.14,漲了約 5%),這裡的簡化公式如果還沿用舊 margin 會變得不夠安全。
       1.10 是量過 75° 角、多種橫式尺寸後留的餘裕,不是隨手調的數字。 */
    d = Math.max(distForH, distForW) * 1.10;
  } else {
    d = requiredDistance({ fovDeg: camera.fov, aspect, dir, scale });
  }

  camera.position.set(target.x + dir[0] * d, target.y + dir[1] * d, target.z + dir[2] * d);
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
