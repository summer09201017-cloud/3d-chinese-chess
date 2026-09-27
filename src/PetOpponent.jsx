/* PetOpponent.jsx — 🐾 動物對手的 R3F 殼(2026-09-28)。
 *
 * 為什麼是 Canvas 裡的元件:scene / camera 只有 useThree 拿得到,每幀更新要 useFrame。
 * 這一支只管「建 / 拆 / 每幀更新 / 屬性變了就重坐」;誰坐、坐哪、讓位、反應都在 src/opponent.js(純 three,不吃 React)。
 * ★ OrbitControls 是同一個 Canvas 裡晚一拍才掛上來的(controlsRef 一開始是 null)⇒ Opponent 用 getter 每次現讀,不在建構時抓死。
 * ★ App 端用 petRef.current.react(...) 接事件(走子 / 將軍 / 結束),跟口白同一個分岔;純觀感,沒有它棋照下。
 */
import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Opponent } from './opponent.js';

export function PetOpponent({ petRef, controlsRef, refitRef, scale, kind, mode, hidden, voice, getCtx }) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const opp = useRef(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  useEffect(() => {
    const o = new Opponent({
      scene,
      getCamera: () => camera,
      getControls: () => controlsRef.current,
      getScale: () => scaleRef.current,
      voice,
    });
    opp.current = o;
    if (petRef) petRef.current = o;
    return () => {
      o.dispose();
      if (petRef && petRef.current === o) petRef.current = null;
      opp.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, camera]);

  /* 難度換了(換一隻)/ 三段開關 / 2D・編輯(收起)/ 手機↔桌機(group scale)⇒ 重坐 + 讓相機重算距離(保留方向) */
  useEffect(() => {
    const o = opp.current;
    if (!o) return;
    o.setMode(mode);
    o.setHidden(hidden);
    o.seat(kind);
    o.reseat();
    if (refitRef && refitRef.current) refitRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, mode, hidden, scale]);

  useFrame((_, dt) => {
    const o = opp.current;
    if (o) o.update(Math.min(0.05, Math.max(0, dt || 0)), getCtx ? getCtx() : {});
  });

  return null;
}
