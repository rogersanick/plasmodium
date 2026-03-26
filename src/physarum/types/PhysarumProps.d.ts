import { PhysarumSpecies } from './PhysarumSpecies';
import { PhysarumParticleTexture } from '../particle_textures';

export interface PhysarumProps {
  //This controls the amount of particles in the simulation.
  //The texture used will have the dimensions textureSize*textureSize, so the amount of particles is equal
  //to textureSize^2.
  //It's best to use powers of 2 for this for performance reasons (64,128,256 etc)
  textureSize?: number;

  //Size of the output texture. The dimensions of the plane on which the simulation takes place.
  outputSize?: THREE.Vector2;

  //amount of different species
  speciesAmount?: 1 | 2 | 3;

  //Configurations for the three different species
  species0?: PhysarumSpecies;
  species1?: PhysarumSpecies;
  species2?: PhysarumSpecies;

  //Rate at which the trails of the particles decay over time. Value of 1 means no decay. Value of 0 means the trails disappear immediately.
  decay?: number;

  //moves particles into a circle around the origin coordinates
  restrictToMiddle?: boolean;

  //If enabled, only one particle may occupy each pixel. More controlled results but less fun.
  disallowDisplacement?: boolean;

  //Enable flat shading.
  isFlatShading?: boolean;

  //Alpha threshold above which a pixel will be rendered in a color
  flatShadingThreshold?: number;

  //Enable monochrome rendering
  isMonochrome?: boolean;

  //Invert colors
  isInvert?: boolean;

  //Opacity of the diffusing trail the particles leave
  trailOpacity?: number;

  //Opacity of the dots/particles
  dotOpacity?: number;

  isParticleTexture?: boolean;
  particleTexture?: PhysarumParticleTexture;

  mousePushRadius?: number;
  mousePlaceRadius?: number;
  mousePlaceAmount?: number;
  mousePlaceColor?: 0 | 1 | 2;
}
