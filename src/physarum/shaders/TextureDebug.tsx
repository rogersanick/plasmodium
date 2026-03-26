import * as THREE from 'three';
import { ShaderMaterial } from 'three';

const TextureDebug = ({
  viewport,
  mat,
}: {
  mat: ShaderMaterial;
  viewport: { width: number; height: number };
}) => {
  // Setup plane geometry matching the viewport
  const planeGeometry = new THREE.PlaneGeometry(
    viewport.width,
    viewport.height
  );

  return <mesh geometry={planeGeometry} material={mat} />;
};
export default TextureDebug;
