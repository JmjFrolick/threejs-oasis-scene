import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// SCENE
const scene = new THREE.Scene();

// RENDERER (UPGRADED)
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

const eyeHeight = 15; // keeps camera above terrain

camera.position.set(0, 0, 150); // starting position
camera.lookAt(0, 0, 0); // initial view direction

const controls = new PointerLockControls(camera, renderer.domElement); // first-person controls

// --------------- CONTROLS ------------- //

document.addEventListener('click', () => {
  controls.lock(); // lock cursor for mouse look
});

const keys = { w: false, a: false, s: false, d: false }; // track movement key states

document.addEventListener('keydown', (e) => {
  if (e.key === 'w') keys.w = true; // forward
  if (e.key === 'a') keys.a = true; // left
  if (e.key === 's') keys.s = true; // backward
  if (e.key === 'd') keys.d = true; // right
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'w') keys.w = false; // stop forward
  if (e.key === 'a') keys.a = false; // stop left
  if (e.key === 's') keys.s = false; // stop backward
  if (e.key === 'd') keys.d = false; // stop right
});

// -------- LIGHTING -------- //

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2); // main "sun" light
directionalLight.position.set(30, 50, 10); // direction the light shines from
directionalLight.castShadow = true; // enable shadow casting

directionalLight.shadow.mapSize.width = 2048; // shadow resolution (width)
directionalLight.shadow.mapSize.height = 2048; // shadow resolution (height)

directionalLight.shadow.camera.near = 1; // shadow camera near plane
directionalLight.shadow.camera.far = 500; // shadow camera far plane

directionalLight.shadow.camera.left = -400; // shadow area bounds
directionalLight.shadow.camera.right = 400;
directionalLight.shadow.camera.top = 400;
directionalLight.shadow.camera.bottom = -400;

scene.add(directionalLight); // add light to scene

const clock = new THREE.Clock(); // used for animations and timing

// ---------- SKYBOX -------- //

const loader = new THREE.CubeTextureLoader(); // loads 6-sided sky textures

const skybox = loader.load([
  '/daylight_rt.bmp', // right
  '/daylight_lf.bmp', // left
  '/daylight_up.bmp', // top
  '/daylight_dn.bmp', // bottom
  '/daylight_ft.bmp', // front
  '/daylight_bk.bmp'  // back
]);

scene.background = skybox; // visible sky
scene.environment = skybox; // lighting and reflections from sky


// ---------------- TERRAIN --------------- //
const textureLoader = new THREE.TextureLoader(); // loads textures for terrain and objects

const sandTexture = textureLoader.load('sand.jpg'); // base sand texture
sandTexture.colorSpace = THREE.SRGBColorSpace; // correct color rendering
const size = 100; // unused here but likely kept from earlier tuning

// repeat texture instead of stretching across entire terrain
sandTexture.wrapS = THREE.RepeatWrapping;
sandTexture.wrapT = THREE.RepeatWrapping;

sandTexture.repeat.set(50, 50); // tiles the texture for better detail



function getTerrainHeight(x, z) {
  const dist = Math.sqrt(x * x + z * z); // distance from center

  let y = 0; // base height

  const radius = 100;
  if (dist < radius) {
    const t = dist / radius;
    y -= (1 - t * t) * 40; // creates central dip (oasis)
  }

  // adds wave-like variation for dunes
  y += Math.sin(x * 0.02) * 6.0;
  y += Math.cos(z * 0.02) * 6.0;

  return y; // final terrain height
}

function getGrassAmount(x, z) {
  const grassCenterX = 500; // center of grass area
  const grassCenterZ = 15;
  const grassRadius = 350; // how far grass extends

  const dx = x - grassCenterX;
  const dz = z - grassCenterZ;
  const dist = Math.sqrt(dx * dx + dz * dz); // distance from grass center

  const edgeWidth = 20; // size of transition zone

  if (dist < grassRadius - edgeWidth) return 1; // full grass
  if (dist > grassRadius) return 0; // no grass

  // blend between sand and grass near the edge
  let t = 1 - (dist - (grassRadius - edgeWidth)) / edgeWidth;

  // smooth transition curve
  t = t * t * (3 - 2 * t);

  return t;
}

