import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface FishConfig {
    id: string;
    color: number;
    count: number;
    speedMultiplier: number;
    scale: number;
    preferredHeight: number;
}

export interface AssetRegistry {
    fishMesh: THREE.InstancedMesh;
    fishHitboxMesh: THREE.InstancedMesh; // Added for easier clicking
    coralsGroup: THREE.Group;
    coralGlobalUniforms: { time: { value: number } };
    geographyGroup: THREE.Group;
    environmentGroup: THREE.Group;
    fishData: { 
        baseSpeed: number; 
        turnSpeed: number; 
        preferredHeight: number; 
        originalColor: THREE.Color;
        schoolOffset: THREE.Vector3;
        schoolId: number;
        scale: number;
        baseScale: number;
    }[];
    rockSpheres: { center: THREE.Vector3, radius: number }[];
    fishMaterial: THREE.MeshStandardMaterial;
    coralMaterial: THREE.MeshStandardMaterial;
    rockMaterial: THREE.MeshStandardMaterial;
    seaweedsGroup: THREE.Group;
    seaweedMaterials: THREE.ShaderMaterial[]; // Added for wiggle animation
    sunRaysGroup: THREE.Group;
    sunRayMaterial: THREE.MeshBasicMaterial;
}

export interface CoralConfig {
    id: string;
    name: string;
    color: string;
    bleach_year: number;
    count: number;
    desc: string;
}

