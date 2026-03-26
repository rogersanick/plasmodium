/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { GUI } from 'dat.gui';
import { useEffect } from 'react';
import * as THREE from 'three';
import {
  PHYSARUM_PARTICLE_TEXTURES,
  PhysarumParticleTexture,
} from './particle_textures';
import { rndFloat } from './Util';
import { PhysarumHookResult } from './types/PhysarumHookResult';
import { PhysarumProps } from './types/PhysarumProps';
import { PingPongShader } from './util/PingPongShader';

const usePhysarumSettings = (props: PhysarumHookResult) => {
  const {
    shaders,
    setParticleTexture,
    mouseSpawnTexture,
    props: physarumProps,
    setProps,
  } = props;

  const { renderMaterial, diffuseShader, updateDotsShader, renderDotsShader } =
    shaders;

  useEffect(() => {
    const particleTexture = {
      value: physarumProps.particleTexture,
    };
    const textureSize = {
      value: physarumProps.textureSize,
    };
    if (typeof window !== 'undefined' && renderMaterial) {
      const gui = new GUI();

      gui
        .add(textureSize, 'value', [16, 32, 64, 128, 256, 512, 1024])
        .name('Texture size')
        .onChange((t) =>
          setProps((v: PhysarumProps) => ({
            ...v,
            species0: {
              ...v.species0,
              attractions: v.species0?.attractions?.clone(),
            },

            species1: {
              ...v.species1,
              attractions: v.species1?.attractions?.clone(),
            },
            species2: {
              ...v.species2,
              attractions: v.species2?.attractions?.clone(),
            },
            textureSize: t,
          }))
        );
      const renderFolder = gui.addFolder('Rendering');
      renderFolder
        .add(renderMaterial.uniforms.dotOpacity, 'value', 0, 1, 0.01)
        .name('Dot opacity');
      renderFolder
        .add(renderMaterial.uniforms.trailOpacity, 'value', 0, 1, 0.01)
        .name('Trail opacity');
      renderFolder
        .add(renderMaterial.uniforms.isMonochrome, 'value', 0, 1, 1)
        .name('Monochrome');

      renderFolder
        .add(particleTexture, 'value', PHYSARUM_PARTICLE_TEXTURES)
        .name('Particle texture')
        .onChange((t: PhysarumParticleTexture) => {
          new THREE.TextureLoader().load(
            `/particles/${t}.png`,
            (tex) => {
              setParticleTexture(tex);
            },
            () => {},
            (err) => console.log((err as any).message)
          );
        });
      const flatShadingFold = renderFolder.addFolder('Flat shading');
      flatShadingFold
        .add(renderMaterial.uniforms.isFlatShading, 'value', 0, 1, 1)
        .name('Enable');
      flatShadingFold
        .add(renderMaterial.uniforms.colorThreshold, 'value', 0, 1, 0.01)
        .name('Threshold');

      const simFolder = gui.addFolder('Simulation');
      simFolder
        .add(
          updateDotsShader.material.uniforms.isRestrictToMiddle,
          'value',
          0,
          1,
          1
        )
        .name('Restrict to middle');
      simFolder
        .add(
          updateDotsShader.material.uniforms.isDisplacement,
          'value',
          0,
          1,
          1
        )
        .name('Restrict displacement');
      simFolder
        .add(diffuseShader.material.uniforms.decay, 'value', 0, 1, 0.01)
        .name('Decay rate');

      const species = [0, 1, 2];
      const coords = ['x', 'y', 'z'];
      const speciesSettings = species.map((spec) => {
        const col = renderMaterial.uniforms['col' + spec].value;
        return {
          moveSpeed:
            updateDotsShader.material.uniforms.moveSpeed.value[coords[spec]],
          sensorDistance:
            updateDotsShader.material.uniforms.sensorDistance.value[
              coords[spec]
            ],
          rotationAngle:
            updateDotsShader.material.uniforms.rotationAngle.value[
              coords[spec]
            ],
          sensorAngle:
            updateDotsShader.material.uniforms.sensorAngle.value[coords[spec]],
          attract0:
            updateDotsShader.material.uniforms['attract' + spec].value.x,
          attract1:
            updateDotsShader.material.uniforms['attract' + spec].value.y,
          attract2:
            updateDotsShader.material.uniforms['attract' + spec].value.z,

          infectious:
            updateDotsShader.material.uniforms.infectious.value[coords[spec]],

          dotSize:
            renderDotsShader.material.uniforms.dotSizes.value[coords[spec]],
          color: `rgb(${col.x},${col.y},${col.z},)`,
        };
      });
      species.forEach((spec) => {
        const specFolder = simFolder.addFolder('Species ' + spec);
        specFolder
          .add(speciesSettings[spec], 'moveSpeed', 0, 50, 0.01)
          .name('Move speed')
          .onChange(() =>
            updateDotsShader.setUniform(
              'moveSpeed',
              new THREE.Vector3(
                ...speciesSettings.map((sett, i) => sett.moveSpeed)
              )
            )
          );
        specFolder
          .add(speciesSettings[spec], 'sensorDistance', 0, 50, 0.01)
          .name('Sensor Distance')
          .onChange(() =>
            updateDotsShader.setUniform(
              'sensorDistance',
              new THREE.Vector3(
                ...speciesSettings.map((sett, i) => sett.sensorDistance)
              )
            )
          );
        specFolder
          .add(speciesSettings[spec], 'rotationAngle', 0, Math.PI, 0.01)
          .name('Rotation Angle')
          .onChange(() =>
            updateDotsShader.setUniform(
              'rotationAngle',
              new THREE.Vector3(
                ...speciesSettings.map((sett, i) => sett.rotationAngle)
              )
            )
          );
        specFolder
          .add(speciesSettings[spec], 'sensorAngle', 0, Math.PI, 0.01)
          .name('Sensor angle')
          .onChange(() =>
            updateDotsShader.setUniform(
              'sensorAngle',
              new THREE.Vector3(
                ...speciesSettings.map((sett, i) => sett.sensorAngle)
              )
            )
          );
        specFolder
          .add(speciesSettings[spec], 'attract0', -1, 1, 0.01)
          .name('Attraction 0')
          .onChange(() =>
            updateDotsShader.setUniform(
              'attract' + spec,
              new THREE.Vector3(
                speciesSettings[spec].attract0,
                speciesSettings[spec].attract1,
                speciesSettings[spec].attract2
              )
            )
          );
        specFolder
          .add(speciesSettings[spec], 'attract1', -1, 1, 0.01)
          .name('Attraction 1')
          .onChange(() =>
            updateDotsShader.setUniform(
              'attract' + spec,
              new THREE.Vector3(
                speciesSettings[spec].attract0,
                speciesSettings[spec].attract1,
                speciesSettings[spec].attract2
              )
            )
          );
        specFolder
          .add(speciesSettings[spec], 'attract2', -1, 1, 0.01)
          .name('Attraction 2')
          .onChange(() =>
            updateDotsShader.setUniform(
              'attract' + spec,
              new THREE.Vector3(
                speciesSettings[spec].attract0,
                speciesSettings[spec].attract1,
                speciesSettings[spec].attract2
              )
            )
          );
        specFolder
          .add(speciesSettings[spec], 'infectious', 0, 1, 1)
          .name('Infectious to species ' + ((spec + 1) % 3))
          .onChange(() =>
            updateDotsShader.setUniform(
              'infectious',
              new THREE.Vector3(
                ...speciesSettings.map((sett) => sett.infectious)
              )
            )
          );
        specFolder
          .addColor(speciesSettings[spec], 'color')
          .name('Color')
          .onChange(
            (t) =>
              (renderMaterial.uniforms['col' + spec].value = new THREE.Color(t))
          );
        specFolder
          .add(speciesSettings[spec], 'dotSize', 0, 10, 0.1)
          .name('Dot size')
          .onChange((t) =>
            renderDotsShader.setUniform(
              'dotSizes',
              new THREE.Vector3(...speciesSettings.map((sett) => sett.dotSize))
            )
          );
      });

      const controlsFolder = gui.addFolder('Controls');
      controlsFolder
        .add(updateDotsShader.material.uniforms.mouseRad, 'value', 0, 500, 1)
        .name('Mouse push radius');
      controlsFolder
        .add(mouseSpawnTexture, 'radius', 0, 500, 1)
        .name('Spawn radius');
      controlsFolder
        .add(mouseSpawnTexture, 'amount', 1, 15000, 1)
        .name('Spawn amount');
      controlsFolder
        .add(mouseSpawnTexture, 'color', -1, 2, 1)
        .name('Spawn color');

      gui
        .add(
          {
            func: () => {
              randomizeSpecies(speciesSettings, updateDotsShader, 0);
            },
          },
          'func'
        )
        .name('Randomize species 0');
      gui
        .add(
          {
            func: () => {
              randomizeSpecies(speciesSettings, updateDotsShader, 1);
            },
          },
          'func'
        )
        .name('Randomize species 1');
      gui
        .add(
          {
            func: () => {
              randomizeSpecies(speciesSettings, updateDotsShader, 2);
            },
          },
          'func'
        )
        .name('Randomize species 2');
      //updateDots mouseRad

      return () => {
        gui.destroy();
      };
    }
  }, [
    renderMaterial,
    diffuseShader,
    updateDotsShader,
    renderDotsShader,
    mouseSpawnTexture,
    physarumProps.particleTexture,
    setParticleTexture,
    setProps,
    physarumProps.textureSize,
  ]);
};

