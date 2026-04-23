import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// SCENE
const scene = new THREE.Scene();

// RENDERER 
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // enable shadow calculations for lights and objects
renderer.physicallyCorrectLights = true; // use physically accurate lighting calculations for more realistic results
renderer.outputEncoding = THREE.sRGBEncoding; // correct color output so textures do not appear washed out
renderer.toneMappingExposure = 0.75; // controls overall brightness/exposure of the scene

document.body.appendChild(renderer.domElement);

// CAMERA
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const eyeHeight = 15;

camera.position.set(0, 0, 150);
camera.lookAt(0, 0, 0);

const controls = new PointerLockControls(camera, renderer.domElement);

document.addEventListener('click', () => {
  controls.lock();
});

// -------- CONTROLS --------
const keys = { w: false, a: false, s: false, d: false };

document.addEventListener('keydown', (e) => {
  if (e.key === 'w') keys.w = true;
  if (e.key === 'a') keys.a = true;
  if (e.key === 's') keys.s = true;
  if (e.key === 'd') keys.d = true;
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'w') keys.w = false;
  if (e.key === 'a') keys.a = false;
  if (e.key === 's') keys.s = false;
  if (e.key === 'd') keys.d = false;
});

// -------- LIGHTING -------- //

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
directionalLight.position.set(30, 50, 10);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;

directionalLight.shadow.camera.near = 1;
directionalLight.shadow.camera.far = 500;

directionalLight.shadow.camera.left = -400;
directionalLight.shadow.camera.right = 400;
directionalLight.shadow.camera.top = 400;
directionalLight.shadow.camera.bottom = -400;
scene.add(directionalLight);


const clock = new THREE.Clock();

// ---------- SKYBOX -------- //
const loader = new THREE.CubeTextureLoader();
const skybox = loader.load([
  '/daylight_rt.bmp',
  '/daylight_lf.bmp',
  '/daylight_up.bmp',
  '/daylight_dn.bmp',
  '/daylight_ft.bmp',
  '/daylight_bk.bmp'
]);
scene.background = skybox;
scene.environment = skybox;


// ---------------- TERRAIN --------------- //
const textureLoader = new THREE.TextureLoader();

const sandTexture = textureLoader.load('sand.jpg');
sandTexture.colorSpace = THREE.SRGBColorSpace;
const size = 100;
sandTexture.wrapS = THREE.RepeatWrapping;
sandTexture.wrapT = THREE.RepeatWrapping;

sandTexture.repeat.set(50, 50); // tweak this



function getTerrainHeight(x, z) {
  const dist = Math.sqrt(x * x + z * z);

  let y = 0;

  const radius = 100;
  if (dist < radius) {
    const t = dist / radius;
    y -= (1 - t * t) * 40;
  }

  y += Math.sin(x * 0.02) * 6.0;
  y += Math.cos(z * 0.02) * 6.0;

  return y;
}

function getGrassAmount(x, z) {
  const grassCenterX = 500;
  const grassCenterZ = 15;
  const grassRadius = 350;

  const dx = x - grassCenterX;
  const dz = z - grassCenterZ;
  const dist = Math.sqrt(dx * dx + dz * dz);

const edgeWidth = 20;

if (dist < grassRadius - edgeWidth) return 1;
if (dist > grassRadius) return 0;

let t = 1 - (dist - (grassRadius - edgeWidth)) / edgeWidth;

// apply a light smoothing on the edge of grass
t = t * t * (3 - 2 * t); // 

return t;

}

function createTerrain() {
  const size = 1500;
  const segments = 200;

  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const pos = geometry.attributes.position;
  const colors = [];

  const sandColor = new THREE.Color(0xffffff);
  const grassColor = new THREE.Color(0x5f8f3a);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);

    const y = getTerrainHeight(x, z);
    pos.setY(i, y);

    const grassAmount = getGrassAmount(x, z);

    const finalColor = sandColor.clone().lerp(grassColor, grassAmount);
    colors.push(finalColor.r, finalColor.g, finalColor.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    map : sandTexture,
    vertexColors: true,
    roughness: 0.95
  });

  const terrain = new THREE.Mesh(geometry, material);
  terrain.receiveShadow = true;

  return terrain;
  }