export function createAssetRegistry(fishConfigs: FishConfig[], coralConfigs: CoralConfig[]): AssetRegistry {
    const totalFishCount = fishConfigs.reduce((sum, cfg) => sum + cfg.count, 0);

    // --- Fish System ---
    const fishGeometry = new THREE.ConeGeometry(0.15, 0.8, 4);
    fishGeometry.rotateX(Math.PI / 2); 
    const fishMaterial = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4 });
    const fishMesh = new THREE.InstancedMesh(fishGeometry, fishMaterial, totalFishCount);
    fishMesh.frustumCulled = false;
    
    // Hitbox System
    const hitboxGeometry = new THREE.SphereGeometry(1.2, 8, 8); // Large invisible sphere
    const hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });
    const fishHitboxMesh = new THREE.InstancedMesh(hitboxGeometry, hitboxMaterial, totalFishCount);
    fishHitboxMesh.frustumCulled = false;
    
    const colorArray = new Float32Array(totalFishCount * 3);
    const instColor = new THREE.Color();
    const dummy = new THREE.Object3D();
    const fishData: AssetRegistry['fishData'] = [];
    
    const schoolCenters = fishConfigs.map(() => ({
        pos: new THREE.Vector3((Math.random()-0.5)*20, Math.random()*3 + 1, (Math.random()-0.5)*100),
    }));

    let globalIdx = 0;
    fishConfigs.forEach((cfg, schoolId) => {
        for (let i = 0; i < cfg.count; i++) {
            instColor.setHex(cfg.color).toArray(colorArray, globalIdx * 3);
            const center = schoolCenters[schoolId].pos;
            const offset = new THREE.Vector3((Math.random()-0.5)*10, (Math.random()-0.5)*2, (Math.random()-0.5)*10);
            dummy.position.copy(center).add(offset);
            dummy.scale.setScalar(cfg.scale); // Visible initially
            dummy.updateMatrix();
            fishMesh.setMatrixAt(globalIdx, dummy.matrix);
            fishData.push({
                baseSpeed: (Math.random()*0.04+0.03) * cfg.speedMultiplier, 
                turnSpeed: (Math.random()-0.5)*0.02, 
                preferredHeight: cfg.preferredHeight + offset.y,
                originalColor: new THREE.Color(cfg.color), 
                schoolOffset: offset, 
                schoolId: schoolId,
                scale: 1.0, // Initialize visible
                baseScale: cfg.scale
            });
            globalIdx++;
        }
    });
    fishMesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);
    fishMesh.instanceColor.needsUpdate = true;

    // --- Environment ---
    const environmentGroup = new THREE.Group();
    const sandGeoBase = new THREE.SphereGeometry(1, 8, 8);
    const sandMat = new THREE.MeshStandardMaterial({ color: 0xc2b280, roughness: 1.0 });
    const sandGeometries: THREE.BufferGeometry[] = [];

    for (let i = 0; i < 400; i++) {
        const x = (Math.random() - 0.5) * 100;
        const z = (Math.random() - 0.5) * 180;
        const twist = Math.sin(z * 0.08) * 6;
        if (Math.abs(x + twist) > 45) continue;
        
        const baseHeight = Math.sin(x * 0.05) * 2 + Math.cos(z * 0.05) * 2 - 5;
        const wallHeight = Math.pow(Math.abs(x + twist) / 10, 4);
        const y = baseHeight + Math.min(wallHeight, 12);
        
        const geo = sandGeoBase.clone();
        const pos = new THREE.Vector3(x, y - 0.5, z);
        const rot = new THREE.Euler(0, Math.random() * Math.PI, 0);
        const scale = new THREE.Vector3(Math.random() * 4 + 2, Math.random() * 0.6 + 0.2, Math.random() * 4 + 2);
        
        const matrix = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), scale);
        geo.applyMatrix4(matrix);
        sandGeometries.push(geo);
    }
    if (sandGeometries.length > 0) {
        const mergedSandGeo = BufferGeometryUtils.mergeGeometries(sandGeometries);
        environmentGroup.add(new THREE.Mesh(mergedSandGeo, sandMat));
    }

    const domeGeo = new THREE.SphereGeometry(100, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMat = new THREE.MeshBasicMaterial({ color: 0x000205, side: THREE.BackSide, fog: false });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.y = -5;
    environmentGroup.add(dome);

    const ceilingGeo = new THREE.PlaneGeometry(200, 200);
    const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x0088dd, transparent: true, opacity: 0.6, side: THREE.DoubleSide, roughness: 0.1, metalness: 0.8 });
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 16; 
    environmentGroup.add(ceiling);

    // --- Geography ---
    const geographyGroup = new THREE.Group();
    const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x3a4b4c, roughness: 1.0, flatShading: true });
    const rockSpheres: { center: THREE.Vector3, radius: number }[] = [];
    const rockGeometries: THREE.BufferGeometry[] = [];

    for (let i = 0; i < 1000; i++) {
        const isPebble = i > 400;
        const size = isPebble ? Math.random() * 0.4 + 0.1 : Math.random() * 6 + 2;
        const x = (Math.random() - 0.5) * 80;
        const z = (Math.random() - 0.5) * 150;
        if (!isPebble && Math.abs(x) < 5 && size > 3) continue;
        const geo = new THREE.IcosahedronGeometry(size, isPebble ? 0 : 1);
        
        const twist = Math.sin(z * 0.08) * 6;
        const baseHeight = Math.sin(x * 0.05) * 2 + Math.cos(z * 0.05) * 2 - 5;
        const wallHeight = Math.pow(Math.abs(x + twist) / 10, 4);
        const y = baseHeight + Math.min(wallHeight, 12);
        
        const pos = new THREE.Vector3(x, y - size * 0.2, z);
        const rot = new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
        const scale = isPebble ? new THREE.Vector3(1, 1, 1) : new THREE.Vector3(1, 1.8 + Math.random() * 1.5, 1);

        const matrix = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), scale);
        geo.applyMatrix4(matrix);
        
        if (!isPebble) {
            rockSpheres.push({ center: pos, radius: size * 0.85 });
        }
        rockGeometries.push(geo);
    }
    if (rockGeometries.length > 0) {
        const mergedRockGeo = BufferGeometryUtils.mergeGeometries(rockGeometries);
        geographyGroup.add(new THREE.Mesh(mergedRockGeo, rockMaterial));
    }

    // --- Reef ---
    const coralsGroup = new THREE.Group();
    const coralGlobalUniforms = { time: { value: 0 } };
    const coralMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xdddddd, 
        flatShading: true,
        roughness: 0.7,
        metalness: 0.1
    });

    coralMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.time = coralGlobalUniforms.time;
        
        // Vertex sway
        shader.vertexShader = `
            uniform float time;
            ${shader.vertexShader}
        `.replace(
            `#include <begin_vertex>`,
            `#include <begin_vertex>
            // Subtle sway based on position and time
            float sway = sin(time * 1.5 + position.x * 0.8 + position.z * 0.8) * 0.08 * max(0.0, position.y - 1.0);
            transformed.x += sway;
            transformed.z += sway * 0.5;
            `
        );
        
        // Fragment pulse
        shader.fragmentShader = `
            uniform float time;
            ${shader.fragmentShader}
        `.replace(
            `#include <emissivemap_fragment>`,
            `#include <emissivemap_fragment>
            // Simple pulsing effect applied to emissive radiance
            float pulse = sin(time * 2.0) * 0.25 + 0.75;
            totalEmissiveRadiance *= pulse;
            `
        );
    };
    
    // Distribute corals based on configs
    coralConfigs.forEach(cfg => {
        const speciesColor = new THREE.Color(cfg.color);
        const speciesGeometries: THREE.BufferGeometry[] = [];

        for(let i = 0; i < cfg.count; i++) {
            let sx, sy, sz;
            const onRock = Math.random() > 0.4 && rockSpheres.length > 0;
            
            if (onRock) {
                const rock = rockSpheres[Math.floor(Math.random() * rockSpheres.length)];
                sx = rock.center.x + (Math.random() - 0.5) * rock.radius;
                sz = rock.center.z + (Math.random() - 0.5) * rock.radius;
                sy = rock.center.y + rock.radius * 0.4;
            } else {
                sx = (Math.random() - 0.5) * 80;
                sz = (Math.random() - 0.5) * 150;
                const twist = Math.sin(sz * 0.08) * 6;
                if (Math.abs(sx + twist) > 40) continue;
                const baseHeight = Math.sin(sx * 0.05) * 2 + Math.cos(sz * 0.05) * 2 - 5;
                const wallHeight = Math.pow(Math.abs(sx + twist) / 10, 4);
                sy = baseHeight + Math.min(wallHeight, 12) + 0.2;
            }
            
            const numPieces = Math.floor(Math.random()*15)+15;
            for(let j = 0; j < numPieces; j++) {
                const isCyl = Math.random()>0.3;
                const pieceGeo = isCyl ? 
                    new THREE.CylinderGeometry(0.1, 0.7, Math.random()*5.0+1.5, 12) : 
                    new THREE.SphereGeometry(0.8, 16, 16);
                
                const piecePos = new THREE.Vector3(
                    sx + (Math.random()-0.5)*3.5, 
                    sy + Math.random()*1.5, 
                    sz + (Math.random()-0.5)*3.5
                );
                const pieceRot = new THREE.Euler(Math.random()*1.5, Math.random()*Math.PI, Math.random()*1.5);
                const pieceMatrix = new THREE.Matrix4().compose(piecePos, new THREE.Quaternion().setFromEuler(pieceRot), new THREE.Vector3(1, 1, 1));
                pieceGeo.applyMatrix4(pieceMatrix);
                speciesGeometries.push(pieceGeo);
            }
        }

        if (speciesGeometries.length > 0) {
            const mergedSpeciesGeo = BufferGeometryUtils.mergeGeometries(speciesGeometries);
            
            // Clone the upgraded material and set species-specific colors
            const mat = coralMaterial.clone();
            mat.color.copy(speciesColor);
            mat.emissive.copy(speciesColor);
            mat.emissiveIntensity = 1.3;

            const speciesMesh = new THREE.Mesh(mergedSpeciesGeo, mat);
            
            speciesMesh.userData = { 
                type: 'coral', 
                id: cfg.id, 
                name: cfg.name, 
                desc: cfg.desc, 
                bleach_year: cfg.bleach_year,
                originalColor: speciesColor.clone()
            };
            coralsGroup.add(speciesMesh);
        }
    });

    // --- Seaweed ---
    const seaweedsGroup = new THREE.Group();
    const seaweedColors = [0x2d5a27, 0x3d6a37, 0x1d4a17, 0x4d7a47, 0x5a8a4a, 0x2e4a2e];
    const seaweedMaterials: THREE.ShaderMaterial[] = [];
    
    const seaweedBuckets: THREE.BufferGeometry[][] = seaweedColors.map(() => []);

    for (let i = 0; i < 4000; i++) {
        const x = (Math.random() - 0.5) * 110;
        const z = (Math.random() - 0.5) * 200;
        const twist = Math.sin(z * 0.08) * 6;
        const baseHeight = Math.sin(x * 0.05) * 2 + Math.cos(z * 0.05) * 2 - 5;
        const wallHeight = Math.pow(Math.abs(x + twist) / 10, 4);
        const y = baseHeight + Math.min(wallHeight, 12) + 0.1;
        
        const height = Math.random() * 6 + 3; // MUCH TALLER: 3.0 - 9.0
        const seaweedGeo = new THREE.PlaneGeometry(0.3, height, 1, 8);
        
        // Custom attribute to store height from base for anchoring in shader
        const posAttr = seaweedGeo.attributes.position;
        const heightFromBase = new Float32Array(posAttr.count);
        for(let j=0; j<posAttr.count; j++) {
            heightFromBase[j] = posAttr.getY(j) + height/2; // Map -h/2..h/2 to 0..h
        }
        seaweedGeo.setAttribute('heightFromBase', new THREE.BufferAttribute(heightFromBase, 1));
        
        const pos = new THREE.Vector3(x, y + height / 2, z);
        const rot = new THREE.Euler(0, Math.random() * Math.PI, 0);
        const matrix = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1));
        seaweedGeo.applyMatrix4(matrix);

        const colorIdx = Math.floor(Math.random() * seaweedColors.length);
        seaweedBuckets[colorIdx].push(seaweedGeo);
    }

    const SeaweedShader = {
        uniforms: {
            time: { value: 0 },
            color: { value: new THREE.Color() }
        },
        vertexShader: `
            uniform float time;
            attribute float heightFromBase;
            varying vec2 vUv;
            void main() {
                vUv = uv;
                vec3 pos = position;
                // Wiggle: intensity increases with height
                float wiggle = sin(time * 1.5 + position.x * 0.5 + position.z * 0.5) * (heightFromBase * 0.15);
                pos.x += wiggle;
                pos.z += wiggle * 0.5;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            varying vec2 vUv;
            void main() {
                // Simple gradient based on height
                gl_FragColor = vec4(color * (vUv.y + 0.3), 1.0);
            }
        `
    };

    seaweedColors.forEach((color, idx) => {
        if (seaweedBuckets[idx].length > 0) {
            const mergedGeo = BufferGeometryUtils.mergeGeometries(seaweedBuckets[idx]);
            const mat = new THREE.ShaderMaterial({
                uniforms: THREE.UniformsUtils.clone(SeaweedShader.uniforms),
                vertexShader: SeaweedShader.vertexShader,
                fragmentShader: SeaweedShader.fragmentShader,
                side: THREE.DoubleSide
            });
            mat.uniforms.color.value.setHex(color);
            seaweedMaterials.push(mat);
            seaweedsGroup.add(new THREE.Mesh(mergedGeo, mat));
        }
    });

    // --- Dispersed Sun Rays ---
    const sunRaysGroup = new THREE.Group();
    const sunRayMaterial = new THREE.MeshBasicMaterial({
        color: 0xeeffff, transparent: true, opacity: 0.03, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
    });
    for (let i = 0; i < 20; i++) {
        const h = 400;
        const geo = new THREE.CylinderGeometry(5, 80 + Math.random() * 40, h, 12, 1, true);
        const mesh = new THREE.Mesh(geo, sunRayMaterial);
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 80;
        mesh.position.set(Math.cos(angle) * dist, 150, Math.sin(angle) * dist);
        mesh.rotation.x = (Math.random() - 0.5) * 0.3;
        mesh.rotation.z = (Math.random() - 0.5) * 0.3;
        sunRaysGroup.add(mesh);
    }

    // --- Ambient Dust ---
    const dustGeometry = new THREE.BufferGeometry();
    const dustCount = 4000;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount * 3; i++) {
        dustPositions[i] = (Math.random() - 0.5) * 200;
    }
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMaterial = new THREE.PointsMaterial({ color: 0x888888, size: 0.05, transparent: true, opacity: 0.3 });
    environmentGroup.add(new THREE.Points(dustGeometry, dustMaterial));

    return {
        fishMesh, fishHitboxMesh, coralsGroup, coralGlobalUniforms, geographyGroup, environmentGroup, fishData, rockSpheres,
        fishMaterial, coralMaterial, rockMaterial, seaweedsGroup, seaweedMaterials,
        sunRaysGroup, sunRayMaterial
    };
}

