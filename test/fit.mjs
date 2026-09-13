/* 📐 test/fit.mjs — 守「整張棋盤真的裝得進畫面」(0909 立)
 *
 * 由來:使用者實機截圖「直向兩側被切,邊路的砲馬只剩半顆」。三處相機座標都寫死,
 *   只有寬螢幕裝得下。這支不開瀏覽器,直接對 fitCamera 的純數學反算:
 *   把棋盤 8 個角**投影**到算出來的相機的視錐裡,斷言每個角的 |x| <= 半寬、|y| <= 半高。
 *   ⇒ 「裝不裝得下」變成一個算得出來的數字,不是目測截圖。
 *
 * ⚠ 這支刻意驗**投影後的座標**而不是「距離有沒有變大」——
 *   驗距離只能證明「我改了」,證不了「夠了」。
 * ⚠ 2026-09-13 起橫式的注視點**不在原點**(fitLandscape 會沿 z 偏移)⇒ 投影一律用
 *   fit 之後 controls.target 的真實值,不要再假設注視原點。
 */
import { requiredDistance, fitCamera, BOARD, DIR_2D, DIR_3D, LANDSCAPE_MARGIN } from '../src/fitCamera.js';

let pass = 0, fail = 0;
const ok = (c, m, n = '') => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m + (n ? ' → ' + n : '')); } };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const hyp = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = hyp(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** 把一個世界座標點投到相機平面,回傳 NDC 式的 (x, y) 比例(1 = 剛好在邊緣;y 帶正負,正=上)。 */
function project(point, camPos, target, fovDeg, aspect) {
  const fwd = norm(sub(target, camPos));               // 相機看的方向
  let right = cross(fwd, [0, 1, 0]);
  if (hyp(right) < 1e-6) right = [1, 0, 0];
  right = norm(right);
  const up = norm(cross(right, fwd));

  const v = sub(point, camPos);
  const z = dot(v, fwd);                                // 前方深度
  if (z <= 0) return { x: Infinity, y: Infinity, z };   // 在相機後面 = 一定看不到
  const tanV = Math.tan((fovDeg * Math.PI) / 180 / 2);
  const tanH = tanV * aspect;
  return { x: Math.abs(dot(v, right)) / (z * tanH), y: dot(v, up) / (z * tanV), z };
}

function corners(scale) {
  const out = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [BOARD.bottom, BOARD.top]) {
    out.push([sx * BOARD.halfX * scale, y * scale, sz * BOARD.halfZ * scale]);
  }
  return out;
}

const fakeCamera = (aspect) => ({
  fov: 45, aspect, position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
  updateProjectionMatrix() {},
});
const fakeControls = () => ({ target: { x: 0, y: 0, z: 0 }, maxDistance: 25, update() {} });
const camOf = (c) => [c.position.x, c.position.y, c.position.z];
const tgtOf = (ctl) => [ctl.target.x, ctl.target.y, ctl.target.z];

/** fit 之後 8 個角的最壞值(0~1)、最高點與最低點(帶正負,上=正) */
function fitAndMeasure({ w, h, scale, is2D }) {
  const aspect = w / h;
  const fake = fakeCamera(aspect);
  const controls = fakeControls();
  const d = fitCamera(fake, controls, { is2D, aspect, scale });
  let worst = 0, top = -Infinity, bottom = Infinity;
  for (const p of corners(scale)) {
    const pr = project(p, camOf(fake), tgtOf(controls), fake.fov, aspect);
    worst = Math.max(worst, pr.x, Math.abs(pr.y));
    top = Math.max(top, pr.y); bottom = Math.min(bottom, pr.y);
  }
  return { d, worst, top, bottom, fake, controls, aspect };
}

