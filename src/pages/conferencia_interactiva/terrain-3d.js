import * as THREE from "three";
import { createScene, startRenderLoop } from "../../lib/three-setup.js";
import { getRandomItem } from "../../lib/load-latents.js";
import { readImagePixels } from "../../lib/read-image-pixels.js";
import { extractPalette } from "./palette.js";
import { sendColors } from "./devices.js";
import { SENSORS } from "./heart-rate.js";

const MIN_BPM = 40;
const MAX_BPM = 200;

const hudPreview = document.getElementById("hudPreview");
const hudMeta = document.getElementById("hudMeta");
const fadeOverlay = document.getElementById("fadeOverlay");

const FADE_MS = 650;
let fadeTimer = null;

function fade(toBlack) {
  return new Promise((resolve) => {
    fadeOverlay.classList.toggle("on", toBlack);
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(resolve, FADE_MS);
  });
}

let mesh = null;
let group = null;
let camera = null;
let controls = null;
const clock = new THREE.Clock();

export function getView() {
  return { camera, controls };
}

export function loadRandomMap() {
  return buildRandomMap();
}

export function resetView() {
  if (camera && controls) {
    camera.position.set(0, 110, 180);
    controls.target.set(0, 0, 0);
    camera.lookAt(controls.target);
  }
  if (mesh) mesh.material.wireframe = false;
  if (group) {
    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0);
    group.scale.set(1, 0.7, 1);
  }
}

function normalize(bpm) {
  if (!bpm || bpm <= 0) return 0;
  return Math.max(0, Math.min(1, (bpm - MIN_BPM) / (MAX_BPM - MIN_BPM)));
}

function createHeightMeshFromImage(imageData) {
  const srcW = imageData.width;
  const srcH = imageData.height;
  const data = imageData.data;

  const targetW = 120;
  const targetH = Math.max(40, Math.round((srcH / srcW) * targetW));

  const geometry = new THREE.PlaneGeometry(
    140,
    (140 * srcH) / srcW,
    targetW - 1,
    targetH - 1,
  );
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position;
  const colors = new Float32Array(targetW * targetH * 3);
  const heightScale = 42;

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const u = x / (targetW - 1);
      const v = y / (targetH - 1);

      const ix = Math.min(srcW - 1, Math.floor(u * (srcW - 1)));
      const iy = Math.min(srcH - 1, Math.floor(v * (srcH - 1)));
      const idx = (iy * srcW + ix) * 4;

      const r = data[idx] / 255;
      const g = data[idx + 1] / 255;
      const b = data[idx + 2] / 255;
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const h = luminance * heightScale;

      const vertexIndex = y * targetW + x;
      positions.setY(vertexIndex, h);

      colors[vertexIndex * 3] = r;
      colors[vertexIndex * 3 + 1] = g;
      colors[vertexIndex * 3 + 2] = b;
    }
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.06,
    side: THREE.DoubleSide,
    flatShading: false,
  });

  const newMesh = new THREE.Mesh(geometry, material);
  newMesh.position.y = -18;
  newMesh.userData = { sampleW: targetW, sampleH: targetH, heightScale };

  return newMesh;
}

async function buildRandomMap() {
  try {
    await fade(true);

    const item = await getRandomItem();
    if (!item) return;

    const imagePath = `${import.meta.env.BASE_URL}imagenes_generadas/${item.file}`;
    const imageData = await readImagePixels(imagePath);
    const newMesh = createHeightMeshFromImage(imageData);

    if (mesh) {
      group.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }

    mesh = newMesh;
    group.add(mesh);

    if (hudPreview) hudPreview.src = imagePath;

    const palette = extractPalette(imageData, 3);
    sendColors(palette);

    if (hudMeta) {
      hudMeta.innerHTML = `
        <strong>${item.file}</strong><br>
        resolución: ${imageData.width} x ${imageData.height}<br>
        muestras usadas: ${newMesh.userData.sampleW} x ${newMesh.userData.sampleH}<br>
        escala altura: ${newMesh.userData.heightScale}<br>
        coord_1d: ${item.coord_1d != null ? item.coord_1d.toFixed(3) : "-"}<br>
        colores: ${palette.join(" · ")}
      `;
    }

    await fade(false);
  } catch (error) {
    fade(false);
    console.error("Error al generar el mapa 3D:", error);
  }
}

function beforeRender() {
  const delta = Math.min(clock.getDelta(), 0.05);
  if (!group || !mesh) return;

  const claudia = normalize(SENSORS.claudia.lastBpm);
  const cecilia = normalize(SENSORS.cecilia.lastBpm);

  const targetScale = 0.7 + cecilia * 1.3;
  group.scale.y += (targetScale - group.scale.y) * 0.08;
}

export function initTerrain() {
  const created = createScene({
    cameraPos: [0, 110, 180],
    background: 0x0e0e0e,
    far: 5000,
    controlsTarget: [0, 0, 0],
  });
  const { scene, renderer } = created;
  camera = created.camera;
  controls = created.controls;

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
  keyLight.position.set(90, 160, 120);
  scene.add(keyLight);

  group = new THREE.Group();
  group.scale.y = 0.7;
  scene.add(group);

  renderer.domElement.style.position = "fixed";
  renderer.domElement.style.inset = "0";
  renderer.domElement.style.zIndex = "0";

  document.getElementById("hudRandomBtn")?.addEventListener("click", () => {
    loadRandomMap();
  });

  startRenderLoop(renderer, scene, camera, controls, beforeRender);
  buildRandomMap();
}
