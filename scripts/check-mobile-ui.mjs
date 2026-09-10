/* 🔬 手機版面三件事的真瀏覽器驗收(2026-09-10 使用者實機退件那三條)。
 * 跑法:npm run build && npm run serve   (另一個視窗)
 *      npm run check:mobile             (或 CHECK_URL=線上網址 node scripts/check-mobile-ui.mjs)
 *
 * 守的三件(每一件都對應一次退件,不是憑空想的):
 *   ① 🗂「展開/收起」在**手機橫向**要看得見(退件原話:「展開與收起會有時 DISABLE」——
 *      其實不是被鎖住,是斷點只認寬度,轉橫向後寬度超過 768px、鈕整顆 display:none 不見了)。
 *   ② 🎥 轉向之後按「重置視角」,camera.aspect 要等於畫布**現在**的長寬比
 *      (退件原話:「橫向重置視角後,棋盤太扁,這角度看不到棋子,無法玩」——
 *       病根是按鈕綁著轉向前的舊閉包,把 camera.aspect 寫回舊值)。
 *   ③ 🔄「更新」鈕要在(退件原話:「在手機無法用手指下滑,來重新整理成為最新版」)。
 *
 * ★ 一律真滑鼠 page.click,不在 evaluate 裡直接呼叫函式 —— 繞過真點擊的話,
 *   「鈕被蓋住、按不到」這種病照樣全綠(這正是①那條想守的東西)。
 * ★ goto 用 domcontentloaded 不用 networkidle:這站是 3D + SW,
 *   networkidle 在本機實測等不到(0910 實測連原始未改動的版本也一樣 30 秒逾時)。
 */
import { chromium } from 'playwright-core';

const URL = process.env.CHECK_URL || 'http://localhost:8799';
const PHONE_LANDSCAPE = { width: 844, height: 390 };   // iPhone 轉橫:寬 > 768 ⇒ 舊斷點會失效
const PHONE_PORTRAIT = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

let browser = null;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel, headless: true }); break; }
  catch { /* 換下一個 channel */ }
}
if (!browser) { console.error('找不到系統 Edge/Chrome'); process.exit(1); }

