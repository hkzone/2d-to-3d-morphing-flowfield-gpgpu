import gsap from 'gsap';
import GUI from 'lil-gui';
import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import Stats from 'stats.js';

import { Rendering } from './rendering';
import { getDistanceToFitBox } from './utils';
import gpgpuTextureFlowDirectionShader from './shaders/gpgpu/flowDirection.glsl';
import gpgpuTextureFlowFieldShader from './shaders/gpgpu/flowField.glsl';
import gpgpuTexturePositionShader from './shaders/gpgpu/position.glsl';
import modelsFragmentShader from './shaders/models/fragment.glsl';
import modelsVertexShader from './shaders/models/vertex.glsl';

// ************************************************************************** //
// ********************************* Options ******************************** //
// ************************************************************************** //

const options = {
  clearColor: '#160920',
  animationDuration: 2.3,
  initialActiveModel: 1,
  freeFlow: false,
  flowType: 'Type A',
};

// ************************************************************************** //
// ***************************** Setup Rendering **************************** //
// ************************************************************************** //

const rendering = new Rendering(document.querySelector('#canvas'));

// ************************************************************************** //
// ********************************* Loaders ******************************** //
// ************************************************************************** //

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('./draco/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

// ************************************************************************** //
// ******************************* GLTF Models ****************************** //
// ************************************************************************** //

// Load Models
let models = {};
models.index = options.initialActiveModel;
const gltf = await gltfLoader.loadAsync('./models.glb');

// Positions
models.positions = gltf.scene.children.map(
  (child) =>
    new THREE.Float32BufferAttribute(child.geometry.toNonIndexed().attributes.position.array, 3)
);

// Maximum vertices count
models.maxCount = models.positions.reduce(
  (acc, value) => (acc < value.count ? value.count : acc),
  0
);

// UVs
models.uv = gltf.scene.children.map((child) => child.geometry.toNonIndexed().attributes.uv);

// Textures
models.textures = gltf.scene.children.map((child) => child.material.map);

// ************************************************************************** //
// *************************** Camera Positioning *************************** //
// ************************************************************************** //
// Calculate camera position to fit the scene

models.maxVertPosition = new THREE.Vector3(-Infinity);

for (const position of models.positions) {
  for (let i = 0; i < position.count; i += 3) {
    const x = position.array[i];
    const y = position.array[i + 1];
    const z = position.array[i + 2];

    models.maxVertPosition.x = Math.max(models.maxVertPosition.x, Math.abs(x));
    models.maxVertPosition.y = Math.max(models.maxVertPosition.y, Math.abs(y));
    models.maxVertPosition.z = Math.max(models.maxVertPosition.z, Math.abs(z));
  }
}

const distance = getDistanceToFitBox(
  models.maxVertPosition.x * 2,
  models.maxVertPosition.y * 2,
  models.maxVertPosition.z,
  rendering.camera.fov,
  rendering.camera.aspect
);

rendering.camera.position.z = distance;
rendering.camera.updateProjectionMatrix();

// ************************************************************************** //
// ******************************** Uniforms ******************************** //
// ************************************************************************** //

const uniforms = {
  uResolution: new THREE.Uniform(
    new THREE.Vector2(
      rendering.vp.canvas.width * rendering.vp.canvas.dpr,
      rendering.vp.canvas.height * rendering.vp.canvas.dpr
    )
  ),
  uProgress: new THREE.Uniform(0),
  tMap: new THREE.Uniform(models.textures[models.index]),
  tMap1: new THREE.Uniform(models.textures[Math.abs(models.index - 1)]),
  uPositionTexture: new THREE.Uniform(null),
  uFlowFieldTexture: new THREE.Uniform(null),
};

// ************************************************************************** //
// ******************************* GPU compute ****************************** //
// ************************************************************************** //

// GPU compute setup
const gpgpu = {};
gpgpu.size = Math.ceil(Math.sqrt(models.maxCount));
gpgpu.computation = new GPUComputationRenderer(gpgpu.size, gpgpu.size, rendering.renderer);

// ******************************** Textures ******************************** //

const basePositionTexture = gpgpu.computation.createTexture();
const targetPositionTexture = gpgpu.computation.createTexture();
const flowFieldTexture = gpgpu.computation.createTexture();
const flowDirectionTexture = gpgpu.computation.createTexture();

// Initialize textures
for (let i = 0; i < models.maxCount; i++) {
  const i3 = i * 3;
  const i4 = i * 4;
  let index;

  // Base position based on geometry
  index = models.index;
  basePositionTexture.image.data[i4 + 0] = models.positions[index].array[i3 + 0];
  basePositionTexture.image.data[i4 + 1] = models.positions[index].array[i3 + 1];
  basePositionTexture.image.data[i4 + 2] = models.positions[index].array[i3 + 2];
  basePositionTexture.image.data[i4 + 3] = 0;

  // Target position based on geometry
  index = Math.abs(models.index - 1);
  targetPositionTexture.image.data[i4 + 0] = models.positions[index].array[i3 + 0];
  targetPositionTexture.image.data[i4 + 1] = models.positions[index].array[i3 + 1];
  targetPositionTexture.image.data[i4 + 2] = models.positions[index].array[i3 + 2];
  targetPositionTexture.image.data[i4 + 3] = 0;

  // Default values for flow direction
  flowDirectionTexture.image.data[i4 + 0] = 1;
  flowDirectionTexture.image.data[i4 + 1] = 1;
  flowDirectionTexture.image.data[i4 + 2] = 1;
  flowDirectionTexture.image.data[i4 + 3] = 0;
}

// ************************** GPU compute variables ************************* //

// Variables
gpgpu.flowFieldVariable = gpgpu.computation.addVariable(
  'uTextureFlowField',
  gpgpuTextureFlowFieldShader,
  flowFieldTexture,
  flowDirectionTexture
);
gpgpu.flowDirectionVariable = gpgpu.computation.addVariable(
  'uTextureFlowDirection',
  gpgpuTextureFlowDirectionShader,
  flowDirectionTexture
);
gpgpu.positionVariable = gpgpu.computation.addVariable(
  'uTexturePosition',
  gpgpuTexturePositionShader,
  basePositionTexture
);

// Set variable dependencies
gpgpu.computation.setVariableDependencies(gpgpu.flowFieldVariable, [
  gpgpu.positionVariable,
  gpgpu.flowFieldVariable,
]);
gpgpu.computation.setVariableDependencies(gpgpu.flowDirectionVariable, [
  gpgpu.positionVariable,
  gpgpu.flowFieldVariable,
  gpgpu.flowDirectionVariable,
]);
gpgpu.computation.setVariableDependencies(gpgpu.positionVariable, [
  gpgpu.positionVariable,
  gpgpu.flowFieldVariable,
  gpgpu.flowDirectionVariable,
]);

// Variables uniforms
const positionUniforms = gpgpu.positionVariable.material.uniforms;
const flowFieldUniforms = gpgpu.flowFieldVariable.material.uniforms;
const FlowDirectionUniforms = gpgpu.flowDirectionVariable.material.uniforms;

positionUniforms.uTime = new THREE.Uniform(0);
positionUniforms.uDeltaTime = new THREE.Uniform(0);
positionUniforms.uProgress = uniforms.uProgress;
positionUniforms.uBase = new THREE.Uniform(basePositionTexture);
positionUniforms.uTargetPosition = new THREE.Uniform(targetPositionTexture);
positionUniforms.uFreeFlow = new THREE.Uniform(Number(options.freeFlow));

flowFieldUniforms.uTime = new THREE.Uniform(0);
flowFieldUniforms.uFlowFieldInfluence = new THREE.Uniform(0.6);
flowFieldUniforms.uFlowFieldStrength = new THREE.Uniform(0.95);
flowFieldUniforms.uFlowFieldFrequency = new THREE.Uniform(0.9);
flowFieldUniforms.uType = new THREE.Uniform(1);

FlowDirectionUniforms.uFov = new THREE.Uniform(rendering.camera.fov);
FlowDirectionUniforms.uCameraZ = new THREE.Uniform(rendering.camera.position.z);

// *********************** Initialize GPU computation *********************** //

gpgpu.computation.init();

// ******************************* GPGPU Debug ****************************** //
gpgpu.debug = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 3),
  new THREE.MeshBasicMaterial({
    map: gpgpu.computation.getCurrentRenderTarget(gpgpu.flowFieldVariable).texture,
  })
);
gpgpu.debug.position.x = 3;
gpgpu.debug.position.z = 3;
// gpgpu.debug.visible = true
// rendering.scene.add(gpgpu.debug)

