import * as THREE from 'three';

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
    seaweedMaterial: THREE.MeshStandardMaterial;
    sunRaysGroup: THREE.Group;
    sunRayMaterial: THREE.MeshBasicMaterial;
}

export function createAssetRegistry(configs: FishConfig[]): AssetRegistry {
    const totalFishCount = configs.reduce((sum, cfg) => sum + cfg.count, 0);

    // --- Fish System ---
    const fishGeometry = new THREE.ConeGeometry(0.15, 0.8, 4);
    fishGeometry.rotateX(Math.PI / 2); 
    const fishMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const fishMesh = new THREE.InstancedMesh(fishGeometry, fishMaterial, totalFishCount);
    fishMesh.frustumCulled = false;
    
    const colorArray = new Float32Array(totalFishCount * 3);
    const instColor = new THREE.Color();
    const dummy = new THREE.Object3D();
    const fishData: AssetRegistry['fishData'] = [];
    
    const schoolCenters = configs.map(() => ({
        pos: new THREE.Vector3((Math.random()-0.5)*20, Math.random()*3 + 1, (Math.random()-0.5)*100),
    }));

    let globalIdx = 0;
    configs.forEach((cfg, schoolId) => {
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
    // Add sand mounds for floor variety
    const sandGeo = new THREE.SphereGeometry(1, 8, 8);
    const sandMat = new THREE.MeshStandardMaterial({ color: 0xc2b280, roughness: 1.0 });
    for (let i = 0; i < 200; i++) {
        const x = (Math.random() - 0.5) * 80;
        const z = (Math.random() - 0.5) * 150;
        const twist = Math.sin(z * 0.08) * 6;
        if (Math.abs(x + twist) > 35) continue;
        
        const mound = new THREE.Mesh(sandGeo, sandMat);
        const baseHeight = Math.sin(x * 0.05) * 2 + Math.cos(z * 0.05) * 2 - 5;
        const wallHeight = Math.pow(Math.abs(x + twist) / 10, 4);
        const y = baseHeight + Math.min(wallHeight, 12);
        
        mound.position.set(x, y - 0.5, z);
        mound.scale.set(Math.random() * 3 + 2, Math.random() * 0.5 + 0.2, Math.random() * 3 + 2);
        mound.rotation.y = Math.random() * Math.PI;
        environmentGroup.add(mound);
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
    for (let i = 0; i < 600; i++) {
        const isPebble = i > 300;
        const size = isPebble ? Math.random() * 0.4 + 0.1 : Math.random() * 5 + 2;
        const x = (Math.random() - 0.5) * 80;
        const z = (Math.random() - 0.5) * 150;
        
        // Skip large rocks in the central path, but allow pebbles
        if (!isPebble && Math.abs(x) < 5 && size > 3) continue;

        const geo = new THREE.IcosahedronGeometry(size, isPebble ? 0 : 1);
        const rock = new THREE.Mesh(geo, rockMaterial);
        const twist = Math.sin(z * 0.08) * 6;
        const baseHeight = Math.sin(x * 0.05) * 2 + Math.cos(z * 0.05) * 2 - 5;
        const wallHeight = Math.pow(Math.abs(x + twist) / 10, 4);
        const y = baseHeight + Math.min(wallHeight, 12);
        
        rock.position.set(x, y - size * 0.2, z);
        if (!isPebble) {
            rock.scale.set(1, 1.8 + Math.random() * 1.5, 1); // Taller rocks
            rockSpheres.push({ center: rock.position.clone(), radius: size * 0.85 });
        }
        rock.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
        geographyGroup.add(rock);
    }

    // --- Reef ---
    const coralsGroup = new THREE.Group();
    const coralMaterial = new THREE.MeshStandardMaterial({ color: 0xff6b81, flatShading: true });
    for(let i = 0; i < 2500; i++) {
        const cluster = new THREE.Group();
        const sx = (Math.random() - 0.5) * 80;
        const sz = (Math.random() - 0.5) * 150;
        const twist = Math.sin(sz * 0.08) * 6;
        if (Math.abs(sx + twist) > 40) continue; // Out of bounds

        const baseHeight = Math.sin(sx * 0.05) * 2 + Math.cos(sz * 0.05) * 2 - 5;
        const wallHeight = Math.pow(Math.abs(sx + twist) / 10, 4);
        const sy = baseHeight + Math.min(wallHeight, 12) + 0.2;
        
        cluster.position.set(sx, sy, sz);
        const numPieces = Math.floor(Math.random()*6)+4;
        const clusterColor = new THREE.Color().setHSL(Math.random()*0.12+0.92, 0.8, 0.5); 
        for(let j = 0; j < numPieces; j++) {
            const isCyl = Math.random()>0.3;
            const pieceGeo = isCyl ? new THREE.CylinderGeometry(0.02, 0.15, Math.random()*1.5+0.3) : new THREE.SphereGeometry(0.15, 4, 4);
            const pieceMat = coralMaterial.clone(); pieceMat.color.copy(clusterColor);
            const mesh = new THREE.Mesh(pieceGeo, pieceMat);
            mesh.position.set((Math.random()-0.5)*0.5, Math.random()*0.2, (Math.random()-0.5)*0.5);
            mesh.rotation.set(Math.random()*0.6, Math.random()*Math.PI, Math.random()*0.6);
            cluster.add(mesh);
        }
        coralsGroup.add(cluster);
    }

    // --- Seaweed ---
    const seaweedsGroup = new THREE.Group();
    const seaweedMaterial = new THREE.MeshStandardMaterial({ color: 0x2d5a27, side: THREE.DoubleSide, flatShading: true });
    const seaweedColors = [0x2d5a27, 0x3d6a37, 0x1d4a17, 0x4d7a47];
    for (let i = 0; i < 1200; i++) {
        const x = (Math.random() - 0.5) * 80;
        const z = (Math.random() - 0.5) * 150;
        const twist = Math.sin(z * 0.08) * 6;
        const baseHeight = Math.sin(x * 0.05) * 2 + Math.cos(z * 0.05) * 2 - 5;
        const wallHeight = Math.pow(Math.abs(x + twist) / 10, 4);
        const y = baseHeight + Math.min(wallHeight, 12) + 0.1;

        const height = Math.random() * 3 + 1;
        const seaweedGeo = new THREE.PlaneGeometry(0.2, height, 1, 4);
        // Bend it slightly
        const pos = seaweedGeo.attributes.position;
        for(let j=0; j<pos.count; j++) {
            const py = pos.getY(j);
            pos.setX(j, pos.getX(j) + Math.sin(py * 1.5 + i) * 0.3);
        }
        seaweedGeo.computeVertexNormals();

        const mat = seaweedMaterial.clone();
        mat.color.setHex(seaweedColors[Math.floor(Math.random() * seaweedColors.length)]);
        const seaweed = new THREE.Mesh(seaweedGeo, mat);
        seaweed.position.set(x, y + height / 2, z);
        seaweed.rotation.y = Math.random() * Math.PI;
        seaweedsGroup.add(seaweed);
    }

    // --- Dispersed Sun Rays ---
    const sunRaysGroup = new THREE.Group();
    const sunRayMaterial = new THREE.MeshBasicMaterial({
        color: 0xeeffff, transparent: true, opacity: 0.03, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
    });

    for (let i = 0; i < 20; i++) {
        const h = 400; // Very tall
        // Narrow at top (above water), wide at bottom (deep ocean)
        const geo = new THREE.CylinderGeometry(5, 80 + Math.random() * 40, h, 12, 1, true);
        const mesh = new THREE.Mesh(geo, sunRayMaterial);
        
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 80;
        // Spawn center high up so it covers the entire vertical range
        mesh.position.set(Math.cos(angle) * dist, 150, Math.sin(angle) * dist);
        mesh.rotation.x = (Math.random() - 0.5) * 0.3;
        mesh.rotation.z = (Math.random() - 0.5) * 0.3;
        sunRaysGroup.add(mesh);
    }

    return {
        fishMesh, coralsGroup, geographyGroup, environmentGroup, fishData, rockSpheres,
        fishMaterial, coralMaterial, rockMaterial, seaweedsGroup, seaweedMaterial,
        sunRaysGroup, sunRayMaterial
    };
}
