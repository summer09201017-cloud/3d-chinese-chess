/* opponent.js — 這一站的 🐾 動物對手接線(本站專屬;動物引擎 animals.js、人聲 voice.js 兩支與 skill animal-opponent-kit 同一份,不在這裡改)
 *
 * 對手是誰就坐誰:難度 1~3 🐰 白兔 / 4~6 🐱 橘貓 / 7~8 🐻 棕熊 / 9~10 🦉 貓頭鷹(select 十檔,四隻分四段);
 * 2D 模式(鏡頭釘在正上方,看不到牠)與 🧩 編輯殘局時收起、不讓位。本站永遠是「你 vs 電腦」,沒有兩人同機。
 * ★ 本站世界是 Y-up(棋盤躺 XZ、盤面 y=0、板厚 0.4 在 y<0),跟 gomoku3d 同一個座標系 ⇒ 座位算法照抄,不用轉父群組。
 *   棋盤與棋子都在一個 <group scale=1.2|1.0> 底下,動物直接掛在 scene(世界座標),所以半盤要乘上那個 scale。
 * ★ 座位永遠在「相機的對面」:每幀量 OrbitControls 的方位角(2° 一格)變了就重擺;🔃 換邊跟著坐到另一側。
 *   坐的距離 = 矩形盤緣(照方向算)+ 1.25 × scale(掌心搭到盤沿)。
 * ★ 相機讓位:fitCamera.js 的 `extra(dir)` 收牠的頭頂(+EAR_ROOM),距離最多拉到 1.28 倍;正俯視(≥76°)不讓。
 * ★ 純觀感:不進 raycast(group 不掛 onClick;R3F 的 raycast 只打有 handler 的 mesh)、不進 AI、不影響棋力。
 */
import * as THREE from 'three';
import { AnimalFigures, ANIMALS, HEAD_TOP_LOCAL_Y } from './animals.js';
import { BOARD_W, BOARD_D } from './boardLayout.js';

export { ANIMALS };
export const PET_KEY = '3dcc-pet';
export const PET_MODES = ['voice', 'mute', 'off'];
export function loadPetMode() { try { const v = localStorage.getItem(PET_KEY); return PET_MODES.includes(v) ? v : 'voice'; } catch { return 'voice'; } }
export function savePetMode(m) { try { localStorage.setItem(PET_KEY, m); } catch { /* 私密模式:這場有效 */ } }
/** 難度(搜尋深度 1~10)→ 哪一隻 */
export function animalFor(depth) {
  const d = Number(depth) || 2;
  if (d <= 3) return 'rabbit';
  if (d <= 6) return 'cat';
  if (d <= 8) return 'bear';
  return 'owl';
}

const SEAT = 'ai';
/* 動物多大?照 gomoku3d / 3D-Xiangqi 的比例(0927「看螢幕不看尺」)起跳 0.215/1.3,再照**這一站的相機**收斂(0928 實測):
   本站橫式的 fit 是 70° 俯角 + 注視點偏向玩家、遠邊頂到畫面上緣(fitLandscape),比姊妹站緊得多 ——
   0.215 倍時頭頂 NDC 1.16,要 1.50 倍距離才裝得下;讓注視點也能往遠邊偏(fitCamera tzMin)後 0.215 仍要 1.34 倍、0.17 倍 1.26 倍(≤ 上限 1.28)
   ⇒ 取 0.17:桌機 group 1.2 ⇒ 動物 0.72、頭直徑 ≈ 1.6 顆棋子;手機 1.0 ⇒ 0.60。牠在螢幕上比五子棋那隻小一號,但整顆頭都在。 */
const SCALE_PER_HALF = 0.17 / 1.3;
const EAR_ROOM = 0.55;      // 取景點比頭頂再高一點,貓 / 熊耳尖才不會貼邊被切
const PITCH_HIDE = 76;      // 俯角 ≥ 這個就不為牠讓位(正俯視看不到牠)
const YAW_STEP_DEG = 2;     // 相機方位角每差 2° 才重擺(OrbitControls 阻尼期間每幀都在微動)
const BOARD_BOTTOM = -0.4;  // 板底(Board.jsx boxGeometry 0.4 厚、中心 y=-0.2)

