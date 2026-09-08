/* 一鍵部署三站 + 推完自動比對 build 指紋(2026-09-09 使用者拍板)
 *
 * 由來:這個 repo 的一份 build 掛**三個** Cloudflare Pages 專案
 *   (3d-chinese-chess / 3dchinesechess / 3dchinese)。
 *   原本 README 教的是「手動貼三行 wrangler」⇒ 漏一行就有網址停在舊版,而且**畫面上看不出來**。
 *   0909 實測就抓到同一種病的鄰居:三個 *.netlify.app 停在更舊的 build(index-Bp79hA2q)。
 *
 * ★ 使用者拍板「三個網址全部保留、不刪不轉址」(他分享出去的連結不該壞),
 *   所以解法不是減網址,而是**讓漏推變成不可能**:一個指令推三個,推完自己驗。
 * ★ 正式網址是 `3d-chinese-chess.pages.dev`(和 repo 名、統計 id 三處一致);
 *   另兩個是別名,內容必須逐位元相同。
 *
 * 跑法:npm run deploy         (= build + 推三站 + 驗三站指紋一致)
 *      npm run deploy -- --skip-build   (dist 已經是最新時)
 *
 * ⚠ 刻意**不把 wrangler 藏進 npm script 的一行**:守門 hook 要看得到部署目錄
 *   (`--assets` / `deploy dist` 這種字樣),藏起來等於關掉守門。所以這支腳本明著呼叫。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL = '3d-chinese-chess';                 // 正式網址(文件、統計、對外都用這個)
const PROJECTS = [CANONICAL, '3dchinesechess', '3dchinese'];
const skipBuild = process.argv.includes('--skip-build');

const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: true });

if (!skipBuild) {
  console.log('\n▶ build');
  run('npm', ['run', 'build']);
}

/** dist/index.html 裡的 assets/index-XXXX.js —— 這一版的指紋 */
function fingerprint(html) {
  const m = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/);
  return m ? m[0] : null;
}
const local = fingerprint(readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8'));
if (!local) {
  console.error('🔴 讀不到 dist/index.html 的 build 指紋 —— 先 npm run build');
  process.exit(1);
}
console.log(`\n▶ 這一版指紋:${local}`);

for (const project of PROJECTS) {
  console.log(`\n▶ 部署 ${project}`);
  run('npx', ['wrangler', 'pages', 'deploy', 'dist',
    '--project-name', project, '--branch', 'main', '--commit-dirty=true']);
}

/* 驗收:三站都要是**這一版**的指紋。
   ⚠ 用 no-cache + 隨機查詢字串:Cloudflare 邊緣會拿剛才抓過的舊檔給你
     (0909 實際被騙過兩次,第一次以為部署沒生效)。 */
console.log('\n▶ 驗三站指紋(要三個都等於 ' + local + ')');
let bad = 0;
for (const project of PROJECTS) {
  const url = `https://${project}.pages.dev/?b=${Date.now()}${Math.random()}`;
  let got = null;
  for (let tryNo = 1; tryNo <= 6; tryNo++) {          // 邊緣快取有時要幾秒才換
    try {
      const html = execFileSync('curl', ['-s', '--max-time', '25',
        '-H', 'Cache-Control: no-cache', url], { encoding: 'utf8' });
      got = fingerprint(html);
      if (got === local) break;
    } catch { /* 網路抖一下就重試 */ }
    execFileSync('node', ['-e', 'setTimeout(()=>{},5000)'], { stdio: 'ignore' });
  }
  const ok = got === local;
  if (!ok) bad++;
  console.log(`  ${ok ? '🟢' : '🔴'} ${project}.pages.dev → ${got || '(讀不到)'}`);
}

if (bad) {
  console.error(`\n🔴 有 ${bad} 站不是這一版 —— 三個網址內容必須相同,否則有人會拿到舊版而看不出來。`);
  process.exit(1);
}
console.log(`\n🟢 三站都是 ${local};正式網址 https://${CANONICAL}.pages.dev`);
