import './style.css';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { createAssetRegistry, setupInteractivePreview, type AssetRegistry, type CoralConfig } from './assets';
import * as TWEEN from '@tweenjs/tween.js';

// --- Interfaces ---
interface PopulationYear {
    year: number;
    counts: { [species: string]: number };
}

// ==========================================
// 1. GLOBAL STATE & ENGINE SETUP
// ==========================================
const scene = new THREE.Scene();
const waterSurfaceColor = new THREE.Color(0x0088dd);
const waterDeepColor = new THREE.Color(0x00aaaa);
scene.background = new THREE.Color(0x000000); 
scene.fog = new THREE.FogExp2(waterSurfaceColor, 0.012);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 5, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

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
const headlight = new THREE.SpotLight(0xffffff, 50, 80, Math.PI / 6, 0.1, 2);
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

// UI References
const controls = new PointerLockControls(camera, document.body);
const instructions = document.getElementById('instructions')!;
const yearSlider = document.getElementById('year-slider') as HTMLInputElement;
const yearValue = document.getElementById('year-value')!;
const brightnessSlider = document.getElementById('brightness-slider') as HTMLInputElement;
const fishPopup = document.getElementById('fish-popup')!;
const fishNameEl = document.getElementById('fish-name')!;
const fishDescEl = document.getElementById('fish-desc')!;
const popupClose = document.getElementById('popup-close')!;
const bingoBookEl = document.getElementById('bingo-book')!;
const bingoGridEl = document.getElementById('bingo-grid')!;
const bingoOverlay = document.getElementById('bingo-overlay')!;
const pauseIndicator = document.getElementById('pause-indicator')!;

// System State
let isPaused = false;
let previewDispose: (() => void) | null = null;
let bingoPreviewDisposes: (() => void)[] = [];
let headlightOn = true;
let blurEnabled = true;
let isInternalUnlock = false; // Flag to skip next unlock event
let prevTime = performance.now();
let lastUIActionTime = 0; // Cooldown for UI toggles
const UI_COOLDOWN = 300; 

const moveState = { forward: false, backward: false, left: false, right: false, up: false, down: false };
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// Data State
let populations: PopulationYear[] = [];
let envByYear: { [year: number]: { avg_ph: number; avg_temp: number; vitality: number } } = {};
let coralMetadata: any[] = [];
let discoveredSpecies = new Set<string>(JSON.parse(localStorage.getItem('discoveredSpecies') || '[]'));
let fishConfigs: any[] = [];
let FISH_COUNT = 0;
const speciesOffset: { [id: string]: number } = {};
let assets: AssetRegistry;
const TOTAL_CORAL_CAP = 1200;

// Reusable Three objects
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const dummy = new THREE.Object3D();
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

headlight.intensity = 100;
beamMaterial.uniforms.opacity.value = 0.4;

function closeFishPopup() {
    if (previewDispose) { previewDispose(); previewDispose = null; }
    fishPopup.style.display = 'none';
    isPaused = false;
    pauseIndicator.style.display = 'none';
    controls.lock(); // Re-lock immediately
}

function showPopup(id: string, title: string, desc: string) {
    lastUIActionTime = performance.now();
    fishNameEl.innerText = title;
    fishDescEl.innerText = desc;
    fishPopup.style.display = 'block'; // must be visible before renderer reads canvas size
    if (previewDispose) { previewDispose(); previewDispose = null; }
    const previewCanvas = document.getElementById('popup-species-canvas') as HTMLCanvasElement;
    const fishCfg = fishConfigs.find(f => f.id === id);
    const coralCfg = coralMetadata.find(c => c.id === id);
    if (fishCfg) {
        previewDispose = setupInteractivePreview(previewCanvas, 'fish', fishCfg);
    } else if (coralCfg) {
        previewDispose = setupInteractivePreview(previewCanvas, 'coral', { id: coralCfg.id, color: coralCfg.color });
    }
    isPaused = true;
    pauseIndicator.style.display = 'flex';
    isInternalUnlock = true;
    controls.unlock();
    if (!discoveredSpecies.has(id)) {
        discoveredSpecies.add(id);
        localStorage.setItem('discoveredSpecies', JSON.stringify(Array.from(discoveredSpecies)));
    }
}