// ************************************************************************** //
// ******************************** Geometry ******************************** //
// ************************************************************************** //

// Reference UV
const referenceUVArray = new Float32Array(models.maxCount * 2);
for (let y = 0; y < gpgpu.size; y++) {
  for (let x = 0; x < gpgpu.size; x++) {
    const i = y * gpgpu.size + x;
    const i2 = i * 2;

    const uvX = (x + 0.5) / gpgpu.size;
    const uvY = (y + 0.5) / gpgpu.size;

    referenceUVArray[i2 + 0] = uvX;
    referenceUVArray[i2 + 1] = uvY;
  }
}

models.geometry = new THREE.BufferGeometry();
models.geometry.setAttribute('position', models.positions[models.index], 3);
models.geometry.setAttribute('baseUV', models.uv[models.index]);
models.geometry.setAttribute('targetUV', models.uv[Math.abs(models.index - 1)]);
models.geometry.setAttribute('aReferenceUv', new THREE.BufferAttribute(referenceUVArray, 2));

models.geometry.setIndex(null);
models.geometry.computeVertexNormals();

// ************************************************************************** //
// ******************************** Material ******************************** //
// ************************************************************************** //

models.material = new THREE.ShaderMaterial({
  vertexShader: modelsVertexShader,
  fragmentShader: modelsFragmentShader,
  uniforms,
});