/* ── 各種真實裝置尺寸:每一個都要「整張盤都在畫面內」 ── */
const CASES = [
  { name: 'iPhone 直向 390x844', w: 390, h: 844, scale: 1.0, is2D: false },
  { name: 'iPhone 橫向 844x390', w: 844, h: 390, scale: 1.0, is2D: false },
  { name: 'iPhone 橫向、選單收起後的舞台 844x356', w: 844, h: 356, scale: 1.0, is2D: false },
  { name: 'Android 直向 360x800', w: 360, h: 800, scale: 1.0, is2D: false },
  { name: 'Android 橫向 800x360', w: 800, h: 360, scale: 1.0, is2D: false },
  { name: '窄長 320x900(最極端)', w: 320, h: 900, scale: 1.0, is2D: false },
  { name: 'iPad 直向 768x1024', w: 768, h: 1024, scale: 1.0, is2D: false },
  { name: 'iPad 橫向 1024x768', w: 1024, h: 768, scale: 1.0, is2D: false },
  { name: '桌機 1440x900', w: 1440, h: 900, scale: 1.2, is2D: false },
  { name: '直向 2D 模式 390x844', w: 390, h: 844, scale: 1.0, is2D: true },
  { name: '桌機 2D 模式 1440x900', w: 1440, h: 900, scale: 1.2, is2D: true },
];

console.log('\n── ① 每個裝置尺寸:棋盤 8 個角都在視錐內 ──');
for (const c of CASES) {
  const { d, worst } = fitAndMeasure(c);
  ok(worst <= 1.0, `${c.name}:最外側的角落在畫面內(佔滿 ${(worst * 100).toFixed(1)}%,距離 ${d.toFixed(1)})`,
    `worst=${worst.toFixed(3)}`);
  // 別退太遠:不然棋盤變成畫面中央一小塊
  ok(worst >= 0.7, `${c.name}:也沒有退太遠(至少佔滿 70%)`, `worst=${worst.toFixed(3)}`);
}

console.log('\n── ② 寫死座標的反例:證明舊版真的裝不下 ──');
{
  const aspect = 390 / 844;
  // 舊版:3D 用 (0,10,10)
  let worst = 0;
  for (const p of corners(1.0)) {
    const pr = project(p, [0, 10, 10], [0, 0, 0], 55, aspect);
    worst = Math.max(worst, pr.x, Math.abs(pr.y));
  }
  ok(worst > 1.0, `舊版寫死 (0,10,10) 在 390x844 **裝不下**(要 ${(worst * 100).toFixed(0)}% 的畫面)`,
    `worst=${worst.toFixed(3)}`);
}

console.log('\n── ③ 純數學的邊界條件 ──');
{
  const dNarrow = requiredDistance({ fovDeg: 55, aspect: 390 / 844, dir: DIR_3D });
  const dWide = requiredDistance({ fovDeg: 45, aspect: 1440 / 900, dir: DIR_3D, scale: 1.2 });
  ok(dNarrow > dWide, `窄畫面要退得比寬畫面遠(${dNarrow.toFixed(1)} > ${dWide.toFixed(1)})`);
  const d2D = requiredDistance({ fovDeg: 45, aspect: 390 / 844, dir: DIR_2D });
  ok(Number.isFinite(d2D) && d2D > 0, `正上方視角不會算出 NaN(${d2D.toFixed(1)})`,
    '⚠ dir ∥ worldUp 時 cross 是零向量,沒守就會 NaN,而 NaN 相機不報錯、畫面直接空白');
}

console.log('\n── ④ 橫式棋盤要比「注視原點的 8 角精算法」敢貼近(0910 起),而且依然不裁 ──');
{
  /* 2026-09-10 使用者拿三站截圖比對:本站橫式棋盤明顯比另外兩站小。0913 改成
     fitLandscape(注視點沿 z 掃描 + 二分搜最小距離),這裡守兩件事:
       ①真的比「注視原點」的 8 角精算法距離更近(棋盤看起來更大)②依然不裁切(≤100%)。
     直向(見上面①的斷言)完全沒被這次改動碰到,继续用 8 角精算法。 */
  const aspect = 844 / 390;
  const distExact = requiredDistance({ fovDeg: 45, aspect, dir: DIR_3D, scale: 1.0, margin: 1.0 });
  const { d: distFit, worst } = fitAndMeasure({ w: 844, h: 390, scale: 1.0, is2D: false });
  ok(distFit < distExact, `★ 橫式(844x390)真的比注視原點的精算法貼近了(${distFit.toFixed(1)} < ${distExact.toFixed(1)})`);
  ok(worst <= 1.0, `★★ 貼近之後依然沒裁切(佔滿 ${(worst * 100).toFixed(1)}%)`, `worst=${worst.toFixed(3)}`);
  ok(worst >= 0.9, '★ 而且真的「貼近」了,不是換公式换假的(至少佔滿 90%)', `worst=${worst.toFixed(3)}`);
  ok(Math.abs(worst - 1 / LANDSCAPE_MARGIN) < 0.01,
    `★ 最外側的角剛好停在 1/margin(留 ${((LANDSCAPE_MARGIN - 1) * 100).toFixed(0)}% 餘裕,不多不少)`, `worst=${worst.toFixed(3)}`);
}