function createTerrain() {
  const size = 1500; // overall terrain size
  const segments = 200; // level of detail

  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2); // lay flat on ground

  const pos = geometry.attributes.position; // vertex positions
  const colors = []; // stores vertex colors

  const sandColor = new THREE.Color(0xffffff); // base sand color
  const grassColor = new THREE.Color(0x5f8f3a); // grass color

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);

    const y = getTerrainHeight(x, z); // calculate height
    pos.setY(i, y); // apply height to vertex

    const grassAmount = getGrassAmount(x, z); // blend factor

    // mix sand and grass colors based on location
    const finalColor = sandColor.clone().lerp(grassColor, grassAmount);
    colors.push(finalColor.r, finalColor.g, finalColor.b);
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); // apply colors
  geometry.computeVertexNormals(); // fix lighting after height changes

  const material = new THREE.MeshStandardMaterial({
    map: sandTexture, // sand texture
    vertexColors: true, // allows grass blending
    roughness: 0.95 // dull surface
  });

  const terrain = new THREE.Mesh(geometry, material);
  terrain.receiveShadow = true; // terrain receives shadows

  return terrain;
}

const terrain = createTerrain(); // generate terrain
scene.add(terrain); // add to scene

// ------------ WATER ------------- //
const waterMaterial = new THREE.ShaderMaterial({
    transparent: true, // allows water to be see-through
    uniforms: {
      time: { value: 0 }, // used to animate waves over time
      color: { value: new THREE.Color(0xA9E9FF) } // base water color
    },

    vertexShader: `
      varying vec2 vUv;
      uniform float time;

      void main() {
        vUv = uv; // pass UV coordinates to fragment shader

        vec3 pos = position;

        // simulate wave motion using sine functions
        pos.y += sin(pos.x * 0.1 + time) * 0.3;
        pos.y += sin(pos.z * 0.15 + time * 1.5) * 0.2;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0); // standard vertex transform
      }
    `,

    fragmentShader: `
      uniform vec3 color;
      varying vec2 vUv;

      void main() {
        float brightness = 0.6 + vUv.y * 0.4; // slight vertical gradient
        gl_FragColor = vec4(color * brightness, 0.7); // apply color with transparency
      }
    `
  });

// small central water body (oasis)
const water = new THREE.Mesh(
  new THREE.CylinderGeometry(100, 100, 0.5, 128, 32), // high detail for smoother surface
  waterMaterial
);

// large surrounding water layer
const water2 = new THREE.Mesh(
  new THREE.CylinderGeometry(1500, 1500, 0.5, 128, 32), // covers entire scene
  waterMaterial
);


// ---------- ROCK ARCH ---------- //

const rockTexture = textureLoader.load('stone.jpg'); // rock surface texture
rockTexture.colorSpace = THREE.SRGBColorSpace;

// repeat texture to avoid stretching
rockTexture.wrapS = THREE.RepeatWrapping;
rockTexture.wrapT = THREE.RepeatWrapping;
rockTexture.repeat.set(2, 2);

// creates a single rock block with slight imperfections
function createRockBlock(w, h, d) {
  const block = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1), // base cube
    new THREE.MeshStandardMaterial({
      map: rockTexture, // apply rock texture
      roughness: 0.8,
      metalness: 0.1
    })
  );

  block.scale.set(w, h, d); // resize to desired shape

  // add small random rotations to make it look less artificial
  block.rotation.x = (Math.random() - 0.5) * 0.2;
  block.rotation.y = (Math.random() - 0.5) * 0.2;
  block.rotation.z = (Math.random() - 0.5) * 0.2;

  block.castShadow = true; // block casts shadows
  block.receiveShadow = true; // block receives shadows

  return block;
}

const arch = new THREE.Group(); // group all rock pieces together

// -------- LEFT SIDE --------
const leftBase = createRockBlock(28, 32, 36);
leftBase.position.set(-40, 16, 0);
leftBase.rotation.z = 0.1; // slight tilt
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

// -------- TOP  --------
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

// scale 
arch.scale.set(2, 2, 2);

// ----------- LIGHTHOUSE ----------- //

// creates a striped texture using a canvas
function createStripeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const stripeHeight = 32; // height of each stripe

  for (let i = 0; i < canvas.height; i += stripeHeight) {
    ctx.fillStyle = (i / stripeHeight) % 2 === 0 ? '#ffffff' : '#cc0000'; // alternate colors
    ctx.fillRect(0, i, canvas.width, stripeHeight);
  }

  return new THREE.CanvasTexture(canvas); // convert canvas to texture
}

const lighthouse = new THREE.Group(); // group for all lighthouse parts