function renderBingoBook() {
    bingoPreviewDisposes.forEach(d => d());
    bingoPreviewDisposes = [];
    bingoGridEl.innerHTML = '';
    const categories = [
        { title: 'Vertebrate Marine Life', species: fishConfigs.map((f: any) => ({ id: f.id, name: f.name || f.id })) },
        { title: 'Coral Reef Structures', species: coralMetadata.map((c: any) => ({ id: c.id, name: c.name || c.id })) }
    ];
    categories.forEach(category => {
        const header = document.createElement('div');
        header.className = 'bingo-category-header';
        header.innerText = category.title;
        bingoGridEl.appendChild(header);
        category.species.forEach(species => {
            const isDiscovered = discoveredSpecies.has(species.id);
            const slot = document.createElement('div');
            slot.className = `bingo-slot ${isDiscovered ? 'discovered' : ''}`;
            const icon = document.createElement('div');
            icon.className = 'bingo-icon';
            if (isDiscovered) {
                const cfg = fishConfigs.find((f: any) => f.id === species.id) || coralMetadata.find((c: any) => c.id === species.id);
                const type = fishConfigs.find((f: any) => f.id === species.id) ? 'fish' : 'coral';
                if (cfg) {
                    const previewCanvas = document.createElement('canvas');
                    previewCanvas.width = 100;
                    previewCanvas.height = 100;
                    previewCanvas.className = 'bingo-preview-canvas';
                    icon.appendChild(previewCanvas);
                    bingoPreviewDisposes.push(setupInteractivePreview(previewCanvas, type, { id: cfg.id, color: cfg.color }));
                } else {
                    icon.innerText = '✓';
                }
            } else {
                icon.innerText = '?';
            }
            const label = document.createElement('div');
            label.className = 'bingo-label';
            label.innerText = species.name;
            slot.appendChild(icon);
            slot.appendChild(label);
            bingoGridEl.appendChild(slot);
        });
    });
}

function toggleBingoBook() {
    if (performance.now() - lastUIActionTime < UI_COOLDOWN) return;
    lastUIActionTime = performance.now();

    const isVisible = bingoBookEl.style.display === 'block';
    if (isVisible) {
        bingoPreviewDisposes.forEach(d => d());
        bingoPreviewDisposes = [];
        bingoBookEl.style.display = 'none';
        bingoOverlay.style.display = 'none';
        isPaused = false;
        pauseIndicator.style.display = 'none';
        controls.lock(); // Re-lock immediately
    } else {
        renderBingoBook();
        bingoBookEl.style.display = 'block';
        bingoOverlay.style.display = 'block';
        isPaused = true;
        pauseIndicator.style.display = 'flex';
        isInternalUnlock = true;
        controls.unlock();
    }
}

const dyingColor = new THREE.Color(0x445566), tempColor = new THREE.Color();
function updateFish(vitality: number) {
    if (assets && assets.fishMesh && assets.fishMesh.instanceColor) {
        for (let i = 0; i < FISH_COUNT; i++) {
            tempColor.copy(dyingColor).lerp(assets.fishData[i].originalColor, vitality);
            assets.fishMesh.setColorAt(i, tempColor);
        }
        assets.fishMesh.instanceColor.needsUpdate = true;
    }
}

function syncPopulations(year: number) {
    const data = populations.find(p => p.year === year);
    if (!data) return;
    Object.keys(data.counts).forEach(speciesId => {
        const targetCount = data.counts[speciesId];
        const offset = speciesOffset[speciesId];
        const config = fishConfigs.find(c => c.id === speciesId);
        const speciesCapacity = config ? config.count : 0;
        for (let i = 0; i < speciesCapacity; i++) {
            if (assets.fishData[offset + i]) {
                assets.fishData[offset + i].scale = i < targetCount ? 1.0 : 0;
            }
        }
    });
}

