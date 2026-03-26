import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { MouseSpawnTexture } from './MouseSpawnTexture';
import { rndFloat, rndInt } from './Util';
import { DIFFUSE_DECAY_FRAGMENT } from './shaders/DiffuseDecayFragment';
import { FINAL_RENDER_FRAGMENT } from './shaders/FinalRenderFragment';
import { PASS_THROUGH_FRAGMENT } from './shaders/PassThroughFragment';
import { PASS_THROUGH_VERTEX } from './shaders/PassThroughVertex';
import { RENDER_DOTS_FRAGMENT } from './shaders/RenderDotsFragment';
import { RENDER_DOTS_VERTEX } from './shaders/RenderDotsVertex';
import { UPDATE_DOTS_FRAGMENT } from './shaders/UpdateDotsFragment';
import { PingPongShaderBuilder } from './util/PingPongShaderBuilder';
import { PlaneShader } from './util/PlaneShader';
import { ShaderBuilder } from './util/ShaderBuilder';
import { Vector } from './util/ThreeJsUtils';

import gsap from 'gsap';
import {
  DefaultPhysarumProps,
  getSpeciesOne,
  getSpeciesThree,
  getSpeciesTwo,
} from './DefaultProps';
import { PhysarumHookResult } from './types/PhysarumHookResult';
import { PhysarumProps } from './types/PhysarumProps';

