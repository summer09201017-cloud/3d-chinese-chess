/* 📐 test/fit.mjs — 守「整張棋盤真的裝得進畫面」(0909 立)
 *
 * 由來:使用者實機截圖「直向兩側被切,邊路的砲馬只剩半顆」。三處相機座標都寫死,
 *   只有寬螢幕裝得下。這支不開瀏覽器,直接對 fitCamera 的純數學反算:
 *   把棋盤 8 個角**投影**到算出來的相機的視錐裡,斷言每個角的 |x| <= 半寬、|y| <= 半高。
 *   ⇒ 「裝不裝得下」變成一個算得出來的數字,不是目測截圖。
 *
 * ⚠ 這支刻意驗**投影後的座標**而不是「距離有沒有變大」——
 *   驗距離只能證明「我改了」,證不了「夠了」。
 */
import { requiredDistance, fitCamera, BOARD, DIR_2D, DIR_3D } from '../src/fitCamera.js';

let pass = 0, fail = 0;
const ok = (c, m, n = '') => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m + (n ? ' → ' + n : '')); } };

/** 把一個世界座標點投到相機平面,回傳 NDC 式的 (x, y) 比例(1 = 剛好在邊緣)。 */
function project(point, camPos, target, fovDeg, aspect) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const hyp = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = hyp(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

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
  return { x: Math.abs(dot(v, right)) / (z * tanH), y: Math.abs(dot(v, up)) / (z * tanV), z };
}

function corners(scale) {
  const out = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [BOARD.bottom, BOARD.top]) {
    out.push([sx * BOARD.halfX * scale, y * scale, sz * BOARD.halfZ * scale]);
  }
  return out;
}

/* ── 各種真實裝置尺寸:每一個都要「整張盤都在畫面內」 ── */
const CASES = [
  { name: 'iPhone 直向 390x844', w: 390, h: 844, scale: 1.0, is2D: false },
  { name: 'iPhone 橫向 844x390', w: 844, h: 390, scale: 1.0, is2D: false },
  { name: 'Android 直向 360x800', w: 360, h: 800, scale: 1.0, is2D: false },
  { name: '窄長 320x900(最極端)', w: 320, h: 900, scale: 1.0, is2D: false },
  { name: 'iPad 直向 768x1024', w: 768, h: 1024, scale: 1.0, is2D: false },
  { name: '桌機 1440x900', w: 1440, h: 900, scale: 1.2, is2D: false },
  { name: '直向 2D 模式 390x844', w: 390, h: 844, scale: 1.0, is2D: true },
  { name: '桌機 2D 模式 1440x900', w: 1440, h: 900, scale: 1.2, is2D: true },
];