function applyDataToWorld(pH: number, temp: number) {
    let vitality = Math.max(0, Math.min(1, (pH - 7.6) / 0.5)); 
    document.getElementById('stat-ph')!.innerText = pH.toFixed(2);
    document.getElementById('stat-temp')!.innerText = temp.toFixed(1) + " °C";
    document.getElementById('stat-vit')!.innerText = (vitality*100).toFixed(0) + "%";
    updateFish(vitality);
}

function updateYear(year: number) {
    yearSlider.value = year.toString();
    yearValue.innerText = year.toString();
    const env = envByYear[year];
    const pH = env ? env.avg_ph : 8.1 - (year - 2014) * 0.04;
    const temp = env ? env.avg_temp : 10.0 + (year - 2014) * 0.15;
    const vitality = env ? env.vitality : 1.0;
    applyDataToWorld(pH, temp, vitality);
    syncPopulations(year);

    const greyColor = new THREE.Color(0xcccccc);
    if (assets && assets.coralsGroup) {
        assets.coralsGroup.children.forEach(speciesMesh => {
            const data = speciesMesh.userData;
            if (data.type === 'coral') {
                const isBleached = data.bleach_year !== null && year >= data.bleach_year;
                const targetColor = isBleached ? greyColor : data.originalColor;
                const mat = (speciesMesh as THREE.Mesh).material as THREE.MeshStandardMaterial;
                mat.color.copy(targetColor);
            }
        });
    }
}

// ==========================================
// 3. EVENT LISTENERS
// ==========================================

instructions.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => {
    instructions.style.opacity = '0';
    instructions.style.pointerEvents = 'none';
});
controls.addEventListener('unlock', () => {
    if (isInternalUnlock) {
        isInternalUnlock = false;
        return;
    }

    // 1. If a submenu was open, just hide it (user pressed Esc to leave)
    if (fishPopup.style.display === 'block') {
        fishPopup.style.display = 'none';
        isPaused = false;
        pauseIndicator.style.display = 'none';
        return; 
    }
    
    if (bingoBookEl.style.display === 'block') {
        bingoBookEl.style.display = 'none';
        bingoOverlay.style.display = 'none';
        isPaused = false;
        pauseIndicator.style.display = 'none';
        return; 
    }

    // 2. If NO submenu is open, show the main instructions menu
    instructions.style.opacity = '1';
    instructions.style.pointerEvents = 'auto';
});

document.body.addEventListener('click', () => {
    if (fishPopup.style.display === 'block' || bingoBookEl.style.display === 'block') return;
    if (!controls.isLocked && instructions.style.opacity === '0') {
        controls.lock();
    }
});