// main tower with striped texture
const tower = new THREE.Mesh(
  new THREE.CylinderGeometry(6, 8, 40, 32),
  new THREE.MeshStandardMaterial({
    map: createStripeTexture(), // apply stripes
    roughness: 0.6,
    metalness: 0.1
  })
);
tower.position.y = 20; // lift above ground
tower.castShadow = true;
lighthouse.add(tower);

// top room of lighthouse
const topRoom = new THREE.Mesh(
  new THREE.CylinderGeometry(5, 5, 8, 32),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
);
topRoom.position.y = 44;
topRoom.castShadow = true;
lighthouse.add(topRoom);

// roof cone
const roof = new THREE.Mesh(
  new THREE.ConeGeometry(6, 6, 32),
  new THREE.MeshStandardMaterial({ color: 0x8B0000, roughness: 0.5 })
);
roof.position.y = 51;
roof.castShadow = true;
lighthouse.add(roof);

// visible glowing bulb
const light = new THREE.Mesh(
  new THREE.SphereGeometry(5.3, 16, 16),
  new THREE.MeshStandardMaterial({
    color: 0xffffaa,
    emissive: 0xffffaa, // makes it glow
    emissiveIntensity: 3
  })
);
light.position.y = 45;
lighthouse.add(light);

// actual light source affecting the scene
const lighthouseLight = new THREE.PointLight(0xffffaa, 5000, 5000);
lighthouseLight.position.y = 45;
lighthouse.add(lighthouseLight);

let lightOn = true; // tracks light state

// toggle lighthouse light with keyboard input
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'l') {
    lightOn = !lightOn;

    lighthouseLight.intensity = lightOn ? 150 : 0; // turn light on/off
    light.material.emissiveIntensity = lightOn ? 3 : 0; // toggle glow

    console.log("Lighthouse light:", lightOn ? "ON" : "OFF");
  }
});


// ----------- PALM TREE ----------- //
const palmTree = new THREE.Group(); // group for trunk and leaves

// --- trunk texture ---
const woodTexture = textureLoader.load('wood.jpg'); // load wood texture
woodTexture.colorSpace = THREE.SRGBColorSpace;
woodTexture.wrapS = THREE.RepeatWrapping;
woodTexture.wrapT = THREE.RepeatWrapping;
woodTexture.repeat.set(1, 2); // slight vertical tiling

// --- leaf texture ---
const leafTexture = textureLoader.load('leaf.jpg'); // load leaf texture
leafTexture.colorSpace = THREE.SRGBColorSpace;
leafTexture.wrapS = THREE.RepeatWrapping;
leafTexture.wrapT = THREE.RepeatWrapping;
leafTexture.repeat.set(1, 1);

// material for trunk
const trunkMaterial = new THREE.MeshStandardMaterial({
  map: woodTexture,
  roughness: 0.9
});

// build trunk using stacked segments
for (let i = 0; i < 10; i++) {
  const segment = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.5, 6, 8),
    trunkMaterial
  );
  segment.position.y = i * 3; // stack vertically
  segment.castShadow = true;
  palmTree.add(segment);
}

// material for leaves
const leafMaterial = new THREE.MeshStandardMaterial({
  map: leafTexture,
  roughness: 0.8
});

// create leaves arranged in a circular pattern
for (let i = 0; i < 6; i++) {
  const leaf = new THREE.Mesh(
    new THREE.SphereGeometry(4, 8, 8),
    leafMaterial
  );
  leaf.scale.set(3, 0.45, 0.9); // flatten into leaf shape
  leaf.position.y = 28; // top of tree
  leaf.rotation.y = (i / 6) * Math.PI * 2; // spread around
  leaf.castShadow = true;
  palmTree.add(leaf);
}

// ----------- FISH ------------- //

