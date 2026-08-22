import * as THREE from "three";
import { createScene, startRenderLoop } from "../../lib/three-setup.js";
import { fetchLatents } from "../../lib/load-latents.js";

let initialized = false;
let scene = null;
let camera = null;
let renderer = null;
let raycaster = null;
let pointer = null;
let pointMeshes = [];
let selectedPoint = null;

const previewImage = document.getElementById("extra3Preview");
const previewMeta = document.getElementById("extra3Meta");

function onClick(event) {
  if (!renderer || !camera) return;

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(pointMeshes);

  if (intersects.length > 0) {
    const selected = intersects[0].object;
    const item = selected.userData;

    if (selectedPoint) {
      selectedPoint.scale.set(1, 1, 1);
      selectedPoint.material.color.setHex(selectedPoint.userData.baseColorHex);
    }
    selected.scale.set(1.9, 1.9, 1.9);
    selected.material.color.set(0xff0000);
    selectedPoint = selected;

    if (previewImage) {
      previewImage.src = `${import.meta.env.BASE_URL}imagenes_generadas/${item.file}`;
    }
    if (previewMeta) {
      previewMeta.innerHTML = `
        <strong>${item.file}</strong><br>
        latent_hash_num: ${item.latent_hash_num}<br>
        coord_1d: ${Number(item.coord_1d).toFixed(4)}<br>
        x: ${Number(item.coord_3d.x).toFixed(3)}<br>
        y: ${Number(item.coord_3d.y).toFixed(3)}<br>
        z: ${Number(item.coord_3d.z).toFixed(3)}
      `;
    }
  }
}

async function loadData() {
  try {
    const data = await fetchLatents();
    const items = data.items || [];

    const SCALE = 8;
    const POINT_RADIUS = 0.55;

    const minCoord1d = Math.min(...items.map((it) => Number(it.coord_1d) || 0));
    const maxCoord1d = Math.max(...items.map((it) => Number(it.coord_1d) || 1));
    const rangeCoord1d = Math.max(maxCoord1d - minCoord1d, 1e-9);

    const sphereGeometry = new THREE.SphereGeometry(POINT_RADIUS, 10, 10);

    for (const item of items) {
      const x = item.coord_3d?.x ?? 0;
      const y = item.coord_3d?.y ?? 0;
      const z = item.coord_3d?.z ?? 0;

      const t = (Number(item.coord_1d) - minCoord1d) / rangeCoord1d;
      const color = new THREE.Color().setHSL(0.65 - t * 0.65, 0.9, 0.55);

      const point = new THREE.Mesh(
        sphereGeometry,
        new THREE.MeshBasicMaterial({ color }),
      );
      point.position.set(x * SCALE, y * SCALE, z * SCALE);
      point.userData = { ...item, baseColorHex: color.getHex() };

      scene.add(point);
      pointMeshes.push(point);
    }

    const sorted = [...pointMeshes].sort(
      (a, b) => (a.userData.coord_1d ?? 0) - (b.userData.coord_1d ?? 0),
    );

    const linePoints = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      linePoints.push(sorted[i].position, sorted[i + 1].position);
    }

    const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x6aa9ff,
      transparent: true,
      opacity: 0.35,
    });
    scene.add(new THREE.LineSegments(lineGeometry, lineMaterial));
  } catch (error) {
    console.error("Error al cargar los latentes:", error);
  }
}

function ensureInit() {
  if (initialized) return;
  initialized = true;

  const modal = document.getElementById("extra3Modal");
  const viewport = document.getElementById("extra3Viewport");

  const created = createScene({
    cameraPos: [0, 0, 180],
    background: 0x111111,
    far: 5000,
    container: viewport,
  });
  scene = created.scene;
  camera = created.camera;
  renderer = created.renderer;
  raycaster = created.raycaster;
  pointer = created.pointer;
  const controls = created.controls;

  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  scene.add(new THREE.AxesHelper(30));

  renderer.domElement.style.display = "block";
  renderer.domElement.addEventListener("click", onClick);

  startRenderLoop(renderer, scene, camera, controls, null, () => !modal.hidden);

  loadData();
}

export function initVisualizador() {
  document.getElementById("extra3Btn")?.addEventListener("click", ensureInit);
}
