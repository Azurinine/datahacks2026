import * as THREE from 'three';

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
    }[];
    fishMaterial: THREE.MeshStandardMaterial;
    coralMaterial: THREE.MeshStandardMaterial;
    rockMaterial: THREE.MeshStandardMaterial;
    sunRaysGroup: THREE.Group;
    sunRayMaterial: THREE.MeshBasicMaterial;
}

export function createAssetRegistry(fishCount: number): AssetRegistry {
    // --- Fish System (Schooling) ---
    const fishGeometry = new THREE.ConeGeometry(0.15, 0.8, 4);
    fishGeometry.rotateX(Math.PI / 2); 
    const fishMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        roughness: 0.4
    });
    const fishMesh = new THREE.InstancedMesh(fishGeometry, fishMaterial, fishCount);
    
    const colorArray = new Float32Array(fishCount * 3);
    const instColor = new THREE.Color();
    const fishPalettes = [0x55aaff, 0xffaa55, 0x55ffaa, 0xff55aa];

    const dummy = new THREE.Object3D();
    const fishData: AssetRegistry['fishData'] = [];

    const numSchools = fishPalettes.length;
    const schoolCenters = fishPalettes.map(() => ({
        pos: new THREE.Vector3((Math.random()-0.5)*40, Math.random()*15+5, (Math.random()-0.5)*40),
        color: new THREE.Color()
    }));

    for (let i = 0; i < fishCount; i++) {
        const schoolId = i % numSchools;
        const paletteHex = fishPalettes[schoolId];
        instColor.setHex(paletteHex);
        instColor.toArray(colorArray, i * 3);

        const center = schoolCenters[schoolId].pos;
        const offset = new THREE.Vector3(
            (Math.random() - 0.5) * 15,
            (Math.random() - 0.5) * 6,
            (Math.random() - 0.5) * 15
        );

        dummy.position.copy(center).add(offset);
        dummy.updateMatrix();
        fishMesh.setMatrixAt(i, dummy.matrix);
        
        fishData.push({
            baseSpeed: Math.random() * 0.04 + 0.03,
            turnSpeed: (Math.random() - 0.5) * 0.02,
            preferredHeight: center.y + offset.y,
            originalColor: new THREE.Color(paletteHex),
            schoolOffset: offset,
            schoolId: schoolId
        });
    }

    fishMesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);
    fishMesh.instanceColor.needsUpdate = true;

    // --- Environment (Smaller Dome & Ceiling) ---
    const environmentGroup = new THREE.Group();
    
    // Boundary Dome (Shrunk to 60 for density)
    const domeGeo = new THREE.SphereGeometry(65, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMat = new THREE.MeshBasicMaterial({ 
        color: 0x000205, // Much darker
        side: THREE.BackSide, 
        fog: false 
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.y = -5;
    environmentGroup.add(dome);

    // Water Surface (Ceiling)
    const ceilingGeo = new THREE.CircleGeometry(65, 32);
    const ceilingMat = new THREE.MeshStandardMaterial({ 
        color: 0x00aaff, 
        transparent: true, 
        opacity: 0.3, 
        side: THREE.DoubleSide,
        roughness: 0.1,
        metalness: 0.3
    });
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 35; 
    environmentGroup.add(ceiling);

    // --- Geography (Rocks & Arches) ---
    const geographyGroup = new THREE.Group();
    const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x222a2a, roughness: 0.9, flatShading: true });
    
    for (let i = 0; i < 120; i++) {
        const size = Math.random() * 6 + 2;
        const geo = new THREE.IcosahedronGeometry(size, 1);
        const rock = new THREE.Mesh(geo, rockMaterial);
        
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 60;
        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;
        const y = Math.sin(x * 0.05) * 3 + Math.cos(z * 0.05) * 3 - 5;
        
        rock.position.set(x, y - size * 0.3, z);
        rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        geographyGroup.add(rock);
    }

    // --- Super-Dense Reef ---
    const coralsGroup = new THREE.Group();
    const coralMaterial = new THREE.MeshStandardMaterial({ color: 0xff6b81, flatShading: true });
    
    for(let i = 0; i < 1500; i++) {
        const cluster = new THREE.Group();
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 62;
        const sx = Math.cos(angle) * dist;
        const sz = Math.sin(angle) * dist;
        const sy = Math.sin(sx * 0.05) * 3 + Math.cos(sz * 0.05) * 3 - 5 + 0.2;
        
        cluster.position.set(sx, sy, sz);

        const numPieces = Math.floor(Math.random() * 4) + 2;
        const h = Math.random();
        const clusterColor = new THREE.Color().setHSL(h * 0.12 + 0.92, 0.8, 0.5); 
        
        for(let j = 0; j < numPieces; j++) {
            const isCyl = Math.random() > 0.4;
            const pieceGeo = isCyl 
                ? new THREE.CylinderGeometry(0.02, 0.12, Math.random() * 1.0 + 0.2) 
                : new THREE.SphereGeometry(0.12, 4, 4);
            
            const pieceMat = coralMaterial.clone();
            pieceMat.color.copy(clusterColor);
            
            const mesh = new THREE.Mesh(pieceGeo, pieceMat);
            mesh.position.set((Math.random() - 0.5)*0.5, Math.random() * 0.2, (Math.random() - 0.5)*0.5);
            mesh.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, Math.random() * 0.4);
            cluster.add(mesh);
        }
        coralsGroup.add(cluster);
    }

    // --- Focused Sun Ray System ---
    const sunRaysGroup = new THREE.Group();
    const sunRayMaterial = new THREE.MeshBasicMaterial({
        color: 0xccffff,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    for (let i = 0; i < 25; i++) {
        const h = 500;
        const geo = new THREE.CylinderGeometry(1, 30, h, 8, 1, true);
        const mesh = new THREE.Mesh(geo, sunRayMaterial);
        mesh.position.set((Math.random() - 0.5) * 100, h / 2 - 10, (Math.random() - 0.5) * 100);
        mesh.rotation.x = Math.PI + (Math.random() - 0.5) * 0.2;
        sunRaysGroup.add(mesh);
    }

    return {
        fishMesh,
        coralsGroup,
        geographyGroup,
        environmentGroup,
        fishData,
        fishMaterial,
        coralMaterial,
        rockMaterial,
        sunRaysGroup,
        sunRayMaterial
    };
}