export function setupInteractivePreview(
    canvas: HTMLCanvasElement,
    type: 'fish' | 'coral' | 'unknown',
    config: { id: string; color: number | string }
): () => void {
    const W = canvas.width, H = canvas.height;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(W, H, false);
    renderer.setClearColor(0x000000, 0);

    const thumbScene = new THREE.Scene();
    thumbScene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(3, 5, 4);
    thumbScene.add(dir);

    const colorHex = typeof config.color === 'string'
        ? parseInt(config.color.replace('#', ''), 16)
        : config.color;
    const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4 });

    const pivot = new THREE.Object3D();
    thumbScene.add(pivot);

    let mesh: THREE.Mesh | undefined;
    if (type === 'fish') {
        const geo = new THREE.ConeGeometry(0.15, 0.8, 4);
        geo.rotateX(Math.PI / 2);
        mesh = new THREE.Mesh(geo, mat);
        pivot.rotation.y = Math.PI * 0.4; // 3/4 side view
        pivot.rotation.x = 0.2; // Slight tilt
    } else if (type === 'coral') {
        const geos: THREE.BufferGeometry[] = [];
        const pieceCount = 15 + Math.floor(Math.random() * 15);
        for (let i = 0; i < pieceCount; i++) {
            const isSphere = Math.random() < 0.3;
            const geo = isSphere
                ? new THREE.SphereGeometry(0.8, 8, 8)
                : new THREE.CylinderGeometry(0.1, 0.7, Math.random() * 5.0 + 1.5, 8);
            geo.translate((Math.random() - 0.5) * 3.5, Math.random() * 1.5, (Math.random() - 0.5) * 3.5);
            geos.push(geo);
        }
        mesh = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos), mat);
        pivot.rotation.y = Math.PI * 0.2;
    } else if (type === 'unknown') {
        // Create a large '?' using a texture or just a simple geometry for now
        // For simplicity and to avoid font loading issues, we'll use a stylized "X" or just leave it empty with a placeholder
        // Actually, we can just use a Sphere with a wireframe or something technical
        const geo = new THREE.IcosahedronGeometry(1.5, 1);
        const wireMat = new THREE.MeshBasicMaterial({ color: 0x557788, wireframe: true, transparent: true, opacity: 0.3 });
        mesh = new THREE.Mesh(geo, wireMat);
        
        // Add a smaller solid core
        const coreGeo = new THREE.IcosahedronGeometry(0.5, 0);
        const coreMesh = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: 0x557788 }));
        pivot.add(coreMesh);
    }
    
    if (mesh) pivot.add(mesh);

    const box = new THREE.Box3().setFromObject(pivot);
    const center = box.getCenter(new THREE.Vector3());
    const boxSize = box.getSize(new THREE.Vector3()).length();
    const thumbCamera = new THREE.PerspectiveCamera(45, W / H, 0.01, 1000);
    const dist = type === 'fish' ? boxSize * 2.2 : boxSize * 1.1;
    thumbCamera.position.set(center.x, center.y, center.z + dist);
    thumbCamera.lookAt(center);

    // Drag-to-rotate
    let isDragging = false, prevX = 0, prevY = 0;
    const onDown = (e: PointerEvent) => { isDragging = true; prevX = e.clientX; prevY = e.clientY; canvas.setPointerCapture(e.pointerId); };
    const onMove = (e: PointerEvent) => {
        if (!isDragging) return;
        pivot.rotation.y += (e.clientX - prevX) * 0.012;
        pivot.rotation.x += (e.clientY - prevY) * 0.012;
        prevX = e.clientX; prevY = e.clientY;
    };
    const onUp = () => { isDragging = false; };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);

    let animId: number;
    const loop = () => { animId = requestAnimationFrame(loop); renderer.render(thumbScene, thumbCamera); };
    loop();

    return () => {
        cancelAnimationFrame(animId);
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        renderer.dispose();
    };
}

