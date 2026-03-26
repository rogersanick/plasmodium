import * as THREE from 'three';
import { orthographicCamera } from './ThreeJsUtils.js';
/**
 * Adapted from https://github.com/nicoptere/physarum/blob/master/src/PingpongRenderTarget.js
 */
export class PingPongShader {
  constructor(
    width,
    height,
    vertex,
    fragment,
    uniforms,
    data = null,
    attributes,
    options
  ) {
    this.width = width;
    this.height = height;

    let opts = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      alpha: true,
      blending: THREE.NoBlending,
      depthBuffer: false,
      stencilBuffer: false,
    };
    for (let key in options) {
      opts[key] = options[key];
    }

    if (data === null) {
      data = new Float32Array(width * height * 4);
    }

    let texture = new THREE.DataTexture(
      data,
      width,
      height,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    texture.needsUpdate = true;

    this.renderTarget0 = new THREE.WebGLRenderTarget(width, height, opts);
    this.renderTarget1 = new THREE.WebGLRenderTarget(width, height, opts);

    this.renderTarget0.texture = texture.clone();
    this.renderTarget1.texture = texture;

    this.currentRenderTarget = this.renderTarget0;
    this.nextRenderTarget = this.renderTarget1;

    this.uniforms = {
      input_texture: { value: this.getTexture() },
    };
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

    this.getScene().add(this.mesh);
  }
  setSize(width, height, newData) {
    this.width = width;
    this.height = height;
    this.material.uniforms.resolution.value = new THREE.Vector2(width, height);
    this.mesh.scale.set(width, height, 1);
    if (newData) {
      this.renderTarget0.setSize(width, height);
      this.renderTarget1.setSize(width, height);

      let texture = new THREE.DataTexture(
        newData,
        width,
        height,
        THREE.RGBAFormat,
        THREE.FloatType
      );
      texture.needsUpdate = true;
      this.renderTarget0.texture = texture.clone();
      this.renderTarget1.texture = texture;
    }
  }
  setUniform(key, value) {
    if (!this.material.uniforms.hasOwnProperty(key)) {
      this.material.uniforms[key] = {};
    }
    this.material.uniforms[key].value = value;
  }
  getUniforms() {
    return this.material.uniforms;
  }
  getTexture() {
    return this.currentRenderTarget.texture;
  }
  setTextureData() {}
  switchRenderTargets() {
    this.currentRenderTarget =
      this.currentRenderTarget === this.renderTarget0
        ? this.renderTarget1
        : this.renderTarget0;
    this.nextRenderTarget =
      this.currentRenderTarget === this.renderTarget0
        ? this.renderTarget1
        : this.renderTarget0;
  }

  render(renderer, updatedUniforms) {
    this.switchRenderTargets();

    this.mesh.visible = true;
    this.material.uniforms.input_texture.value = this.getTexture();

    for (let key in updatedUniforms) {
      this.material.uniforms[key].value = updatedUniforms[key];
    }

    const prevRenderTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.nextRenderTarget);
    renderer.render(this.getScene(), this.getCamera());
    renderer.setRenderTarget(prevRenderTarget);
    this.mesh.visible = false;
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
    this.getScene().remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh = null;
    this.camera = null;
    this.material.dispose();
    this.currentRenderTarget.texture.dispose();
    this.nextRenderTarget.texture.dispose();
    this.renderTarget0 = null;
    this.renderTarget1 = null;
    this.currentRenderTarget = null;
    this.nextRenderTarget = null;
    this.scene = null;
  }
}
