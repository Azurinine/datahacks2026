import './style.css';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { createAssetRegistry, type AssetRegistry } from './assets';

interface PopulationYear {
    year: number;
    counts: { [species: string]: number };
}

// ==========================================
// 1. ENGINE SETUP (Scene, Camera, Renderer)
// ==========================================
const scene = new THREE.Scene();
const waterSurfaceColor = new THREE.Color(0x0088dd); // Lighter bluer surface
const waterDeepColor = new THREE.Color(0x00aaaa);    // Brighter deeper hue
scene.background = new THREE.Color(0x000000); 
scene.fog = new THREE.FogExp2(waterSurfaceColor, 0.012);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 5, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Post-Processing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const RadialBlurShader = {
    uniforms: { "tDiffuse": { value: null }, "strength": { value: 0.15 }, "center": { value: new THREE.Vector2(0.5, 0.5) } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
        uniform sampler2D tDiffuse; uniform float strength; uniform vec2 center; varying vec2 vUv;
        void main() {
            vec2 dir = vUv - center; vec4 color = vec4(0.0);
            float samples[10]; samples[0] = -0.08; samples[1] = -0.05; samples[2] = -0.03; samples[3] = -0.02; samples[4] = -0.01;
            samples[5] = 0.01; samples[6] = 0.02; samples[7] = 0.03; samples[8] = 0.05; samples[9] = 0.08;
            for (int i = 0; i < 10; i++) { color += texture2D(tDiffuse, vUv + dir * samples[i] * strength); }
            gl_FragColor = color / 10.0;
        }
    `
};
const blurPass = new ShaderPass(RadialBlurShader);
composer.addPass(blurPass);

// Lighting
const ambientLight = new THREE.AmbientLight(0x1a3a5e, 0.1); 
scene.add(ambientLight);
const headlight = new THREE.SpotLight(0xffffff, 500, 80, Math.PI / 6, 0.1, 2);
headlight.position.set(0, 0, 0);
camera.add(headlight);
const headlightTarget = new THREE.Object3D();
headlightTarget.position.set(0, 0, -10);
camera.add(headlightTarget);
headlight.target = headlightTarget;
const beamGeometry = new THREE.ConeGeometry(6, 60, 32, 1, true);
beamGeometry.translate(0, -30, 0);
beamGeometry.rotateX(-Math.PI / 2);
const beamMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { color: { value: new THREE.Color(0xffffff) }, opacity: { value: 0.3 } },
    vertexShader: `varying vec2 vUv; varying float vDepth; void main() { vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); vDepth = -mvPosition.z; gl_Position = projectionMatrix * mvPosition; }`,
    fragmentShader: `varying vec2 vUv; varying float vDepth; uniform vec3 color; uniform float opacity; void main() { float radial = 1.0 - smoothstep(0.0, 0.5, length(vUv - 0.5)); float distFade = 1.0 - smoothstep(0.0, 50.0, vDepth); gl_FragColor = vec4(color, radial * distFade * opacity); }`
});
const headlightBeam = new THREE.Mesh(beamGeometry, beamMaterial);
camera.add(headlightBeam);
scene.add(camera);

// Movement
const controls = new PointerLockControls(camera, document.body);
const instructions = document.getElementById('instructions')!;
instructions.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => instructions.style.opacity = '0');
controls.addEventListener('unlock', () => instructions.style.opacity = '1');
const moveState = { forward: false, backward: false, left: false, right: false, up: false, down: false };
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let prevTime = performance.now();
let isPaused = false, headlightOn = true, blurEnabled = true;
const yearSlider = document.getElementById('year-slider') as HTMLInputElement;
const yearValue = document.getElementById('year-value')!;
const brightnessSlider = document.getElementById('brightness-slider') as HTMLInputElement;
const fishPopup = document.getElementById('fish-popup')!;
const fishNameEl = document.getElementById('fish-name')!;
const fishDescEl = document.getElementById('fish-desc')!;
const popupClose = document.getElementById('popup-close')!;

let populations: PopulationYear[] = [];

document.addEventListener('keydown', (event) => {
    switch (event.code) {
        case 'KeyW': moveState.forward = true; break;
        case 'KeyA': moveState.left = true; break;
        case 'KeyS': moveState.backward = true; break;
        case 'KeyD': moveState.right = true; break;
        case 'Space': moveState.up = true; break;
        case 'ShiftLeft':
        case 'ShiftRight': moveState.down = true; break;
        case 'KeyF': headlightOn = !headlightOn; headlight.visible = headlightOn; headlightBeam.visible = headlightOn; break;
        case 'KeyB': blurEnabled = !blurEnabled; blurPass.enabled = blurEnabled; break;
        case 'KeyP': isPaused = !isPaused; document.getElementById('pause-indicator')!.style.display = isPaused ? 'flex' : 'none'; break;
    }
    const curYear = parseInt(yearSlider.value);
    if (event.key === '[' && curYear > 2014) updateYear(curYear - 1);
    if (event.key === ']' && curYear < 2026) updateYear(curYear + 1);
    if (event.code === 'KeyJ') updateBrightness(Math.max(0, parseFloat(brightnessSlider.value) - 0.1));
    if (event.code === 'KeyL') updateBrightness(Math.min(3, parseFloat(brightnessSlider.value) + 0.1));
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

function updateBrightness(val: number) {
    brightnessSlider.value = val.toFixed(1);
    headlight.intensity = val * 100; 
    beamMaterial.uniforms.opacity.value = (val / 3) * 0.4;
}
brightnessSlider.addEventListener('input', (e) => updateBrightness(parseFloat((e.target as HTMLInputElement).value)));

popupClose.addEventListener('click', () => {
    fishPopup.style.display = 'none';
    isPaused = false;
    document.getElementById('pause-indicator')!.style.display = 'none';
    controls.lock();
});

// Interaction
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('click', () => {
    if (!controls.isLocked || isPaused) return;

    // Center of screen
    mouse.x = 0;
    mouse.y = 0;
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObject(assets.fishMesh);

    if (intersects.length > 0) {
        const instanceId = intersects[0].instanceId;
        if (instanceId !== undefined) {
            const data = assets.fishData[instanceId];
            const speciesId = fishConfigs[data.schoolId].id;
            
            // Find species config
            const config = fishConfigs.find(c => c.id === speciesId);
            if (config) {
                fishNameEl.innerText = speciesId.toUpperCase();
                fishDescEl.innerText = `Detailed scan for ${speciesId} sequence complete. Species is exhibiting normal migration patterns for the current simulated year.`;
                fishPopup.style.display = 'block';
                
                // Freeze time
                isPaused = true;
                document.getElementById('pause-indicator')!.style.display = 'flex';
                controls.unlock();
            }
        }
    }
});

// Floor
const floorGeometry = new THREE.PlaneGeometry(120, 160, 64, 80);
floorGeometry.rotateX(-Math.PI / 2);
const posAttr = floorGeometry.attributes.position;
for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i), z = posAttr.getZ(i);
    const twist = Math.sin(z * 0.08) * 6;
    const baseHeight = Math.sin(x * 0.05) * 2 + Math.cos(z * 0.05) * 2 - 5; 
    const wallHeight = Math.pow(Math.abs(x + twist) / 10, 4); 
    posAttr.setY(i, baseHeight + Math.min(wallHeight, 12)); // Shorter walls capped at 12
}
floorGeometry.computeVertexNormals();
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xc2b280, roughness: 1.0 }); // Sandy floor
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
scene.add(floor);

// Assets
const fishConfigs = [
    { id: 'porifera',      color: 0x55aaff, count: 300, speedMultiplier: 1.0, scale: 1.0, preferredHeight: 3.0 },
    { id: 'pennatuloidea', color: 0xff55aa, count: 300, speedMultiplier: 1.2, scale: 0.8, preferredHeight: 2.0 },
    { id: 'ptilosarcus',   color: 0xffaa55, count: 300, speedMultiplier: 0.8, scale: 1.2, preferredHeight: 4.0 },
    { id: 'suberites',     color: 0xffff00, count: 300, speedMultiplier: 1.5, scale: 0.9, preferredHeight: 2.5 },
    { id: 'octocorallia',  color: 0xff4500, count: 300, speedMultiplier: 1.1, scale: 1.3, preferredHeight: 3.5 },
    { id: 'plumarella',    color: 0x55ffaa, count: 300, speedMultiplier: 0.7, scale: 1.1, preferredHeight: 1.5 },
    { id: 'leptogorgia',   color: 0xff6600, count: 300, speedMultiplier: 0.9, scale: 1.5, preferredHeight: 2.0 },
    { id: 'acanthogorgia', color: 0xaa55ff, count: 300, speedMultiplier: 1.3, scale: 0.7, preferredHeight: 4.5 },
    { id: 'paragorgia',    color: 0x8b0000, count: 300, speedMultiplier: 1.0, scale: 1.2, preferredHeight: 2.5 },
];
const FISH_COUNT = fishConfigs.reduce((s, c) => s + c.count, 0);

const speciesOffset: { [id: string]: number } = {};
let currentOffset = 0;
fishConfigs.forEach(cfg => {
    speciesOffset[cfg.id] = currentOffset;
    currentOffset += cfg.count;
});

const assets: AssetRegistry = createAssetRegistry(fishConfigs);
scene.add(assets.fishMesh); scene.add(assets.coralsGroup); scene.add(assets.sunRaysGroup); scene.add(assets.geographyGroup); scene.add(assets.environmentGroup); scene.add(assets.seaweedsGroup);

fetch('/data/populations.json')
    .then(res => res.json())
    .then(data => {
        populations = data;
        syncPopulations(2014); // Initial sync
    });

const dyingColor = new THREE.Color(0x445566), tempColor = new THREE.Color();
function updateFish(vitality: number) {
    if (assets.fishMesh.instanceColor) {
        for (let i = 0; i < FISH_COUNT; i++) {
            tempColor.copy(dyingColor).lerp(assets.fishData[i].originalColor, vitality);
            assets.fishMesh.setColorAt(i, tempColor);
        }
        assets.fishMesh.instanceColor.needsUpdate = true;
    }
}
function updateYear(year: number) {
    yearSlider.value = year.toString(); yearValue.innerText = year.toString();
    const yearsPassed = year - 2014;
    const simulatedPH = 8.1 - (yearsPassed * 0.04), simulatedTemp = 10.0 + (yearsPassed * 0.15);
    applyDataToWorld(simulatedPH, simulatedTemp, 33.5);
    syncPopulations(year);
}

function syncPopulations(year: number) {
    // Hide all fish first so species absent this year disappear
    fishConfigs.forEach(cfg => {
        const offset = speciesOffset[cfg.id];
        for (let i = 0; i < cfg.count; i++) {
            assets.fishData[offset + i].scale = 0;
        }
    });

    const data = populations.find(p => p.year === year);
    if (!data) return;

    Object.keys(data.counts).forEach(speciesId => {
        const offset = speciesOffset[speciesId];
        if (offset === undefined) return; // species not in fishConfigs, skip
        const targetCount = data.counts[speciesId];
        const speciesCapacity = fishConfigs.find(c => c.id === speciesId)!.count;

        for (let i = 0; i < speciesCapacity; i++) {
            assets.fishData[offset + i].scale = i < targetCount ? 1.0 : 0;
        }
    });
}

function applyDataToWorld(pH: number, temp: number, _salinity: number) {
    let vitality = Math.max(0, Math.min(1, (pH - 7.6) / 0.5)); 
    document.getElementById('stat-ph')!.innerText = pH.toFixed(2);
    document.getElementById('stat-temp')!.innerText = temp.toFixed(1) + " °C";
    document.getElementById('stat-vit')!.innerText = (vitality*100).toFixed(0) + "%";
    updateFish(vitality);
    const healthyColor = new THREE.Color(0xff6b81), bleachedColor = new THREE.Color(0xe0e0e0);
    assets.coralMaterial.color.copy(bleachedColor.clone().lerp(healthyColor, vitality));
}
applyDataToWorld(8.1, 10.0, 33.5);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight);
});

const _matrix = new THREE.Matrix4(), _position = new THREE.Vector3(), _quaternion = new THREE.Quaternion(), _scale = new THREE.Vector3(1, 1, 1), dummy = new THREE.Object3D();
function animate() {
    requestAnimationFrame(animate);
    const time = performance.now(), delta = (time - prevTime) / 1000;
    prevTime = time;
    const currentY = camera.position.y, depthLerp = Math.max(0, Math.min(1, (35 - currentY) / 40));
    const currentWaterColor = waterSurfaceColor.clone().lerp(waterDeepColor, depthLerp);
    
    if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.copy(currentWaterColor);
        const fogDensity = 0.05 - (1.0 - depthLerp) * 0.04;
        scene.fog.density = fogDensity;
    }
    
    ambientLight.intensity = 0.1 + depthLerp * 0.2; 

    if (controls.isLocked === true) {
        const oldPos = camera.position.clone();
        velocity.x -= velocity.x * 5.0 * delta; velocity.z -= velocity.z * 5.0 * delta; velocity.y -= velocity.y * 5.0 * delta;
        direction.z = Number(moveState.forward) - Number(moveState.backward); direction.x = Number(moveState.right) - Number(moveState.left); direction.y = Number(moveState.up) - Number(moveState.down);
        direction.normalize();
        const swimSpeed = 30.0;
        if (moveState.forward || moveState.backward) velocity.z -= direction.z * swimSpeed * delta;
        if (moveState.left || moveState.right) velocity.x -= direction.x * swimSpeed * delta;
        if (moveState.up || moveState.down) velocity.y += direction.y * swimSpeed * delta;
        controls.moveRight(-velocity.x * delta); controls.moveForward(-velocity.z * delta);
        controls.object.position.y += velocity.y * delta;
        const playerPos = controls.object.position;
        for (const rock of assets.rockSpheres) {
            if (playerPos.distanceTo(rock.center) < rock.radius + 1.5) { playerPos.copy(oldPos); velocity.set(0,0,0); break; }
        }
        const twist = Math.sin(playerPos.z * 0.08) * 6;
        const baseFloorY = Math.sin(playerPos.x * 0.05) * 2 + Math.cos(playerPos.z * 0.05) * 2 - 5;
        const wallHeight = Math.pow(Math.abs(playerPos.x + twist) / 10, 4);
        const floorY = baseFloorY + Math.min(wallHeight, 12);
        
        if (playerPos.y < floorY + 2) { playerPos.y = floorY + 2; velocity.y = 0; }
        if (playerPos.y > 15) { playerPos.y = 15; velocity.y = 0; } // Lower max height
        if (Math.abs(playerPos.x) > 40) { playerPos.x = Math.sign(playerPos.x) * 40; }
        if (Math.abs(playerPos.z) > 70) { playerPos.z = Math.sign(playerPos.z) * 70; }
    }

    assets.sunRayMaterial.opacity = Math.max(0, 0.04 * (1.0 - depthLerp));

    if (!isPaused) {
        const schoolPositions = [
            new THREE.Vector3(Math.sin(time*0.0002)*15, 2.5, Math.cos(time*0.0001)*80),
            new THREE.Vector3(Math.cos(time*0.00015)*10, 4.0, Math.sin(time*0.00008)*70),
            new THREE.Vector3(Math.sin(time*0.00025)*20, 3.5, Math.cos(time*0.00015)*90),
            new THREE.Vector3(Math.cos(time*0.00022)*12, 1.5, Math.sin(time*0.00012)*85)
        ];
        const playerPos = camera.position;
        for (let i = 0; i < FISH_COUNT; i++) {
            assets.fishMesh.getMatrixAt(i, _matrix); _matrix.decompose(_position, _quaternion, _scale);
            const data = assets.fishData[i];
            const schoolCenter = schoolPositions[data.schoolId % schoolPositions.length];
            
            if (!schoolCenter) continue; // Safety check

            const targetPos = schoolCenter.clone().add(data.schoolOffset);
            
            if (_position.distanceTo(playerPos) > 70) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 30 + Math.random() * 20;
                _position.set(playerPos.x + Math.cos(angle)*dist, data.preferredHeight, playerPos.z + Math.sin(angle)*dist);
                _matrix.setPosition(_position);
                assets.fishMesh.setMatrixAt(i, _matrix);
            }

            const prevPos = _position.clone();
            _position.lerp(targetPos, 0.005); // Much slower lerp
            
            if (_position.distanceTo(prevPos) > 0.0001) {
                dummy.position.copy(_position);
                dummy.lookAt(targetPos);
                dummy.rotateY(Math.sin(time * 0.001 + i) * 0.2); // Slower variation
                // Instant scale apply
                const finalScale = data.baseScale * data.scale; 
                dummy.scale.set(finalScale, finalScale, finalScale);
                dummy.updateMatrix(); 
                assets.fishMesh.setMatrixAt(i, dummy.matrix);
            }
        }
        assets.fishMesh.instanceMatrix.needsUpdate = true;
    }
    composer.render();
}
animate();