function createFish(color = 0xff8844) {
  const fish = new THREE.Group(); // group for all fish parts

  const bodyMaterial = new THREE.MeshStandardMaterial({ color }); // shared material

  // body
  const bodyGeometry = new THREE.SphereGeometry(0.8, 12, 12);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.scale.set(1.8, 1, 1); // stretch into fish shape
  fish.add(body);

  // tail
  const tailShape = new THREE.Shape(); // custom 2D shape
  tailShape.moveTo(0, 0);
  tailShape.lineTo(-1.5, 0.7);
  tailShape.lineTo(-1.5, -0.7);
  tailShape.lineTo(0, 0);

  const tailGeometry = new THREE.ShapeGeometry(tailShape);
  const tailMaterial = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide });

  const tail = new THREE.Mesh(tailGeometry, tailMaterial);
  tail.position.x = -1.0; // attach behind body
  fish.add(tail);

  // fin
  const finShape = new THREE.Shape(); // top fin shape
  finShape.moveTo(0, 0);
  finShape.lineTo(-0.5, 0.8);
  finShape.lineTo(-1.2, 0);
  finShape.lineTo(0, 0);

  const finGeometry = new THREE.ShapeGeometry(finShape);
  const finMaterial = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide });

  const fin = new THREE.Mesh(finGeometry, finMaterial);

  fin.position.set(0, 0.8, 0); // place on top of body
  fin.rotation.z = Math.PI / 12; // slight tilt for variation
  fish.add(fin);

  return fish; // return completed fish
}

const waterRadius = 50; // area fish are allowed to swim in
const fishList = []; // stores all fish movement data

function randomPointInWater(radius) {
  const angle = Math.random() * Math.PI * 2; // random direction
  const distance = Math.random() * radius; // random distance from center

  return new THREE.Vector3(
    Math.cos(angle) * distance,
    0,
    Math.sin(angle) * distance
  ); // convert polar to cartesian
}

function createFishData(fish, minY = -12, maxY = -11) {
  const start = randomPointInWater(waterRadius); // random start position
  const swimY = minY + Math.random() * (maxY - minY); // fixed depth range

  fish.position.set(start.x, swimY, start.z);

  const target = randomPointInWater(waterRadius); // first movement target

  const data = {
    mesh: fish, // reference to mesh
    target: new THREE.Vector3(target.x, swimY, target.z), // destination
    speed: 0.05 + Math.random(), // movement speed variation
    turnSpeed: 0.05, // unused but reserved for smoother turning
    pauseTime: 0, // time to stop moving
    swimY, // fixed vertical level
    bobOffset: Math.random() * Math.PI * 2 // offset for bobbing animation
  };

  fishList.push(data); // store fish behavior
}

// create fish with different colors
const fish1 = createFish(0xff8844);
const fish2 = createFish(0xff0000);
const fish3 = createFish(0xffdd44);
const fish4 = createFish(0xffff44);
const fish5 = createFish(0xff88ff);

// assign movement data to each fish
createFishData(fish1);
createFishData(fish2);
createFishData(fish3);
createFishData(fish4);
createFishData(fish5);

function updateFish(delta, elapsedTime) {
  for (const fish of fishList) {
    const mesh = fish.mesh;

    if (fish.pauseTime > 0) {
      fish.pauseTime -= delta; // countdown pause
      continue;
    }

    const toTarget = new THREE.Vector3().subVectors(fish.target, mesh.position);
    const distance = toTarget.length();

    if (distance < 0.5) {
      const next = randomPointInWater(waterRadius); // pick new target
      fish.target.set(next.x, fish.swimY, next.z);

      // randomly pause sometimes for more natural movement
      if (Math.random() < 0.25) {
        fish.pauseTime = 0.4 + Math.random();
      }

      continue;
    }

    toTarget.normalize(); // get direction
    mesh.position.addScaledVector(toTarget, fish.speed); // move toward target

    // subtle up/down motion
    mesh.position.y = fish.swimY + Math.sin(elapsedTime * 3 + fish.bobOffset) * 0.08;

    // rotate fish to face movement direction
    const desiredAngle = Math.atan2(toTarget.z, toTarget.x);
    mesh.rotation.y = -desiredAngle;
  }
}

const gltfloader = new GLTFLoader(); // loader for imported glb models

// ----------- SUBMARINE ------------- //
gltfloader.load('/models/submarine.glb', function (gltf) {
    const submarine = gltf.scene; // imported submarine model

    submarine.scale.set(15, 15, 15); // resize model
    submarine.rotateZ(Math.PI / 4); // tilt slightly

    // replace materials and enable shadows
    submarine.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({
          color: 0x333333, // dark gray surface
          roughness: 0.2, // slightly shiny
          metalness: 0.5 // metallic look
        });

        child.castShadow = true; // submarine casts shadows
        child.receiveShadow = true; // submarine receives shadows
      }
    });

    submarine.position.set(-150, getTerrainHeight(150, -50) - 2, 250); // place on terrain
    scene.add(submarine); // add to scene
});

// ------------ CRAB ---------------- //
let crabModel = null; // stores crab model for cloning