export class Opponent {
  /**
   * @param {{scene:THREE.Scene, getCamera:()=>THREE.Camera, getControls:()=>object|null, getScale:()=>number, voice?:object}} o
   */
  constructor({ scene, getCamera, getControls, getScale, voice }) {
    this.scene = scene;
    this.getCamera = getCamera;
    this.getControls = getControls;
    this.getScale = getScale;
    this.voice = voice || null;
    this.figs = new AnimalFigures(scene);
    this.kind = null;
    this.mode = loadPetMode();
    this.hidden = false;
    this._seatKey = null;
    this.thinkCount = 0;
    this.chat = { idleMs: 0, said: 0, first: 15000, every: 30000, max: 2, log: [] };
  }
  get on() { return this.mode !== 'off' && !!this.kind && !this.hidden; }
  get voiceOn() { return this.mode === 'voice'; }
  get emoji() { return this.kind ? ANIMALS[this.kind].emoji : ''; }
  get name() { return this.kind ? ANIMALS[this.kind].name : ''; }
  get figure() { return this.figs.bySeat(SEAT); }

  setMode(m) {
    if (!PET_MODES.includes(m)) return false;
    this.mode = m; savePetMode(m);
    this.figs.setVisible(this.on);
    return true;
  }
  /** 2D 模式 / 編輯殘局 ⇒ 收起(不佔取景點) */
  setHidden(h) { this.hidden = !!h; this.figs.setVisible(this.on); }

  /** 難度換了 / 開局:換人就換動物;null 收起 */
  seat(kind) {
    if (kind !== this.kind) {
      this.kind = kind;
      if (!kind) this.figs.remove(SEAT);
      else this.figs.setKind(SEAT, kind, this._placement());
      this._seatKey = this._key();
    }
    this.figs.setVisible(this.on);
    this.figs.cancel(SEAT);
    this.chat.idleMs = 0; this.chat.said = 0; this.thinkCount = 0;
  }
  /** group scale 變了(手機 ↔ 桌機)⇒ 重擺 */
  reseat() { if (this.kind) { this.figs.place(SEAT, this._placement()); this._seatKey = this._key(); } }

  /* ── 幾何 ── */
  _dir(dir) {
    if (dir) return { x: dir[0], y: dir[1], z: dir[2] };
    const cam = this.getCamera(), c = this.getControls();
    if (!cam) return { x: 0, y: 0.9, z: 0.4 };
    const v = cam.position.clone(); if (c && c.target) v.sub(c.target);
    const n = v.length() || 1;
    return { x: v.x / n, y: v.y / n, z: v.z / n };
  }
  _geom(dir) {
    const s = this.getScale() || 1;
    const halfX = (BOARD_W / 2) * s, halfZ = (BOARD_D / 2) * s;
    const scale = Math.max(halfX, halfZ) * SCALE_PER_HALF;
    const d = this._dir(dir);
    const h = Math.hypot(d.x, d.z) || 1;
    const ux = d.x / h, uz = d.z / h;
    const edge = Math.min(halfX / Math.max(Math.abs(ux), 1e-6), halfZ / Math.max(Math.abs(uz), 1e-6));
    const R = edge + 1.25 * scale;
    const dy = 0 - 0.4 * scale;                       // 掌心(本地 y 0.4)落在盤面 y=0
    const floorY = BOARD_BOTTOM * s;
    const legDrop = (dy - floorY) / scale;
    return { scale, R, dy, legDrop, floorY, ux, uz, pitchDeg: Math.asin(Math.max(-1, Math.min(1, d.y))) * 180 / Math.PI };
  }
  _key() { const g = this._geom(); return Math.round(Math.atan2(g.ux, g.uz) * 180 / Math.PI / YAW_STEP_DEG); }
  _placement() {
    const g = this._geom();
    return { pos: { x: -g.ux * g.R, y: 0, z: -g.uz * g.R }, lookAt: { x: 0, z: 0 }, scale: g.scale, dy: g.dy, legDrop: g.legDrop };
  }
  /** 取景點(fitCamera.js 的 extra):頭頂 + 耳朵的餘裕;照 fit 決定的方向算,不等人物真的擺過去 */
  fitPoints(dir) {
    if (!this.on) return [];
    const g = this._geom(dir);
    if (g.pitchDeg >= PITCH_HIDE) return [];
    return [[-g.ux * g.R, g.dy + (HEAD_TOP_LOCAL_Y + EAR_ROOM) * g.scale, -g.uz * g.R]];
  }

