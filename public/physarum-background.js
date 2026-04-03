import * as THREE from 'https://esm.sh/three@0.169.0'

let TEXTURE_TYPE = THREE.HalfFloatType

const PASS_THROUGH_VERTEX = `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
}
`

const PASS_THROUGH_FRAGMENT = `
uniform sampler2D input_texture;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(input_texture, vUv);
}
`

const DIFFUSE_DECAY_FRAGMENT = `
uniform sampler2D points;
uniform sampler2D input_texture;
uniform vec2 resolution;
uniform float decay;
varying vec2 vUv;
void main(){
  vec3 pixelPoint = texture2D(points, vUv).rgb;
  vec3 col = vec3(0.0);
  const float dim = 1.0;
  float weight = 1.0 / pow(dim * 2.0 + 1.0, 2.0);
  for(float i = -dim; i <= dim; i++) {
    for(float j = -dim; j <= dim; j++) {
      vec3 val = texture2D(input_texture, (gl_FragCoord.xy + vec2(i, j)) / resolution).rgb;
      col += val * weight;
    }
  }
  gl_FragColor = vec4(
    max(0.0, min(1.0, col.r * decay + pixelPoint.r)),
    max(0.0, min(1.0, col.g * decay + pixelPoint.g)),
    max(0.0, min(1.0, col.b * decay + pixelPoint.b)),
    1.0
  );
}
`

const RENDER_DOTS_VERTEX = `
uniform sampler2D positionTexture;
uniform vec3 dotSizes;
varying float team;
void main(){
  vec4 posText = texture2D(positionTexture, uv);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(posText.xy, 0.0, 1.0);
  team = posText.a;
  gl_PointSize = dotSizes[int(team)];
}
`

const RENDER_DOTS_FRAGMENT = `
varying float team;
void main(){
  float r = 0.0;
  float g = 0.0;
  float b = 1.0;
  if (team == 0.0) {
    r = 1.0;
    g = 0.0;
    b = 0.0;
  } else if (team == 1.0) {
    r = 0.0;
    g = 1.0;
    b = 0.0;
  }
  gl_FragColor = vec4(r, g, b, 1.0);
}
`

const UPDATE_DOTS_FRAGMENT = `
uniform vec2 resolution;
uniform float time;
uniform bool isRestrictToMiddle;
uniform bool isDisplacement;
uniform vec3 moveSpeed;
uniform vec3 rotationAngle;
uniform vec3 sensorDistance;
uniform vec3 sensorAngle;
uniform vec3 attract0;
uniform vec3 attract1;
uniform vec3 attract2;
uniform vec2 textureDimensions;
uniform sampler2D diffuseTexture;
uniform sampler2D pointsTexture;
uniform sampler2D input_texture;
const float PI = 3.14159265358979323846264;
const float PI2 = PI * 2.0;
float sampleDiffuseTexture(vec2 pos, float team) {
  float val = 0.0;
  const float searchArea = 1.0;
  vec2 uv = pos / resolution + 0.5;
  for (float i = 0.0; i < searchArea * 2.0 + 1.0; i++) {
    for (float j = 0.0; j < searchArea * 2.0 + 1.0; j++) {
      vec4 pixel = texture2D(diffuseTexture, (uv + vec2(i - searchArea, j - searchArea) / resolution)).rgba;
      vec3 attract = attract0;
      if (team == 1.0) attract = attract1;
      else if (team == 2.0) attract = attract2;
      float pixelVal = pixel.r * attract.r + pixel.g * attract.g + pixel.b * attract.b;
      val += pixelVal * (1.0 / pow(2.0 * searchArea + 1.0, 2.0));
    }
  }
  return val;
}
float getDataValue(vec2 uv){
  vec3 pixel = texture2D(pointsTexture, (uv / resolution + 0.5)).rgb;
  return pixel.r + pixel.b + pixel.g;
}
float rand(vec2 co){
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}
vec2 wrapPos(vec2 pos) {
  return fract((pos.xy + resolution * 0.5) / resolution) * resolution - resolution * 0.5;
}
void main(){
  vec4 tmpPos = texture2D(input_texture, gl_FragCoord.xy / textureDimensions);
  vec2 position = tmpPos.xy;
  float direction = tmpPos.z;
  float team = tmpPos.a;
  int teamInt = int(team);
  float angDif = sensorAngle[teamInt];
  float leftAng = direction - angDif;
  float rightAng = direction + angDif;
  float sensorDist = sensorDistance[teamInt];
  vec2 leftPos = position + vec2(cos(leftAng), sin(leftAng)) * sensorDist;
  vec2 midPos = position + vec2(cos(direction), sin(direction)) * sensorDist;
  vec2 rightPos = position + vec2(cos(rightAng), sin(rightAng)) * sensorDist;
  float leftVal = sampleDiffuseTexture(leftPos.xy, team);
  float rightVal = sampleDiffuseTexture(rightPos.xy, team);
  float midVal = sampleDiffuseTexture(midPos.xy, team);
  float rotationAng = rotationAngle[teamInt];
  if (midVal > rightVal && midVal > leftVal) {
  } else if (midVal < rightVal && midVal < leftVal) {
    direction += (0.5 - floor(rand(position + gl_FragCoord.xy) + 0.5)) * rotationAng;
  } else if (rightVal > midVal && rightVal > leftVal) {
    direction += rotationAng;
  } else if (leftVal > midVal && leftVal > rightVal) {
    direction -= rotationAng;
  }
  if (isRestrictToMiddle && length(position) > 155.0 * (1.0 + abs(mod(time * 0.01, 10.0) - 5.0) / 5.0)) {
    direction = atan(position.y, position.x) - PI;
  }
  vec2 newPosition = position + vec2(cos(direction), sin(direction)) * moveSpeed[teamInt];
  if (isDisplacement && getDataValue(newPosition.xy) > 0.0) {
    newPosition.xy = tmpPos.xy;
    direction += PI2 / 2.0;
  }
  newPosition.xy = wrapPos(newPosition.xy);
  gl_FragColor = vec4(newPosition.xy, direction, team);
}
`