const usePhysarumMaterial = (props?: PhysarumProps): PhysarumHookResult => {
  const { gl, size } = useThree();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [mouseInside, setMouseInside] = useState(false);
  const [mouseDown, setMouseDown] = useState(false);
  const [particleTexture, setParticleTexture] = useState<THREE.Texture | null>(
    null
  );

  const filledProps = {
    ...DefaultPhysarumProps,
    ...props,
    outputSize: new THREE.Vector2(size.width, size.height),
  } as Required<PhysarumProps>;

  filledProps.species0 = { ...getSpeciesOne(), ...filledProps.species0 };
  filledProps.species1 = { ...getSpeciesTwo(), ...filledProps.species1 };
  filledProps.species2 = { ...getSpeciesThree(), ...filledProps.species2 };

  /**
   * Prop States
   */
  const [currentProps, setProps] =
    useState<Required<PhysarumProps>>(filledProps);

  const { outputSize } = currentProps;
  const speciesOneColor = useRef(new THREE.Color(currentProps.species0.color));
  const speciesTwoColor = useRef(new THREE.Color(currentProps.species1.color));
  const speciesThreeColor = useRef(
    new THREE.Color(currentProps.species2.color)
  );

  const renderMaterial = useMemo(() => {
    return getFinalMaterial(currentProps, [
      speciesOneColor.current,
      speciesTwoColor.current,
      speciesThreeColor.current,
    ]);
  }, [outputSize.width, outputSize.height]);

  useEffect(() => {
    if (renderMaterial) {
      const targetSpeciesOneColor = new THREE.Color(
        currentProps.species0.color
      );
      const targetSpeciesTwoColor = new THREE.Color(
        currentProps.species1.color
      );
      const targetSpeciesThreeColor = new THREE.Color(
        currentProps.species2.color
      );

      gsap.to(speciesOneColor.current, {
        r: targetSpeciesOneColor.r,
        g: targetSpeciesOneColor.g,
        b: targetSpeciesOneColor.b,
        duration: 1,
        onUpdate: () => {
          renderMaterial.uniforms.col0.value.copy(speciesOneColor.current);
        },
      });
      gsap.to(speciesTwoColor.current, {
        r: targetSpeciesTwoColor.r,
        g: targetSpeciesTwoColor.g,
        b: targetSpeciesTwoColor.b,
        duration: 1,
        onUpdate: () => {
          renderMaterial.uniforms.col1.value.copy(speciesTwoColor.current);
        },
      });
      gsap.to(speciesThreeColor.current, {
        r: targetSpeciesThreeColor.r,
        g: targetSpeciesThreeColor.g,
        b: targetSpeciesThreeColor.b,
        duration: 1,
        onUpdate: () => {
          renderMaterial.uniforms.col2.value.copy(speciesThreeColor.current);
        },
      });
    }
  }, [
    renderMaterial,
    currentProps.species0.color,
    currentProps.species1.color,
    currentProps.species2.color,
  ]);

  useEffect(() => {
    if (renderMaterial) {
      renderMaterial.uniforms.isFlatShading.value = currentProps.isFlatShading;
    }
  }, [renderMaterial, currentProps.isFlatShading]);
  useEffect(() => {
    if (renderMaterial) {
      renderMaterial.uniforms.colorThreshold.value =
        currentProps.flatShadingThreshold;
    }
  }, [renderMaterial, currentProps.flatShadingThreshold]);
  useEffect(() => {
    if (renderMaterial) {
      renderMaterial.uniforms.dotOpacity.value = currentProps.dotOpacity;
    }
  }, [renderMaterial, currentProps.dotOpacity]);
  useEffect(() => {
    if (renderMaterial) {
      renderMaterial.uniforms.trailOpacity.value = currentProps.trailOpacity;
    }
  }, [renderMaterial, currentProps.trailOpacity]);
  useEffect(() => {
    if (renderMaterial) {
      renderMaterial.uniforms.isMonochrome.value = currentProps.isMonochrome;
    }
  }, [renderMaterial, currentProps.isMonochrome]);

  // species0
  // species1
  // species2
  const finalMaterial = useMemo(() => {
    return getOutputMaterial();
  }, []);

  const positionAndDirections = useMemo(
    () =>
      getPositionAndDirectionArray({
        outputSize: currentProps.outputSize,
        textureSize: currentProps.textureSize,
        speciesAmount: currentProps.speciesAmount,
      }),
    [currentProps.textureSize, currentProps.speciesAmount]
  );

  const updateDotsShader = useMemo(
    () => getUpdateDotsShader(currentProps, positionAndDirections),
    [currentProps.textureSize, positionAndDirections]
  );

  useEffect(() => {
    if (updateDotsShader) {
      updateDotsShader.setUniform(
        'attract0',
        currentProps.species0.attractions
      );
    }
  }, [updateDotsShader, currentProps.species0.attractions]);
  useEffect(() => {
    if (updateDotsShader) {
      updateDotsShader.setUniform(
        'attract1',
        currentProps.species1.attractions
      );
    }
  }, [updateDotsShader, currentProps.species1.attractions]);
  useEffect(() => {
    if (updateDotsShader) {
      updateDotsShader.setUniform(
        'attract2',
        currentProps.species2.attractions
      );
    }
  }, [updateDotsShader, currentProps.species2.attractions]);
  useEffect(() => {
    if (updateDotsShader) {
      const infectiousness = [
        currentProps.species0.infectious,
        currentProps.species1.infectious,
        currentProps.species2.infectious,
      ];
      updateDotsShader.setUniform(
        'infectious',
        new THREE.Vector3(...infectiousness)
      );
    }
  }, [
    updateDotsShader,
    currentProps.species0.infectious,
    currentProps.species1.infectious,
    currentProps.species2.infectious,
  ]);
  useEffect(() => {
    if (updateDotsShader) {
      const sensorAngles = [
        currentProps.species0.sensorAngle,
        currentProps.species1.sensorAngle,
        currentProps.species2.sensorAngle,
      ];
      updateDotsShader.setUniform(
        'sensorAngle',
        new THREE.Vector3(...sensorAngles)
      );
    }
  }, [
    updateDotsShader,
    currentProps.species0.sensorAngle,
    currentProps.species1.sensorAngle,
    currentProps.species2.sensorAngle,
  ]);
  useEffect(() => {
    if (updateDotsShader) {
      const rotationAngles = [
        currentProps.species0.rotationAngle,
        currentProps.species1.rotationAngle,
        currentProps.species2.rotationAngle,
      ];
      updateDotsShader.setUniform(
        'rotationAngle',
        new THREE.Vector3(...rotationAngles)
      );
    }
  }, [
    updateDotsShader,
    currentProps.species0.rotationAngle,
    currentProps.species1.rotationAngle,
    currentProps.species2.rotationAngle,
  ]);
  useEffect(() => {
    if (updateDotsShader) {
      const moveSpeeds = [
        currentProps.species0.moveSpeed,
        currentProps.species1.moveSpeed,
        currentProps.species2.moveSpeed,
      ];
      updateDotsShader.setUniform(
        'moveSpeed',
        new THREE.Vector3(...moveSpeeds)
      );
    }
  }, [
    updateDotsShader,
    currentProps.species0.moveSpeed,
    currentProps.species1.moveSpeed,
    currentProps.species2.moveSpeed,
  ]);
  useEffect(() => {
    if (updateDotsShader) {
      const sensorDistances = [
        currentProps.species0.sensorDistance,
        currentProps.species1.sensorDistance,
        currentProps.species2.sensorDistance,
      ];
      updateDotsShader.setUniform(
        'sensorDistance',
        new THREE.Vector3(...sensorDistances)
      );
    }
  }, [
    updateDotsShader,
    currentProps.species0.sensorDistance,
    currentProps.species1.sensorDistance,
    currentProps.species2.sensorDistance,
  ]);
  useEffect(() => {
    if (updateDotsShader) {
      updateDotsShader.setUniform(
        'isRestrictToMiddle',
        currentProps.restrictToMiddle
      );
    }
  }, [updateDotsShader, currentProps.restrictToMiddle]);
  useEffect(() => {
    if (updateDotsShader) {
      updateDotsShader.setUniform(
        'isDisplacement',
        currentProps.disallowDisplacement
      );
    }
  }, [updateDotsShader, currentProps.disallowDisplacement]);
  useEffect(() => {
    if (updateDotsShader) {
      updateDotsShader.setUniform('mouseRad', currentProps.mousePushRadius);
    }
  }, [updateDotsShader, currentProps.mousePushRadius]);

  const diffuseShader = useMemo(
    () => getDiffuseShader(currentProps),
    [currentProps.textureSize]
  );
  useEffect(() => {
    if (diffuseShader) {
      diffuseShader.setUniform('decay', currentProps.decay);
    }
  }, [diffuseShader, currentProps.decay]);

  const renderDotsShader = useMemo(
    () => getRenderDotsShader(currentProps),
    [currentProps.textureSize]
  );
  useEffect(() => {
    if (renderDotsShader) {
      const dotSizes = [
        currentProps.species0.dotSize,
        currentProps.species1.dotSize,
        currentProps.species2.dotSize,
      ];
      renderDotsShader.setUniform('dotSizes', new THREE.Vector3(...dotSizes));
    }
  }, [
    renderDotsShader,
    currentProps.species0.dotSize,
    currentProps.species1.dotSize,
    currentProps.species2.dotSize,
  ]);

  const mouseSpawnTexture = useMemo(
    () =>
      getMouseTexture({
        textureSize: currentProps.textureSize,
        mousePlaceAmount: currentProps.mousePlaceAmount,
        mousePlaceRadius: currentProps.mousePlaceRadius,
        mousePlaceColor: currentProps.mousePlaceColor,
      }),
    [currentProps.textureSize]
  );

  useEffect(() => {
    if (mouseSpawnTexture) {
      mouseSpawnTexture.radius = currentProps.mousePlaceRadius;
    }
  }, [mouseSpawnTexture, currentProps.mousePlaceRadius]);
  useEffect(() => {
    if (mouseSpawnTexture) {
      mouseSpawnTexture.amount = currentProps.mousePlaceAmount;
    }
  }, [mouseSpawnTexture, currentProps.mousePlaceAmount]);
  useEffect(() => {
    if (mouseSpawnTexture) {
      mouseSpawnTexture.color = currentProps.mousePlaceColor;
    }
  }, [mouseSpawnTexture, currentProps.mousePlaceColor]);

  useEffect(() => {
    renderDotsShader.setUniform('isParticleTexture', currentProps.isParticleTexture);

    if (!currentProps.isParticleTexture) {
      setParticleTexture(null);
      return;
    }

    const loader = new THREE.TextureLoader();
    loader.load(
      `/particles/${currentProps.particleTexture}.png`,
      (tex) => {
        setParticleTexture(tex);
        renderDotsShader.setUniform('particleTexture', tex);
      },
      () => {},
      (err) => console.log((err as any).message)
    );
  }, [
    currentProps.isParticleTexture,
    currentProps.particleTexture,
    renderDotsShader,
  ]);
  useEffect(() => {
    if (particleTexture) {
      renderDotsShader.setUniform('particleTexture', particleTexture);
    }
  }, [particleTexture, renderDotsShader]);

  // useEffect(() => {
  // 	// veryFinalMaterial.uniforms.resolution.value = new THREE.Vector2(
  // 	// 	viewport.width,
  // 	// 	viewport.height,
  // 	// )
  // 	finalMaterial.setSize(viewport.width, viewport.height)
  // 	diffuseShader.setSize(
  // 		viewport.width,
  // 		viewport.height,
  // 		new Float32Array(viewport.width * viewport.height * 4),
  // 	)
  // 	renderDotsShader.setSize(viewport.width, viewport.height)

  // 	updateDotsShader.setUniform(
  // 		"resolution",
  // 		new THREE.Vector2(viewport.width, viewport.height),
  // 	)
  // }, [viewport.width, viewport.height])

  // const testMat = useMemo(() => {
  // 	return getTestMaterial
  // }, [updateDotsShader])

  useFrame((_, delta, __) => {
    updateDotsShader.setUniform('isMouseInside', mouseInside);
    if (mouseDown && mouseInside) {
      mouseSpawnTexture.drawMouse(mousePosition);

      updateDotsShader.setUniform(
        'mouseSpawnTexture',
        mouseSpawnTexture.getTexture()
      );
    }
    updateDotsShader.material.uniforms.time.value += delta * 0.1;

    diffuseShader.setUniform('points', renderDotsShader.getTexture());
    diffuseShader.render(gl);
    updateDotsShader.setUniform('mousePos', mousePosition);
    updateDotsShader.setUniform('pointsTexture', renderDotsShader.getTexture());
    updateDotsShader.setUniform('diffuseTexture', diffuseShader.getTexture());
    updateDotsShader.render(gl, {});

    renderDotsShader.setUniform(
      'positionTexture',
      updateDotsShader.getTexture()
    );
    renderDotsShader.render(gl);
    renderMaterial.uniforms.pointsTexture.value = renderDotsShader.getTexture();
    renderMaterial.uniforms.diffuseTexture.value = diffuseShader.getTexture();
    renderMaterial.render(gl, {});

    finalMaterial.uniforms.input_texture.value = renderMaterial.getTexture();

    // testMat.uniforms.aTexture.value = diffuseShader.getTexture(
    mouseSpawnTexture.clear();
    updateDotsShader.setUniform(
      'mouseSpawnTexture',
      mouseSpawnTexture.getTexture()
    );
  });

  // return (
  // 	<TextureDebug
  // 		mat={testMat}
  // 		viewport={{ width: viewport.width, height: viewport.height }}
  // 	/>
  // )
  // return finalMaterial.material
  return {
    material: finalMaterial,
    shaders: {
      renderMaterial,
      diffuseShader,
      updateDotsShader,
      renderDotsShader,
    },
    setMouseDown,
    setMousePosition,
    setMouseInside,
    setParticleTexture,
    mouseSpawnTexture,
    props: currentProps,
    setProps,
  };
};

