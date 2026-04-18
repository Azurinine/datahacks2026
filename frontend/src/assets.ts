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
    rockSpheres: { center: THREE.Vector3, radius: number }[];
    fishMaterial: THREE.MeshStandardMaterial;
    coralMaterial: THREE.MeshStandardMaterial;
    rockMaterial: THREE.MeshStandardMaterial;
    sunRaysGroup: THREE.Group;
    sunRayMaterial: THREE.MeshBasicMaterial;
}

export function createAssetRegistry(fishCount: number): AssetRegistry {
    // --- Fish System ---
    const fishGeometry = new THREE.ConeGeometry(0.15, 0.8, 4);
    fishGeometry.rotateX(Math.PI / 2); 
    const fishMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const fishMesh = new THREE.InstancedMesh(fishGeometry, fishMaterial, fishCount);
    
    const colorArray = new Float32Array(fishCount * 3);
    const instColor = new THREE.Color();
    const fishPalettes = [0x55aaff, 0xffaa55, 0x55ffaa, 0xff55aa];
    const dummy = new THREE.Object3D();
    const fishData: AssetRegistry['fishData'] = [];
    const numSchools = fishPalettes.length;
    const schoolCenters = fishPalettes.map(() => ({
        pos: new THREE.Vector3((Math.random()-0.5)*40, Math.random()*15+5, (Math.random()-0.5)*40),
    }));

    for (let i = 0; i < fishCount; i++) {
        const schoolId = i % numSchools;
        instColor.setHex(fishPalettes[schoolId]).toArray(colorArray, i * 3);
        const center = schoolCenters[schoolId].pos;
        const offset = new THREE.Vector3((Math.random()-0.5)*15, (Math.random()-0.5)*6, (Math.random()-0.5)*15);
        dummy.position.copy(center).add(offset);
        dummy.updateMatrix();
        fishMesh.setMatrixAt(i, dummy.matrix);
        fishData.push({
            baseSpeed: Math.random()*0.04+0.03, turnSpeed: (Math.random()-0.5)*0.02, preferredHeight: center.y+offset.y,
            originalColor: new THREE.Color(fishPalettes[schoolId]), schoolOffset: offset, schoolId: schoolId
        });
    }
    fishMesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);
    fishMesh.instanceColor.needsUpdate = true;

    // --- Environment ---
    const environmentGroup = new THREE.Group();
    const domeGeo = new THREE.SphereGeometry(65, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMat = new THREE.MeshBasicMaterial({ color: 0x000205, side: THREE.BackSide, fog: false });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.y = -5;
    environmentGroup.add(dome);

    const ceilingGeo = new THREE.CircleGeometry(65, 32);
    const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x0088dd, transparent: true, opacity: 0.6, side: THREE.DoubleSide, roughness: 0.1, metalness: 0.8 });
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 35; 
    environmentGroup.add(ceiling);

    // --- Geography ---
    const geographyGroup = new THREE.Group();
    const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x3a4b4c, roughness: 1.0, flatShading: true });
    const rockSpheres: { center: THREE.Vector3, radius: number }[] = [];
    for (let i = 0; i < 120; i++) {
        const size = Math.random() * 6 + 2;
        const geo = new THREE.IcosahedronGeometry(size, 1);
        const rock = new THREE.Mesh(geo, rockMaterial);
        const angle = Math.random() * Math.PI * 2, dist = Math.random() * 60;
        const x = Math.cos(angle)*dist, z = Math.sin(angle)*dist, y = Math.sin(x*0.05)*3+Math.cos(z*0.05)*3-5;
        rock.position.set(x, y - size * 0.3, z);
        rock.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
        geographyGroup.add(rock);
        rockSpheres.push({ center: rock.position.clone(), radius: size * 0.85 });
    }

    // --- Reef ---
    const coralsGroup = new THREE.Group();
    const coralMaterial = new THREE.MeshStandardMaterial({ color: 0xff6b81, flatShading: true });
    for(let i = 0; i < 1500; i++) {
        const cluster = new THREE.Group();
        const angle = Math.random()*Math.PI*2, dist = Math.random()*62;
        const sx = Math.cos(angle)*dist, sz = Math.sin(angle)*dist, sy = Math.sin(sx*0.05)*3+Math.cos(sz*0.05)*3-5+0.2;
        cluster.position.set(sx, sy, sz);
        const numPieces = Math.floor(Math.random()*4)+2;
        const clusterColor = new THREE.Color().setHSL(Math.random()*0.12+0.92, 0.8, 0.5); 
        for(let j = 0; j < numPieces; j++) {
            const isCyl = Math.random()>0.4;
            const pieceGeo = isCyl ? new THREE.CylinderGeometry(0.02, 0.12, Math.random()*1.0+0.2) : new THREE.SphereGeometry(0.12, 4, 4);
            const pieceMat = coralMaterial.clone(); pieceMat.color.copy(clusterColor);
            const mesh = new THREE.Mesh(pieceGeo, pieceMat);
            mesh.position.set((Math.random()-0.5)*0.5, Math.random()*0.2, (Math.random()-0.5)*0.5);
            mesh.rotation.set(Math.random()*0.6, Math.random()*Math.PI, Math.random()*0.6);
            cluster.add(mesh);
        }
        coralsGroup.add(cluster);
    }

    // --- Dispersed Sun Rays (Spawn high above, wider at bottom) ---
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
        fishMaterial, coralMaterial, rockMaterial, sunRaysGroup, sunRayMaterial
    };
}