const _thumbnailCache = new Map<string, string>();
let _sharedThumbnailRenderer: THREE.WebGLRenderer | null = null;

export function generateThumbnail(
    type: 'fish' | 'coral',
    config: { id: string; color: number | string },
    size = 200
): string {
    if (_thumbnailCache.has(config.id)) return _thumbnailCache.get(config.id)!;

    if (!_sharedThumbnailRenderer) {
        _sharedThumbnailRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        _sharedThumbnailRenderer.setClearColor(0x000000, 0);
    }
    
    _sharedThumbnailRenderer.setSize(size, size);

    const thumbScene = new THREE.Scene();
    thumbScene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(2, 4, 3);
    thumbScene.add(dirLight);

    const colorHex = typeof config.color === 'string'
        ? parseInt(config.color.replace('#', ''), 16)
        : config.color;
    const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4 });

    let mesh: THREE.Mesh;
    if (type === 'fish') {
        const geo = new THREE.ConeGeometry(0.15, 0.8, 4);
        geo.rotateX(Math.PI / 2);
        mesh = new THREE.Mesh(geo, mat);
    } else {
        const geos: THREE.BufferGeometry[] = [];
        const pieceCount = 15 + Math.floor(Math.random() * 15);
        for (let i = 0; i < pieceCount; i++) {
            const isSphere = Math.random() < 0.3;
            const geo = isSphere
                ? new THREE.SphereGeometry(0.8, 8, 8)
                : new THREE.CylinderGeometry(0.1, 0.7, Math.random() * 5.0 + 1.5, 8);
            geo.translate((Math.random() - 0.5) * 3.5, Math.random() * 1.5, (Math.random() - 0.5) * 3.5);
            geos.push(geo);
        }
        mesh = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos), mat);
    }
    thumbScene.add(mesh);

    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const boxSize = box.getSize(new THREE.Vector3()).length();
    const thumbCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    
    // Angle the camera for a 3/4 view
    const angle = Math.PI * 0.15;
    const dist = type === 'fish' ? boxSize * 2.5 : boxSize * 1.5;
    thumbCamera.position.set(
        center.x + Math.sin(angle) * dist,
        center.y + (type === 'fish' ? dist * 0.1 : dist * 0.5),
        center.z + Math.cos(angle) * dist
    );
    thumbCamera.lookAt(center);

    _sharedThumbnailRenderer.render(thumbScene, thumbCamera);
    const dataUrl = _sharedThumbnailRenderer.domElement.toDataURL('image/png');
    
    // Cleanup
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    
    _thumbnailCache.set(config.id, dataUrl);
    return dataUrl;
}

export async function warmThumbnailCache(
    fishConfigs: FishConfig[],
    coralConfigs: CoralConfig[]
) {
    const coralIds = new Set(coralConfigs.map(c => c.id));
    
    // Generate thumbnails sequentially to avoid overloading GPU
    for (const cfg of fishConfigs) {
        const type = coralIds.has(cfg.id) ? 'coral' : 'fish';
        generateThumbnail(type, cfg);
        await new Promise(r => setTimeout(r, 10)); // Tiny breather
    }
    
    // Also warm anything in coralConfigs that might not be in fishConfigs
    for (const cfg of coralConfigs) {
        if (!_thumbnailCache.has(cfg.id)) {
            generateThumbnail('coral', cfg);
            await new Promise(r => setTimeout(r, 10));
        }
    }
}