gltfloader.load('/models/crab.glb', function (gltf) {
    crabModel = gltf.scene; // save loaded crab model

    // place multiple crabs around the scene
    spawnCrab(-200, getTerrainHeight(-200, 50) - 1, 50, Math.PI / 2);
    spawnCrab(-50, getTerrainHeight(-50, 50) - 1, 50, Math.PI / 2);
    spawnCrab(150, getTerrainHeight(150, 170) - 1, 170, Math.PI);
    spawnCrab(25, getTerrainHeight(25, 25) - 1, 25, Math.PI);
    spawnCrab(0, getTerrainHeight(0, 300) - 1, 300, Math.PI);
});

function spawnCrab(x, y, z, rotation = 0) {
  if (!crabModel) {
    console.warn("Crab model not loaded yet."); // prevent cloning before load completes
    return;
  }

  const crab = crabModel.clone(true); // duplicate model

  crab.rotateY(rotation); // set facing direction
  crab.position.set(x, y, z); // place crab

  scene.add(crab); // add clone to scene

  return crab;
}


// ---------------- SHRUB ------------- // 

let shrubModel = null; // stores shrub model for cloning

gltfloader.load('/models/shrub.glb', function (gltf) {
    shrubModel = gltf.scene; // save loaded shrub model

    // place multiple shrubs around grassy area
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
    console.warn("Shrub model not loaded yet."); // prevent cloning before load completes
    return;
  }

  const shrub = shrubModel.clone(true); // duplicate model
  shrub.scale.set(30, 30, 30); // resize shrub
  shrub.rotateY(rotation); // optional rotation
  shrub.position.set(x, y, z); // place shrub

  scene.add(shrub); // add clone to scene

  return shrub;
}

// -------------- SHOVEL -------------- //
gltfloader.load('/models/shovel.glb', function (gltf) {
    const shovel = gltf.scene; // imported shovel model

    shovel.scale.set(22, 22, 22); // resize model
    shovel.position.set(85, getTerrainHeight(85, 175) - 2, 175); // place on terrain

    scene.add(shovel); // add to scene
});

// -------------- CACTUS -------------- //
let cactusModel = null; // stores cactus model for cloning

gltfloader.load('/models/cactus.glb', function (gltf) {
  cactusModel = gltf.scene; // save loaded cactus model

  // replace cactus materials and enable shadows
  cactusModel.traverse((child) => {
    if (child.isMesh) {
      child.material = new THREE.MeshStandardMaterial({
        color: 0x4f8a3d, // cactus green
        roughness: 0.9, // matte surface
        metalness: 0.0 // non-metallic
      });

      child.castShadow = true; // cactus casts shadows
      child.receiveShadow = true; // cactus receives shadows
    }
  });

  // place multiple cacti across the terrain
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
    console.warn("Cactus model not loaded yet."); // prevent cloning before load completes
    return;
  }

  const cactus = cactusModel.clone(true); // duplicate model
  cactus.rotation.y = rotation; // set facing direction
  cactus.position.set(x, y, z); // place cactus
  cactus.scale.set(900, 900, 900); // resize cactus

  scene.add(cactus); // add clone to scene
  return cactus;
}

// ------------ SANDCASTLE ------------ //

gltfloader.load('/models/sandcastle.glb', function (gltf) {
    const sandcastle = gltf.scene; // imported sandcastle model

    sandcastle.scale.set(5, 5, 5); // resize model
    sandcastle.position.set(115, getTerrainHeight(115, 0) + 5, 0); // place slightly above terrain

    scene.add(sandcastle); // add to scene
});

// ------------ DINOSAUR -------------- //
gltfloader.load('/models/dinosaur.glb', function (gltf) {
    const dinosaur = gltf.scene; // imported dinosaur model

    dinosaur.scale.set(0.03, 0.03, 0.03); // resize model
    dinosaur.position.set(105, getTerrainHeight(105, 175), 175); // place on terrain
    dinosaur.rotateZ(Math.PI / 2); // rotate into desired orientation

    scene.add(dinosaur); // add to scene
});

// -------------- CUBE ------------ //

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(200, 200, 200), // large cube geometry
  new THREE.MeshStandardMaterial({
    emissive: 0x0000ff, // glowing blue color
    emissiveIntensity: 0.5, // glow strength
    roughness: 0.1, // reflective surface
    metalness: 1.0 // full metallic reflection
  })
);

