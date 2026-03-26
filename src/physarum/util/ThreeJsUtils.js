import * as THREE from 'three';

export const Vector = (arr) => {
  return arr.length === 2
    ? new THREE.Vector2(arr[0], arr[1])
    : arr.length === 3
      ? new THREE.Vector3(arr[0], arr[1], arr[2])
      : arr.length === 4
        ? new THREE.Vector4(arr[0], arr[1], arr[2], arr[3])
        : console.error('Cant create vector with ' + arr.length + ' elements');
};

export const orthographicCamera = (w, h) =>
  new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 100);

export const getTestMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: {
      aTexture: { value: null },
      time: { value: 0 },
    },
    transparent: true,
    blending: THREE.NoBlending,
    vertexShader: `
	  varying vec2 vUv;
	  void main() {
	    vUv = uv;
	    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	  }
	`,
    fragmentShader: `
	  uniform sampler2D aTexture;
	  uniform float time;
	  varying vec2 vUv;
	  void main() {

			vec4 texColor = texture2D(aTexture, vUv);
			// // Normal texture sampling logic
			gl_FragColor = texColor.rgba ;

	  }
	`,
    depthWrite: false,
    depthTest: false,
  });
