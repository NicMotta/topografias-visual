import * as THREE from "three";
import { createScene, startRenderLoop } from "../../lib/three-setup.js";
import { getAllItems } from "../../lib/load-latents.js";
import { readImagePixels } from "../../lib/read-image-pixels.js";

const LAYER_COUNT = 5;
const DEFAULT_STRIDE = 58;
const HEIGHT_SCALE = 36;
const DEFAULT_THICKNESS = 13;
const LAYER_SIZE_STEP = 0.05;

let initialized = false;
let crustThickness = DEFAULT_THICKNESS;
let layerStride = DEFAULT_STRIDE;
const layers = [];

function applyLayout() {
  const n = layers.length;
  for (let i = 0; i < n; i++) {
    layers[i].group.position.y = (i - (n - 1) / 2) * layerStride;
    layers[i].group.scale.setScalar(1 - i * LAYER_SIZE_STEP);
  }
}

function buildSkirtGeometry(positions, topColors, targetW, targetH) {
  const loop = [];
  for (let x = 0; x < targetW; x++) loop.push(x);
  for (let y = 1; y < targetH; y++) loop.push(y * targetW + (targetW - 1));
  for (let x = targetW - 2; x >= 0; x--) loop.push((targetH - 1) * targetW + x);
  for (let y = targetH - 2; y >= 1; y--) loop.push(y * targetW);

  const vertCount = loop.length * 6;
  const posArr = new Float32Array(vertCount * 3);
  const colArr = new Float32Array(vertCount * 3);

  const baseY = -crustThickness;
  let p = 0;

  const pushVert = (vi, y, t) => {
    posArr[p * 3] = positions.getX(vi);
    posArr[p * 3 + 1] = y;
    posArr[p * 3 + 2] = positions.getZ(vi);

    const shade = 1 - t * 0.55;
    colArr[p * 3] = topColors[vi * 3] * shade;
    colArr[p * 3 + 1] = topColors[vi * 3 + 1] * shade;
    colArr[p * 3 + 2] = topColors[vi * 3 + 2] * shade;
    p++;
  };

  for (let k = 0; k < loop.length; k++) {
    const a = loop[k];
    const b = loop[(k + 1) % loop.length];
    pushVert(a, positions.getY(a), 0);
    pushVert(b, positions.getY(b), 0);
    pushVert(b, baseY, 1);
    pushVert(a, positions.getY(a), 0);
    pushVert(b, baseY, 1);
    pushVert(a, baseY, 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
  geometry.computeVertexNormals();

  return geometry;
}

function createHeightLayerFromImage(imageData) {
  const srcW = imageData.width;
  const srcH = imageData.height;
  const data = imageData.data;

  const targetW = 120;
  const targetH = Math.max(40, Math.round((srcH / srcW) * targetW));
  const depth = (140 * srcH) / srcW;

  const geometry = new THREE.PlaneGeometry(
    140,
    depth,
    targetW - 1,
    targetH - 1,
  );
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position;
  const colors = new Float32Array(targetW * targetH * 3);

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

      const vertexIndex = y * targetW + x;
      positions.setY(vertexIndex, luminance * HEIGHT_SCALE);

      colors[vertexIndex * 3] = r;
      colors[vertexIndex * 3 + 1] = g;
      colors[vertexIndex * 3 + 2] = b;
    }
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const top = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.04,
    }),
  );

  const skirtGeometry = buildSkirtGeometry(positions, colors, targetW, targetH);
  const skirt = new THREE.Mesh(
    skirtGeometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
  );

  let avgR = 0;
  let avgG = 0;
  let avgB = 0;
  const edgeCount = 2 * targetW + 2 * (targetH - 2);
  for (let x = 0; x < targetW; x++) {
    avgR += colors[x * 3] + colors[((targetH - 1) * targetW + x) * 3];
    avgG += colors[x * 3 + 1] + colors[((targetH - 1) * targetW + x) * 3 + 1];
    avgB += colors[x * 3 + 2] + colors[((targetH - 1) * targetW + x) * 3 + 2];
  }
  for (let y = 1; y < targetH - 1; y++) {
    avgR += colors[(y * targetW) * 3] + colors[(y * targetW + targetW - 1) * 3];
    avgG +=
      colors[(y * targetW) * 3 + 1] +
      colors[(y * targetW + targetW - 1) * 3 + 1];
    avgB +=
      colors[(y * targetW) * 3 + 2] +
      colors[(y * targetW + targetW - 1) * 3 + 2];
  }
  const baseColor = new THREE.Color(
    avgR / edgeCount,
    avgG / edgeCount,
    avgB / edgeCount,
  ).multiplyScalar(0.18);

  const baseGeometry = new THREE.PlaneGeometry(140, depth);
  baseGeometry.rotateX(Math.PI / 2);
  const base = new THREE.Mesh(
    baseGeometry,
    new THREE.MeshStandardMaterial({ color: baseColor, roughness: 1 }),
  );
  base.position.y = -crustThickness;

  const layer = new THREE.Group();
  layer.add(top, skirt, base);
  layers.push({
    group: layer,
    skirt,
    base,
    positions,
    topColors: colors,
    targetW,
    targetH,
  });
  return layer;
}

