#!/usr/bin/env node
/**
 * smoke-dice.mjs — 🎲 擲骰 / 🪙 擲硬幣決定先後 + 可執黑 真瀏覽器冒煙(v19;skill dice-coin-toss「驗收」段)
 *
 *   npm run build && npm run serve   (另一個視窗)→ npm run smoke:dice
 *   BASE=https://3d-chinese-chess.pages.dev node scripts/smoke-dice.mjs      # 線上(三站各跑一次)
 *
 * ① 選 ⚫ 黑方 ⇒ 選單只改選擇,還沒生效;按重新開局 ⇒ 你執黑、電腦 6 秒內走第一手、輪到你
 * ② 執黑悔到開局 ⇒ 電腦重走第一手、輪到你(以前卡住)
 * ③ 局號守門:執黑時連按兩次重新開局 ⇒ 新局只有電腦一手
 * ④ 🎲 擲骰:骰面朝上 == 點數(判定 = 畫面);擲骰中按提示 / 悔棋不收;開始鈕 ≥44px;你 6 點 ⇒ 執紅、電腦 6 點 ⇒ 執黑
 * ⑤ 🪙 硬幣朝上那面 == 結果,執色跟浮層寫的誰先對得上
 * ⑥ 擲骰中用鍵盤按重新開局 ⇒ 只剩一層浮層;⑦ 存檔記住執黑、讀回來還是執黑;⑧ 全程零 pageerror
 * 點數用 window.__anchess.setDiceRng 指定(⚠ 不能換 Math.random:動物每幀都在用,佇列會在擲骰前被吃光)。
 */
import { chromium } from "playwright-core";

const BASE = (process.env.BASE || "http://localhost:8799").replace(/\/$/, "");
const results = [];
const check = (c, n, d = "") => results.push([c ? "🟢" : "🔴", n, d]);
let browser = null;
for (const channel of ["msedge", "chrome"]) {
  try { browser = await chromium.launch({ channel, headless: true }); break; } catch { /* 換下一個 */ }
}
browser ||= await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: "block" });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 160)); });
page.on("dialog", (d) => d.accept());   // 存檔 / 讀檔的 alert

const GO = ".dt-ov .dt-go:not([hidden])";
const st = () => page.evaluate(() => {
  const a = window.__anchess;
  return { me: a.playerColor, choice: a.sideChoice, tossing: a.tossing, turn: a.engine.turn, n: a.engine.history.length, hint: a.thinking };
});
const rig = (vals) => page.evaluate((v) => {
  const q = v.slice();
  window.__anchess.setDiceRng(() => (q.length ? q.shift() : Math.random()));
}, vals);
const facesMatch = () => page.evaluate(() =>
  [...document.querySelectorAll(".dt-ov .dt-die, .dt-ov .dt-coin")].map((el) => [String(window.__anchess.topFace(el)), String(el.dataset.v)]));
const restart = () => page.getByRole("button", { name: "重新開局 (Restart)" }).click();
const waitAi = (n) => page.waitForFunction((k) => {
  const a = window.__anchess; return a.engine.history.length >= k && a.engine.turn === a.playerColor;
}, n, { timeout: 6000 }).catch(() => {});

await page.goto(BASE + "/?v=" + Date.now(), { waitUntil: "load" });
await page.evaluate(() => { try { localStorage.removeItem("xiangqiSave"); } catch {} });
/* 等畫布真的起來(同 browser-check):__anchess 一出現就點,3D 場景還在載入、點擊會被晚處理 ⇒ 前幾條假紅(實測) */
await page.waitForFunction(() => window.__anchess && window.__anchess.canvasAspect, null, { timeout: 30000 });
await page.waitForTimeout(1500);

// ① 選黑方:還沒生效;按重新開局才生效
await page.selectOption("#sideSelect", "b");
await page.waitForTimeout(300);
let s = await st();
check(s.me === "w" && s.n === 0 && (await page.locator("#sideHint").count()) === 1, "選 ⚫ 黑方 ⇒ 只改選擇、提示「按重新開局生效」", JSON.stringify(s));
await restart();
await waitAi(1);
s = await st();
check(s.me === "b" && s.n === 1 && s.turn === "b", "重新開局 ⇒ 你執黑、電腦先走一手、輪到你", JSON.stringify(s));

// ② 執黑悔到開局
await page.getByRole("button", { name: "悔棋 (Undo)" }).click();
await page.waitForTimeout(100);
await waitAi(1);
await page.waitForTimeout(400);
s = await st();
check(s.n === 1 && s.turn === "b", "執黑悔到開局 ⇒ 電腦重走第一手、輪到你(不卡住)", JSON.stringify(s));

// ⑦ 存檔記住執黑:存 → 改回紅方重新開局 → 讀檔 ⇒ 還是執黑
await page.getByRole("button", { name: "存檔 (Save)" }).click();
await page.selectOption("#sideSelect", "w");
await restart();
await page.waitForTimeout(500);
await page.getByRole("button", { name: "讀檔 (Load)" }).click();
await page.waitForTimeout(600);
s = await st();
check(s.me === "b" && s.n === 1 && s.turn === "b", "存檔記住執黑、讀回來還是執黑", JSON.stringify(s));

