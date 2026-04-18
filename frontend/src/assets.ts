import * as THREE from 'three';

export interface AssetRegistry {
    fishMesh: THREE.InstancedMesh;
    coralsGroup: THREE.Group;
    fishData: { baseSpeed: number; turnSpeed: number }[];
    fishMaterial: THREE.MeshStandardMaterial;
    coralMaterial: THREE.MeshStandardMaterial;
    sunRaysGroup: THREE.Group;
    sunRayMaterial: THREE.MeshBasicMaterial;
}

export function createAssetRegistry(fishCount: number): AssetRegistry {
    // --- Fish System ---
    const fishGeometry = new THREE.ConeGeometry(0.15, 0.8, 4);
    fishGeometry.rotateX(Math.PI / 2); 
    const fishMaterial = new THREE.MeshStandardMaterial({ color: 0x55aaff });
    const fishMesh = new THREE.InstancedMesh(fishGeometry, fishMaterial, fishCount);
    
    const dummy = new THREE.Object3D();
    const fishData: { baseSpeed: number; turnSpeed: number }[] = [];

    for (let i = 0; i < fishCount; i++) {
        dummy.position.set(
            (Math.random() - 0.5) * 100,
            Math.random() * 15 + 1,
            (Math.random() - 0.5) * 100
        );
        dummy.rotation.y = Math.random() * Math.PI * 2;
        dummy.updateMatrix();
        fishMesh.setMatrixAt(i, dummy.matrix);
        
        fishData.push({
            baseSpeed: Math.random() * 0.04 + 0.02,
            turnSpeed: (Math.random() - 0.5) * 0.03
        });
    }

    // --- Coral System ---
    const coralsGroup = new THREE.Group();
    const coralMaterial = new THREE.MeshStandardMaterial({ color: 0xff6b81, flatShading: true });
    
    for(let i = 0; i < 80; i++) {
        const cluster = new THREE.Group();
        const sx = (Math.random() - 0.5) * 150;
        const sz = (Math.random() - 0.5) * 150;
        // Match seafloor height (logic will be synced with main.ts)
        const sy = Math.sin(sx * 0.05) * 3 + Math.cos(sz * 0.05) * 3 - 5 + 0.2;
        
        cluster.position.set(sx, sy, sz);

        const numPieces = Math.floor(Math.random() * 5) + 3;
        for(let j = 0; j < numPieces; j++) {
            const isCyl = Math.random() > 0.4;
            const geo = isCyl 
                ? new THREE.CylinderGeometry(0.1, 0.3, Math.random() * 2 + 1) 
                : new THREE.SphereGeometry(0.4, 6, 6);
            const mesh = new THREE.Mesh(geo, coralMaterial);
            mesh.position.set((Math.random() - 0.5), Math.random() * 0.5, (Math.random() - 0.5));
            mesh.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, Math.random() * 0.4);
            cluster.add(mesh);
        }
        coralsGroup.add(cluster);
    }

    // --- Sun Ray System ---
    const sunRaysGroup = new THREE.Group();
    const sunRayMaterial = new THREE.MeshBasicMaterial({
        color: 0xccffff,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    for (let i = 0; i < 15; i++) {
        const h = 1000; // Drastically increased height
        const geo = new THREE.CylinderGeometry(1, 40, h, 8, 1, true);
        const mesh = new THREE.Mesh(geo, sunRayMaterial);
        
        mesh.position.set(
            (Math.random() - 0.5) * 150,
            h / 2 - 20, // Lowered start point to penetrate deeper
            (Math.random() - 0.5) * 100
        );
        mesh.rotation.x = Math.PI + (Math.random() - 0.5) * 0.2;
        mesh.rotation.z = (Math.random() - 0.5) * 0.2;
        
        sunRaysGroup.add(mesh);
    }

    return {
        fishMesh,
        coralsGroup,
        fishData,
        fishMaterial,
        coralMaterial,
        sunRaysGroup,
        sunRayMaterial
    };
}