export default usePhysarumMaterial;

const getFinalMaterial = (
  props: Required<PhysarumProps>,
  colors: THREE.Color[]
) => {
  const {
    outputSize,
    isFlatShading,
    flatShadingThreshold,
    dotOpacity,
    trailOpacity,
    isMonochrome,
  } = props;
  const { width, height } = outputSize;
  const finalMat = new PlaneShader({
    width,
    height,
    vertex: PASS_THROUGH_VERTEX,
    fragment: FINAL_RENDER_FRAGMENT,
    uniforms: {
      resolution: new THREE.Vector2(width, height),
      diffuseTexture: null,
      pointsTexture: null,

      col0: colors[0],
      col1: colors[1],
      col2: colors[2],

      isFlatShading,
      colorThreshold: flatShadingThreshold,

      dotOpacity,
      trailOpacity,

      isMonochrome,
    },
    options: {},
  });

  return finalMat;
};
const getOutputMaterial = () => {
  const finalMat = new THREE.ShaderMaterial({
    uniforms: {
      input_texture: {
        value: null,
      },
    },
    transparent: true,
    blending: THREE.NoBlending,
    vertexShader: PASS_THROUGH_VERTEX,
    fragmentShader: PASS_THROUGH_FRAGMENT,
  });

  return finalMat;
};

