import './style.css';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { createAssetRegistry, type AssetRegistry } from './assets';

// ==========================================
// 1. ENGINE SETUP (Scene, Camera, Renderer)
// ==========================================
const scene = new THREE.Scene();

// Murky deep-sea atmosphere
const oceanColor = new THREE.Color(0x001628);
scene.background = oceanColor;
scene.fog = new THREE.FogExp2(oceanColor, 0.025);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 5, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0x1a4a6e, 0.8);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0x88ccff, 0.5);
dirLight.position.set(10, 50, 20);
scene.add(dirLight);

// ==========================================
// 2. PLAYER MOVEMENT & GAME-FEEL
// ==========================================
const controls = new PointerLockControls(camera, document.body);

const instructions = document.getElementById('instructions')!;
instructions.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => instructions.style.display = 'none');
controls.addEventListener('unlock', () => instructions.style.display = 'flex');
scene.add(controls.object);

const moveState = { forward: false, backward: false, left: false, right: false, up: false, down: false };
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let prevTime = performance.now();
let isPaused = false;

document.addEventListener('keydown', (event) => {
    switch (event.code) {
        case 'KeyW': moveState.forward = true; break;
        case 'KeyA': moveState.left = true; break;
        case 'KeyS': moveState.backward = true; break;
        case 'KeyD': moveState.right = true; break;
        case 'Space': moveState.up = true; break;
        case 'ShiftLeft':
        case 'ShiftRight': moveState.down = true; break;
        case 'KeyP': 
            isPaused = !isPaused;
            document.getElementById('pause-indicator')!.style.display = isPaused ? 'flex' : 'none';
            break;
    }
});

document.addEventListener('keyup', (event) => {
    switch (event.code) {
        case 'KeyW': moveState.forward = false; break;
        case 'KeyA': moveState.left = false; break;
        case 'KeyS': moveState.backward = false; break;
        case 'KeyD': moveState.right = false; break;
        case 'Space': moveState.up = false; break;
        case 'ShiftLeft':
        case 'ShiftRight': moveState.down = false; break;
    }
});

// Topography (Seafloor)
const floorGeometry = new THREE.PlaneGeometry(300, 300, 64, 64);
floorGeometry.rotateX(-Math.PI / 2);

const positionAttribute = floorGeometry.attributes.position;
for (let i = 0; i < positionAttribute.count; i++) {
    const x = positionAttribute.getX(i);
    const z = positionAttribute.getZ(i);
    const y = Math.sin(x * 0.05) * 3 + Math.cos(z * 0.05) * 3 - 5; 
    positionAttribute.setY(i, y);
}
floorGeometry.computeVertexNormals();

const floorMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x11221c, 
    roughness: 0.9,
    flatShading: true 
});
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
scene.add(floor);

// ==========================================
// 3. ASSET REGISTRY INTEGRATION
// ==========================================
const FISH_COUNT = 200;
const assets: AssetRegistry = createAssetRegistry(FISH_COUNT);

scene.add(assets.fishMesh);
scene.add(assets.coralsGroup);
scene.add(assets.sunRaysGroup);

// ==========================================
// 4. UPDATE HOOKS
// ==========================================
let currentFishSpeedMultiplier = 1.0; 

function updateFish(vitality: number) {
    currentFishSpeedMultiplier = Math.max(0.1, vitality * 1.5);
    const healthyColor = new THREE.Color(0x55aaff);
    const dyingColor = new THREE.Color(0x445566);
    assets.fishMaterial.color.copy(dyingColor.clone().lerp(healthyColor, vitality));
}

function updateCorals(vitality: number, _acidity: number) {
    const healthyColor = new THREE.Color(0xff6b81);
    const bleachedColor = new THREE.Color(0xe0e0e0);
    assets.coralMaterial.color.copy(bleachedColor.clone().lerp(healthyColor, vitality));
}

// ==========================================
// 5. THE "BRAIN" HOOK (Injection Point)
// ==========================================
function applyDataToWorld(pH: number, temp: number, _salinity: number) {
    // ==========================================
    // [TEAMMATE INJECTION POINT]
    // INSERT DATA LOGIC & EQUATIONS HERE
    // ==========================================
    
    // Temporary placeholder logic
    let vitality = Math.max(0, Math.min(1, (pH - 7.6) / 0.5)); 
    let acidity = 8.1 - pH; 
    // ==========================================
    
    // Update HUD Stats
    document.getElementById('stat-ph')!.innerText = `pH: ${pH.toFixed(2)}`;
    document.getElementById('stat-temp')!.innerText = `Temp: ${temp.toFixed(1)} °C`;
    document.getElementById('stat-vit')!.innerText = `Vitality: ${(vitality*100).toFixed(0)}%`;

    updateFish(vitality);
    updateCorals(vitality, acidity);
}

