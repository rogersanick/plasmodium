'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import usePhysarumMaterial from '../usePhysarum';

import { getSpeciesOne, getSpeciesThree, getSpeciesTwo } from '../DefaultProps';
import { DISPLACEMENT_VERTEX } from '../shaders/DisplacementVertex';
import { GRAY_FRAGMENT } from '../shaders/GrayLightedFragment';
import { PASS_THROUGH_LIGHT_VERTEX } from '../shaders/PassThroughLightningVertex';
import { PhysarumProps } from '../types/PhysarumProps';
import usePointer from '../usePointer';

interface PhysarumDisplacementMeshProps {
  geometry: THREE.BufferGeometry;
  pointerGeometry?: THREE.BufferGeometry;
  position: THREE.Vector3;
  speciesColors?: [string?, string?, string?];
  /**
   * When true, renders the physarum texture without vertex displacement.
   * (Lighting/shading stays the same.)
   */
  disableDisplacement?: boolean;
}

function PhysarumDisplacementMesh(props: PhysarumDisplacementMeshProps) {
  const [speciesOneColor, speciesTwoColor, speciesThreeColor] =
    props.speciesColors || [];

  const { size } = useThree();
  const meshRef = useRef<THREE.Mesh>(null!);
  const geometry = useMemo(() => {
    return (
      props.geometry ||
      new THREE.SphereGeometry(size.width / 10, size.width, size.height)
    );
  }, [props.geometry, size.width, size.height]);
  const pointerGeometry = useMemo(
    () => props.pointerGeometry ?? geometry.clone(),
    [props.pointerGeometry, geometry]
  );
  const position = useMemo(
    () => props.position ?? new THREE.Vector3(0),
    [props.position]
  );
  const isMobile = size.width < 600;

  const [species0, species1, species2] = useMemo(
    () => [
      getSpeciesOne(speciesOneColor),
      getSpeciesTwo(speciesTwoColor),
      getSpeciesThree(speciesThreeColor),
    ],
    [speciesOneColor, speciesTwoColor, speciesThreeColor]
  );

  const physarum = usePhysarumMaterial({
    textureSize: isMobile ? 256 : 512,
    species0,
    species1,
    species2,
  });

  const { material, setMouseDown, setMousePosition, setMouseInside, setProps } =
    physarum;

  const handlers = usePointer({
    meshRef,
    setMousePosition,
    setMouseDown,
    setMouseInside,
  });

  useEffect(() => {
    setProps((v: PhysarumProps) => ({
      ...v,
      species0: {
        ...v.species0,
        color: speciesOneColor,
      },
      species1: {
        ...v.species1,
        color: speciesTwoColor,
      },
      species2: {
        ...v.species2,
        color: speciesThreeColor,
      },
    }));
  }, [speciesOneColor, speciesTwoColor, speciesThreeColor, material]);

  const geometryBoundingRadius = useMemo(() => {
    // Scale displacement relative to the actual mesh size, so `PhysarumDisplay radius`
    // behaves like a true scale control (including the displacement effect).
    if (!geometry.boundingSphere) {
      geometry.computeBoundingSphere();
    }
    return geometry.boundingSphere?.radius ?? 1;
  }, [geometry]);

  const shaderMat = useMemo(() => {
    const lightPosition = new THREE.Vector3(10, 10, 10);
    const lightColor = new THREE.Color(1, 1, 1);
    const lightIntensity = 1.0;
    return new THREE.ShaderMaterial({
      uniforms: {
        input_texture: { value: null },
        resolution: { value: new THREE.Vector2(size.width, size.height) },
        lightPosition: { value: lightPosition },
        lightColor: { value: lightColor },
        lightIntensity: { value: lightIntensity },
        // NOTE: this gets updated in an effect to track geometry/viewport changes.
        maxHeight: { value: 110 },
        inset: { value: 0 },
      },
      vertexShader: props.disableDisplacement
        ? PASS_THROUGH_LIGHT_VERTEX
        : DISPLACEMENT_VERTEX,
      fragmentShader: GRAY_FRAGMENT,
      transparent: true,
      blending: THREE.NoBlending,
    });
  }, [props.disableDisplacement, size.width, size.height]);

  useEffect(() => {
    // Keep shader uniforms in sync with current viewport + geometry size.
    shaderMat.uniforms.resolution.value.set(size.width, size.height);
    shaderMat.uniforms.maxHeight.value = geometryBoundingRadius * 1.1;
  }, [shaderMat, size.width, size.height, geometryBoundingRadius]);

  useFrame(() => {
    if (material.uniforms.input_texture) {
      shaderMat.uniforms.input_texture.value =
        material.uniforms.input_texture.value;
    }
  });

  const theMesh = useMemo(() => {
    const mesh = new THREE.Mesh(geometry, shaderMat);
    mesh.position.set(position.x, position.y, position.z);
    return mesh;
  }, [geometry, shaderMat, position.x, position.y, position.z]);

  const pointerMesh = useMemo(() => {
    const mesh = new THREE.Mesh(
      pointerGeometry,
      new THREE.MeshBasicMaterial({
        opacity: 0,
        depthTest: false,
        transparent: true,
      })
    );
    mesh.position.set(position.x, position.y, position.z);
    return mesh;
  }, [pointerGeometry, position.x, position.y, position.z]);

  return (
    <>
      <mesh>
        <primitive ref={meshRef} {...handlers} object={pointerMesh} />
      </mesh>
      <mesh>
        <primitive object={theMesh} />
      </mesh>
    </>
  );
}

export default PhysarumDisplacementMesh;