let pass = 0; let fail = 0;
const ok = (cond, msg, note = '') => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ ' + msg + (note ? ' → ' + note : '')); }
};
const open = async (viewport) => {
  const page = await browser.newPage({ viewport });
  await page.goto(URL + '?v=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForFunction(() => window.__anchess && window.__anchess.canvasAspect, null, { timeout: 20000 });
  return page;
};
const toggleBox = (page) => page.locator('.panel-toggle').boundingBox();

console.log('\n── ① 🗂 展開/收起鈕在各尺寸的可見性 ──');
{
  const page = await open(PHONE_LANDSCAPE);
  const box = await toggleBox(page);
  ok(box !== null && box.width > 0 && box.height > 0,
    '★ 手機橫向(844×390)看得見「展開/收起」', box ? JSON.stringify(box) : '整顆不見(display:none)');
  // 真的按得動:按一下要能收起面板(難度下拉消失)
  if (box) {
    /* ⚠ 面板有 0.3s 的 CSS transition,而且展開時 React 才把子元素掛回 DOM
         ⇒ 一律用 waitFor(state) 等狀態,不要用固定 sleep 之後直接數(數到的是半路上的畫面)。 */
    const sel = page.locator('.controls select').first();
    await page.click('.panel-toggle');
    await sel.waitFor({ state: 'detached', timeout: 5000 }).then(() => ok(true, '★ 手機橫向按下去真的收得起來'))
      .catch(() => ok(false, '★ 手機橫向按下去真的收得起來', '按了沒收起來'));
    await page.click('.panel-toggle');
    await sel.waitFor({ state: 'visible', timeout: 5000 }).then(() => ok(true, '★ 再按一次展得開'))
      .catch(() => ok(false, '★ 再按一次展得開', '收起來就回不去了'));
  }
  await page.close();
}
{
  const page = await open(PHONE_PORTRAIT);
  const box = await toggleBox(page);
  ok(box !== null && box.height > 0, '手機直向(390×844)也看得見(原本就正常,不可以修壞)');
  await page.close();
}
{
  const page = await open(DESKTOP);
  ok(await toggleBox(page) === null, '桌機(1440×900)刻意不顯示(面板本來就小,不需要收合)');
  await page.close();
}

console.log('\n── ② 🎥 轉向之後按「重置視角」,相機比例要跟著畫布 ──');
{
  const page = await open(PHONE_PORTRAIT);
  /* ⚠ camAspect 讀的是 OrbitControls 掛上來的相機,比 canvas 晚一拍才有
       ⇒ 要等它非 null 再讀,否則量到的是「還沒掛好」而不是產品的毛病(0910 自己踩到)。 */
  await page.waitForFunction(() => window.__anchess && window.__anchess.camAspect, null, { timeout: 20000 })
    .then(() => ok(true, '讀得到 camera.aspect'))
    .catch(() => ok(false, '讀得到 camera.aspect', '等了 20 秒還是 null'));

  // 直向 → 橫向(等同手機轉一圈),再按「重置視角」
  await page.setViewportSize(PHONE_LANDSCAPE);
  await page.waitForTimeout(500);
  /* ⚠ 不可以用 `text=重置視角`:改版簡歷裡也寫著這四個字(而且排在前面),
       會點到那段說明文字而不是按鈕(0910 寫這支時當場踩到)。只認 <button>。 */
  await page.locator('button', { hasText: '重置視角' }).first().click();
  await page.waitForTimeout(500);

  const { cam, canvas } = await page.evaluate(() => ({
    cam: window.__anchess.camAspect, canvas: window.__anchess.canvasAspect,
  }));
  const drift = Math.abs(cam - canvas);
  ok(drift < 0.05,
    '★★ 重置視角後 camera.aspect == 畫布長寬比(對不上就是那個「棋盤被壓扁」的病)',
    'cam=' + cam?.toFixed(3) + ' canvas=' + canvas?.toFixed(3) + ' 差=' + drift.toFixed(3));
  ok(cam > 1, '★ 橫向時相機比例真的是「寬 > 高」', String(cam?.toFixed(3)));
  await page.close();
}

console.log('\n── ③ 🎥 相機俯角「設了要真的生效」(不是只寫在常數裡)──');
{
  /* ⚠⚠ 2026-09-10 實錘:fitCamera 把俯角設成 75°,但 OrbitControls 的
     `minPolarAngle={Math.PI/6}`(30° 極角 = 俯角上限 60°)把它夾成 60.0°,
     使用者看到的一直是 60°;而 test/fit.mjs 只斷言「常數寫了 75」所以全綠 ——
     那是在測「我寫了什麼」,不是「畫出來什麼」。這條才是真的守門:
     開真瀏覽器、量 controls 上那台相機的實際位置換算出來的俯角。 */
  const page = await open(PHONE_LANDSCAPE);
  /* ⚠ camElevation 讀的是 OrbitControls 掛上來的相機,比 canvas 晚一拍才有
       ⇒ 要等它非 null 再讀(跟②那條同一個坑)。 */
  await page.waitForFunction(() => window.__anchess && window.__anchess.camElevation !== null,
    null, { timeout: 20000 }).catch(() => {});
  const elev = await page.evaluate(() => window.__anchess.camElevation);
  ok(elev !== null, '量得到相機的實際俯角', String(elev));
  ok(elev !== null && Math.abs(elev - 62) < 1.5,
    '★★ 實際渲染出來的俯角就是設定的 62°(沒有被 OrbitControls 的 minPolarAngle 夾掉)',
    '量到 ' + (elev === null ? 'null' : elev.toFixed(1) + '°'));
  await page.close();
}

console.log('\n── ④ 🖐 手機轉棋盤不要太靈敏(觸控 0.4、滑鼠維持 1.0)──');
{
  /* 使用者:「棋盤旋轉太快太靈敏」。旋轉量 = 2π × 拖曳像素 ÷ 容器高 × rotateSpeed,
     預設 1.0 在直向手機劃 150px 就轉掉 64°。
     ⚠ `pointer: coarse` 是**裝置能力**,setViewportSize 改不出來 ——
       一定要另開 hasTouch 的 context,不然這條永遠量到桌機那一邊(姊妹站 0909 踩過)。 */
  for (const [label, hasTouch, want] of [['觸控裝置', true, 0.2], ['桌機滑鼠', false, 1.0]]) {
    const ctx = await browser.newContext({ viewport: PHONE_LANDSCAPE, hasTouch, isMobile: hasTouch });
    const p = await ctx.newPage();
    await p.goto(URL + '?v=' + Date.now(), { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('canvas', { timeout: 20000 });
    await p.waitForFunction(() => window.__anchess && window.__anchess.rotateSpeed !== null,
      null, { timeout: 20000 }).catch(() => {});
    const got = await p.evaluate(() => window.__anchess.rotateSpeed);
    ok(got === want, `★ ${label} 的 rotateSpeed = ${want}`, '量到 ' + got);
    await ctx.close();
  }
}

console.log('\n── ⑤ 🔄 更新鈕(手機沒有下拉重新整理可用)──');
{
  const page = await open(PHONE_PORTRAIT);
  const refresh = page.locator('button', { hasText: '更新' });
  await refresh.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  ok(await refresh.count() > 0, '★ 畫面上找得到「🔄 更新」鈕');
  const box = await refresh.first().boundingBox();
  ok(box !== null && box.height >= 24, '★ 更新鈕點得到(有實際大小)', box ? JSON.stringify(box) : '沒有版面');

  /* ⚠ 自動更新那段是靠 controllerchange 觸發 reload —— 寫錯就會變成無限重整。
       這裡數 6 秒內的導覽次數:首次安裝 SW 會有一次接管重整,再多就是迴圈。 */
  let navs = 0;
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs++; });
  await page.waitForTimeout(6000);
  ok(navs <= 1, '★ 沒有重整迴圈(6 秒內導覽 ' + navs + ' 次)', '>1 = controllerchange 的守門旗標壞了');
  await page.close();
}

console.log('\n── ⑥ 真的走一步棋,黑方要真的回應(2026-09-10 使用者實機退件:「炮走一步後黑方完全沒反應」+「黑方一次走兩步」)──');
{
  /* 真因:getBestMoveAlphaBeta 裡 `minimax` 宣告在後面,但黑方開局書那段安全檢查
     (openingStyle 預設 'auto',幾乎每一局都會踩到)在宣告之前就先用了它 —— TDZ 例外。
     丟例外之前 engine.move() 已經真的套用了測試手,例外一路炸出去,undo 永遠沒執行,
     一步「洩漏」的棋子就黏在盤面上;react state 沒機會同步,玩家螢幕看起來像沒反應。
     test/ai.mjs 已經在引擎層守住這個 TDZ + undo 洩漏;這裡補**真滑鼠點擊**的端對端版本,
     因為使用者是在真的點擊互動裡發現的,引擎層測試證明不了「畫面上點了會不會動」。
     ⚠ 一律用 window.__anchess.screenPosFor(x,y) 算真實螢幕像素再 page.mouse.click,
       不能用 evaluate 直接呼叫函式繞過去 —— 那樣「點了但沒反應」這種病照樣全綠。 */
  const page = await open(PHONE_LANDSCAPE);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const clickCell = async (x, y) => {
    const pos = await page.evaluate(([px, py]) => window.__anchess.screenPosFor(px, py), [x, y]);
    if (pos) await page.mouse.click(pos.x, pos.y);
    return pos;
  };
  const countPieces = (board) => board.join('').split('').filter((c) => c !== '.').length;
  const dump = () => page.evaluate(() => ({
    turn: window.__anchess.engine.turn, board: window.__anchess.engine.board.map((r) => r.join('')),
  }));

  /* ⚠ camAspect 非 null 不代表 controlsRef.current(相機物件)也已經掛好——
     screenPosFor 讀的是後者,兩者掛載時機差一拍,這裡要多等一次(跟②那條同一個坑)。 */
  await page.waitForFunction(() => window.__anchess.screenPosFor(7, 7) !== null, null, { timeout: 10000 }).catch(() => {});

  const before = await dump();
  const p1 = await clickCell(7, 7);   // 右邊紅炮起手位置
  ok(p1 !== null, '★ 算得出紅炮的螢幕座標(相機/棋盤都已就緒)');
  await page.waitForTimeout(200);
  await clickCell(7, 6);               // 走到正前方一格空格
  await page.waitForTimeout(2500);     // 給 AI 開局書 + 搜尋足夠時間

  const after = await dump();
  ok(errors.length === 0, '★★ 走這一步不會噴任何 JS 例外(退件三件的共同真因)', errors.join(' | '));
  ok(after.turn === 'w', '★ 黑方真的回應了(輪回紅方,不是卡在黑方那一手)', 'turn=' + after.turn);
  ok(countPieces(after.board) === countPieces(before.board),
    '★★ 棋子總數沒有憑空增減(沒有洩漏未 undo 的測試手殘留在盤面上)',
    `${countPieces(before.board)} → ${countPieces(after.board)}`);
  await page.close();
}

await browser.close();
console.log('\n' + (fail === 0 ? '🟢' : '🔴') + ` mobile-ui:${pass} 過 / ${fail} 失敗\n`);
process.exit(fail === 0 ? 0 : 1);
