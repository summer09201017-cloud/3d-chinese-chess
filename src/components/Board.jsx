import React from 'react';
import { Line } from '@react-three/drei';
import { FILES, RANKS, BOARD_W, BOARD_D, gridToWorld } from '../boardLayout.js';

/* 座標一律走 boardLayout 的 gridToWorld,不要再寫死 `y - 4.5`
   —— 2026-09-10 行距從 1.0 改成 0.85(對齊姊妹站的視覺比例)時,
   格線/棋子/提示/點擊反算五處只要有一處沒跟上就會對不齊,而且不會報錯。 */
export function Board({ onBoardClick }) {
    const linePoints = [];
    const lineColor = '#594433';
    const lineWidth = 2;
    const zAt = (rank) => gridToWorld(0, rank)[1];    // 第 rank 條橫線的 z
    const xAt = (file) => gridToWorld(file, 0)[0];    // 第 file 條直線的 x
    const zTop = zAt(0);
    const zBottom = zAt(RANKS - 1);
    const zRiverTop = zAt(4);                         // 河界上緣(第 5 條橫線)
    const zRiverBottom = zAt(5);                      // 河界下緣(第 6 條橫線)

    // 橫線 10 條
    for (let y = 0; y < RANKS; y++) {
        linePoints.push([[xAt(0), 0, zAt(y)], [xAt(FILES - 1), 0, zAt(y)]]);
    }

    // 直線 9 條(中間七條在河界斷開)
    for (let x = 0; x < FILES; x++) {
        if (x === 0 || x === FILES - 1) {
            linePoints.push([[xAt(x), 0, zTop], [xAt(x), 0, zBottom]]);
        } else {
            linePoints.push([[xAt(x), 0, zTop], [xAt(x), 0, zRiverTop]]);
            linePoints.push([[xAt(x), 0, zRiverBottom], [xAt(x), 0, zBottom]]);
        }
    }

    // 兩座九宮的斜線
    const zP1 = zAt(2);      // 上方九宮的內緣(第 3 條橫線)
    const zP2 = zAt(RANKS - 3);
    linePoints.push([[xAt(3), 0, zTop], [xAt(5), 0, zP1]]);
    linePoints.push([[xAt(5), 0, zTop], [xAt(3), 0, zP1]]);
    linePoints.push([[xAt(3), 0, zP2], [xAt(5), 0, zBottom]]);
    linePoints.push([[xAt(5), 0, zP2], [xAt(3), 0, zBottom]]);

    return (
        <group>
            {/* Wooden Board Base */}
            <mesh receiveShadow position={[0, -0.2, 0]} onClick={onBoardClick}>
                <boxGeometry args={[BOARD_W, 0.4, BOARD_D]} />
                <meshStandardMaterial color="#ebc38a" roughness={0.8} />
            </mesh>

            {/* Grid Lines */}
            {linePoints.map((pts, idx) => (
                <Line key={idx} points={pts} color={lineColor} lineWidth={lineWidth} position={[0, 0.01, 0]} />
            ))}
        </group>
    );
}
