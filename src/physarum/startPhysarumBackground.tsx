import { createRoot, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { getSpeciesOne, getSpeciesThree, getSpeciesTwo } from './DefaultProps'
import usePhysarumMaterial from './usePhysarum'

type StartPhysarumBackgroundOptions = {
  canvas: HTMLCanvasElement
}

function PhysarumBackgroundPlane() {
  const { gl, size, viewport } = useThree()
  const physarum = usePhysarumMaterial({
    textureSize: size.width < 900 ? 256 : 512,
    outputSize: new THREE.Vector2(size.width, size.height),
    isParticleTexture: false,
    dotOpacity: 0.18,
    trailOpacity: 0.92,
    decay: 0.968,
    species0: getSpeciesOne('rgb(196, 196, 196)'),
    species1: getSpeciesTwo('rgb(136, 136, 136)'),
    species2: getSpeciesThree('rgb(232, 232, 232)')
  })

  const planeArgs = useMemo(
    () => [viewport.width, viewport.height] as [number, number],
    [viewport.height, viewport.width]
  )

  useEffect(() => {
    gl.setClearColor(0x000000, 0)
  }, [gl])

  return (
    <mesh position={[0, 0, 0]}>
      <planeGeometry args={planeArgs} />
      <primitive attach="material" object={physarum.material} />
    </mesh>
  )
}

export function startPhysarumBackground({ canvas }: StartPhysarumBackgroundOptions) {
  const root = createRoot(canvas)

  const configure = () => {
    const width = canvas.clientWidth || window.innerWidth
    const height = canvas.clientHeight || window.innerHeight

    root.configure({
      size: { width, height, top: 0, left: 0 },
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      gl: {
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      },
      camera: {
        position: [0, 0, 3],
        fov: 50,
        near: 0.1,
        far: 100
      }
    })
  }

  configure()
  root.render(<PhysarumBackgroundPlane />)

  const handleResize = () => {
    configure()
  }

  window.addEventListener('resize', handleResize)

  return {
    destroy() {
      window.removeEventListener('resize', handleResize)
      root.unmount()
    }
  }
}
