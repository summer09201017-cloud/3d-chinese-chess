# 3D 中國象棋(repo `3d-chinese-chess`)

React + Three.js 的 3D 中國象棋 PWA,單機對 AI。

## 線上網址

**正式網址(對外只講這一個)**:<https://3d-chinese-chess.pages.dev>

同一份 build 另外掛兩個**別名**(2026-09-09 使用者拍板「三個全部保留、不刪不轉址」——
分享出去的連結不該壞):

| 網址 | CF 專案名 | 角色 |
|---|---|---|
| <https://3d-chinese-chess.pages.dev> | `3d-chinese-chess` | **正式**(和 repo 名、統計 id 三處一致) |
| <https://3dchinesechess.pages.dev> | `3dchinesechess` | 別名 |
| <https://3dchinese.pages.dev> | `3dchinese` | 別名 |

★ 為什麼正式網址選 `3d-chinese-chess`(0909 使用者指正我原本選 `3dchinese` 的理由太隨便):
repo 名、play-stats 的 id、對外網址**三處一致**,以後不會有人搞錯是哪個站;
而 `3dchinese` 看不出是象棋。

### ⚠ 三個網址內容必須相同 —— 用 `npm run deploy`,不要手動貼三行

```bash
npm run deploy                  # build → 推三站 → 自動比對三站 build 指紋
npm run deploy -- --skip-build  # dist 已是最新時
```

`scripts/deploy-all.mjs` 推完會抓三站的 `assets/index-*.js` 比對,有一站不一致就 exit 1。
**手動貼三行 wrangler 的老辦法漏一行就有網址停在舊版,而畫面上看不出來** ——
0909 實測抓到同一種病的鄰居(見下面 netlify 那段)。
驗收要帶 `Cache-Control: no-cache` + 隨機查詢字串:Cloudflare 邊緣會把剛抓過的舊檔再給你一次
(0909 被騙過兩次,第一次以為部署沒生效)。

### 🔀 三個舊 `*.netlify.app` 已掛 301(2026-09-09)

`3dchinese` / `3dchinesechess` / `3d-chinese-chess`**.netlify.app** 三個都還活著,
而且在餵**更舊的 build**(`index-Bp79hA2q` vs 當時正版 `index-CyqHgBnS`)⇒
從舊連結進來的人會拿到舊版,畫面上完全看不出來。已全部改成 301 殼轉到正式網址。

殼在 `netlify-301/`,兩個檔各有責任:

- `_redirects`:深路徑與資產一律 `301!` 到正式網址(查詢字串自動帶走)。
- `index.html`:根路徑**刻意不 301**,先跑一段「解除舊 Service Worker + 清掉它的快取」再轉。
  ★ 理由:舊站曾經是可安裝的 PWA,舊 SW 是 cache-first ⇒ 從手機自己的快取端出整包程式、
    **根本不連網**,只放 301 的話裝過的人永遠看不到新版。
    (0909 的活證據:使用者手機上還在玩 `3chinese.netlify.app`,而那個站早就從 Netlify 被刪了。)

還原點(要復原成完整站時用):`3dchinese` `6a96d67eac937900086c1c47` /
`3dchinesechess` `6a96d67e99fc2c0008fa4887` / `3d-chinese-chess` `6a96d67eddae95000804b2cb`。
**留置一個月後再刪站**(照 skill `netlify-to-cloudflare-migrate` 慣例)。
⚠ 三站的 `build_settings.stop_builds` 已是 true,**不要關掉** ——
Netlify 一重新建置就會用 repo 的 `npm run build` 把 301 殼蓋回完整站
(`5chess` 0903 就是推個 README 觸發重建、殼被蓋掉,得重掛一次)。

### 為什麼會有三個網址(0909 查證)

重複**不是**在 Cloudflare 產生的,是**從 Netlify 帶過來的**:這個 repo 在 Netlify 帳號下有三個站
(`netlify sites:list` 實查,三個都 `stop_builds: true`、都有 published deploy),
搬 CF 時一個 Netlify 站對一個 CF 專案地把每個活著的網址都保下來 ⇒ 三個 CF 專案。
根因是同一個 repo 被**重複接上 Netlify** 好幾次,每接一次多一個站、每個站都吃 push 自動建置
—— 正是 0719「Netlify 幾乎每天加值 $10」的來源(見 skill `netlify-autobuild-stop`)。
## 功能

- PvAI,難度 1~10(對應搜尋深度 2~5),含五種開局譜(中炮 / 屏風馬 / 飛象 / 挺卒 / 自動)。
- 💡 **AI 提示**:紫色標記 + 順手把那顆棋選起來,接著點紫格就走完。
- 悔棋、3D 自由轉視角、PWA 可安裝可離線、⛶ 手機放大鈕。

## 💡 AI 提示的規矩(2026-09-07 大改,四站統一)

