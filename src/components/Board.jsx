import React from 'react';
import { Line } from '@react-three/drei';

export function Board({ onBoardClick }) {
    const linePoints = [];
    const lineColor = '#594433';
    const lineWidth = 2;

    // 10 Horizontal lines
    for (let y = 0; y < 10; y++) {
        linePoints.push([[-4, 0, y - 4.5], [4, 0, y - 4.5]]);
    }

    // Vertical lines
    for (let x = 0; x < 9; x++) {
        if (x === 0 || x === 8) {
            linePoints.push([[x - 4, 0, -4.5], [x - 4, 0, 4.5]]);
        } else {
            linePoints.push([[x - 4, 0, -4.5], [x - 4, 0, -0.5]]);
            linePoints.push([[x - 4, 0, 0.5], [x - 4, 0, 4.5]]);
        }
    }

    // Palaces
    linePoints.push([[-1, 0, -4.5], [1, 0, -2.5]]);
    linePoints.push([[1, 0, -4.5], [-1, 0, -2.5]]);
    linePoints.push([[-1, 0, 2.5], [1, 0, 4.5]]);
    linePoints.push([[1, 0, 2.5], [-1, 0, 4.5]]);

    return (
        <group>
            {/* Wooden Board Base */}
            <mesh receiveShadow position={[0, -0.2, 0]} onClick={onBoardClick}>
                <boxGeometry args={[9, 0.4, 10]} />
                <meshStandardMaterial color="#ebc38a" roughness={0.8} />
            </mesh>

            {/* Grid Lines */}
            {linePoints.map((pts, idx) => (
                <Line key={idx} points={pts} color={lineColor} lineWidth={lineWidth} position={[0, 0.01, 0]} />
            ))}
        </group>
    );
}
