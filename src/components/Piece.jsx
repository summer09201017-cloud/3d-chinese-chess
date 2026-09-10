import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { gridToWorld, PIECE_R_TOP, PIECE_R_MID, PIECE_R_BASE } from '../boardLayout.js';

function getPieceDetails(type) {
    const isRed = type >= 'A' && type <= 'Z';
    const t = type.toLowerCase();
    let label = '';
    if (t === 'k') label = isRed ? '帥' : '將';
    else if (t === 'a') label = isRed ? '仕' : '士';
    else if (t === 'b') label = isRed ? '相' : '象';
    else if (t === 'n') label = isRed ? '傌' : '馬';
    else if (t === 'r') label = isRed ? '俥' : '車';
    else if (t === 'c') label = isRed ? '炮' : '砲';
    else if (t === 'p') label = isRed ? '兵' : '卒';

    return { isRed, label };
}

/* 🔴 「這顆吃得到」的顏色(2026-09-09 使用者指定:
     「讓炮能夠吃的棋子變成其他顏色,AI 提示也要」)。
   ★ 為什麼特別是炮:車馬象的吃子目標就在走的路徑上,看得出來;**炮要隔一顆打**,
     目標不相鄰、中間還隔著別的棋子 ⇒ 小朋友根本看不出「原來那一顆吃得到」。
   ★ 為什麼要染主體:綠點是畫在**格子**上的,而可吃的目標那一格**站著一顆棋子**
     ⇒ 點被棋子壓住,等於沒畫。染那一顆本身才看得到。
   ★ 配色分工:🟠 橘 = 我選的那一顆(只有一顆) 🔴 紅 = 這些吃得到 🟢 綠 = 可以走到這裡(空點)
   ★ 上層用**淡**珊瑚紅、底座用濃紅:字是紅/深藍的 3D Text 疊在上面,底色太濃就讀不出來。
   ⚠ selected 與 capturable 不會同時成立(選的是自己的子、吃的是對方的子),
     但還是明確給 selected 優先,免得將來有人加「選對方的子看它能走哪」時靜靜地兩色打架。 */
const TOP = { normal: '#fdfaf6', selected: '#f4a261', capturable: '#ff8a80' };
const BOTTOM = { normal: '#4CAF50', selected: '#2e7d32', capturable: '#c62828' };

export function Piece({ x, y, type, selected, capturable, onClick }) {
    const { isRed, label } = getPieceDetails(type);

    /* 座標一律走 boardLayout(2026-09-10 行距改 0.85 之後,寫死 `y - 4.5` 會跟格線錯開) */
    const [px, pz] = gridToWorld(x, y);
    const py = 0.25; // Height above board

    const color = isRed ? '#e63946' : '#1d3557';
    const state = selected ? 'selected' : (capturable ? 'capturable' : 'normal');

    return (
        <group position={[px, py, pz]} onClick={onClick}>
            {/* Top Half */}
            <mesh castShadow receiveShadow position={[0, 0.05, 0]}>
                <cylinderGeometry args={[PIECE_R_TOP, PIECE_R_MID, 0.15, 32]} />
                <meshStandardMaterial color={TOP[state]} />
            </mesh>

            {/* Bottom Half (Green / 選中深綠 / 吃得到深紅) */}
            <mesh position={[0, -0.1, 0]}>
                <cylinderGeometry args={[PIECE_R_MID, PIECE_R_BASE, 0.15, 32]} />
                <meshStandardMaterial color={BOTTOM[state]} />
            </mesh>

            {/* Text Label */}
            <Text
                position={[0, 0.16, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={0.4}
                color={color}
                outlineWidth={0.01}
                outlineColor={color}
                anchorX="center"
                anchorY="middle"
            >
                {label}
            </Text>
        </group>
    );
}
