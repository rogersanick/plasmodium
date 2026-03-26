import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';

const usePointer = (props: {
  meshRef: any;
  setMousePosition: (vec2: THREE.Vector2) => void;
  setMouseDown: (isDown: boolean) => void;
  setMouseInside: (isDown: boolean) => void;
}) => {
  const { meshRef, setMousePosition, setMouseDown, setMouseInside } = props;
  const { camera, size, pointer } = useThree();

  useEffect(() => {
    const handleMouseDown = () => setMouseDown(true);
    const handleMouseUp = () => setMouseDown(false);

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setMouseDown]);

  const onPointerMove = () => {
    if (meshRef.current) {
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObject(meshRef.current);

      if (intersects.length > 0) {
        const uv = intersects[0].uv!;
        if (uv) {
          const x = uv.x * size.width;
          const y = uv.y * size.height;
          //our simulation has the origin in the middle of the screen so substract half width and height from coordinates.
          setMousePosition(
            new THREE.Vector2(x - size.width / 2, y - size.height / 2)
          );
        }
      }
    }
  };

  const onPointerOut = () => setMouseInside(false);
  const onPointerOver = () => setMouseInside(true);

  return { onPointerMove, onPointerOut, onPointerOver };
};

export default usePointer;