cube.material.envMap = skybox; // reflect skybox on cube surface

const cubeLight = new THREE.PointLight(0xff00ff, 3, 300); // local light attached to cube
cube.add(cubeLight);

cube.position.set(-350, 250, 0); // place cube above ground
cube.castShadow = true; // cube casts shadows
cube.receiveShadow = true; // cube receives shadows

scene.add(cube); // add cube to scene

let cubeRising = false; // tracks whether cube should rise

let inputBuffer = ""; // stores typed input
const secretCode = "4f41534953"; // hidden code that activates cube

document.addEventListener('keydown', (e) => {
  if (e.key.length === 1) { // only accept character keys
    inputBuffer += e.key.toLowerCase(); // add typed key to buffer

    if (inputBuffer.length > 10) {
      inputBuffer = inputBuffer.slice(-10); // keep only recent input
    }

    if (inputBuffer.includes(secretCode) && !cubeRising) {
      console.log("Code accepted."); // debug message
      cubeRising = true; // start cube movement
      inputBuffer = ""; // clear input buffer
    }
  }
});


// ------------- SECRET CODE ----------- //

function createTextTexture(text) {
  const canvas = document.createElement('canvas'); // create drawing surface
  canvas.width = 512;
  canvas.height = 256;

  const ctx = canvas.getContext('2d'); // 2d drawing context

  ctx.fillStyle = 'rgba(0,0,0,0)'; // transparent background
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#ffffff'; // text color
  ctx.font = 'bold 60px Arial'; // font style
  ctx.textAlign = 'center'; // center text horizontally
  ctx.textBaseline = 'middle'; // center text vertically

  ctx.fillText(text, canvas.width / 2, canvas.height / 2); // draw text in center

  const texture = new THREE.CanvasTexture(canvas); // turn canvas into texture
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture; // return finished texture
}

function createTextSign(text, x, y, z) {
  const texture = createTextTexture(text); // create text texture

  const material = new THREE.MeshBasicMaterial({
    map: texture, // apply text texture
    transparent: true // allow transparent background
  });

  const geometry = new THREE.PlaneGeometry(60, 25); // flat sign surface

  const mesh = new THREE.Mesh(geometry, material); // combine geometry and material
  mesh.position.set(x, y, z); // place sign in scene

  scene.add(mesh); // add sign to scene

  return mesh;
}

createTextSign("4F 41 53 49 53", -80, 19, -82); // place hidden code 

// ------------ PLACEMENT ------------ //

lighthouse.scale.set(4, 4, 4); // enlarge lighthouse
lighthouse.position.set(400, 0, -100); // place lighthouse in scene
scene.add(lighthouse);

arch.position.set(0, -15, -120); // place rock arch slightly lower
scene.add(arch);

water.position.y = -10; // lower oasis water into terrain
scene.add(water);

water2.position.y = -45; // lower outer water layer
scene.add(water2);

palmTree.scale.set(4, 4, 4); // enlarge palm tree
palmTree.position.set(-115, getTerrainHeight(-115, 0), 0); // place tree on terrain
scene.add(palmTree);

scene.add(fish1); // add fish to scene
scene.add(fish2);
scene.add(fish3);
scene.add(fish4);
scene.add(fish5);

// ----------- ANIMATION ----------- //

function animate() {
  requestAnimationFrame(animate); // loop animation continuously

  waterMaterial.uniforms.time.value = clock.getElapsedTime(); // update water shader time

  const delta = clock.getDelta(); // time since last frame
  const elapsedTime = clock.getElapsedTime(); // total running time

  palmTree.rotation.z = Math.sin(elapsedTime) * 0.05; // sway palm tree slightly

  const speed = 2.5; // movement speed
  if (controls.isLocked) {
    if (keys.w) controls.moveForward(speed); // move forward
    if (keys.s) controls.moveForward(-speed); // move backward
    if (keys.a) controls.moveRight(-speed); // move left
    if (keys.d) controls.moveRight(speed); // move right
  }

  const groundY = getTerrainHeight(camera.position.x, camera.position.z); // terrain height under camera
  camera.position.y = groundY + eyeHeight; // keep camera above terrain

  updateFish(delta, elapsedTime); // animate fish movement

  cube.rotation.y += 0.002; // slowly rotate cube

  if (cubeRising) {
    cube.position.y += 2; // move cube upward after code is entered
  }

  renderer.render(scene, camera); // draw current frame
}

animate(); // start animation loop