function getRenderDotsShader(props: Required<PhysarumProps>) {
  const { textureSize, outputSize, species0, species1, species2 } = props;
  const species = [species0, species1, species2];
  const dotSizes = species.map((sp) => sp.dotSize);
  const { pos, uvs } = getDataArrays(textureSize);
  return new ShaderBuilder()
    .withDimensions(outputSize.width, outputSize.height)
    .withVertex(RENDER_DOTS_VERTEX)
    .withFragment(RENDER_DOTS_FRAGMENT)
    .withUniform('isParticleTexture', props.isParticleTexture)
    .withUniform('particleTexture', null)
    .withUniform('positionTexture', null)
    .withUniform('dotSizes', new THREE.Vector3(...dotSizes))
    .withUniform(
      'resolution',
      new THREE.Vector2(outputSize.width, outputSize.height)
    )
    .withAttribute('position', new THREE.BufferAttribute(pos, 3, false))
    .withAttribute('uv', new THREE.BufferAttribute(uvs, 2, false))
    .create();
}

function getDataArrays(textureSize: number) {
  const dotAmount = textureSize * textureSize;
  let pos = new Float32Array(dotAmount * 3);
  let uvs = new Float32Array(dotAmount * 2);

  for (let i = 0; i < dotAmount; i++) {
    pos[i * 3] = pos[i * 3 + 1] = pos[i * 3 + 2] = 0;

    uvs[i * 2] = (i % textureSize) / textureSize;
    uvs[i * 2 + 1] = ~~(i / textureSize) / textureSize;
  }
  return { pos, uvs };
}
function getUpdateDotsShader(
  props: Required<PhysarumProps>,
  positionsAndDirections: Float32Array
) {
  const {
    species0,
    species1,
    species2,
    textureSize,
    outputSize,
    restrictToMiddle,
    disallowDisplacement,
    mousePushRadius,
  } = props;
  const species = [species0, species1, species2];

  const moveSpeeds = species.map((sp) => sp.moveSpeed);
  const sensorDistances = species.map((sp) => sp.sensorDistance);
  const rotationAngles = species.map((sp) => sp.rotationAngle);
  const sensorAngles = species.map((sp) => sp.sensorAngle);
  const infectiousness = species.map((sp) => (sp.infectious ? 1 : 0));

  return new PingPongShaderBuilder()
    .withDimensions(textureSize, textureSize)
    .withVertex(PASS_THROUGH_VERTEX)
    .withFragment(UPDATE_DOTS_FRAGMENT)
    .withTextureData(positionsAndDirections)
    .withUniform('diffuseTexture', null)
    .withUniform('pointsTexture', null)
    .withUniform('mouseSpawnTexture', null)
    .withUniform('isRestrictToMiddle', restrictToMiddle)
    .withUniform('time', 0)
    .withUniform('resolution', Vector([outputSize.width, outputSize.height]))
    .withUniform('textureDimensions', Vector([textureSize, textureSize]))
    .withUniform('mouseRad', mousePushRadius)
    .withUniform('mousePos', Vector([0, 0]))
    .withUniform('isMouseInside', false)
    .withUniform('isDisplacement', disallowDisplacement)
    .withUniform('sensorAngle', Vector(sensorAngles))
    .withUniform('rotationAngle', Vector(rotationAngles))
    .withUniform('sensorDistance', Vector(sensorDistances))
    .withUniform('attract0', species0.attractions)
    .withUniform('attract1', species1.attractions)
    .withUniform('attract2', species2.attractions)
    .withUniform('moveSpeed', Vector(moveSpeeds))
    .withUniform('infectious', Vector(infectiousness))
    .create();
}

