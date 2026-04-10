import * as THREE from 'three'

let physarumTextureType: THREE.TextureDataType = THREE.HalfFloatType

export function getPhysarumTextureType() {
  return physarumTextureType
}

export function setPhysarumTextureType(type: THREE.TextureDataType) {
  physarumTextureType = type
}

export function detectPhysarumTextureType(renderer: THREE.WebGLRenderer) {
  const gl = renderer.getContext()
  const canFloat = Boolean(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('WEBGL_color_buffer_float'))
  const canHalfFloat = Boolean(gl.getExtension('EXT_color_buffer_half_float'))
  const nextType = canFloat ? THREE.FloatType : (canHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType)
  setPhysarumTextureType(nextType)
  return nextType
}
