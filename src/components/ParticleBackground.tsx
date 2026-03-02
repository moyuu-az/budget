import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const PARTICLE_COUNT = 60;
const CONNECTION_DISTANCE = 100;
const COLORS = [
  new THREE.Color('#3b82f6'),
  new THREE.Color('#60a5fa'),
  new THREE.Color('#8b5cf6'),
  new THREE.Color('#a78bfa'),
  new THREE.Color('#22d3ee'),
  new THREE.Color('#67e8f9'),
];

function ParticleBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.z = 300;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // Create soft glow texture for particles
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.6)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const spriteTexture = new THREE.CanvasTexture(canvas);

    // Particle positions and velocities
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const opacities = new Float32Array(PARTICLE_COUNT);
    const velocities: THREE.Vector3[] = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 600;
      positions[i3 + 1] = (Math.random() - 0.5) * 400;
      positions[i3 + 2] = (Math.random() - 0.5) * 200;

      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;

      opacities[i] = 0.3 + Math.random() * 0.3;

      velocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.15,
          (Math.random() - 0.5) * 0.15,
          (Math.random() - 0.5) * 0.05
        )
      );
    }

    // Points geometry
    const pointsGeometry = new THREE.BufferGeometry();
    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pointsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const pointsMaterial = new THREE.PointsMaterial({
      size: 8,
      map: spriteTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(pointsGeometry, pointsMaterial);
    scene.add(points);

    // Lines for connections - pre-allocate max possible
    const maxLines = PARTICLE_COUNT * (PARTICLE_COUNT - 1) / 2;
    const linePositions = new Float32Array(maxLines * 6);
    const lineColors = new Float32Array(maxLines * 6);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));

    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lines);

    // Animation
    let animationId: number;
    let frame = 0;

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      frame++;
      if (frame % 2 !== 0) return; // skip odd frames = 30fps

      const posAttr = pointsGeometry.getAttribute('position') as THREE.BufferAttribute;
      const posArray = posAttr.array as Float32Array;

      // Update particle positions
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        posArray[i3] += velocities[i].x;
        posArray[i3 + 1] += velocities[i].y;
        posArray[i3 + 2] += velocities[i].z;

        // Wrap around bounds
        if (posArray[i3] > 300) posArray[i3] = -300;
        if (posArray[i3] < -300) posArray[i3] = 300;
        if (posArray[i3 + 1] > 200) posArray[i3 + 1] = -200;
        if (posArray[i3 + 1] < -200) posArray[i3 + 1] = 200;
        if (posArray[i3 + 2] > 100) posArray[i3 + 2] = -100;
        if (posArray[i3 + 2] < -100) posArray[i3 + 2] = 100;
      }
      posAttr.needsUpdate = true;

      // Update connection lines
      let lineIndex = 0;
      const linePosArray = lineGeometry.getAttribute('position').array as Float32Array;
      const lineColArray = lineGeometry.getAttribute('color').array as Float32Array;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        for (let j = i + 1; j < PARTICLE_COUNT; j++) {
          const j3 = j * 3;
          const dx = posArray[i3] - posArray[j3];
          const dy = posArray[i3 + 1] - posArray[j3 + 1];
          const dz = posArray[i3 + 2] - posArray[j3 + 2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (dist < CONNECTION_DISTANCE) {
            const alpha = 1 - dist / CONNECTION_DISTANCE;
            const li = lineIndex * 6;

            linePosArray[li] = posArray[i3];
            linePosArray[li + 1] = posArray[i3 + 1];
            linePosArray[li + 2] = posArray[i3 + 2];
            linePosArray[li + 3] = posArray[j3];
            linePosArray[li + 4] = posArray[j3 + 1];
            linePosArray[li + 5] = posArray[j3 + 2];

            // Blend the colors of connected particles
            const ci3 = i * 3;
            const cj3 = j * 3;
            const r = (colors[ci3] + colors[cj3]) * 0.5 * alpha;
            const g = (colors[ci3 + 1] + colors[cj3 + 1]) * 0.5 * alpha;
            const b = (colors[ci3 + 2] + colors[cj3 + 2]) * 0.5 * alpha;

            lineColArray[li] = r;
            lineColArray[li + 1] = g;
            lineColArray[li + 2] = b;
            lineColArray[li + 3] = r;
            lineColArray[li + 4] = g;
            lineColArray[li + 5] = b;

            lineIndex++;
          }
        }
      }

      lineGeometry.setDrawRange(0, lineIndex * 2);
      (lineGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (lineGeometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;

      renderer.render(scene, camera);
    };

    animate();

    // Handle resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      pointsGeometry.dispose();
      pointsMaterial.dispose();
      spriteTexture.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}

export default ParticleBackground;