interface MouseTextureProps {
  textureSize: number;
  mousePlaceRadius: number;
  mousePlaceAmount: number;
  mousePlaceColor: number;
}
function getMouseTexture(props: MouseTextureProps) {
  const { textureSize, mousePlaceRadius, mousePlaceAmount, mousePlaceColor } =
    props;
  return new MouseSpawnTexture(
    textureSize,
    textureSize,
    mousePlaceRadius,
    mousePlaceAmount,
    mousePlaceColor
  );
}
interface PosAndDirProps {
  textureSize: number;
  outputSize: THREE.Vector2;
  speciesAmount: number;
}
const getPositionAndDirectionArray = (props: PosAndDirProps) => {
  const { textureSize, outputSize, speciesAmount } = props;
  const dotAmount = textureSize * textureSize;

  let positionsAndDirections = new Float32Array(dotAmount * 4);

  for (let i = 0; i < dotAmount; i++) {
    let id = i * 4;

    let rndAng = rndFloat(0, Math.PI * 2);

    //x
    positionsAndDirections[id++] =
      ((i % textureSize) * outputSize.width) / textureSize;

    //y
    positionsAndDirections[id++] =
      (Math.floor(i / textureSize) * outputSize.height) / textureSize;

    //direction
    positionsAndDirections[id++] = rndAng;

    //team (0-> red, 1-> green, 2-> blue)
    positionsAndDirections[id] = rndInt(0, speciesAmount - 1);
  }
  return positionsAndDirections;
};

const getDiffuseShader = (props: Required<PhysarumProps>) => {
  const { decay, outputSize } = props;
  return new PingPongShaderBuilder()
    .withDimensions(outputSize.width, outputSize.height)
    .withVertex(PASS_THROUGH_VERTEX)
    .withFragment(DIFFUSE_DECAY_FRAGMENT)
    .withUniform('points', null)
    .withUniform('decay', decay)
    .withUniform(
      'resolution',
      new THREE.Vector2(outputSize.width, outputSize.height)
    )
    .create();
};
