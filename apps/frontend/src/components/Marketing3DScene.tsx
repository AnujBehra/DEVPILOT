import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const isBrowser = typeof window !== 'undefined';

const disposeScene = (scene: THREE.Scene) => {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else if (material) {
      material.dispose();
    }
  });
};

const createPanel = (width: number, height: number, color: number, accent: number) => {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.08),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.32,
      metalness: 0.18,
      transparent: true,
      opacity: 0.86,
    }),
  );
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(base.geometry),
    new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.42 }),
  );
  group.add(base, edge);
  return group;
};

export const Marketing3DScene = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spotlightRef = useRef<HTMLDivElement | null>(null);
  const trailRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    if (!isBrowser || !canvasRef.current) return undefined;

    const canvas = canvasRef.current;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 8);

    scene.add(new THREE.AmbientLight(0xffffff, 0.74));
    const keyLight = new THREE.PointLight(0x7dd3fc, 5.5, 36);
    keyLight.position.set(4.2, 4.8, 6);
    scene.add(keyLight);
    const fillLight = new THREE.PointLight(0x60a5fa, 3.4, 28);
    fillLight.position.set(-4.8, -2.2, 4);
    scene.add(fillLight);

    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    const globeGroup = new THREE.Group();
    globeGroup.position.set(2.35, 0.05, -1.35);
    worldGroup.add(globeGroup);

    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1.34, 64, 64),
      new THREE.MeshStandardMaterial({
        color: 0x2563eb,
        emissive: 0x0f3d91,
        emissiveIntensity: 0.08,
        roughness: 0.45,
        metalness: 0.14,
        transparent: true,
        opacity: 0.2,
      }),
    );
    const globeWire = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.SphereGeometry(1.36, 28, 20)),
      new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.34 }),
    );
    globeGroup.add(globe, globeWire);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
    });
    [0, 1, 2].forEach((index) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.56 + index * 0.17, 0.008, 8, 128), ringMaterial);
      ring.rotation.set(index * 0.74, index * 0.42, index * 0.62);
      globeGroup.add(ring);
    });

    const productGroup = new THREE.Group();
    productGroup.position.set(-2.4, -0.1, -0.65);
    productGroup.rotation.set(-0.08, 0.2, -0.02);
    worldGroup.add(productGroup);

    const heroPanel = createPanel(2.55, 1.55, 0xf8fbff, 0x2563eb);
    const sidePanel = createPanel(0.92, 1.55, 0xe0f2fe, 0x38bdf8);
    const commandPanel = createPanel(1.35, 0.52, 0xdbeafe, 0x2563eb);
    sidePanel.position.set(-1.78, 0.08, -0.08);
    commandPanel.position.set(0.36, 0.44, 0.14);
    productGroup.add(heroPanel, sidePanel, commandPanel);

    const cardMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.26,
      metalness: 0.12,
      transparent: true,
      opacity: 0.88,
    });
    for (let index = 0; index < 5; index += 1) {
      const card = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.22, 0.055), cardMaterial);
      card.position.set(-0.34 + (index % 2) * 0.72, -0.2 - Math.floor(index / 2) * 0.33, 0.24 + index * 0.012);
      productGroup.add(card);
    }

    const depthGroup = new THREE.Group();
    scene.add(depthGroup);
    const particleCount = 180;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let index = 0; index < particleCount; index += 1) {
      particlePositions[index * 3] = (Math.random() - 0.5) * 12;
      particlePositions[index * 3 + 1] = (Math.random() - 0.5) * 7;
      particlePositions[index * 3 + 2] = -2 - Math.random() * 8;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({ color: 0x60a5fa, size: 0.028, transparent: true, opacity: 0.45 }),
    );
    depthGroup.add(particles);

    let width = 0;
    let height = 0;
    let frameId = 0;
    let pointerX = 0;
    let pointerY = 0;
    let scrollProgress = 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };

    const updatePointer = (event: PointerEvent) => {
      pointerX = (event.clientX / Math.max(width, 1) - 0.5) * 2;
      pointerY = (event.clientY / Math.max(height, 1) - 0.5) * 2;
    };

    const updateScroll = () => {
      const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      scrollProgress = window.scrollY / maxScroll;
    };

    const renderFrame = (time: number) => {
      const elapsed = prefersReducedMotion ? 0 : time * 0.001;
      const pointerEaseX = pointerX * 0.18;
      const pointerEaseY = pointerY * 0.12;
      const scrollShift = scrollProgress * Math.PI * 1.65;

      globeGroup.rotation.y = elapsed * 0.18 + scrollShift + pointerEaseX;
      globeGroup.rotation.x = pointerEaseY + Math.sin(elapsed * 0.35) * 0.04;
      productGroup.rotation.y = 0.22 + pointerEaseX * 0.9 + scrollProgress * 0.32;
      productGroup.rotation.x = -0.08 - pointerEaseY * 0.6;
      productGroup.position.y = -0.08 + Math.sin(elapsed * 0.7) * 0.08 - scrollProgress * 0.28;
      depthGroup.rotation.z = elapsed * 0.012;
      depthGroup.position.x = -pointerX * 0.28;
      depthGroup.position.y = pointerY * 0.18;
      camera.position.x = pointerEaseX;
      camera.position.y = -pointerEaseY;
      camera.position.z = 8 - scrollProgress * 0.58;
      camera.lookAt(0, 0, -1);
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(renderFrame);
    };

    resize();
    updateScroll();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', updatePointer, { passive: true });
    window.addEventListener('scroll', updateScroll, { passive: true });
    frameId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', updatePointer);
      window.removeEventListener('scroll', updateScroll);
      disposeScene(scene);
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (!isBrowser) return undefined;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return undefined;

    const positions = trailRefs.current.map(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }));
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let frameId = 0;

    const updatePointer = (event: PointerEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
      if (spotlightRef.current) {
        spotlightRef.current.style.setProperty('--cursor-x', `${event.clientX}px`);
        spotlightRef.current.style.setProperty('--cursor-y', `${event.clientY}px`);
      }
    };

    const animateTrail = () => {
      let leadX = targetX;
      let leadY = targetY;
      positions.forEach((position, index) => {
        position.x += (leadX - position.x) * (0.3 - index * 0.018);
        position.y += (leadY - position.y) * (0.3 - index * 0.018);
        const node = trailRefs.current[index];
        if (node) {
          node.style.transform = `translate3d(${position.x}px, ${position.y}px, 0) scale(${1 - index * 0.075})`;
          node.style.opacity = `${Math.max(0.08, 0.4 - index * 0.03)}`;
        }
        leadX = position.x;
        leadY = position.y;
      });
      frameId = window.requestAnimationFrame(animateTrail);
    };

    window.addEventListener('pointermove', updatePointer, { passive: true });
    frameId = window.requestAnimationFrame(animateTrail);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('pointermove', updatePointer);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="marketing-3d-canvas" aria-hidden="true" data-testid="marketing-3d-scene" />
      <div ref={spotlightRef} className="marketing-fx-layer" aria-hidden="true">
        <span className="liquid-blob liquid-blob-one" />
        <span className="liquid-blob liquid-blob-two" />
        <span className="liquid-blob liquid-blob-three" />
        <span className="floating-orb floating-orb-one" />
        <span className="floating-orb floating-orb-two" />
        <span className="floating-orb floating-orb-three" />
        <span className="spotlight-effect" />
        <span className="noise-texture" />
        <span className="cursor-trail">
          {Array.from({ length: 9 }).map((_, index) => (
            <span
              key={index}
              ref={(node) => {
                trailRefs.current[index] = node;
              }}
            />
          ))}
        </span>
      </div>
    </>
  );
};