// ③ 局號守門:執黑時連按兩次重新開局
await page.selectOption("#sideSelect", "b");
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("重新開局")); b.click(); b.click(); });
await page.waitForTimeout(300);
await waitAi(1);
await page.waitForTimeout(800);
s = await st();
check(s.n === 1 && s.turn === "b", "連按重新開局 ⇒ 新局只有電腦一手", JSON.stringify(s));

// ④ 擲骰:你 6、電腦 1 ⇒ 執紅
await page.selectOption("#sideSelect", "dice");
await rig([0.99, 0.01]);
await restart();
await page.waitForSelector(GO, { timeout: 8000 }).catch(() => {});
let fm = await facesMatch();
check(fm.length === 2 && fm.every(([a, b]) => a === b), "🎲 骰面朝上 == 點數(你先那局)", JSON.stringify(fm));
/* 浮層蓋住整頁 ⇒ 用 DOM click 直接送進按鈕(驗的是 tossingRef 那道,不是「浮層蓋住」) */
await page.evaluate(() => { document.getElementById("hintButton").click(); [...document.querySelectorAll("button")].find((x) => x.textContent.includes("悔棋")).click(); });
await page.waitForTimeout(200);
s = await st();
const hintMade = await page.evaluate(() => !!window.__anchess.hint);   // 提示 ~60ms 就算完 ⇒ 看「有沒有產出」,不看「想一手…」
check(s.tossing && !s.hint && !hintMade && s.n === 0, "擲骰中按提示 / 悔棋都不收", JSON.stringify({ ...s, hintMade }));
const box = await page.locator(GO).boundingBox();
check(box && box.width >= 44 && box.height >= 44, "開始鈕 ≥44px", box ? `${Math.round(box.width)}×${Math.round(box.height)}` : "沒有框");
await page.locator(GO).click();
await page.waitForTimeout(700);
s = await st();
check(s.me === "w" && !s.tossing && s.n === 0, "你 6 點 ⇒ 你執紅、電腦沒有搶走", JSON.stringify(s));
// 再擲:電腦 6、你 1 ⇒ 執黑
await rig([0.01, 0.99]);
await restart();
await page.waitForSelector(GO, { timeout: 8000 }).catch(() => {});
fm = await facesMatch();
check(fm.length === 2 && fm.every(([a, b]) => a === b), "🎲 重新開局重擲、骰面 == 點數(電腦先那局)", JSON.stringify(fm));
await page.locator(GO).click();
await waitAi(1);
s = await st();
check(s.me === "b" && s.n === 1 && s.turn === "b", "電腦 6 點 ⇒ 你執黑、電腦先走一手", JSON.stringify(s));

// ⑤ 硬幣
await page.selectOption("#sideSelect", "coin");
await rig([0.2]);
await restart();
await page.waitForSelector(GO, { timeout: 8000 }).catch(() => {});
fm = await facesMatch();
check(fm.length === 1 && fm[0][0] === fm[0][1], "🪙 硬幣朝上那面 == 結果", JSON.stringify(fm));
const youFirst = await page.evaluate(() => /^你\s*先/.test(document.querySelector(".dt-ov .dt-msg")?.textContent || ""));
await page.locator(GO).click();
await page.waitForTimeout(youFirst ? 700 : 0);
if (!youFirst) await waitAi(1);
s = await st();
check(s.me === (youFirst ? "w" : "b") && s.n === (youFirst ? 0 : 1), `🪙 浮層寫「${youFirst ? "你" : "電腦"}先」⇒ 你執${youFirst ? "紅" : "黑"}`, JSON.stringify(s));

// ⑥ 擲骰中用鍵盤按重新開局 ⇒ 只剩一層
await page.selectOption("#sideSelect", "dice");
await rig([0.99, 0.01]);
await restart();
await page.waitForSelector(GO, { timeout: 8000 }).catch(() => {});
await rig([0.99, 0.01]);
await page.getByRole("button", { name: "重新開局 (Restart)" }).focus();
await page.keyboard.press("Enter");
await page.waitForSelector(GO, { timeout: 8000 }).catch(() => {});
check((await page.locator(".dt-ov").count()) === 1, "擲骰中用鍵盤重新開局 ⇒ 只剩一層浮層", `浮層 ${await page.locator(".dt-ov").count()} 層`);
await page.locator(GO).first().click();
await page.waitForTimeout(400);
s = await st();
check((await page.locator(".dt-ov").count()) === 0 && s.me === "w" && !s.tossing, "按開始後浮層全收、你執紅", JSON.stringify(s));

// ⑧
check(errs.length === 0, "整場零 pageerror / console error", errs.join(" | "));

await browser.close();
for (const [c, name, d] of results) console.log(`${c} ${name}${d ? " — " + d : ""}`);
const red = results.filter((r) => r[0] === "🔴").length;
console.log(`\nsmoke-dice:${results.length - red} 綠 / ${red} 紅(${BASE})`);
process.exit(red ? 1 : 0);
