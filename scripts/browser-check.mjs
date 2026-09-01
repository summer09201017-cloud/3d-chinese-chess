// 🔬 💡 AI 提示真瀏覽器冒煙(playwright-core + 系統 Edge/Chrome)。
// 跑法:npm run build && npm run check   (或 CHECK_URL=線上網址 node scripts/browser-check.mjs)
// 驗:提示鈕在 → 按下去算得出一手 → 那一手真的合法 → 順手把棋選起來 →
//     同局面按兩次給同一手(不跳針)→ 走一手之後舊建議自己失效。
//
// ★ 一律用真滑鼠 page.click,不在 evaluate 裡呼叫 showHint ——
//   evaluate-not-click-guard 存在的理由就是這個:繞過真點擊的話,
//   「鈕被別的東西蓋住、按不到」這種病照樣全綠。
import { chromium } from "playwright-core";

const URL = process.env.CHECK_URL || "http://localhost:8799";

let browser = null;
for (const channel of ["msedge", "chrome"]) {
  try { browser = await chromium.launch({ channel, headless: true }); break; }
  catch { /* 換下一個 channel */ }
}
if (!browser) { console.error("找不到系統 Edge/Chrome"); process.exitCode = 1; }

let pass = 0, fail = 0;
const ok = (cond, msg, note = "") => {
  if (cond) { pass++; console.log("  ✓ " + msg); }
  else { fail++; console.error("  ✗ " + msg + (note ? " → " + note : "")); }
};

const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(URL + "/?v=" + Date.now(), { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

ok(await page.locator("#hintButton").count() === 1, "畫面上有「💡 提示」鈕");
ok(await page.evaluate(() => !!window.__anchess), "測試把手在(window.__anchess)");

await page.locator("#hintButton").click();
// 提示是同步深搜(量過:depth 3 約 150ms),等它算完
await page.waitForFunction(() => window.__anchess && !window.__anchess.thinking && window.__anchess.hint,
  null, { timeout: 15000 }).catch(() => {});

const a = await page.evaluate(() => {
  const A = window.__anchess;
  const h = A.hint;
  return {
    hint: h && { from: h.from, to: h.to },
    matchesHash: h ? h.hash === A.engine.zobristHash : false,
    selected: A.selected,
    legal: h
      ? A.engine.getPieceMoves(h.from[0], h.from[1]).some((m) => m[0] === h.to[0] && m[1] === h.to[1])
      : false,
    mine: h ? /[A-Z]/.test(A.engine.board[h.from[1]][h.from[0]]) : false,   // 紅方=大寫
  };
});
ok(Boolean(a.hint), "按下去算得出一手", JSON.stringify(a));
ok(a.legal, "★ 建議的那一手通得過真正的走法規則(玩家點得動)", JSON.stringify(a.hint));
ok(a.mine, "建議動的是玩家自己的棋(紅方)");
ok(a.matchesHash, "建議綁在當下這個局面上(hash 對得上 ⇒ 畫得出來)");
ok(Array.isArray(a.selected) && a.selected[0] === a.hint.from[0] && a.selected[1] === a.hint.from[1],
  "順手幫你把那顆棋選起來(接著點紫盤就走完)", JSON.stringify(a.selected));

await page.locator("#hintButton").click();                   // 同局面再按一次
await page.waitForTimeout(600);
const b = await page.evaluate(() => JSON.stringify(window.__anchess.hint.from) + JSON.stringify(window.__anchess.hint.to));
ok(b === JSON.stringify(a.hint.from) + JSON.stringify(a.hint.to),
  "同一個局面按兩次 ⇒ 同一手(不跳針)",
  JSON.stringify(a.hint.from) + JSON.stringify(a.hint.to) + " vs " + b);

/* 照著提示走完一手,舊建議的 hash 就對不上了 ⇒ 畫面上不會再指著過期的格子。
   走法直接動 engine(這支沒有可從外面呼叫的點擊管線),但驗的是 hash 這條防呆本身。 */
await page.evaluate(() => {
  const A = window.__anchess;
  A.engine.move(A.hint.from, A.hint.to);
});
await page.waitForTimeout(300);
ok(await page.evaluate(() => {
  const A = window.__anchess;
  return A.hint.hash !== A.engine.zobristHash;
}), "★ 走一手之後,上一手的建議自己就失效了(比對 hash,不靠逐處清)");

ok(errors.length === 0, "整場零 pageerror", errors.join(" | ").slice(0, 200));

await browser.close();
console.log(`\n🔬 browser-check:${pass} 過 / ${fail} 失敗`);
process.exitCode = fail ? 1 : 0;
