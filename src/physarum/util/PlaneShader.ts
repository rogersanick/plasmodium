import * as THREE from 'three';
import { Uniform } from 'three';

import { orthographicCamera } from './ThreeJsUtils';

interface PlaneShaderProps {
  width: number;
  height: number;
  vertex: string;
  fragment: string;
  uniforms: { [key: string]: any };
  options: any;
}
export class PlaneShader {
  width: number;
  height: number;
  uniforms: { [key: string]: any };
  material: THREE.ShaderMaterial;
  renderTarget: THREE.WebGLRenderTarget<THREE.Texture> | null;
  mesh: THREE.Mesh<THREE.PlaneGeometry, any, THREE.Object3DEventMap> | null;
  scene: any;
  camera: any;
  constructor(props: PlaneShaderProps) {
    const { width, height, vertex, fragment, uniforms, options } = props;
    this.width = width;
    this.height = height;
    this.uniforms = {};
    for (let key in uniforms) {
      if (!this.uniforms.hasOwnProperty(key)) {
        this.uniforms[key] = {};
      }
      this.uniforms[key] = { value: uniforms[key] };
    }
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      blending: THREE.NoBlending,
      transparent: true,
      vertexShader: vertex,
      fragmentShader: fragment,
    });

    let opts = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      blending: THREE.NoBlending,
      depthBuffer: false,
      stencilBuffer: false,
    } as any;
    for (let key in options) {
      opts[key] = options[key];
    }
    this.renderTarget = new THREE.WebGLRenderTarget(width, height, opts);

    this.uniforms = {};

    for (let key in uniforms) {
      this.uniforms[key] = { value: uniforms[key] };
    }
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      blending: THREE.NoBlending,
      vertexShader: vertex,
      fragmentShader: fragment,
    });
    this.material.transparent = true;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(), this.material);
    this.mesh.scale.set(width, height, 1);
    this.mesh.position.set(0, 0, 0);

    this.getScene().add(this.mesh);
  }
  setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.material.uniforms.resolution.value = new THREE.Vector2(width, height);
    if (this.renderTarget) {
      this.renderTarget.setSize(width, height);
    }
  }
  setUniform(key: string, value: Uniform) {
    if (!this.material.uniforms.hasOwnProperty(key)) {
      this.material.uniforms[key] = { value: value };
    }
    this.material.uniforms[key].value = value;
  }
  getTexture() {
    return this.renderTarget ? this.renderTarget.texture : null;
  }
  render(
    renderer: THREE.WebGLRenderer,
    updatedUniforms: { [key: string]: any }
  ) {
    if (this.mesh) {
      this.mesh.visible = true;

      for (let key in updatedUniforms) {
        this.material.uniforms[key].value = updatedUniforms[key];
      }
      const prevRenderTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(this.renderTarget);
      renderer.render(this.getScene(), this.getCamera());
      renderer.setRenderTarget(prevRenderTarget);
      this.mesh.visible = false;
    }
  }
  getScene() {
    if (!this.scene) {
      this.scene = new THREE.Scene();
    }
    return this.scene;
  }
  getCamera() {
    if (!this.camera) {
      this.camera = orthographicCamera(this.width, this.height);
      this.camera.position.z = 1;
    }
    return this.camera;
  }
  dispose() {
    if (this.mesh) {
      this.getScene().remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (this.renderTarget) {
      this.renderTarget.texture.dispose();
    }
    this.camera = null;
    this.material.dispose();
    this.renderTarget = null;
    this.scene = null;
  }
}
