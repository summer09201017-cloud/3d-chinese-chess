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
export const DIR_3D = norm([0, 1, 1]);      // 45° 俯角,和原本 (0,10,10) 同一個角度

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
  const d = requiredDistance({ fovDeg: camera.fov, aspect, dir, scale });

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
