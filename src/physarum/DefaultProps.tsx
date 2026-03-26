import * as THREE from 'three';
import { DEFAULT_PHYSARUM_PARTICLE_TEXTURE } from './particle_textures';
import { PhysarumProps } from './types/PhysarumProps';
import { PhysarumSpecies } from './types/PhysarumSpecies';
import { rndFloat } from './Util.js';

const defaultSpeciesColorsFromZinc = (): [string, string, string] => [
  'rgb(120,120,120)',
  'rgb(150,150,150)',
  'rgb(190,190,190)',
];

export const getSpeciesOne = (color?: string): Required<PhysarumSpecies> => {
  const [z0] = defaultSpeciesColorsFromZinc();
  return {
    moveSpeed: 2.2,
    sensorDistance: 6.48,
    rotationAngle: 0.74,
    sensorAngle: 0.84,
    infectious: 0,
    attractions: new THREE.Vector3(0, -0.32, -0.62),
    color: color || z0,
    dotSize: 1,
  };
};

export const getSpeciesTwo = (color?: string): Required<PhysarumSpecies> => {
  const [, z1] = defaultSpeciesColorsFromZinc();
  return {
    moveSpeed: 1.89,
    sensorDistance: 8.48,
    rotationAngle: 0.76,
    sensorAngle: 0.87,
    infectious: 0,
    attractions: new THREE.Vector3(0.01, 1, -0.61),
    color: color || z1,
    dotSize: 1,
  };
};

export const getSpeciesThree = (color?: string): Required<PhysarumSpecies> => {
  const [, , z2] = defaultSpeciesColorsFromZinc();
  return {
    moveSpeed: 2.51,
    sensorDistance: 7.5,
    rotationAngle: 0.49,
    sensorAngle: 0.69,
    infectious: 0,
    attractions: new THREE.Vector3(0.88, 0.51, 1),
    color: color || z2,
    dotSize: 1.5,
  };
};

export const getDefaultSpecies = (
  team: 0 | 1 | 2
): Required<PhysarumSpecies> => {
  const moveSpeed = rndFloat(1, 5);
  const sensorDistance = moveSpeed * rndFloat(1.5, 6);

  const rotationAngle = rndFloat(0.3, 1);
  const sensorAngle = rotationAngle * rndFloat(1, 1.5);
  const zincDefaults = defaultSpeciesColorsFromZinc();

  return {
    moveSpeed,
    sensorDistance,
    rotationAngle,
    sensorAngle,
    infectious: 0,
    attractions: new THREE.Vector3(
      ...Array(3)
        .fill(0)
        .map((_, i) => (i === team ? 1 : rndFloat(-1, 1)))
    ),
    color: zincDefaults[team],
    dotSize: 1,
  };
};
export const DefaultPhysarumProps = {
  textureSize: 1024,
  outputSize: new THREE.Vector2(4000, 4000),
  speciesAmount: 3,
  restrictToMiddle: false,
  disallowDisplacement: false,
  isFlatShading: false,
  flatShadingThreshold: 0.4,
  isMonochrome: false,
  isInvert: true,
  trailOpacity: 1,
  dotOpacity: 0.2,
  decay: 0.97,
  species0: getDefaultSpecies(0),
  species1: getDefaultSpecies(1),
  species2: getDefaultSpecies(2),
  mousePushRadius: 100,
  mousePlaceRadius: 100,
  mousePlaceAmount: 100,
  mousePlaceColor: 0,
  isParticleTexture: false,
  particleTexture: DEFAULT_PHYSARUM_PARTICLE_TEXTURE,
  contrast: 1,
  saturation: 1,
  vibrance: 1,
  gammaCorrection: 1,
} as Required<PhysarumProps>;
