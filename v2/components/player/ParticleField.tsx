'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getEngine } from '@/lib/audio/engine';

function Particles({ count = 2200, color = '#F59E0B' }: { count?: number; color?: string }) {
  const ref = useRef<THREE.Points>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);

  const [positions, colors, sizes] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    const c = new THREE.Color(color);
    const c2 = new THREE.Color('#E11D74');
    const c3 = new THREE.Color('#4F39E8');
    for (let i = 0; i < count; i++) {
      const r = 8 + Math.random() * 12;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      const pick = Math.random();
      const mix = pick < 0.5 ? c : pick < 0.8 ? c2 : c3;
      col[i * 3] = mix.r;
      col[i * 3 + 1] = mix.g;
      col[i * 3 + 2] = mix.b;
      sz[i] = Math.random() * 2 + 0.5;
    }
    return [pos, col, sz] as const;
  }, [count, color]);

  useFrame((_, dt) => {
    const p = ref.current;
    if (!p) return;
    p.rotation.y += dt * 0.05;
    p.rotation.x += dt * 0.02;

    if (!analyserRef.current) {
      analyserRef.current = getEngine().getAnalyser();
      if (analyserRef.current) {
        dataRef.current = new Uint8Array(new ArrayBuffer(analyserRef.current.frequencyBinCount));
      }
    }
    const a = analyserRef.current;
    const d = dataRef.current;
    if (a && d) {
      a.getByteFrequencyData(d as Uint8Array<ArrayBuffer>);
      let sum = 0;
      for (let i = 0; i < d.length; i++) sum += d[i];
      const avg = sum / d.length / 255;
      const target = 1 + avg * 0.5;
      p.scale.setScalar(THREE.MathUtils.lerp(p.scale.x, target, 0.1));
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        sizeAttenuation
        transparent
        opacity={0.9}
        vertexColors
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

export function ParticleField() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <Canvas camera={{ position: [0, 0, 18], fov: 55 }} gl={{ antialias: false, alpha: true }} dpr={[1, 1.5]}>
        <color attach="background" args={['#0a0712']} />
        <fog attach="fog" args={['#0a0712', 15, 32]} />
        <Particles />
      </Canvas>
    </div>
  );
}