async function buildLayers(group, onLayerAdded) {
  try {
    const items = await getAllItems();
    const pool = [...items].sort(() => Math.random() - 0.5);
    const chosen = pool.slice(0, Math.min(LAYER_COUNT, pool.length));

    for (let i = 0; i < chosen.length; i++) {
      try {
        const imagePath = `${import.meta.env.BASE_URL}imagenes_generadas/${chosen[i].file}`;
        const imageData = await readImagePixels(imagePath);
        createHeightLayerFromImage(imageData);
      } catch (error) {
        console.error(`Error cargando la capa ${i}:`, error);
      }
    }
  } catch (error) {
    console.error("Error generando las capas:", error);
  } finally {
    document.getElementById("capasLoading")?.remove();
  }

  for (const layer of layers) group.add(layer.group);
  applyLayout();
  onLayerAdded?.();
}

function disposeLayers(group) {
  for (const layer of layers) {
    layer.group.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry.dispose();
        obj.material.dispose();
      }
    });
    group.remove(layer.group);
  }
  layers.length = 0;
}

function setThickness(value) {
  crustThickness = value;
  for (const layer of layers) {
    layer.skirt.geometry.dispose();
    layer.skirt.geometry = buildSkirtGeometry(
      layer.positions,
      layer.topColors,
      layer.targetW,
      layer.targetH,
    );
    layer.base.position.y = -crustThickness;
  }
  applyLayout();
}

function ensureInit() {
  if (initialized) return;
  initialized = true;

  const modal = document.getElementById("capasModal");
  const viewport = document.getElementById("capasViewport");

  const created = createScene({
    cameraPos: [0, 100, 280],
    background: 0x0e0e0e,
    far: 5000,
    controlsTarget: [0, 0, 0],
    container: viewport,
  });
  const { scene, camera, renderer, controls } = created;

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
  keyLight.position.set(90, 160, 120);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffe0c0, 0.35);
  fillLight.position.set(-90, 40, -110);
  scene.add(fillLight);

  const group = new THREE.Group();
  scene.add(group);

  renderer.domElement.style.display = "block";

  startRenderLoop(
    renderer,
    scene,
    camera,
    controls,
    null,
    () => !modal.hidden,
  );

  const thicknessInput = document.getElementById("capasThickness");
  const thicknessOut = document.getElementById("capasThicknessOut");
  const strideInput = document.getElementById("capasStride");
  const strideOut = document.getElementById("capasStrideOut");
  const togglesEl = document.getElementById("capasLayerToggles");

  const createToggles = () => {
    togglesEl.innerHTML = "";
    layers.forEach((layer, i) => {
      const btn = document.createElement("button");
      btn.className = "ghost seg-active";
      btn.textContent = `Capa ${i + 1}`;
      btn.addEventListener("click", () => {
        layer.group.visible = !layer.group.visible;
        btn.classList.toggle("seg-active", layer.group.visible);
      });
      togglesEl.appendChild(btn);
    });
  };

  const reloadBtn = document.getElementById("capasReloadBtn");
  const regenerate = async () => {
    reloadBtn.disabled = true;
    disposeLayers(group);
    await buildLayers(group, createToggles);
    reloadBtn.disabled = false;
  };
  reloadBtn.addEventListener("click", () => {
    regenerate();
  });

  thicknessInput.addEventListener("input", () => {
    thicknessOut.textContent = thicknessInput.value;
    setThickness(Number(thicknessInput.value));
  });

  strideInput.addEventListener("input", () => {
    layerStride = Number(strideInput.value);
    strideOut.textContent = strideInput.value;
    applyLayout();
  });

  buildLayers(group, createToggles);
}

export function initCapas() {
  document.getElementById("capasBtn")?.addEventListener("click", ensureInit);
}
