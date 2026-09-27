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
/* 0928:networkidle 會被 drei <Environment> 的 HDR / SW 預快取 48 項(含 32 支動物 mp3)拖到超時 ⇒ 等 load + 把手出現就好 */
await page.goto(URL + "/?v=" + Date.now(), { waitUntil: "load" });
/* ⚠ 第一次載入會裝 SW,SW 接管那一刻 App 自動 reload 一次(App.jsx 的 controllerchange)—— 那一下什麼時候來沒有準(0928 實測:
   等 4 秒放行,結果 reload 剛好落在按「💡 提示」之後,提示狀態被洗掉、整段紅)。
   ⇒ 確定性的做法:等 SW 接管(controller 出現)再**自己**重載一次 —— 第二次載入從頭就有 controller,不會再 controllerchange,也就不會再 reload。 */
await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(500);
await page.goto(URL + "/?v=" + Date.now(), { waitUntil: "load" });
await page.waitForFunction(() => window.__anchess && window.__anchess.canvasAspect, null, { timeout: 30000 }).catch(() => {});
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


/* ══════ 🐾 動物對手(2026-09-28,skill animal-opponent-kit 第七個活例;照 gomoku3d smoke ⑩ / 3D-Xiangqi 🐾 段)══════
   檔案側對賬 → 真的用 select 選「會說話」+ 難度 5 → 坐對面 / 鐵則遍歷 / 頭在畫面裡 / 凳子落地 / 標籤帶臉 / 臉沒被面板蓋到(桌機・手機橫向・直向)
   → 讓位縮盤 ≤ 25% → 真滑鼠走一手(紅炮二平五)等牠回手(figs.log 有 think + place)→ 姿勢手動推時間 → 🔃 換邊仍坐對面
   → 對局視角頭在畫面裡 → 切 2D 收起、切回來 → 三段開關 → 難度 9 ⇒ 🦉 → 人聲 runtime。
   ★ 本站世界 Y-up:pos 回世界 XZ,相機在 +z 時牠在 -z(黑方那一側)。姿勢一律 figs.update(0.4) 手動推時間(無頭 fps 低)。 */