const FINAL_RENDER_FRAGMENT = `
uniform sampler2D diffuseTexture;
uniform sampler2D pointsTexture;
uniform float isMonochrome;
uniform float trailOpacity;
uniform float dotOpacity;
uniform bool isFlatShading;
uniform float colorThreshold;
uniform vec2 resolution;
uniform vec3 col0;
uniform vec3 col1;
uniform vec3 col2;
varying vec2 vUv;
void main(){
  vec4 trail = texture2D(diffuseTexture, vUv);
  vec4 points = texture2D(pointsTexture, vUv);
  vec4 trailPixel = isMonochrome * vec4(vec3((trail.r + trail.g + trail.b + trail.a) / 4.0), trail.a) + (1.0 - isMonochrome) * trail;
  vec4 dotPixel = isMonochrome * vec4(vec3((points.r + points.g + points.b + points.a) / 4.0), points.a) + (1.0 - isMonochrome) * points;
  vec4 mixedCol = trailPixel * trailOpacity + dotOpacity * dotPixel;
  vec3 customCol = isMonochrome * mixedCol.rgb + (1.0 - isMonochrome) * (mixedCol.r * col0 + mixedCol.g * col1 + mixedCol.b * col2);
  if (isFlatShading) {
    if (mixedCol.r > colorThreshold && mixedCol.r > mixedCol.b && mixedCol.r > mixedCol.g) customCol = col0;
    else if (mixedCol.g > colorThreshold && mixedCol.g > mixedCol.b && mixedCol.g > mixedCol.r) customCol = col1;
    else if (mixedCol.b > colorThreshold && mixedCol.b > mixedCol.g && mixedCol.b > mixedCol.r) customCol = col2;
  }
  gl_FragColor = vec4(customCol, 1.0);
}
`

const orthographicCamera = (w, h) => new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 100)
const vec = (arr) => arr.length === 2 ? new THREE.Vector2(...arr) : new THREE.Vector3(...arr)
const rndFloat = (min, max) => Math.random() * (max - min) + min
const rndInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

