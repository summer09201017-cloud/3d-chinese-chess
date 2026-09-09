/* 🔬 守「版本號與改版簡歷」不漂(2026-09-09 立;艦隊鐵則⑦)
 *
 * 由來:使用者指出「這個站沒有版本號,也沒有簡歷」——本站從上線就一直沒有。
 *   補上之後最容易發生的下一個病是「加了功能但忘了寫進簡歷」:
 *   畫面上的版號停在舊的、老師看不出更新過,而**不會有任何測試變紅**。這支就是那個「人」。
 *
 * 它不管文案寫得好不好(白話品質只有人能判斷),只守機器驗得出來的四件事。
 * 跑法:node test/version.mjs
 */
import { VERSION, DATE, CHANGELOG } from '../src/version.js';

let pass = 0, fail = 0;
const ok = (cond, msg, note = '') => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ ' + msg + (note ? ' → ' + note : '')); }
};
const num = (v) => Number(String(v).replace(/^v/, ''));

ok(/^v\d+$/.test(VERSION), `VERSION 格式是 vN(${VERSION})`);
ok(/^\d{4}-\d{2}-\d{2}$/.test(DATE), `DATE 格式是 YYYY-MM-DD(${DATE})`);
ok(Array.isArray(CHANGELOG) && CHANGELOG.length > 0, '有 CHANGELOG');

ok(CHANGELOG[0] && CHANGELOG[0].v === VERSION,
  `★ VERSION === CHANGELOG 最新那一則(改版忘了寫簡歷 ⇒ 這條紅):${VERSION} vs ${CHANGELOG[0] && CHANGELOG[0].v}`);
ok(CHANGELOG[0] && CHANGELOG[0].date === DATE,
  `★ DATE === 最新那一則的日期:${DATE} vs ${CHANGELOG[0] && CHANGELOG[0].date}`);

// 版號從新到舊、一路到 v1,不跳號也不重複
const vs = CHANGELOG.map((c) => num(c.v));
const want = [];
for (let v = num(VERSION); v >= 1; v--) want.push(v);
ok(JSON.stringify(vs) === JSON.stringify(want),
  `★ 版號 vN → v1 不跳號不重複(跳號 = 有一版沒寫進來):${vs.join(',')} 預期 ${want.join(',')}`);

// 每一則都要有日期與**看得懂的**說明(白話品質人來判斷,長度機器可以守)
for (const c of CHANGELOG) {
  ok(/^\d{4}-\d{2}-\d{2}$/.test(c.date || ''), `${c.v} 有日期(${c.date})`);
  ok(typeof c.text === 'string' && c.text.length >= 30,
    `${c.v} 的說明不是一句空話(${(c.text || '').length} 字)`);
  ok(!/\b(refactor|commit|函式|function|const |=>)\b/.test(c.text || ''),
    `${c.v} 的說明是寫給家長老師看的,不是 commit 訊息`);
  /* 📝 文案用 `**粗體**` 標重點,由 App.jsx 的 richText() 用 split('**') 交替加粗
       ⇒ **星號必須成對**。不成對的話最後多出來的那一段會整段變粗體
         (只是把「畫面印出星號」換成「半句莫名變粗」,一樣是壞的,而且更難發現)。
     ★ 由來:0909 實查 v2 那則從上線起就把 `**` 原封不動印在畫面上 ——
       React 的 {c.text} 是純文字,不會渲染 Markdown。沒有任何測試會紅、畫面也沒有錯誤。 */
  const stars = ((c.text || '').match(/\*\*/g) || []).length;
  ok(stars % 2 === 0, `${c.v} 的 ** 粗體標記成對(${stars} 個)`);
}

console.log((fail ? '🔴' : '🟢') + ` version:${pass} 過 / ${fail} 失敗`);
if (fail) process.exitCode = 1;
