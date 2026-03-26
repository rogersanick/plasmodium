export interface PhysarumSpecies {
  //movement speed of the particles (Pixels per frame)
  moveSpeed?: number;

  //Distance a particle samples in front of it
  sensorDistance?: number;

  //Angle (in radians) with which the particles turn
  rotationAngle?: number;

  //Angle (in radians) with which the particles sample the texture to the left/right of it
  sensorAngle?: number;

  //Whether this species is infectious to the next (species 0 can only be infectious to species 1, species 1 to 2, species 2 to 0).
  infectious?: 0 | 1;

  //Attraction values.
  attractions?: THREE.Vector3;

  //Color of the species
  color?: string;

  //Size of a particle
  dotSize?: number;
}