class PingPongShader {
  constructor(width, height, vertex, fragment, uniforms, data = null, attributes = {}, options = {}) {
    this.width = width
    this.height = height
    const opts = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: TEXTURE_TYPE,
      alpha: true,
      blending: THREE.NoBlending,
      preserveDrawingBuffer: true,
      ...options
    }
    if (data === null) data = new Float32Array(width * height * 4)
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, TEXTURE_TYPE)
    texture.needsUpdate = true
    this.renderTarget0 = new THREE.WebGLRenderTarget(width, height, opts)
    this.renderTarget1 = new THREE.WebGLRenderTarget(width, height, opts)
    this.renderTarget0.texture = texture.clone()
    this.renderTarget1.texture = texture
    this.currentRenderTarget = this.renderTarget0
    this.nextRenderTarget = this.renderTarget1
    this.uniforms = { input_texture: { value: this.getTexture() } }
    for (const key in uniforms) this.uniforms[key] = { value: uniforms[key] }
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, blending: THREE.NoBlending, vertexShader: vertex, fragmentShader: fragment, transparent: true })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(), this.material)
    this.mesh.scale.set(width, height, 1)
    this.getScene().add(this.mesh)
  }
  getScene() { if (!this.scene) this.scene = new THREE.Scene(); return this.scene }
  getCamera() { if (!this.camera) { this.camera = orthographicCamera(this.width, this.height); this.camera.position.z = 1 } return this.camera }
  getTexture() { return this.currentRenderTarget.texture }
  setUniform(key, value) { if (!this.material.uniforms[key]) this.material.uniforms[key] = {}; this.material.uniforms[key].value = value }
  switchRenderTargets() {
    this.currentRenderTarget = this.currentRenderTarget === this.renderTarget0 ? this.renderTarget1 : this.renderTarget0
    this.nextRenderTarget = this.currentRenderTarget === this.renderTarget0 ? this.renderTarget1 : this.renderTarget0
  }
  render(renderer, updatedUniforms = {}) {
    this.switchRenderTargets()
    this.mesh.visible = true
    this.material.uniforms.input_texture.value = this.getTexture()
    for (const key in updatedUniforms) this.material.uniforms[key].value = updatedUniforms[key]
    renderer.setSize(this.width, this.height, false)
    renderer.setRenderTarget(this.nextRenderTarget)
    renderer.render(this.getScene(), this.getCamera())
    renderer.setRenderTarget(null)
    this.mesh.visible = false
  }
  dispose() { this.material.dispose(); this.renderTarget0.dispose(); this.renderTarget1.dispose() }
}

class PointsShader {
  constructor(width, height, vertex, fragment, uniforms, attributes = {}, options = {}) {
    this.width = width
    this.height = height
    this.uniforms = {}
    for (const key in uniforms) this.uniforms[key] = { value: uniforms[key] }
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, blending: THREE.NoBlending, transparent: true, vertexShader: vertex, fragmentShader: fragment })
    const opts = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, type: TEXTURE_TYPE, blending: THREE.NoBlending, ...options }
    this.renderTarget = new THREE.WebGLRenderTarget(width, height, opts)
    const geometry = new THREE.BufferGeometry()
    for (const key in attributes) geometry.setAttribute(key, attributes[key])
    this.mesh = new THREE.Points(geometry, this.material)
    this.getScene().add(this.mesh)
  }
  getScene() { if (!this.scene) this.scene = new THREE.Scene(); return this.scene }
  getCamera() { if (!this.camera) { this.camera = orthographicCamera(this.width, this.height); this.camera.position.z = 1 } return this.camera }
  getTexture() { return this.renderTarget.texture }
  setUniform(key, value) { if (!this.material.uniforms[key]) this.material.uniforms[key] = {}; this.material.uniforms[key].value = value }
  render(renderer, updatedUniforms = {}) {
    this.mesh.visible = true
    for (const key in updatedUniforms) this.material.uniforms[key].value = updatedUniforms[key]
    renderer.setSize(this.width, this.height, false)
    renderer.setRenderTarget(this.renderTarget)
    renderer.render(this.getScene(), this.getCamera())
    renderer.setRenderTarget(null)
    this.mesh.visible = false
  }
  dispose() { this.material.dispose(); this.renderTarget.dispose(); this.mesh.geometry.dispose() }
}

class PlaneShader {
  constructor({ width, height, vertex, fragment, uniforms, options = {} }) {
    this.width = width
    this.height = height
    this.uniforms = {}
    for (const key in uniforms) this.uniforms[key] = { value: uniforms[key] }
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, blending: THREE.NoBlending, transparent: true, vertexShader: vertex, fragmentShader: fragment })
    this.renderTarget = new THREE.WebGLRenderTarget(width, height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, type: TEXTURE_TYPE, blending: THREE.NoBlending, ...options })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(), this.material)
    this.mesh.scale.set(width, height, 1)
    this.getScene().add(this.mesh)
  }
  getScene() { if (!this.scene) this.scene = new THREE.Scene(); return this.scene }
  getCamera() { if (!this.camera) { this.camera = orthographicCamera(this.width, this.height); this.camera.position.z = 1 } return this.camera }
  getTexture() { return this.renderTarget.texture }
  render(renderer, updatedUniforms = {}) {
    this.mesh.visible = true
    for (const key in updatedUniforms) this.material.uniforms[key].value = updatedUniforms[key]
    renderer.setSize(this.width, this.height, false)
    renderer.setRenderTarget(this.renderTarget)
    renderer.render(this.getScene(), this.getCamera())
    renderer.setRenderTarget(null)
    this.mesh.visible = false
  }
  dispose() { this.material.dispose(); this.renderTarget.dispose() }
}

