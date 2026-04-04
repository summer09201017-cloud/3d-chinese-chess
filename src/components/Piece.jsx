import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';

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

export function Piece({ x, y, type, selected, onClick }) {
    const { isRed, label } = getPieceDetails(type);

    // Board coordinates: x in [0, 8], y in [0, 9]
    // Map x to [-4, 4], y to [-4.5, 4.5] for Three.js centering
    const px = x - 4;
    const pz = y - 4.5; // Z acts as Y in 3D ground plane
    const py = 0.25; // Height above board

    const color = isRed ? '#e63946' : '#1d3557';
    const selectedColor = '#f4a261';

    return (
        <group position={[px, py, pz]} onClick={onClick}>
            {/* Top Half */}
            <mesh castShadow receiveShadow position={[0, 0.05, 0]}>
                <cylinderGeometry args={[0.4, 0.42, 0.15, 32]} />
                <meshStandardMaterial color={selected ? selectedColor : '#fdfaf6'} />
            </mesh>

            {/* Bottom Half (Green) */}
            <mesh position={[0, -0.1, 0]}>
                <cylinderGeometry args={[0.42, 0.45, 0.15, 32]} />
                <meshStandardMaterial color={selected ? '#2e7d32' : '#4CAF50'} />
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