console.log('\n── ① 每個裝置尺寸:棋盤 8 個角都在視錐內 ──');
for (const c of CASES) {
  const aspect = c.w / c.h;
  const fake = {
    fov: 45, aspect, position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    updateProjectionMatrix() {},
  };
  const controls = { target: { x: 0, y: 0, z: 0 }, maxDistance: 25, update() {} };
  const d = fitCamera(fake, controls, { is2D: c.is2D, aspect, scale: c.scale });
  const camPos = [fake.position.x, fake.position.y, fake.position.z];
  let worst = 0;
  for (const p of corners(c.scale)) {
    const pr = project(p, camPos, [0, 0, 0], fake.fov, aspect);
    worst = Math.max(worst, pr.x, pr.y);
  }
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
    worst = Math.max(worst, pr.x, pr.y);
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

console.log('\n── ④ 橫式棋盤要比姊妹站(3D-Xiangqi/xiangqi-arena)的簡化公式那樣「敢貼近一點」──');
{
  /* 2026-09-10 使用者拿三站截圖比對:本站橫式棋盤明顯比另外兩站小。查出來 8 角精算法
     在寬螢幕時比姊妹站的「棋盤攤平配 fov」簡化公式保守不少——保守到肉眼看得出差異,
     但那份餘裕在**直向**是真的救過命(0909「邊路砲馬只剩半顆」),不能整支拔掉。
     ⇒ 只在 3D + 橫式(aspect≥1)改用簡化公式,這裡守兩件事:
       ①真的比原本的 8 角精算法距離更近(棋盤看起來更大)②依然不裁切(≤100%)。
     直向(見上面①的斷言)完全沒被這次改動碰到,继续用 8 角精算法。 */
  const aspect = 844 / 390;
  const distExact = requiredDistance({ fovDeg: 45, aspect, dir: DIR_3D, scale: 1.0 });
  const fake = {
    fov: 45, aspect, position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    updateProjectionMatrix() {},
  };
  const controls = { target: { x: 0, y: 0, z: 0 }, maxDistance: 25, update() {} };
  const distFlat = fitCamera(fake, controls, { is2D: false, aspect, scale: 1.0 });
  ok(distFlat < distExact, `★ 橫式(844x390)真的比 8 角精算法貼近了(${distFlat.toFixed(1)} < ${distExact.toFixed(1)})`);

  let worst = 0;
  for (const p of corners(1.0)) {
    const pr = project(p, [fake.position.x, fake.position.y, fake.position.z], [0, 0, 0], fake.fov, aspect);
    worst = Math.max(worst, pr.x, pr.y);
  }
  ok(worst <= 1.0, `★★ 貼近之後依然沒裁切(佔滿 ${(worst * 100).toFixed(1)}%)`, `worst=${worst.toFixed(3)}`);
  ok(worst >= 0.9, '★ 而且真的「貼近」了,不是換公式换假的(至少佔滿 90%)', `worst=${worst.toFixed(3)}`);
}

console.log('\n── ⑤ 俯角是 62 度(2026-09-10 使用者:「重置視角還需要朝上順時鐘再轉30度」)──');
{
  const elevationDeg = Math.atan2(DIR_3D[1], DIR_3D[2]) * 180 / Math.PI;
  ok(Math.abs(elevationDeg - 62) < 0.5, `★ DIR_3D 俯角是 62°(量到 ${elevationDeg.toFixed(1)}°)`);
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
       fit = max(distForH, distForW) × 1.02 × 1.06(boardW/H 各多留半格)。 */
  const W = 844, H = 390, aspect = W / H, tanV = Math.tan((45 * Math.PI) / 180 / 2);
  const tanH = tanV * aspect;
  const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const sb = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  /** 最靠近鏡頭那一排(最底線)的左右跨距,佔畫面寬的 % */
  const frontSpanPct = (boardW, boardD, dist, elevDeg) => {
    const dir = nrm([0, Math.tan((elevDeg * Math.PI) / 180), 1]);
    const cam = [dir[0] * dist, dir[1] * dist, dir[2] * dist];
    const fwd = nrm(sb([0, 0, 0], cam));
    const right = nrm(cr(fwd, [0, 1, 0]));
    const px = (p) => { const v = sb(p, cam); return dt(v, right) / (dt(v, fwd) * tanH); };
    const hx = (boardW / 2) * (8 / 9), zF = (boardD / 2) * (9 / 10);
    return (Math.abs(px([hx, 0, zF]) - px([-hx, 0, zF])) / 2) * 100;
  };

  const SX = 10, SY = 8.5, BW = 9 * SX, BH = 10 * SY;
  const refDist = Math.max(((BH + SY * 0.5) / 2) / tanV, ((BW + SX * 0.5) / 2) / tanV / aspect) * 1.02 * 1.06;
  const refSpan = frontSpanPct(BW, BH, refDist, Math.atan2(90, 60) * 180 / Math.PI);

  const fake = {
    fov: 45, aspect, position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    updateProjectionMatrix() {},
  };
  const oursDist = fitCamera(fake, { target: { x: 0, y: 0, z: 0 }, maxDistance: 25, update() {} },
    { is2D: false, aspect, scale: 1.0 });
  const oursElev = Math.atan2(DIR_3D[1], DIR_3D[2]) * 180 / Math.PI;
  const oursSpan = frontSpanPct(BOARD.halfX * 2, BOARD.halfZ * 2, oursDist, oursElev);

  ok(oursSpan >= refSpan,
    `★★ 橫式底排寬 ${oursSpan.toFixed(1)}% ≥ 姊妹站的 ${refSpan.toFixed(1)}%(使用者的驗收標準)`,
    `ours=${oursSpan.toFixed(2)} ref=${refSpan.toFixed(2)}`);
}

console.log(`\n${fail === 0 ? '🟢' : '🔴'} fit:${pass} 過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
