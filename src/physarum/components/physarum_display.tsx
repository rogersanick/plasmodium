'use client';

import PhysarumDisplacementMesh from '@/physarum/components/PhysarumDisplacementMesh';
import { GAME_TEXT_FONT_URL } from '@/game_three_components/text_fonts';
import { BufferGeometry, Group, SphereGeometry, Vector3 } from 'three';

import { gameColors, colors as tailwindColors } from '@/color';
import { Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';

type PhysarumDisplayProps = {
  radius?: number;
  inputSpeciesOneColor?: string;
  inputSpeciesTwoColor?: string;
  inputSpeciesThreeColor?: string;
  perfMode?: boolean;
  animateOut?: boolean;
  text?: string;
  enableSizeAnimation?: boolean;
  enableRandomColors?: boolean;
  inputGeometry?: BufferGeometry;
  shouldRotate?: boolean;
  /**
   * When true, renders the physarum texture without vertex displacement.
   */
  disableDisplacement?: boolean;
};

const PhysarumDisplay = ({
  radius = 1,
  animateOut,
  perfMode,
  text,
  enableSizeAnimation = true,
  enableRandomColors = true,
  shouldRotate = true,
  inputGeometry,
  inputSpeciesOneColor,
  inputSpeciesTwoColor,
  inputSpeciesThreeColor,
  disableDisplacement = false,
}: PhysarumDisplayProps) => {
  const groupRef = useRef<Group>(null!);
  const baseScale = 0.01;
  const internalRadius = radius / baseScale;

  useEffect(() => {
    if (groupRef.current && animateOut) {
      gsap.fromTo(
        groupRef.current.scale,
        { x: baseScale, y: baseScale, z: baseScale },
        { x: 0, y: 0, z: 0, duration: 0.8, ease: 'elastic.inOut' }
      );
    }
  }, [animateOut, baseScale]);

  const { size } = useThree();
  const isMobile = size.width < 600;

  const geometry = useMemo(
    () =>
      inputGeometry ||
      new SphereGeometry(
        internalRadius,
        isMobile || perfMode ? 300 : 500,
        isMobile || perfMode ? 300 : 500
      ),
    [inputGeometry, internalRadius, isMobile, perfMode]
  );
  const pointerGeometry = useMemo(
    () => inputGeometry || new SphereGeometry(internalRadius, 40, 20),
    [inputGeometry, internalRadius]
  );
  const position = useMemo(() => new Vector3(0, 0, 0), []);

  const [speciesColors, setSpeciesColors] = useState({
    speciesOneColor: tailwindColors.zinc?.['600'] ?? 'rgb(97, 97, 97)',
    speciesTwoColor: tailwindColors.zinc?.['800'] ?? 'rgb(35, 35, 35)',
    speciesThreeColor: tailwindColors.zinc?.['300'] ?? 'rgb(190,190,190)',
  });

  useEffect(() => {
    const changeColorsAndAnimate = () => {
      const timeline = gsap.timeline();

      if (enableSizeAnimation) {
        timeline.to(groupRef.current.scale, {
          x: baseScale * 0.98,
          y: baseScale * 0.98,
          z: baseScale * 0.98,
          duration: 0.3,
          ease: 'slowmo',
        });
      }

      const getRandomGameColor = () => {
        const randomIndex = Math.floor(Math.random() * gameColors.length);
        return gameColors[randomIndex];
      };
      const randomColor = getRandomGameColor();
      const randomColor2 = getRandomGameColor();

      const newColors = {
        speciesOneColor: inputSpeciesOneColor ?? randomColor.mainHex,
        speciesTwoColor: inputSpeciesTwoColor ?? randomColor2.darkHex,
        speciesThreeColor: inputSpeciesThreeColor ?? randomColor2.darkHex,
      };

      setSpeciesColors({
        speciesOneColor: newColors.speciesOneColor,
        speciesTwoColor: newColors.speciesTwoColor,
        speciesThreeColor: newColors.speciesThreeColor,
      });

      if (enableSizeAnimation) {
        timeline.to(groupRef.current.scale, {
          x: baseScale,
          y: baseScale,
          z: baseScale,
          duration: 0.1,
          ease: 'slowmo',
        });
      }
    };

    if (
      inputSpeciesOneColor ||
      inputSpeciesTwoColor ||
      inputSpeciesThreeColor
    ) {
      changeColorsAndAnimate();
    } else if (enableRandomColors) {
      const intervalId = setInterval(changeColorsAndAnimate, 3000);
      return () => clearInterval(intervalId);
    }
    // Species color must be excluded as it is a render target
  }, [
    enableSizeAnimation,
    enableRandomColors,
    inputSpeciesOneColor,
    inputSpeciesTwoColor,
    inputSpeciesThreeColor,
    baseScale,
  ]);

  useFrame(() => {
    if (!shouldRotate) return;
    groupRef.current.rotation.y -= 0.002;
  });

  return (
    <>
      <group>
        <group ref={groupRef} scale={baseScale}>
          <PhysarumDisplacementMesh
            geometry={geometry}
            pointerGeometry={pointerGeometry}
            position={position}
            disableDisplacement={disableDisplacement}
            speciesColors={[
              speciesColors.speciesOneColor,
              speciesColors.speciesTwoColor,
              speciesColors.speciesThreeColor,
            ]}
          />
        </group>
        {text && (
          <Suspense fallback={null}>
            <Text scale={0.6} position={[0, -0.5, 3]} font={GAME_TEXT_FONT_URL}>
              {text}
            </Text>
          </Suspense>
        )}
      </group>
    </>
  );
};

export { PhysarumDisplay };
