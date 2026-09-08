# 3D 中國象棋(repo `3d-chinese-chess`)

React + Three.js 的 3D 中國象棋 PWA,單機對 AI。

## 線上網址(⚠ 同一份 build 部署到三個 Cloudflare Pages 專案)

| 網址 | CF 專案名 |
|---|---|
| https://3d-chinese-chess.pages.dev | `3d-chinese-chess` |
| https://3dchinesechess.pages.dev | `3dchinesechess` |
| https://3dchinese.pages.dev | `3dchinese` |

三個網址內容相同(頁面 `<title>` 都是 `3d-an`)。**改一次要部署三次**,否則三站版本會漂。

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

部署(⚠ **直傳站,`git push` 不會上線;而且要傳三次**):

```bash
npm run build
npx wrangler pages deploy dist --project-name 3d-chinese-chess  --branch main --commit-dirty=true
npx wrangler pages deploy dist --project-name 3dchinesechess    --branch main --commit-dirty=true
npx wrangler pages deploy dist --project-name 3dchinese         --branch main --commit-dirty=true
```

線上驗收(比對 build 指紋,三站要一致):

```bash
ls dist/assets/index-*.js                                   # 本機這次的檔名
curl -s "https://3d-chinese-chess.pages.dev/?b=$RANDOM" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
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
