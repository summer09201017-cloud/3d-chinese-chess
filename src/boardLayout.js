/* 📐 棋盤版面的**單一真相來源**(2026-09-10 立)。
 *
 * 由來:使用者「3d-chinese-chess 橫式棋盤要更寬,至少跟 3d-xiangqi 與 xiangqi-arena 一樣寬」。
 *   查出來真因不是相機、不是 margin —— 是**棋盤本身的比例不一樣**:
 *     · 姊妹站(3D-Xiangqi / xiangqi-arena):SQUARE_SIZE_X = 10、SQUARE_SIZE_Y = **8.5**
 *       (它們的註解寫「讓棋盤長度(Y軸)短一點,符合視覺比例」)⇒ 棋盤 90 寬 × 85 深,比例 1.06
 *     · 本站:9 寬 × 10 深的**正方格** ⇒ 比例 0.9
 *   橫式螢幕的 fit 是被「深度」卡住的(寬度那邊還有一大堆餘裕),深度越短鏡頭越能靠近,
 *   寬度就填得越滿。0.9 vs 1.06 差了 18%,這就是三站並排時「這站比較小」的全部原因。
 *   ⇒ 本檔把行距改成 0.85(= 8.5/10,和姊妹站同一個視覺比例),棋盤變成 9 寬 × 8.5 深。
 *
 * ★ 為什麼要有這支檔:格線、棋子、提示標記、點擊反算、相機 fit —— 五個地方都要用同一組數字。
 *   改版面時只要有一處沒跟上,症狀是「棋子跟格線對不齊」或「點空格點到隔壁」,而且**不會報錯**。
 *   ⇒ 一律從這裡 import,不要在各檔重寫 `y - 4.5` 這種魔術數字。
 */

export const FILES = 9;          // 直線(x 方向)9 條
export const RANKS = 10;         // 橫線(z 方向)10 條
export const FILE_GAP = 1;       // 直線間距
/* 橫線間距。0910 從 1.0 改 0.85(姊妹站 8.5/10 的視覺比例,橫式才填得滿);
   2026-09-13 使用者:「棋子間的距離再拉大一點」⇒ 0.85 → 0.92。
   ★ 為什麼是拉行距、不是縮棋子:棋子最寬 0.80,行距 0.85 時前後相鄰兩顆只剩 0.05 的縫
     (幾乎貼著;直線方向的縫是 0.20)。縮棋子會連字一起縮(使用者才剛嫌後排字小),
     拉行距只動縫。0.92 ⇒ 前後縫 0.12(2.4 倍),左右縫不變。
   ⚠ 行距變深 ⇒ 橫式的 fit 要退得更遠、棋盤會變小 —— 這一輪靠 fitCamera 的「注視點對準投影中心」
     把距離省回來(見 fitCamera.js fitLandscape),兩件事要一起看,不能只改這裡。 */
export const RANK_GAP = 0.92;

/** 棋盤木板的尺寸(格線外各留半格,和原本 9×10 的留白比例一致) */
export const BOARD_W = FILES * FILE_GAP;   // 9
export const BOARD_D = RANKS * RANK_GAP;   // 8.5

/* 格座標的中心點:x ∈ [0,8] → 中心 4;y ∈ [0,9] → 中心 4.5 */
const CX = (FILES - 1) / 2;      // 4
const CY = (RANKS - 1) / 2;      // 4.5

/** 格座標 → 世界座標(回傳 [worldX, worldZ]) */
export function gridToWorld(x, y) {
  return [(x - CX) * FILE_GAP, (y - CY) * RANK_GAP];
}

/** 世界座標 → 格座標(點空格時反算用)。
 *  ⚠ scale:場景 group 有縮放(本站桌機 1.2 / 手機 1.0),反算一定要把它除掉 ——
 *    原本 App.jsx 寫死 `/1.2`,在手機(scale 1.0)上就會算到隔壁格(既有 bug,一併修掉)。 */
export function worldToGrid(worldX, worldZ, scale = 1) {
  return [
    Math.round(worldX / (scale * FILE_GAP) + CX),
    Math.round(worldZ / (scale * RANK_GAP) + CY),
  ];
}

/* 🔴 棋子尺寸:最寬處必須 < RANK_GAP,否則上下相鄰的棋子會疊在一起。
   姊妹站的比例是 PIECE_RADIUS 4 : SQUARE_SIZE_Y 8.5 = 94%,這裡照抄:
   原本的 0.40 : 0.42 : 0.45(上緣:中段:最寬)等比縮到最寬 = 0.40
   ⇒ 0.356 : 0.373 : 0.400,剛好也是姊妹站 3.56 : 3.73 : 4.00 除以 10。 */
export const PIECE_R_TOP = 0.356;
export const PIECE_R_MID = 0.373;
export const PIECE_R_BASE = 0.400;
