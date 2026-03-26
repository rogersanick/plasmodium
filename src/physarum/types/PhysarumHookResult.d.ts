export interface PhysarumHookResult {
  material: THREE.ShaderMaterial;
  shaders: {
    renderMaterial: PlaneShader;
    diffuseShader: PingPongShader;
    updateDotsShader: PingPongShader;
    renderDotsShader: PointsShader;
  };
  props: PhysarumProps;
  setMouseDown: React.Dispatch<React.SetStateAction<boolean>>;
  setParticleTexture: React.Dispatch<
    React.SetStateAction<THREE.Texture | null>
  >;
  setMousePosition: React.Dispatch<
    React.SetStateAction<{
      x: number;
      y: number;
    }>
  >;
  setMouseInside: React.Dispatch<React.SetStateAction<boolean>>;
  setProps: React.Dispatch<React.SetStateAction<Required<PhysarumProps>>>;
  mouseSpawnTexture: MouseSpawnTexture;
}
