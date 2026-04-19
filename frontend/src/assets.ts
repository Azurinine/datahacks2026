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
    const fishMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
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
    const coralMaterial = new THREE.MeshStandardMaterial({ color: 0xff6b81, flatShading: true });
    
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
            const speciesMesh = new THREE.Mesh(mergedSpeciesGeo, coralMaterial.clone());
            (speciesMesh.material as THREE.MeshStandardMaterial).color.copy(speciesColor);
            
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
                float wiggle = sin(time * 1.5 + position.y * 0.5) * (heightFromBase * 0.15);
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

    return {
        fishMesh, fishHitboxMesh, coralsGroup, geographyGroup, environmentGroup, fishData, rockSpheres,
        fishMaterial, coralMaterial, rockMaterial, seaweedsGroup, seaweedMaterials,
        sunRaysGroup, sunRayMaterial
    };
}