document.addEventListener('keydown', (event) => {
    if (event.code === 'Tab') {
        event.preventDefault();
        toggleBingoBook();
        return;
    }
    // Remove manual Escape handling entirely - rely on 'unlock' listener
    
    switch (event.code) {
        case 'KeyM': // Keep M as an alternative
            if (controls.isLocked) { controls.unlock(); }
            break;

        case 'KeyW': moveState.forward = true; break;
        case 'KeyA': moveState.left = true; break;
        case 'KeyS': moveState.backward = true; break;
        case 'KeyD': moveState.right = true; break;
        case 'Space': moveState.up = true; break;
        case 'ShiftLeft':
        case 'ShiftRight': moveState.down = true; break;
        case 'KeyF': headlightOn = !headlightOn; headlight.visible = headlightOn; headlightBeam.visible = headlightOn; break;
        case 'KeyB': blurEnabled = !blurEnabled; blurPass.enabled = blurEnabled; break;
        case 'KeyP': isPaused = !isPaused; pauseIndicator.style.display = isPaused ? 'flex' : 'none'; break;
    }
    const curYear = parseInt(yearSlider.value);
    if (event.key === '[' && curYear > 2014) updateYear(curYear - 1);
    if (event.key === ']' && curYear < 2026) updateYear(curYear + 1);
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

brightnessSlider.addEventListener('input', (e) => updateBrightness(parseFloat((e.target as HTMLInputElement).value)));
brightnessSlider.addEventListener('click', (e) => e.stopPropagation());
yearSlider.addEventListener('click', (e) => e.stopPropagation());
yearSlider.addEventListener('input', (e) => updateYear(parseInt((e.target as HTMLInputElement).value)));
popupClose.addEventListener('click', (e) => { e.stopPropagation(); closeFishPopup(); });
fishPopup.addEventListener('click', (e) => e.stopPropagation());
bingoOverlay.addEventListener('click', () => toggleBingoBook());

window.addEventListener('mousemove', (event) => {
    if (!controls.isLocked) {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    } else {
        mouse.x = 0; mouse.y = 0;
    }
});

window.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (bingoBookEl.style.display === 'block') return;
    if (fishPopup.style.display === 'block') return; // Prevent clicking through popup
    if (!controls.isLocked && !isPaused) return; 

    raycaster.setFromCamera(mouse, camera);
    const fishIntersects = raycaster.intersectObject(assets.fishHitboxMesh);
    const coralIntersects = raycaster.intersectObjects(assets.coralsGroup.children, true);

    let targetId = -1;
    let targetSpecies = "";

    if (fishIntersects.length > 0) {
        targetId = fishIntersects[0].instanceId!;
        targetSpecies = fishConfigs[assets.fishData[targetId].schoolId % fishConfigs.length].id;
    } else if (coralIntersects.length > 0) {
        let obj = coralIntersects[0].object;
        while (obj.parent && obj.userData.type !== 'coral') obj = obj.parent;
        const data = obj.userData;
        if (data.type === 'coral') {
            showPopup(data.id, data.name.toUpperCase(), data.desc);
            return;
        }
    } else {
        let minDist = Infinity;
        const maxProximity = 2.5; 
        const _p = new THREE.Vector3();
        const _m = new THREE.Matrix4();
        for (let i = 0; i < FISH_COUNT; i++) {
            const data = assets.fishData[i];
            if (!data || data.scale <= 0) continue;
            assets.fishMesh.getMatrixAt(i, _m);
            _p.setFromMatrixPosition(_m);
            const dist = raycaster.ray.distanceToPoint(_p);
            if (dist < maxProximity && dist < minDist) { minDist = dist; targetId = i; }
        }
        if (targetId !== -1) targetSpecies = fishConfigs[assets.fishData[targetId].schoolId % fishConfigs.length].id;
    }

    if (targetId !== -1) {
        const config = fishConfigs.find(c => c.id === targetSpecies);
        if (config) showPopup(config.id, (config.name || targetSpecies).toUpperCase(), config.desc || '');
    }
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight);
});

