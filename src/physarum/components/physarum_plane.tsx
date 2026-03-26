import { useThree } from '@react-three/fiber';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import usePhysarumMaterial from '../usePhysarum';
import usePointer from '../usePointer';
import usePhysarumSettings from '../useSettings';

function PhysarumPlane() {
  const { size } = useThree();
  const meshRef = useRef<THREE.Mesh>(null!);

  const physarum = usePhysarumMaterial({
    outputSize: new THREE.Vector2(size.width, size.height),
  });
  usePhysarumSettings(physarum);
  const { material, setMouseDown, setMousePosition, setMouseInside } = physarum;

  const handlers = usePointer({
    meshRef,
    setMousePosition,
    setMouseDown,
    setMouseInside,
  });

  const planeMesh = useMemo(() => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size.width * 0.001, size.height * 0.01),
      material
    );
    mesh.position.set(0, 0, 0);
    return mesh;
  }, [material, size.width, size.height]);
  return (
    <>
      <primitive ref={meshRef} {...handlers} object={planeMesh} />
    </>
  );
}

export default PhysarumPlane;