console.log('\n── ⑤ 俯角是 57 度(2026-09-13 使用者:「手機版橫式棋盤再朝玩家轉 5 度」;0910 是 62°)──');
{
  const elevationDeg = Math.atan2(DIR_3D[1], DIR_3D[2]) * 180 / Math.PI;
  ok(Math.abs(elevationDeg - 57) < 0.5, `★ DIR_3D 俯角是 57°(量到 ${elevationDeg.toFixed(1)}°)`);
}

/** 最靠近鏡頭那一排(最底線)的左右跨距,佔畫面寬的 %(camPos/target 都給真實值) */
function frontSpanPct(boardW, boardD, camPos, target, aspect, fovDeg = 45) {
  const tanH = Math.tan((fovDeg * Math.PI) / 180 / 2) * aspect;
  const fwd = norm(sub(target, camPos));
  const right = norm(cross(fwd, [0, 1, 0]));
  const px = (p) => { const v = sub(p, camPos); return dot(v, right) / (dot(v, fwd) * tanH); };
  const hx = (boardW / 2) * (8 / 9), zF = (boardD / 2) * (9 / 10);
  return (Math.abs(px([hx, 0, zF]) - px([-hx, 0, zF])) / 2) * 100;
}

console.log('\n── ⑥ 橫式棋盤至少要跟姊妹站一樣寬(2026-09-10 使用者的原話)──');
{
  /* 使用者:「3d-chinese-chess 橫式棋盤要更寬,至少跟 3d-xiangqi.pages.dev 與
     incandescent-stroopwafel-31007a 一樣寬」。
     ★ 這裡用**同一套投影數學**去算兩邊「最靠近鏡頭那一排的螢幕跨距」——
       不用截圖比對:兩站棋盤顏色不同,顏色偵測會被版本徽章之類的亮色污染,
       0910 就是這樣一度量出 53.8%(實際 46.8%)害我追錯方向。
     姊妹站(3D-Xiangqi / xiangqi-arena 同一份 renderer):
       SQUARE_SIZE_X=10、SQUARE_SIZE_Y=8.5、棋盤 90×85、俯角 atan(90/60)=56.3°、
       fit = max(distForH, distForW) × 1.02 × 1.06(boardW/H 各多留半格)、注視原點。 */
  const W = 844, H = 390, aspect = W / H, tanV = Math.tan((45 * Math.PI) / 180 / 2);
  const SX = 10, SY = 8.5, BW = 9 * SX, BH = 10 * SY;
  const refDist = Math.max(((BH + SY * 0.5) / 2) / tanV, ((BW + SX * 0.5) / 2) / tanV / aspect) * 1.02 * 1.06;
  const refDir = norm([0, 90, 60]);
  const refSpan = frontSpanPct(BW, BH, [0, refDir[1] * refDist, refDir[2] * refDist], [0, 0, 0], aspect);

  const { fake, controls } = fitAndMeasure({ w: W, h: H, scale: 1.0, is2D: false });
  const oursSpan = frontSpanPct(BOARD.halfX * 2, BOARD.halfZ * 2, camOf(fake), tgtOf(controls), aspect);

  ok(oursSpan >= refSpan,
    `★★ 橫式底排寬 ${oursSpan.toFixed(1)}% ≥ 姊妹站的 ${refSpan.toFixed(1)}%(使用者的驗收標準)`,
    `ours=${oursSpan.toFixed(2)} ref=${refSpan.toFixed(2)}`);
}