// ==========================================
// 4. ANIMATION LOOP & INITIALIZATION
// ==========================================

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now(), delta = (time - prevTime) / 1000;
    prevTime = time;

    const currentY = camera.position.y, depthLerp = Math.max(0, Math.min(1, (35 - currentY) / 40));
    const currentWaterColor = waterSurfaceColor.clone().lerp(waterDeepColor, depthLerp);
    if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.copy(currentWaterColor);
        scene.fog.density = 0.05 - (1.0 - depthLerp) * 0.04;
    }
    ambientLight.intensity = 0.1 + depthLerp * 0.2; 

    if (controls.isLocked === true) {
        const oldPos = camera.position.clone();
        velocity.x -= velocity.x * 5.0 * delta; velocity.z -= velocity.z * 5.0 * delta; velocity.y -= velocity.y * 5.0 * delta;
        direction.z = Number(moveState.forward) - Number(moveState.backward); 
        direction.x = Number(moveState.right) - Number(moveState.left); 
        direction.y = Number(moveState.up) - Number(moveState.down);
        direction.normalize();
        if (moveState.forward || moveState.backward) velocity.z -= direction.z * 30.0 * delta;
        if (moveState.left || moveState.right) velocity.x -= direction.x * 30.0 * delta;
        if (moveState.up || moveState.down) velocity.y += direction.y * 30.0 * delta;
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
        if (playerPos.y > 15) { playerPos.y = 15; velocity.y = 0; }
        if (Math.abs(playerPos.x) > 40) { playerPos.x = Math.sign(playerPos.x) * 40; }
        if (Math.abs(playerPos.z) > 70) { playerPos.z = Math.sign(playerPos.z) * 70; }
    }

    assets.sunRayMaterial.opacity = Math.max(0, 0.04 * (1.0 - depthLerp));
    if (assets.seaweedMaterials) {
        assets.seaweedMaterials.forEach(mat => mat.uniforms.time.value = time * 0.001);
    }

    if (!isPaused) {
        TWEEN.update();
        const schoolPositions = [
            new THREE.Vector3(Math.sin(time*0.0002)*15, 2.5, Math.cos(time*0.0001)*80),
            new THREE.Vector3(Math.cos(time*0.00015)*10, 4.0, Math.sin(time*0.00008)*70),
            new THREE.Vector3(Math.sin(time*0.00025)*20, 3.5, Math.cos(time*0.00015)*90),
            new THREE.Vector3(Math.cos(time*0.00022)*12, 1.5, Math.sin(time*0.00012)*85)
        ];
        const playerPos = camera.position;
        for (let i = 0; i < FISH_COUNT; i++) {
            assets.fishMesh.getMatrixAt(i, _matrix); 
            _matrix.decompose(_position, _quaternion, _scale);
            const data = assets.fishData[i];
            const schoolCenter = schoolPositions[data.schoolId % schoolPositions.length];
            if (!schoolCenter) continue;
            const targetPos = schoolCenter.clone().add(data.schoolOffset);
            if (_position.distanceTo(playerPos) > 70) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 30 + Math.random() * 20;
                _position.set(playerPos.x + Math.cos(angle)*dist, data.preferredHeight, playerPos.z + Math.sin(angle)*dist);
                _matrix.setPosition(_position);
                assets.fishMesh.setMatrixAt(i, _matrix);
            }
            const prevPos = _position.clone();
            _position.lerp(targetPos, 0.005);
            if (_position.distanceTo(prevPos) > 0.0001) {
                dummy.position.copy(_position);
                dummy.lookAt(targetPos);
                dummy.rotateY(Math.sin(time * 0.001 + i) * 0.2); 
                const finalScale = data.baseScale * data.scale; 
                dummy.scale.set(finalScale, finalScale, finalScale);
                dummy.updateMatrix(); 
                assets.fishMesh.setMatrixAt(i, dummy.matrix);
                assets.fishHitboxMesh.setMatrixAt(i, dummy.matrix);
            }
        }
        assets.fishMesh.instanceMatrix.needsUpdate = true;
        assets.fishHitboxMesh.instanceMatrix.needsUpdate = true;
    }
    composer.render();
}

async function init() {
    const [popData, coralReg, fishMeta, envData] = await Promise.all([
        fetch('/data/populations.json').then(res => res.json()),
        fetch('/data/coral_registry.json').then(res => res.json()),
        fetch('/data/fish_metadata.json').then(res => res.json()),
        fetch('/data/env_by_year.json').then(res => res.json())
    ]);

    populations = popData;
    envByYear = Object.fromEntries(envData.map((e: any) => [e.year, { avg_ph: e.avg_ph, avg_temp: e.avg_temp, vitality: e.vitality }]));
    coralMetadata = coralReg;
    fishConfigs = fishMeta.map((f: any) => ({
        ...f,
        color: parseInt(f.color.replace('#', '0x'))
    }));

    FISH_COUNT = fishConfigs.reduce((s, c) => s + c.count, 0);
    let currentOffset = 0;
    fishConfigs.forEach(cfg => {
        speciesOffset[cfg.id] = currentOffset;
        currentOffset += cfg.count;
    });

    const coralConfigs: CoralConfig[] = coralReg.map((c: any) => ({
        ...c,
        count: Math.floor(c.proportion * TOTAL_CORAL_CAP)
    }));

    assets = createAssetRegistry(fishConfigs, coralConfigs);
    scene.add(assets.fishMesh); 
    scene.add(assets.fishHitboxMesh); 
    scene.add(assets.coralsGroup); 
    scene.add(assets.sunRaysGroup); 
    scene.add(assets.geographyGroup); 
    scene.add(assets.environmentGroup); 
    scene.add(assets.seaweedsGroup);

    updateYear(2014);
    animate();
}

init();