function getDataArrays(textureSize) {
  const dotAmount = textureSize * textureSize
  const pos = new Float32Array(dotAmount * 3)
  const uvs = new Float32Array(dotAmount * 2)
  for (let i = 0; i < dotAmount; i++) {
    pos[i * 3] = pos[i * 3 + 1] = pos[i * 3 + 2] = 0
    uvs[i * 2] = (i % textureSize) / textureSize
    uvs[i * 2 + 1] = Math.floor(i / textureSize) / textureSize
  }
  return { pos, uvs }
}

function getPositionAndDirectionArray(textureSize, outputSize, speciesAmount) {
  const dotAmount = textureSize * textureSize
  const positionsAndDirections = new Float32Array(dotAmount * 4)
  for (let i = 0; i < dotAmount; i++) {
    let id = i * 4
    positionsAndDirections[id++] = ((i % textureSize) * outputSize.width) / textureSize - outputSize.width / 2
    positionsAndDirections[id++] = (Math.floor(i / textureSize) * outputSize.height) / textureSize - outputSize.height / 2
    positionsAndDirections[id++] = rndFloat(0, Math.PI * 2)
    positionsAndDirections[id] = rndInt(0, speciesAmount - 1)
  }
  return positionsAndDirections
}

function getFinalMaterial(props, colors) {
  return new PlaneShader({
    width: props.outputSize.width,
    height: props.outputSize.height,
    vertex: PASS_THROUGH_VERTEX,
    fragment: FINAL_RENDER_FRAGMENT,
    uniforms: {
      resolution: new THREE.Vector2(props.outputSize.width, props.outputSize.height),
      diffuseTexture: null,
      pointsTexture: null,
      col0: colors[0],
      col1: colors[1],
      col2: colors[2],
      isFlatShading: props.isFlatShading,
      colorThreshold: props.flatShadingThreshold,
      dotOpacity: props.dotOpacity,
      trailOpacity: props.trailOpacity,
      isMonochrome: props.isMonochrome
    }
  })
}

function getOutputMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { input_texture: { value: null } },
    transparent: true,
    blending: THREE.NoBlending,
    vertexShader: PASS_THROUGH_VERTEX,
    fragmentShader: PASS_THROUGH_FRAGMENT
  })
}

function getRenderDotsShader(props) {
  const species = [props.species0, props.species1, props.species2]
  const dotSizes = species.map((sp) => sp.dotSize)
  const { pos, uvs } = getDataArrays(props.textureSize)
  return new PointsShader(props.outputSize.width, props.outputSize.height, RENDER_DOTS_VERTEX, RENDER_DOTS_FRAGMENT, {
    positionTexture: null,
    dotSizes: new THREE.Vector3(...dotSizes),
    resolution: new THREE.Vector2(props.outputSize.width, props.outputSize.height)
  }, {
    position: new THREE.BufferAttribute(pos, 3, false),
    uv: new THREE.BufferAttribute(uvs, 2, false)
  })
}

function getUpdateDotsShader(props, positionsAndDirections) {
  const species = [props.species0, props.species1, props.species2]
  return new PingPongShader(props.textureSize, props.textureSize, PASS_THROUGH_VERTEX, UPDATE_DOTS_FRAGMENT, {
    diffuseTexture: null,
    pointsTexture: null,
    isRestrictToMiddle: props.restrictToMiddle,
    time: 0,
    resolution: vec([props.outputSize.width, props.outputSize.height]),
    textureDimensions: vec([props.textureSize, props.textureSize]),
    isDisplacement: props.disallowDisplacement,
    sensorAngle: vec(species.map((sp) => sp.sensorAngle)),
    rotationAngle: vec(species.map((sp) => sp.rotationAngle)),
    sensorDistance: vec(species.map((sp) => sp.sensorDistance)),
    attract0: props.species0.attractions,
    attract1: props.species1.attractions,
    attract2: props.species2.attractions,
    moveSpeed: vec(species.map((sp) => sp.moveSpeed))
  }, positionsAndDirections)
}

function getDiffuseShader(props) {
  return new PingPongShader(props.outputSize.width, props.outputSize.height, PASS_THROUGH_VERTEX, DIFFUSE_DECAY_FRAGMENT, {
    points: null,
    decay: props.decay,
    resolution: new THREE.Vector2(props.outputSize.width, props.outputSize.height)
  })
}