  /** 🐾 反應 + 🗣 人聲同一個入口(沒動物 / 收起 ⇒ 略過) */
  react(kind, voiceEvent, delayMs = 0) {
    if (!this.kind) return false;
    const ok = this.figs.react(SEAT, kind);
    if (voiceEvent && this.on && this.voiceOn && this.voice) this.voice.say(this.kind, voiceEvent, delayMs);
    return ok;
  }
  /** 🤔 電腦開始想:姿勢每次都做,人聲每三手唸一次 */
  think() { this.thinkCount++; return this.react('think', this.thinkCount % 3 === 1 ? 'think' : null); }
  cancel() { this.figs.cancel(SEAT); }

  /** 每幀:相機方位變了就重擺;idle;閒聊計時(waiting = 正在等你走) */
  update(dt, { focus = null, waiting = false, reduced = false } = {}) {
    if (this.kind) {
      const k = this._key();
      if (k !== this._seatKey) { this._seatKey = k; this.figs.place(SEAT, this._placement()); }
    }
    this.figs.update(dt, { focus, turn: null, reduced });
    const c = this.chat;
    if (!waiting || !this.on) { c.idleMs = 0; c.said = 0; return; }
    c.idleMs += dt * 1000;
    if (c.said >= c.max || c.idleMs < c.first + c.said * c.every) return;
    c.said++;
    const ev = 'chat' + (1 + Math.floor(Math.random() * 3));
    c.log.push(ev); if (c.log.length > 20) c.log.shift();
    this.react('chat', ev);
  }
  noteInput() { this.chat.idleMs = 0; this.chat.said = 0; }

  dispose() { this.figs.remove(SEAT); this.kind = null; }

  /** smoke 用:哪一隻、看不看得到、頭頂在不在畫面、凳子有沒有落地、坐哪邊(螢幕 px 照 canvas 的 rect 算) */
  probe() {
    const f = this.figure;
    if (!f) return { kind: this.kind, on: this.on, figure: false, mode: this.mode, hidden: this.hidden };
    const cam = this.getCamera();
    const top = this.figs.headTop(SEAT).project(cam);
    const ctr = this.figs.headCenter(SEAT).project(cam);
    const stool = f.group.localToWorld(new THREE.Vector3(0, -f.pose.legDrop, 0));
    const cv = typeof document !== 'undefined' ? document.querySelector('canvas') : null;
    const rect = cv ? cv.getBoundingClientRect() : { left: 0, top: 0, width: 1, height: 1 };
    const px = (v) => ({ x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height });
    const c = px(ctr), t = px(top), rad = Math.hypot(c.x - t.x, c.y - t.y);
    return {
      kind: this.kind, on: this.on, figure: true, visible: f.group.visible, mode: this.mode, hidden: this.hidden,
      head: { x: +top.x.toFixed(3), y: +top.y.toFixed(3), inside: Math.abs(top.x) <= 1 && Math.abs(top.y) <= 1 },
      headBox: { l: Math.round(c.x - rad), t: Math.round(c.y - rad), r: Math.round(c.x + rad), b: Math.round(c.y + rad) },
      stoolY: +stool.y.toFixed(3), floorY: this._geom().floorY,
      pos: { x: +f.group.position.x.toFixed(2), z: +f.group.position.z.toFixed(2) },
      scale: +f.pose.scale.toFixed(3),
    };
  }
}