console.log("—— 🐾 動物對手 ——");
{
  const fs = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath, pathToFileURL } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const { VOICE_FILES } = await import(pathToFileURL(join(root, "src", "voicePhrases.js")).href);
  const vdir = join(root, "public", "voice");
  const mp3 = fs.existsSync(vdir) ? fs.readdirSync(vdir).filter((f) => f.endsWith(".mp3")).sort() : [];
  const want = [...VOICE_FILES].sort();
  ok(mp3.join() === want.join(), `🗣 public/voice/ 有 ${mp3.length} 支 mp3,跟詞庫 ${want.length} 句一一對應`);
  let manifestOk = false;
  try { const mf = JSON.parse(fs.readFileSync(join(vdir, "manifest.json"), "utf8")); manifestOk = mp3.length > 0 && mp3.every((f) => mf[f.replace(/\.mp3$/, "")] === "voice/" + f); } catch { /* 沒烤 */ }
  ok(manifestOk, "🗣 manifest.json 的鍵值跟目錄一致");
  const tiny = mp3.filter((f) => fs.statSync(join(vdir, f)).size < 2048);
  ok(tiny.length === 0, `🗣 每支 mp3 > 2KB(空檔 = 烤失敗)${tiny.length ? ":" + tiny.join(",") : ""}`);
  const swPath = join(root, "dist", "sw.js");
  if (fs.existsSync(swPath)) {
    const sw = fs.readFileSync(swPath, "utf8");
    const missing = mp3.filter((f) => !sw.includes("voice/" + f));
    ok(missing.length === 0 && sw.includes("voice/manifest.json"), `🗣 dist/sw.js 的 precache 含 manifest + 每支 mp3(vite.config globPatterns)${missing.length ? ":漏 " + missing.join(",") : ""}`);
  }
  const webSpeech = fs.readdirSync(join(root, "src")).filter((f) => /\.jsx?$/.test(f) && fs.readFileSync(join(root, "src", f), "utf8").includes("speech" + "Synthesis"));
  ok(webSpeech.length === 0, `🗣 src 裡沒有 Web Speech 機器聲${webSpeech.length ? ":" + webSpeech.join(",") : ""}`);
  const kit = join(process.env.USERPROFILE || process.env.HOME || "", ".claude", "skills", "animal-opponent-kit", "assets");
  if (fs.existsSync(kit)) {
    const drift = ["animals.js", "voice.js"].filter((f) => fs.readFileSync(join(root, "src", f), "utf8") !== fs.readFileSync(join(kit, f), "utf8"));
    ok(drift.length === 0, `🐾 引擎兩支與 skill 同一份${drift.length ? ":漂移 " + drift.join(",") : ""}`);
  }
}
await page.setViewportSize({ width: 1280, height: 860 });
await page.getByRole("button", { name: /重新開局/ }).click();      // 上面那段用 engine.move 走過一手,先回到開局
await page.waitForTimeout(400);
await page.selectOption("#petSelect", "voice");
await page.locator(".controls select").first().selectOption("5");   // 難度 5 ⇒ 🐱(真的用 select 選)
await page.waitForFunction(() => window.__anchess.pet && window.__anchess.pet.kind === "cat" && window.__anchess.pet.figure, null, { timeout: 10000 });
await page.waitForTimeout(800);
const pet0 = await page.evaluate(() => {
  const P = window.__anchess.pet, f = P.figure;
  let neck = 0, eyes = 0, ears = 0, brows = 0, mouth = 0;
  f.group.traverse((o) => { if (o.userData.neck) neck++; if (o.userData.eye) eyes++; if (o.userData.ear) ears++; if (o.userData.brow) brows++; if (o.userData.mouth) mouth++; });
  return { ...P.probe(), neck, eyes, ears, brows, mouth, label: document.getElementById("petLabel").textContent, petOn: document.body.classList.contains("pet-on") };
});
ok(pet0.figure && pet0.visible && pet0.kind === "cat" && pet0.pos.z < 0, `🐾 難度 5 ⇒ 🐱 橘貓坐在對面(黑方那一側,世界 ${JSON.stringify(pet0.pos)},scale ${pet0.scale})`);
ok(pet0.neck === 1 && pet0.eyes === 2 && pet0.ears === 2 && pet0.brows === 2 && pet0.mouth === 1, "🐾 人物鐵則遍歷:脖子 1、眼 2、耳 2、眉 2、嘴 1");
ok(pet0.head.inside, `🐾 桌機:頭頂在畫面裡(NDC ${pet0.head.x}, ${pet0.head.y})`);
ok(Math.abs(pet0.stoolY - pet0.floorY) < 0.02 || pet0.stoolY <= pet0.floorY, `🐾 凳子落地(凳底 y ${pet0.stoolY} vs 板底 ${pet0.floorY})`);
ok(/🐱 橘貓/.test(pet0.label) && pet0.petOn, `🐾 面板標籤帶動物(${pet0.label.trim()})、body.pet-on`);
const hudHits = (box) => [...document.querySelectorAll(".ui-overlay, #mfsFull")].filter((el) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && !(r.right < box.l || r.left > box.r || r.bottom < box.t || r.top > box.b);
}).map((el) => el.id || el.className);
const faceAt = () => page.evaluate((fn) => { const hits = eval(fn); const p = window.__anchess.pet.probe(); return { box: p.headBox, head: p.head, hits: hits(p.headBox) }; }, `(${hudHits.toString()})`);
const faceDesk = await faceAt();
ok(faceDesk.hits.length === 0, `🐾 桌機:牠的臉沒被面板蓋到(頭框 ${JSON.stringify(faceDesk.box)}${faceDesk.hits.length ? ";蓋到 " + faceDesk.hits.join(",") : ""})`);
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(1200);
const faceLand = await faceAt();
ok(faceLand.head.inside && faceLand.hits.length === 0, `🐾 手機橫向:頭在畫面裡(${faceLand.head.x}, ${faceLand.head.y})、臉沒被頂欄蓋到${faceLand.hits.length ? ":" + faceLand.hits.join(",") : ""}`);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1200);
const facePort = await faceAt();
ok(facePort.head.inside, `🐾 手機直向:頭在畫面裡(${facePort.head.x}, ${facePort.head.y})`);
await page.setViewportSize({ width: 1280, height: 860 });
await page.waitForTimeout(1200);
const shrink = await page.evaluate(async () => {
  const A = window.__anchess;
  const width = () => { const a = A.screenPosFor(0, 9), b = A.screenPosFor(8, 9); return Math.hypot(b.x - a.x, b.y - a.y); };
  const on = width();
  const sel = document.getElementById("petSelect");
  const set = (v) => { const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; setter.call(sel, v); sel.dispatchEvent(new Event("change", { bubbles: true })); };
  set("off"); await new Promise((r) => setTimeout(r, 500)); const off = width();
  set("voice"); await new Promise((r) => setTimeout(r, 500));
  return { on: Math.round(on), off: Math.round(off), ratio: +(on / off).toFixed(3) };
});
ok(shrink.ratio >= 0.75 && shrink.ratio <= 1.0001, `🐾 為牠讓位但棋盤最多縮 25%(開 ${shrink.on}px / 關 ${shrink.off}px = ${shrink.ratio})`);
/* 真滑鼠走一手:紅炮 (1,7) → (4,7),等黑方回手;看 figs.log,不是 grep 程式碼 */
await page.waitForFunction(() => window.__anchess.pet && window.__anchess.pet.kind === "cat", null, { timeout: 5000 });
const clickAt = async (x, y) => { const p = await page.evaluate(([px, py]) => window.__anchess.screenPosFor(px, py), [x, y]); await page.mouse.click(p.x, p.y); await page.waitForTimeout(350); };
await clickAt(1, 7); await clickAt(4, 7);
await page.waitForFunction(() => window.__anchess.engine.turn === "w" && window.__anchess.pet.figs.log.some((e) => e.kind === "place"), null, { timeout: 15000 }).catch(() => {});
const moved = await page.evaluate(() => ({ turn: window.__anchess.engine.turn, log: window.__anchess.pet.figs.log.map((e) => e.kind), hist: window.__anchess.engine.history.length }));
ok(moved.turn === "w" && moved.hist >= 2 && moved.log.includes("think") && moved.log.includes("place"), `🐾 走一手、牠回一手,事件真的接到(figs.log):${moved.log.join(",")}`);
const pose = await page.evaluate(() => {
  const P = window.__anchess.pet, f = P.figure, F = P.figs;
  const said = []; const o = P.voice.say.bind(P.voice); P.voice.say = (a, e, d) => { said.push(a + ":" + e); return o(a, e, d); };
  P.react("win", "win"); F.update(0.4);
  const up = { armL: +f.arms[0].rotation.x.toFixed(2), armR: +f.arms[1].rotation.x.toFixed(2), open: f.mouthOpen.visible };
  F.update(3.5); F.update(0.5);
  const back = { armL: +f.arms[0].rotation.x.toFixed(2), smile: f.smile.visible };
  P.react("lose", "lose"); F.update(0.4);
  const sad = { pitch: +f.head.rotation.x.toFixed(2), smileZ: +f.smile.rotation.z.toFixed(2) };
  F.update(3.5); F.update(0.5);
  P.react("think", null); F.update(0.4);
  const think = { armR: +f.arms[1].rotation.x.toFixed(2), tilt: +f.head.rotation.z.toFixed(2) };
  P.cancel(); F.update(1);
  P.voice.say = o;
  return { up, back, sad, think, said };
});
ok(pose.up.armL < -2.2 && pose.up.armR < -2.2 && pose.up.open, `🐾 win:雙手高舉 + 張嘴(${JSON.stringify(pose.up)})`);
ok(Math.abs(pose.back.armL + 1.2) < 0.15 && pose.back.smile, `🐾 反應完回休息姿勢、笑臉回來(${JSON.stringify(pose.back)})`);
ok(pose.sad.pitch > 0.3 && pose.sad.smileZ < 1.6, `🐾 lose:低頭 + 苦臉(${JSON.stringify(pose.sad)})`);
ok(pose.think.armR < -1.9 && pose.think.tilt < -0.05, `🐾 think:手托腮、頭歪(${JSON.stringify(pose.think)})`);
ok(pose.said.join(" ") === "cat:win cat:lose", `🗣 同一個入口也叫了人聲:${pose.said.join(" ")}`);
const beforeFlip = await page.evaluate(() => window.__anchess.pet.probe().pos);
await page.click("[data-vk-flip]");
await page.waitForTimeout(1200);
const afterFlip = await page.evaluate(() => { window.__anchess.pet.update(0.016); return window.__anchess.pet.probe(); });
ok(Math.sign(beforeFlip.z) !== Math.sign(afterFlip.pos.z) && afterFlip.head.inside, `🐾 🔃 換邊後牠還是坐你對面(z ${beforeFlip.z} → ${afterFlip.pos.z})、頭在畫面裡(${afterFlip.head.x}, ${afterFlip.head.y})`);
await page.click('[data-vk-view="sit"]');
await page.waitForTimeout(1200);
const sitPet = await page.evaluate(() => window.__anchess.pet.probe().head);
ok(sitPet.inside, `🐾 對局視角(34°):頭頂在畫面裡(${sitPet.x}, ${sitPet.y})`);
await page.click("[data-vk-reset]");
await page.waitForTimeout(800);
await page.getByRole("button", { name: /切換 2D 視角/ }).click();
await page.waitForTimeout(600);
const in2D = await page.evaluate(() => ({ hidden: window.__anchess.pet.hidden, visible: window.__anchess.pet.figure.group.visible, petOn: window.__anchess.petOn }));
ok(in2D.hidden && in2D.visible === false && !in2D.petOn, `🐾 切 2D ⇒ 牠收起來(正上方看不到,也不讓位)(${JSON.stringify(in2D)})`);
await page.getByRole("button", { name: /切換 3D 視角/ }).click();
await page.waitForTimeout(800);
const back3D = await page.evaluate(() => window.__anchess.pet.probe());
ok(back3D.visible && back3D.head.inside, `🐾 切回 3D ⇒ 牠又坐回對面、頭在畫面裡(${back3D.head.x}, ${back3D.head.y})`);
await page.selectOption("#petSelect", "off");
await page.waitForTimeout(400);
const off = await page.evaluate(() => ({ visible: window.__anchess.pet.figure.group.visible, saved: localStorage.getItem("3dcc-pet"), label: document.getElementById("petLabel").textContent }));
ok(off.visible === false && off.saved === "off" && !/🐱/.test(off.label), `🐾 關掉 ⇒ 隱藏、localStorage 記 off、標籤不寫牠(${JSON.stringify(off)})`);
await page.selectOption("#petSelect", "mute");
await page.waitForTimeout(400);
const mute = await page.evaluate(() => ({ visible: window.__anchess.pet.figure.group.visible, voiceOn: window.__anchess.pet.voiceOn }));
ok(mute.visible === true && mute.voiceOn === false, `🐾 不出聲 ⇒ 還坐著、不唸(${JSON.stringify(mute)})`);
await page.selectOption("#petSelect", "voice");
await page.locator(".controls select").first().selectOption("9");
await page.waitForFunction(() => window.__anchess.pet.kind === "owl", null, { timeout: 5000 });
const owl = await page.evaluate(() => ({ ...window.__anchess.pet.probe(), label: document.getElementById("petLabel").textContent }));
ok(owl.kind === "owl" && owl.visible && owl.head.inside && /🦉/.test(owl.label), `🐾 難度 9 ⇒ 🦉 貓頭鷹(${owl.label.trim()};頭 ${owl.head.x}, ${owl.head.y})`);
await page.locator(".controls select").first().selectOption("2");
await page.waitForFunction(() => window.__anchess.petVoice && window.__anchess.petVoice.ready(), null, { timeout: 10000 }).catch(() => {});
const v = await page.evaluate(() => ({ ready: window.__anchess.petVoice.ready(), has: window.__anchess.petVoice.has("owl", "check"), yes: window.__anchess.petVoice.say("cat", "win"), no: window.__anchess.petVoice.say("cat", "nope") }));
ok(v.ready && v.has && v.yes === true && v.no === false, `🗣 人聲 runtime:manifest 載到、cat-win 送去放、沒烤的不唸(${JSON.stringify(v)})`);

ok(errors.length === 0, "整場零 pageerror", errors.join(" | ").slice(0, 200));

await browser.close();
console.log(`\n🔬 browser-check:${pass} 過 / ${fail} 失敗`);
process.exitCode = fail ? 1 : 0;