const terrain = createTerrain();
scene.add(terrain);


// ------------ WATER ------------- //
const waterMaterial = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      time: { value: 0 },
      color: { value: new THREE.Color(0xA9E9FF) }
    },

    vertexShader: `
      varying vec2 vUv;
      uniform float time;

      void main() {
        vUv = uv;

        vec3 pos = position;

        // wave motion
        pos.y += sin(pos.x * 0.1 + time) * 0.3;
        pos.y += sin(pos.z * 0.15 + time * 1.5) * 0.2;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,

    fragmentShader: `
      uniform vec3 color;
      varying vec2 vUv;

      void main() {
        float brightness = 0.6 + vUv.y * 0.4;
        gl_FragColor = vec4(color * brightness, 0.7);
      }
    `
  });

const water = new THREE.Mesh(
  new THREE.CylinderGeometry(100, 100, 0.5, 128, 32), // more detail
  waterMaterial
);

const water2 = new THREE.Mesh(
  new THREE.CylinderGeometry(1500, 1500, 0.5, 128, 32), // more detail
  waterMaterial
);

// ---------- ROCK ARCH ---------- //

const rockTexture = textureLoader.load('stone.jpg');
rockTexture.colorSpace = THREE.SRGBColorSpace;

rockTexture.wrapS = THREE.RepeatWrapping;
rockTexture.wrapT = THREE.RepeatWrapping;
rockTexture.repeat.set(2, 2);

function createRockBlock(w, h, d) {
  const block = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      map: rockTexture,
      roughness: 0.8,
      metalness: 0.1
    })
  );

  block.scale.set(w, h, d);

  // slight random rotation so nothing looks perfect
  block.rotation.x = (Math.random() - 0.5) * 0.2;
  block.rotation.y = (Math.random() - 0.5) * 0.2;
  block.rotation.z = (Math.random() - 0.5) * 0.2;

  block.castShadow = true;
  block.receiveShadow = true;

  return block;
}

const arch = new THREE.Group();

// -------- LEFT SIDE --------
const leftBase = createRockBlock(28, 32, 36);
leftBase.position.set(-40, 16, 0);
leftBase.rotation.z = 0.1;
arch.add(leftBase);

const leftMid = createRockBlock(26, 20, 24);
leftMid.position.set(-36, 40, 2);
leftMid.rotation.z = -0.2;
arch.add(leftMid);

// -------- RIGHT SIDE --------
const rightBase = createRockBlock(32, 36, 20);
rightBase.position.set(40, 18, 0);
rightBase.rotation.z = -0.1;
arch.add(rightBase);

const rightMid = createRockBlock(26, 38, 32);
rightMid.position.set(36, 40, -2);
rightMid.rotation.z = 0.25;
arch.add(rightMid);

// -------- TOP (BRIDGE) --------
const top1 = createRockBlock(44, 20, 30);
top1.position.set(-28, 55, 0);
top1.rotation.z = 1.1;
top1.rotation.y = 0.2;
arch.add(top1);

const top2 = createRockBlock(40, 20, 22);
top2.position.set(4, 64, 2);
top2.rotation.z = -0.15;
top2.rotation.y = -0.3;
arch.add(top2);

const top3 = createRockBlock(32, 20, 38);
top3.position.set(22, 64, -1.2);
top3.rotation.z = -0.3;
arch.add(top3);

arch.scale.set(2, 2, 2);

// ----------- LIGHTHOUSE ----------- //
function createStripeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const stripeHeight = 32;

  for (let i = 0; i < canvas.height; i += stripeHeight) {
    ctx.fillStyle = (i / stripeHeight) % 2 === 0 ? '#ffffff' : '#cc0000';
    ctx.fillRect(0, i, canvas.width, stripeHeight);
  }

  return new THREE.CanvasTexture(canvas);
}

const lighthouse = new THREE.Group();

const tower = new THREE.Mesh(
  new THREE.CylinderGeometry(6, 8, 40, 32),
  new THREE.MeshStandardMaterial({
    map: createStripeTexture(),
    roughness: 0.6,
    metalness: 0.1
  })
);
tower.position.y = 20;
tower.castShadow = true;
lighthouse.add(tower);

const topRoom = new THREE.Mesh(
  new THREE.CylinderGeometry(5, 5, 8, 32),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
);
topRoom.position.y = 44;
topRoom.castShadow = true;
lighthouse.add(topRoom);

const roof = new THREE.Mesh(
  new THREE.ConeGeometry(6, 6, 32),
  new THREE.MeshStandardMaterial({ color: 0x8B0000, roughness: 0.5 })
);
roof.position.y = 51;
roof.castShadow = true;
lighthouse.add(roof);

const light = new THREE.Mesh(
  new THREE.SphereGeometry(5.3, 16, 16),
  new THREE.MeshStandardMaterial({
    color: 0xffffaa,
    emissive: 0xffffaa,
    emissiveIntensity: 3
  })
);
light.position.y = 45;
lighthouse.add(light);

const lighthouseLight = new THREE.PointLight(0xffffaa, 5000, 5000);
lighthouseLight.position.y = 45;
lighthouse.add(lighthouseLight);

let lightOn = true;

document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'l') {
    lightOn = !lightOn;

    lighthouseLight.intensity = lightOn ? 150 : 0;
    light.material.emissiveIntensity = lightOn ? 3 : 0;

    console.log("Lighthouse light:", lightOn ? "ON" : "OFF");
  }
});

// ----------- PALM TREE ----------- //
const palmTree = new THREE.Group();

// --- trunk texture ---
const woodTexture = textureLoader.load('wood.jpg');
woodTexture.colorSpace = THREE.SRGBColorSpace;
woodTexture.wrapS = THREE.RepeatWrapping;
woodTexture.wrapT = THREE.RepeatWrapping;
woodTexture.repeat.set(1, 2);

// --- leaf texture ---
const leafTexture = textureLoader.load('leaf.jpg');
leafTexture.colorSpace = THREE.SRGBColorSpace;
leafTexture.wrapS = THREE.RepeatWrapping;
leafTexture.wrapT = THREE.RepeatWrapping;
leafTexture.repeat.set(1, 1);

const trunkMaterial = new THREE.MeshStandardMaterial({
  map: woodTexture,
  roughness: 0.9
});

for (let i = 0; i < 10; i++) {
  const segment = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.5, 6, 8),
    trunkMaterial
  );
  segment.position.y = i * 3;
  segment.castShadow = true;
  palmTree.add(segment);
}

const leafMaterial = new THREE.MeshStandardMaterial({
  map: leafTexture,
  roughness: 0.8
});

for (let i = 0; i < 6; i++) {
  const leaf = new THREE.Mesh(
    new THREE.SphereGeometry(4, 8, 8),
    leafMaterial
  );
  leaf.scale.set(3, 0.45, 0.9);
  leaf.position.y = 28;
  leaf.rotation.y = (i / 6) * Math.PI * 2;
  leaf.castShadow = true;
  palmTree.add(leaf);
}



// ----------- FISH ------------- //

function createFish(color = 0xff8844) {
  const fish = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({ color });

  // body
  const bodyGeometry = new THREE.SphereGeometry(0.8, 12, 12);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.scale.set(1.8, 1, 1);
  fish.add(body);

  // tail
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0);
  tailShape.lineTo(-1.5, 0.7);
  tailShape.lineTo(-1.5, -0.7);
  tailShape.lineTo(0, 0);

  const tailGeometry = new THREE.ShapeGeometry(tailShape);
  const tailMaterial = new THREE.MeshStandardMaterial({color, side: THREE.DoubleSide});

  const tail = new THREE.Mesh(tailGeometry, tailMaterial);
  tail.position.x = -1.0;
  fish.add(tail);

  // fin
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(-0.5, 0.8);
  finShape.lineTo(-1.2, 0);
  finShape.lineTo(0, 0);

  const finGeometry = new THREE.ShapeGeometry(finShape);

  const finMaterial = new THREE.MeshStandardMaterial({color, side: THREE.DoubleSide});

  const fin = new THREE.Mesh(finGeometry, finMaterial);

  fin.position.set(0, 0.8, 0);

  // slight tilt
  fin.rotation.z = Math.PI / 12;
  fish.add(fin);

  return fish;
  }

const waterRadius = 50; 
const fishList = [];

function randomPointInWater(radius) {
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * radius;
  return new THREE.Vector3(
    Math.cos(angle) * distance,
    0,
    Math.sin(angle) * distance
  );
}

function createFishData(fish, minY = -12, maxY = -11) {
  const start = randomPointInWater(waterRadius);
  const swimY = minY + Math.random() * (maxY - minY);

  fish.position.set(start.x, swimY, start.z);

  const target = randomPointInWater(waterRadius);

  const data = {
    mesh: fish,
    target: new THREE.Vector3(target.x, swimY, target.z),
    speed: 0.05 + Math.random(),
    turnSpeed: 0.05,
    pauseTime: 0,
    swimY,
    bobOffset: Math.random() * Math.PI * 2
  };

  fishList.push(data);
}

const fish1 = createFish(0xff8844);
const fish2 = createFish(0xff0000);
const fish3 = createFish(0xffdd44);
const fish4 = createFish(0xffff44);
const fish5 = createFish(0xff88ff);

createFishData(fish1);
createFishData(fish2);
createFishData(fish3);
createFishData(fish4);
createFishData(fish5);

function updateFish(delta, elapsedTime) {
  for (const fish of fishList) {
    const mesh = fish.mesh;

    if (fish.pauseTime > 0) {
      fish.pauseTime -= delta;
      continue;
    }

    const toTarget = new THREE.Vector3().subVectors(fish.target, mesh.position);
    const distance = toTarget.length();

    if (distance < 0.5) {
      const next = randomPointInWater(waterRadius);
      fish.target.set(next.x, fish.swimY, next.z);

    if (Math.random() < 0.25) {
        fish.pauseTime = 0.4 + Math.random();
    }

    continue;
    }

    toTarget.normalize();
    mesh.position.addScaledVector(toTarget, fish.speed);

    mesh.position.y = fish.swimY + Math.sin(elapsedTime * 3 + fish.bobOffset) * 0.08;

    const desiredAngle = Math.atan2(toTarget.z, toTarget.x);
    mesh.rotation.y = -desiredAngle;
    }
}

const gltfloader = new GLTFLoader();

// ----------- SUBMARINE ------------- //
gltfloader.load('/models/submarine.glb', function (gltf) {
    const submarine = gltf.scene;

    // scale (VERY common)
    submarine.scale.set(15, 15, 15); // adjust if needed
    submarine.rotateZ(Math.PI / 4);
    submarine.traverse((child) => {
    if (child.isMesh) {
      child.material = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.2,
        metalness: 0.5
      });

      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

    
    submarine.position.set(-150, getTerrainHeight(150, -50) - 2, 250);
    scene.add(submarine);
});

// ------------ CRAB ---------------- //
let crabModel = null;

gltfloader.load('/models/crab.glb', function (gltf) {
    crabModel = gltf.scene;

    spawnCrab(-200, getTerrainHeight(-200, 50) - 1, 50, Math.PI / 2);
    spawnCrab(-50, getTerrainHeight(-50, 50) - 1, 50, Math.PI / 2);
    spawnCrab(150, getTerrainHeight(150, 170) - 1, 170, Math.PI);
    spawnCrab(25, getTerrainHeight(25, 25) - 1, 25, Math.PI);
    spawnCrab(0, getTerrainHeight(0, 300) - 1, 300, Math.PI);
    
    
});

function spawnCrab(x, y, z, rotation = 0) {

  if (!crabModel) {
    console.warn("Crab model not loaded yet.");
    return;
  }

  const crab = crabModel.clone(true);

  crab.rotateY(rotation);
  crab.position.set(x, y, z);

  scene.add(crab);

  return crab;
}


// ---------------- SHRUB ------------- // 

let shrubModel = null;

gltfloader.load('/models/shrub.glb', function (gltf) {
    shrubModel = gltf.scene;

    spawnShrub(237, getTerrainHeight(237, -132), -132);
    spawnShrub(489, getTerrainHeight(489, 84), 84);
    spawnShrub(312, getTerrainHeight(312, -47), -47);
    spawnShrub(455, getTerrainHeight(455, 129), 129);
    spawnShrub(268, getTerrainHeight(268, 12), 12);
    spawnShrub(401, getTerrainHeight(401, -98), -98);
    spawnShrub(224, getTerrainHeight(224, 143), 143);
    spawnShrub(376, getTerrainHeight(376, 5), 5);
    spawnShrub(498, getTerrainHeight(498, -21), -21);
    spawnShrub(291, getTerrainHeight(291, 110), 110);
  
});

function spawnShrub(x, y, z, rotation = 0) {

  if (!shrubModel) {
    console.warn("Shrub model not loaded yet.");
    return;
  }

  const shrub = shrubModel.clone(true);
  shrub.scale.set(30, 30, 30);
  shrub.rotateY(rotation);
  shrub.position.set(x, y, z);

  scene.add(shrub);

  return shrub;
}

// -------------- SHOVEL -------------- //

gltfloader.load('/models/shovel.glb', function (gltf) {
    const shovel = gltf.scene;

    // scale (VERY common)
    shovel.scale.set(22, 22, 22); // adjust if needed

    // position (adjust to your world)
    shovel.position.set(85, getTerrainHeight(85, 175) - 2, 175)


    scene.add(shovel);
});
// -------------- CACTUS -------------- //

let cactusModel = null;

gltfloader.load('/models/cactus.glb', function (gltf) {
  cactusModel = gltf.scene;

  cactusModel.traverse((child) => {
    if (child.isMesh) {
      child.material = new THREE.MeshStandardMaterial({
        color: 0x4f8a3d,
        roughness: 0.9,
        metalness: 0.0
      });

      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  spawnCactus(-612, getTerrainHeight(-612, 384), 384, 1.73);
  spawnCactus(145, getTerrainHeight(145, -703), -703, 4.91);
  spawnCactus(112, getTerrainHeight(728, 112), 112, 0.82);
  spawnCactus(-334, getTerrainHeight(-334, -521), -521, 3.14);
  spawnCactus(59, getTerrainHeight(59, 689), 689, 5.67);
  spawnCactus(-701, getTerrainHeight(-701, -98), -98, 2.25);
  spawnCactus(112, getTerrainHeight(412, -276), -276, 0.47);
  spawnCactus(-128, getTerrainHeight(-128, 533), 533, 4.02);
  spawnCactus(690, getTerrainHeight(690, -645), -645, 5.12);
  spawnCactus(-455, getTerrainHeight(-455, 241), 241, 1.09);
});

function spawnCactus(x, y, z, rotation = 0) {
  if (!cactusModel) {
    console.warn("Cactus model not loaded yet.");
    return;
  }

  const cactus = cactusModel.clone(true);
  cactus.rotation.y = rotation;
  cactus.position.set(x, y, z);
  cactus.scale.set(900, 900, 900);

  scene.add(cactus);
  return cactus;
}

// ------------ SANDCASTLE ------------ //

gltfloader.load('/models/sandcastle.glb', function (gltf) {
    const sandcastle = gltf.scene;

    // scale (VERY common)
    sandcastle.scale.set(5, 5, 5); // adjust if needed

    // position (adjust to your world)
    sandcastle.position.set(115, getTerrainHeight(115, 0) + 5, 0);
    scene.add(sandcastle);
});
// ------------ DINOSAUR -------------- //
gltfloader.load('/models/dinosaur.glb', function (gltf) {
    const dinosaur = gltf.scene;

    // scale (VERY common)
    dinosaur.scale.set(0.03, 0.03, 0.03); // adjust if needed

    // position (adjust to your world)
    dinosaur.position.set(105, getTerrainHeight(105, 175), 175);
    dinosaur.rotateZ(Math.PI / 2);


    scene.add(dinosaur);
});

// -------------- CUBE ------------ //

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(200, 200, 200),
  new THREE.MeshStandardMaterial({
    emissive: 0x0000ff,
    emissiveIntensity: 0.5,
    roughness: 0.1,
    metalness: 1.0
  })
);

cube.material.envMap = skybox;

const cubeLight = new THREE.PointLight(0xff00ff, 3, 300);
cube.add(cubeLight);

cube.position.set(-350, 250, 0);
cube.castShadow = true;
cube.receiveShadow = true;

scene.add(cube);

let cubeRising = false;

let inputBuffer = "";
const secretCode = "4f41534953"; // change this to whatever you want

document.addEventListener('keydown', (e) => {
  // only accept letters
  if (e.key.length === 1) {
    inputBuffer += e.key.toLowerCase();

    // keep buffer from getting huge
    if (inputBuffer.length > 10) {
      inputBuffer = inputBuffer.slice(-10);
    }

    // check for code
    if (inputBuffer.includes(secretCode) && !cubeRising) {
      console.log("Code accepted.");
      cubeRising = true;
      inputBuffer = ""; // reset
    }
  }
});


// ------------- SECRET CODE ----------- //

function createTextTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;

  const ctx = canvas.getContext('2d');

  // background (optional)
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // text style
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 60px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

function createTextSign(text, x, y, z) {
  const texture = createTextTexture(text);

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true
  });

  const geometry = new THREE.PlaneGeometry(60, 25);

  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(x, y, z);

  // face the player (optional)


  scene.add(mesh);

  return mesh;
}

createTextSign("4F 41 53 49 53", -80, 19, -82);

// ------------ PLACEMENT ------------ //


lighthouse.scale.set(4, 4, 4);
lighthouse.position.set(400, 0, -100);
scene.add(lighthouse);

arch.position.set(0, -15, -120);
scene.add(arch);

water.position.y = -10;
scene.add(water);

water2.position.y = -45;
scene.add(water2);

palmTree.scale.set(4, 4, 4);
palmTree.position.set(-115, getTerrainHeight(-115, 0), 0);
scene.add(palmTree);

scene.add(fish1);
scene.add(fish2);
scene.add(fish3);
scene.add(fish4);
scene.add(fish5);

// ----------- ANIMATION ----------- //

function animate() {
  requestAnimationFrame(animate);
  waterMaterial.uniforms.time.value = clock.getElapsedTime();

  const delta = clock.getDelta();
  const elapsedTime = clock.getElapsedTime();

  palmTree.rotation.z = Math.sin(elapsedTime) * 0.05;

  const speed = 2.5;
  if (controls.isLocked) {
    if (keys.w) controls.moveForward(speed);
    if (keys.s) controls.moveForward(-speed);
    if (keys.a) controls.moveRight(-speed);
    if (keys.d) controls.moveRight(speed);
  }

  const groundY = getTerrainHeight(camera.position.x, camera.position.z);
  camera.position.y = groundY + eyeHeight;

  updateFish(delta, elapsedTime);

  cube.rotation.y += 0.002;

  if (cubeRising) {
  cube.position.y += 2;
}

  renderer.render(scene, camera);
}

animate();