// ************************************************************************** //
// ********************************** Mesh ********************************** //
// ************************************************************************** //

models.mesh = new THREE.Mesh(models.geometry, models.material);
models.mesh.frustumCulled = false;

rendering.scene.add(models.mesh);

// ************************************************************************** //
// ******************************* Animation ******************************** //
// ************************************************************************** //

const presetOptions = [
  { dur: 2.3, infl: 0.6, strength: 0.95, freq: 0.9, type: 1, freeFlow: 0 },
  { dur: 2.5, infl: 1, strength: 0.55, freq: 1, type: 0, freeFlow: 0 },
  { dur: 2, infl: 0.7, strength: 8.3, freq: 0.672, type: 0, freeFlow: 0 },
  { dur: 4, infl: 0.563, strength: 10, freq: 0.9, type: 0, freeFlow: 0 },
  { dur: 4, infl: 0.45, strength: 10, freq: 0.9, type: 0, freeFlow: 1 },
];

models.morph = (data) => {
  // Setup values from the preset
  if (data) {
    const { preset } = data;
    options.animationDuration = presetOptions[preset].dur;
    flowFieldUniforms.uFlowFieldInfluence.value = presetOptions[preset].infl;
    flowFieldUniforms.uFlowFieldStrength.value = presetOptions[preset].strength;
    flowFieldUniforms.uFlowFieldFrequency.value = presetOptions[preset].freq;

    flowFieldUniforms.uType.value = presetOptions[preset].type;
    options.flowType = presetOptions[preset].type === 1 ? 'Type A' : 'Type B';

    positionUniforms.uFreeFlow.value = presetOptions[preset].freeFlow;
    options.freeFlow = presetOptions[preset].freeFlow;

    if (preset === 4) {
      //reset position texture
      gpgpu.computation.renderTexture(
        models.index === options.initialActiveModel ? basePositionTexture : targetPositionTexture,
        gpgpu.computation.getCurrentRenderTarget(gpgpu.positionVariable)
      );
      return;
    }
  }

  //Flip attributes and uniforms
  positionUniforms.uBase.value =
    models.index === options.initialActiveModel ? basePositionTexture : targetPositionTexture;
  positionUniforms.uTargetPosition.value =
    models.index === options.initialActiveModel ? targetPositionTexture : basePositionTexture;

  uniforms.tMap1.value = models.textures[Math.abs(models.index - 1)];
  uniforms.tMap.value = models.textures[models.index];

  models.geometry.setAttribute('targetUV', models.uv[Math.abs(models.index - 1)]);
  models.geometry.setAttribute('baseUV', models.uv[models.index]);
  models.geometry.needsUpdate = true;

  //Disable freeflow
  options.freeFlow = false;
  positionUniforms.uFreeFlow.value = false;

  //Animate uProgress
  gsap.fromTo(
    uniforms.uProgress,
    { value: 0 },
    { value: 1, duration: options.animationDuration, ease: 'linear' }
  );

  //Save the index
  models.index = Math.abs(models.index - 1);
};