// ==========================================
// 6. HUD EVENT LISTENER & SIMULATION
// ==========================================
const yearSlider = document.getElementById('year-slider') as HTMLInputElement;
const yearValue = document.getElementById('year-value')!;

function updateYear(year: number) {
    yearSlider.value = year.toString();
    yearValue.innerText = year.toString();
    
    const yearsPassed = year - 2014;
    const simulatedPH = 8.1 - (yearsPassed * 0.04); 
    const simulatedTemp = 10.0 + (yearsPassed * 0.15);
    const simulatedSalinity = 33.5;
    
    applyDataToWorld(simulatedPH, simulatedTemp, simulatedSalinity);
}

yearSlider.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    updateYear(parseInt(target.value));
});

// Keyboard Shortcuts for Year
document.addEventListener('keydown', (event) => {
    const currentYear = parseInt(yearSlider.value);
    if (event.key === '[' && currentYear > 2014) {
        updateYear(currentYear - 1);
    } else if (event.key === ']' && currentYear < 2026) {
        updateYear(currentYear + 1);
    }
});

// Initialize
applyDataToWorld(8.1, 10.0, 33.5);

// ==========================================
// 7. RENDER LOOP
// ==========================================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _rotation = new THREE.Euler();

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const delta = (time - prevTime) / 1000;
    prevTime = time;

    // Player movement remains active even when simulation is paused
    if (controls.isLocked === true) {
        // Fluid drag
        velocity.x -= velocity.x * 5.0 * delta;
        velocity.z -= velocity.z * 5.0 * delta;
        velocity.y -= velocity.y * 5.0 * delta;

        direction.z = Number(moveState.forward) - Number(moveState.backward);
        direction.x = Number(moveState.right) - Number(moveState.left);
        direction.y = Number(moveState.up) - Number(moveState.down); // Vertical swim (Up/Down)
        direction.normalize();

        const swimSpeed = 30.0;
        if (moveState.forward || moveState.backward) velocity.z -= direction.z * swimSpeed * delta;
        if (moveState.left || moveState.right) velocity.x -= direction.x * swimSpeed * delta;
        if (moveState.up || moveState.down) velocity.y += direction.y * swimSpeed * delta;
        
        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
        controls.object.position.y += velocity.y * delta;
        
        const playerPos = controls.object.position;
        const floorY = Math.sin(playerPos.x * 0.05) * 3 + Math.cos(playerPos.z * 0.05) * 3 - 5;
        if (playerPos.y < floorY + 2) {
            playerPos.y = floorY + 2;
            velocity.y = 0;
        }
    }

    // Depth-based Sun Ray Fading
    const depth = Math.max(0, -camera.position.y);
    const rayOpacity = Math.max(0, 0.15 - (depth * 0.02)); 
    assets.sunRayMaterial.opacity = rayOpacity;

    // Fish Swarm Kinetics (Skip if paused)
    if (!isPaused) {
        for (let i = 0; i < FISH_COUNT; i++) {
            assets.fishMesh.getMatrixAt(i, _matrix);
            _matrix.decompose(_position, _quaternion, _scale);
            _rotation.setFromQuaternion(_quaternion);

            const speed = assets.fishData[i].baseSpeed * currentFishSpeedMultiplier;
            
            _position.z += Math.cos(_rotation.y) * speed;
            _position.x += Math.sin(_rotation.y) * speed;
            _rotation.y += assets.fishData[i].turnSpeed;

            const bounds = 80;
            if (_position.x > bounds) _position.x = -bounds;
            if (_position.x < -bounds) _position.x = bounds;
            if (_position.z > bounds) _position.z = -bounds;
            if (_position.z < -bounds) _position.z = bounds;

            _quaternion.setFromEuler(_rotation);
            _matrix.compose(_position, _quaternion, _scale);
            assets.fishMesh.setMatrixAt(i, _matrix);
        }
        assets.fishMesh.instanceMatrix.needsUpdate = true;
    }

    renderer.render(scene, camera);
}

animate();