function defaultSpecies() {
  return {
    textureSize: 180,
    speciesAmount: 3,
    restrictToMiddle: false,
    disallowDisplacement: false,
    isFlatShading: false,
    flatShadingThreshold: 0.4,
    isMonochrome: 0,
    trailOpacity: 1,
    dotOpacity: 0.22,
    decay: 0.965,
    species0: {
      moveSpeed: 2.2,
      sensorDistance: 6.48,
      rotationAngle: 0.74,
      sensorAngle: 0.84,
      attractions: new THREE.Vector3(0.0, -0.32, -0.62),
      color: 'rgb(117,255,187)',
      dotSize: 1.0
    },
    species1: {
      moveSpeed: 1.89,
      sensorDistance: 8.48,
      rotationAngle: 0.76,
      sensorAngle: 0.87,
      attractions: new THREE.Vector3(0.01, 1.0, -0.61),
      color: 'rgb(76,214,255)',
      dotSize: 1.0
    },
    species2: {
      moveSpeed: 2.51,
      sensorDistance: 7.5,
      rotationAngle: 0.49,
      sensorAngle: 0.69,
      attractions: new THREE.Vector3(0.88, 0.51, 1.0),
      color: 'rgb(44,92,70)',
      dotSize: 1.35
    }
  }
}

export function startPhysarumBackground({ canvas }) {
  if (!canvas) return { destroy() {} }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' })
  const gl = renderer.getContext()
  const canFloat = Boolean(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('WEBGL_color_buffer_float'))
  const canHalfFloat = Boolean(gl.getExtension('EXT_color_buffer_half_float'))
  TEXTURE_TYPE = canFloat ? THREE.FloatType : (canHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  const scene = new THREE.Scene()
  const camera = orthographicCamera(2, 2)
  camera.position.z = 1
  const props = { ...defaultSpecies(), outputSize: new THREE.Vector2(window.innerWidth, window.innerHeight) }
  const colors = [new THREE.Color(props.species0.color), new THREE.Color(props.species1.color), new THREE.Color(props.species2.color)]
  let renderMaterial = getFinalMaterial(props, colors)
  let finalMaterial = getOutputMaterial()
  let positionsAndDirections = getPositionAndDirectionArray(props.textureSize, props.outputSize, props.speciesAmount)
  let updateDotsShader = getUpdateDotsShader(props, positionsAndDirections)
  let diffuseShader = getDiffuseShader(props)
  let renderDotsShader = getRenderDotsShader(props)
  const outputMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), finalMaterial)
  scene.add(outputMesh)
  let raf = 0
  let running = true

  function resize() {
    props.outputSize = new THREE.Vector2(window.innerWidth, window.innerHeight)
    renderer.setSize(window.innerWidth, window.innerHeight, false)
    renderMaterial.dispose(); diffuseShader.dispose(); renderDotsShader.dispose(); updateDotsShader.dispose()
    renderMaterial = getFinalMaterial(props, colors)
    positionsAndDirections = getPositionAndDirectionArray(props.textureSize, props.outputSize, props.speciesAmount)
    updateDotsShader = getUpdateDotsShader(props, positionsAndDirections)
    diffuseShader = getDiffuseShader(props)
    renderDotsShader = getRenderDotsShader(props)
  }

  function frame() {
    if (!running) return
    updateDotsShader.setUniform('time', updateDotsShader.material.uniforms.time.value + 0.016)
    diffuseShader.setUniform('points', renderDotsShader.getTexture())
    diffuseShader.render(renderer)
    updateDotsShader.setUniform('pointsTexture', renderDotsShader.getTexture())
    updateDotsShader.setUniform('diffuseTexture', diffuseShader.getTexture())
    updateDotsShader.render(renderer)
    renderDotsShader.setUniform('positionTexture', updateDotsShader.getTexture())
    renderDotsShader.render(renderer)
    renderMaterial.uniforms.pointsTexture.value = renderDotsShader.getTexture()
    renderMaterial.uniforms.diffuseTexture.value = diffuseShader.getTexture()
    renderMaterial.render(renderer)
    finalMaterial.uniforms.input_texture.value = renderMaterial.getTexture()
    renderer.setRenderTarget(null)
    renderer.setSize(window.innerWidth, window.innerHeight, false)
    renderer.clear()
    renderer.render(scene, camera)
    raf = requestAnimationFrame(frame)
  }

  resize()
  window.addEventListener('resize', resize)
  frame()

  return {
    destroy() {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      renderMaterial.dispose(); diffuseShader.dispose(); renderDotsShader.dispose(); updateDotsShader.dispose(); finalMaterial.dispose(); renderer.dispose()
    }
  }
}