// ************************************************************************** //
// ********************* Handle the window resize event ********************* //
// ************************************************************************** //

function onWindowResize() {
  // Update camera position to fit the scene
  const distance = getDistanceToFitBox(
    models.maxVertPosition.x * 2,
    models.maxVertPosition.y * 2,
    models.maxVertPosition.z,
    rendering.camera.fov,
    rendering.camera.aspect
  );
  rendering.camera.position.z = distance;

  //update uniforms
  uniforms.uResolution.value.x = rendering.vp.canvas.width * rendering.vp.canvas.dpr;
  uniforms.uResolution.value.y = rendering.vp.canvas.height * rendering.vp.canvas.dpr;

  FlowDirectionUniforms.uFov.value = rendering.camera.fov;
  FlowDirectionUniforms.uCameraZ.value = rendering.camera.position.z;

  // Update the rendering view and camera
  rendering.onResize();
}

window.addEventListener('resize', onWindowResize);

// ************************************************************************** //
// ********************************** Stats ********************************* //
// ************************************************************************** //

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

// ************************************************************************** //
// ********************************** Debug ********************************* //
// ************************************************************************** //

const gui = new GUI({ width: 280 });

const debugObject = {
  preset1: () => models.morph({ preset: 0 }),
  preset2: () => models.morph({ preset: 1 }),
  preset3: () => models.morph({ preset: 2 }),
  preset4: () => models.morph({ preset: 3 }),
  preset5: () => models.morph({ preset: 4 }),
};

gui.addColor(options, 'clearColor').onChange(() => {
  rendering.renderer.setClearColor(options.clearColor);
});
rendering.renderer.setClearColor(options.clearColor);

gui.add(options, 'animationDuration', 0, 10, 0.1).listen();

gui.add(models.material.uniforms.uProgress, 'value', 0, 1, 0.001).name('progress').listen();

gui.add(models, 'morph');

const presetsFolder = gui.addFolder('presets');
presetsFolder.add(debugObject, 'preset1');
presetsFolder.add(debugObject, 'preset2');
presetsFolder.add(debugObject, 'preset3');
presetsFolder.add(debugObject, 'preset4');
presetsFolder.add(debugObject, 'preset5');

const shaderFolder = gui.addFolder('Shader');

shaderFolder
  .add(flowFieldUniforms.uFlowFieldInfluence, 'value', 0, 1, 0.001)
  .name('uFlowFieldInfluence')
  .listen();
shaderFolder
  .add(flowFieldUniforms.uFlowFieldStrength, 'value', 0, 10, 0.001)
  .name('uFlowFieldStrength')
  .listen();
shaderFolder
  .add(flowFieldUniforms.uFlowFieldFrequency, 'value', 0, 1, 0.001)
  .name('uFlowFieldFrequency')
  .listen();
shaderFolder
  .add(options, 'flowType', ['Type A', 'Type B'])
  .onChange((val) => {
    if (val == 'Type A') flowFieldUniforms.uType.value = 1;
    else flowFieldUniforms.uType.value = 0;
  })
  .listen();

shaderFolder
  .add(options, 'freeFlow', true)
  .name('uFreeFlow')
  .onChange((val) => {
    positionUniforms.uFreeFlow.value = Number(val);
  })
  .listen();

shaderFolder.close();

// ************************************************************************** //
// ***************************** Event listener ***************************** //
// ************************************************************************** //

window.addEventListener('keydown', (event) => {
  if (event.key === 'h') {
    gui.show(gui._hidden);
    stats.showPanel(gui._hidden ? false : 0);
  }
});

// ************************************************************************** //
// ************************ Main Render Loop Function *********************** //
// ************************************************************************** //

const tick = (time, delta) => {
  stats.begin();
  const deltaTime = delta * 0.001;

  //GPGPU Update
  gpgpu.positionVariable.material.uniforms.uTime.value = time;
  gpgpu.positionVariable.material.uniforms.uDeltaTime.value = deltaTime;
  gpgpu.flowFieldVariable.material.uniforms.uTime.value = time;
  gpgpu.computation.compute();

  uniforms.uPositionTexture.value = gpgpu.computation.getCurrentRenderTarget(
    gpgpu.positionVariable
  ).texture;

  // Render
  rendering.render();

  stats.end();
};

gsap.ticker.add(tick);
