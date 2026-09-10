/* 🧹 build 之前先把 dist/ 清乾淨(package.json 的 `prebuild`,npm 會自動先跑這支)。
 *
 * 由來:2026-09-10(agape250 機)`npm run build` 會**原生崩潰**——
 *   畫面只印到「transforming...✓ 575 modules transformed.」就沒了,離開碼
 *   -1073740791(0xC0000409,Windows STATUS_STACK_BUFFER_OVERRUN;bash 看到的是 127),
 *   **沒有錯誤訊息、沒有 stack trace、沒有任何測試會紅**。
 *
 * ★ 一路查下來的結論(寫下來,免得下次又從「是不是我改壞了」開始查):
 *   ① `git stash` 後對**原始未改動**的程式碼跑 ⇒ 一樣崩潰 ⇒ 不是那一輪改動造成的。
 *   ② `--minify false` ⇒ 一樣崩潰 ⇒ 不是壓縮器。
 *   ③ 拿掉 VitePWA ⇒ 成功;只留 manifest / 只留 includeAssets ⇒ 也都成功。
 *      **一度誤判是外掛的鍋** —— 其實那幾次我順手把 outDir 改成了新目錄名,那才是差別。
 *   ④ 原封不動的設定檔 + `outDir: dist-test5`(新目錄)⇒ 成功。
 *      ⇒ 觸發條件是「**dist/ 已經存在**」:存在就崩、不存在就過,連跑三輪 127/0/127。
 *   ⑤ 再往下挖:崩潰的其實**不是 Vite**,是「刪掉 dist/」這個動作本身 ——
 *      `node -e "fs.rmSync('dist',{recursive:true,force:true})"` 直接讓 node 當場崩潰,
 *      而同一支 rmSync 刪別的暫存目錄完全正常。逐檔測:dist/ 底下**每一個** entry
 *      (連 134 bytes 的 registerSW.js)都會讓 node 崩潰 ⇒ 不是某個檔壞掉,
 *      是有東西掛在這條路徑上盯著 node.exe(這台裝了 PC-cillin,防勒索的資料夾保護
 *      就是這個症狀:不是回 EPERM,而是把行程打掛)。
 *   ⑥ Git Bash 的 `rm -rf dist` 與 Windows 的 `rmdir /s /q dist` **都刪得掉** ⇒ 用它們繞過。
 *
 * ★ 所以這支的作法:Windows 走 `rmdir /s /q`(避開會被打掛的 node fs 刪除路徑),
 *   其他平台走 fs.rmSync。刪完一定回頭確認真的不見了,不見了才讓 build 繼續 ——
 *   靜靜刪不掉會讓上一版的殘檔留在 dist/(舊 assets/index-*.js 被 workbox 一起 precache),
 *   那比直接失敗更難查。
 * ★ 這支只碰 dist/,不碰 node_modules、不碰任何原始碼。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

if (!existsSync(DIST)) {
  console.log('🧹 dist/ 本來就不在,直接 build');
  process.exit(0);
}

if (process.platform === 'win32') {
  // ⚠ 不要改用 fs.rmSync:在這台機器上它會讓整個 node 行程崩潰(見上面 ⑤)。
  execFileSync('cmd', ['/c', 'rmdir', '/s', '/q', DIST], { stdio: 'inherit' });
} else {
  rmSync(DIST, { recursive: true, force: true });
}

if (existsSync(DIST)) {
  console.error('🔴 dist/ 刪不掉 —— 先手動清掉再 build(殘檔留著會被 workbox 一起 precache)');
  process.exit(1);
}
console.log('🧹 已清除舊的 dist/');