使用者退件原話:「提示常叫我吃掉哪一個對手,我吃掉之後又被對手其他棋子吃掉,這樣等於交換被吃」。
**本站兩條經典病因都在**(全棋類體檢確認):

1. **同分偏好吃子**:`evaluateBoard` 只加總子力 ⇒ 中局九成的走法都是「0 分平手」;
   而根層是 `moves.sort(() => Math.random() - 0.5)` + 「分數嚴格變好才換人」⇒ 平手裡隨機挑一個,
   等價交換就這樣被當成建議送出來。
2. **只看 3 步的視界**:深度 3 是奇數層,「我吃 → 他回吃 → 我再吃」看起來賺,第 4 步他再吃回來看不到。
3. **本站獨有的第三條**:提示深度跟著玩家選的難度走(`Math.max(difficulty, 6)`)——
   選「簡單」時提示只有 depth 2,幾乎等於隨便給。

修法(`src/game/ai.js`):

- **PST 位置表**:沿用姊妹站 `3D-Xiangqi` 已驗證的那組(馬走盤河、車出直線、卒過河都拿得到分)。
  ⚠ 座標不同:那站紅方在 row 0-4 往上走,本站紅方在 y=6~9 往 y 減少走 ⇒ 紅子查 `PST[9-y][x]`、黑子查 `PST[y][x]`。
  士象王不給位置分(留家守宮,亂加分會把它們趕出九宮)。
- **葉子靜態搜尋 `quiescence()`**:到葉子後只繼續走吃子(qdepth 4),不停在「吃到一半」的局面。
- **`getHintMove()`**:提示專用,固定 depth 3、零隨機、兩段式 —— 先搜安靜手拿到最好的走位手,
  吃子要**同時過兩關**才建議:①子力關 `captureGain > 0`(`materialQuiesce` 只看子力算到底;吃王例外)
  ②分數關 `HINT_TRADE_MARGIN = 50`(半個兵)。兩關過不了就建議走位。
- **MVV-LVA `orderMovesInPlace`**:不改分數只改快慢,提示反而從 123ms 降到 **57ms**。

AI 對手仍走 `getBestMoveAlphaBeta`(該換就換,棋力不受門檻約束)。

★ 誠實寫下缺點:少數「換掉對方關鍵防守子」的等價交換也會被跳過,提示因此偏保守 —— 這是為了不教壞初學者刻意付的代價。

## 跑 / 測 / 部署

```bash
npm install
npm run dev                 # 開發
npm test                    # test/ai.mjs 11 項(提示品質:陷阱局面 + 30 隨機中局獨立裁判)
npm run lint                # ⚠ 有 4 個既有問題(3 error 1 warning),不是這輪造成的
npm run build               # 產出 dist/
npm run serve               # 另一個視窗:靜態伺服 dist/(埠 8799)
npm run check               # 真瀏覽器冒煙 10 項(💡 提示;要先 build + serve)
```

部署(⚠ **直傳站,`git push` 不會上線**):

```bash
npm run deploy      # build → 推三站 → 驗三站指紋一致(見上面「線上網址」)
```
## 檔案在哪

| 檔 | 責任 |
|---|---|
| `src/App.jsx` | 接線(棋盤互動 / 提示 / 難度 / 開局譜);`HintIndicator` 紫色標記 |
| `src/game/logic.js` | `GameEngine`:盤面、走法規則、zobrist hash、move/undo |
| `src/game/ai.js` | 評估(子力 + PST)、`quiescence`、`searchAlphaBeta`、`getBestMoveAlphaBeta`(對手)、`getHintMove`(提示) |
| `test/ai.mjs` | `npm test`:提示品質(獨立裁判 `refQuiesce` 只看子力、只走吃子) |
| `scripts/browser-check.mjs` | 真瀏覽器冒煙(真滑鼠點擊,不在 evaluate 裡呼叫函式) |
| `scripts/serve-dist.mjs` | 零相依靜態伺服器,給 browser-check 用 |

## 本機地雷

- **PWA 用 `vite-plugin-pwa` 的 `autoUpdate`** ⇒ 每次 build 產生新 SW,不必手動 bump 版號
  (與艦隊其他手寫 `sw.js` 的站不同)。
- **`getLegalMoves()` 是偽合法**:原始碼註解寫明「不檢查走完會不會被將」,終局靠
  「王被吃掉」(`history[last].captured === 'k'`)判定。加任何搜尋邏輯都要照這套語意,別假設它會擋自將。
- **搜尋內部的分數是「紅方為正」的絕對分,不是 negamax**;`maximizing` ⟺ `engine.turn === 'w'`。
- 頁面 `<title>` 是 `3d-an`(專案名沿用範本),不是打錯字。
- 姊妹站 `3D-Xiangqi`(單機版)與 `xiangqi-arena`(對局場)是**另外兩個 repo**、另外兩個 CF 專案,
  引擎不同、題庫不同,別搞混。