export default usePhysarumSettings;
function randomizeSpecies(
  speciesSettings: {
    moveSpeed: any;
    sensorDistance: any;
    rotationAngle: any;
    sensorAngle: any;
    attract0: any;
    attract1: any;
    attract2: any;
    infectious: any;
    dotSize: any;
    color: string;
  }[],
  updateDotsShader: PingPongShader,
  species: 0 | 1 | 2
) {
  speciesSettings[species].moveSpeed = rndFloat(1, 5);
  speciesSettings[species].sensorDistance =
    speciesSettings[species].moveSpeed * rndFloat(1.5, 6);
  speciesSettings[species].rotationAngle = rndFloat(0.3, 1);
  speciesSettings[species].sensorAngle =
    speciesSettings[species].rotationAngle * rndFloat(1, 1.5);
  speciesSettings[species].attract0 =
    species === 0 ? rndFloat(0, 1) : rndFloat(-1, 1);
  speciesSettings[species].attract1 =
    species === 1 ? rndFloat(0, 1) : rndFloat(-1, 1);
  speciesSettings[species].attract2 =
    species === 2 ? rndFloat(0, 1) : rndFloat(-1, 1);
  updateDotsShader.setUniform(
    'moveSpeed',
    new THREE.Vector3(...speciesSettings.map((sett) => sett.moveSpeed))
  );
  updateDotsShader.setUniform(
    'sensorDistance',
    new THREE.Vector3(...speciesSettings.map((sett) => sett.sensorDistance))
  );
  updateDotsShader.setUniform(
    'rotationAngle',
    new THREE.Vector3(...speciesSettings.map((sett) => sett.rotationAngle))
  );
  updateDotsShader.setUniform(
    'sensorAngle',
    new THREE.Vector3(...speciesSettings.map((sett) => sett.sensorAngle))
  );
  updateDotsShader.setUniform(
    'attract' + species,
    new THREE.Vector3(
      speciesSettings[species].attract0,
      speciesSettings[species].attract1,
      speciesSettings[species].attract2
    )
  );
  updateDotsShader.setUniform(
    'attract' + species,
    new THREE.Vector3(
      speciesSettings[species].attract0,
      speciesSettings[species].attract1,
      speciesSettings[species].attract2
    )
  );
  updateDotsShader.setUniform(
    'attract' + species,
    new THREE.Vector3(
      speciesSettings[species].attract0,
      speciesSettings[species].attract1,
      speciesSettings[species].attract2
    )
  );
}