console.log('\n── ⑦ 0913 使用者的四句話:更寬、更高、更大、棋子間距拉開 ──');
{
  /* 0910 那版(62°、行距 0.85、簡化公式 ×1.10、注視原點)在 844×390 量到:
       底排寬 47.0%、棋盤格線區高 74.1%、前排相鄰橫線 42.5px、後排相鄰直線 36.0px。
     這裡把那四個數字當**地板**:新版每一個都要贏過它,不然就是白改。 */
  const OLD = { front: 47.0, height: 74.1, frontRank: 42.5, backFile: 36.0 };
  const W = 844, H = 390;
  const { fake, controls, aspect, top, bottom } = fitAndMeasure({ w: W, h: H, scale: 1.0, is2D: false });
  const cam = camOf(fake), tgt = tgtOf(controls);
  const g = (x, y) => [(x - 4) * 1, (y - 4.5) * (BOARD.halfZ * 2 / 10)];
  const P = (x, y) => { const [wx, wz] = g(x, y); return project([wx, 0, wz], cam, tgt, fake.fov, aspect); };
  const sx = (a, b) => Math.abs(project(a, cam, tgt, fake.fov, aspect).x - project(b, cam, tgt, fake.fov, aspect).x);
  const front = frontSpanPct(BOARD.halfX * 2, BOARD.halfZ * 2, cam, tgt, aspect);
  const height = Math.abs(P(4, 0).y - P(4, 9).y) / 2 * 100;
  const frontRank = Math.abs(P(4, 8).y - P(4, 9).y) / 2 * H;
  const backFile = sx([g(0, 0)[0], 0, g(0, 0)[1]], [g(1, 0)[0], 0, g(1, 0)[1]]) / 2 * W;
  ok(front > OLD.front + 3, `★ 更寬:底排 ${front.toFixed(1)}%(0910 版 ${OLD.front}%)`);
  ok(height > OLD.height + 3, `★ 更高:棋盤格線區佔畫面高 ${height.toFixed(1)}%(0910 版 ${OLD.height}%)`);
  ok(frontRank > OLD.frontRank + 5, `★ 更大 / 間距拉開:前排相鄰橫線 ${frontRank.toFixed(1)}px(0910 版 ${OLD.frontRank}px)`);
  ok(backFile >= OLD.backFile, `★ 後排的字沒有變小:後排相鄰直線 ${backFile.toFixed(1)}px(0910 版 ${OLD.backFile}px)`);
  ok(tgt[2] > 0.5, `★ 注視點真的往玩家這側偏了(z=${tgt[2].toFixed(2)}),不是注視原點`);
  ok(Math.abs(top - Math.abs(bottom)) < 0.05,
    `★ 投影後上下平均(最高點 ${top.toFixed(3)} / 最低點 ${bottom.toFixed(3)})—— 這就是鏡頭能靠近的原因`);
  ok(BOARD.halfZ * 2 / 10 > 0.9, `★ 行距 ${(BOARD.halfZ * 2 / 10).toFixed(2)} > 0.9(棋子最寬 0.80 ⇒ 前後至少留 0.1 的縫)`);
}

console.log('\n── ⑧ 直向與 2D 完全沒被 0913 這輪碰到 ──');
{
  for (const c of [{ w: 390, h: 844, scale: 1.0, is2D: false }, { w: 390, h: 844, scale: 1.0, is2D: true }]) {
    const { controls, d } = fitAndMeasure(c);
    const aspect = c.w / c.h;
    const dRef = requiredDistance({ fovDeg: c.is2D ? 45 : 55, aspect, dir: c.is2D ? DIR_2D : DIR_3D, scale: c.scale });
    ok(Math.abs(d - dRef) < 1e-9 && tgtOf(controls).every((v) => v === 0),
      `${c.is2D ? '2D' : '直向'} 390x844:還是注視原點的 8 角精算法(距離 ${d.toFixed(2)})`);
  }
}

console.log(`\n${fail === 0 ? '🟢' : '🔴'} fit:${pass} 過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
