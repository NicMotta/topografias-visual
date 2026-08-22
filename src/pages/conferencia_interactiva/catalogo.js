import { fetchLatents } from "../../lib/load-latents.js";

let initialized = false;
let items = [];
let sorted = [];
let currentIndex = 0;

const slider = document.getElementById("catIndexSlider");
const mainImg = document.getElementById("catMainImg");
const mainMeta = document.getElementById("catMainMeta");
const spark = document.getElementById("catSpark");
const sparkMeta = document.getElementById("catSparkMeta");
const neighbors = document.getElementById("catNeighbors");
const neighborsMeta = document.getElementById("catNeighborsMeta");

async function ensureInit() {
  if (initialized) return;
  initialized = true;

  document
    .getElementById("catPrevBtn")
    ?.addEventListener("click", () => setIndex(Math.max(0, currentIndex - 1)));
  document.getElementById("catNextBtn")?.addEventListener("click", () =>
    setIndex(Math.min(sorted.length - 1, currentIndex + 1)),
  );
  document.getElementById("catRandomBtn")?.addEventListener("click", () => {
    setIndex(Math.floor(Math.random() * sorted.length));
  });
  slider?.addEventListener("input", (event) => {
    setIndex(Number(event.target.value));
  });

  try {
    const data = await fetchLatents();
    items = data.items || [];

    sorted = [...items].sort(
      (a, b) => Number(a.coord_1d) - Number(b.coord_1d),
    );

    if (slider) slider.max = String(Math.max(sorted.length - 1, 0));
    setIndex(Math.floor(sorted.length / 2));
  } catch (error) {
    console.error("Error al cargar el catálogo:", error);
    if (mainMeta) mainMeta.textContent = "Error cargando el catálogo.";
  }
}

function setIndex(index) {
  currentIndex = index;
  if (slider) slider.value = String(index);
  renderCurrent();
}

function renderCurrent() {
  if (!sorted.length) return;
  const item = sorted[currentIndex];

  if (mainImg) {
    mainImg.src = `${import.meta.env.BASE_URL}imagenes_generadas/${item.file}`;
  }

  const percentile = (
    (currentIndex / Math.max(sorted.length - 1, 1)) *
    100
  ).toFixed(1);

  if (mainMeta) {
    mainMeta.innerHTML = `
      <strong>${item.file}</strong><br>
      id: ${item.id}<br>
      índice ordenado: ${currentIndex + 1} / ${sorted.length}<br>
      percentil coord_1d: ${percentile}%<br>
      coord_1d: ${Number(item.coord_1d).toFixed(5)}<br>
      coord_3d: (${Number(item.coord_3d.x).toFixed(3)}, ${Number(item.coord_3d.y).toFixed(3)}, ${Number(item.coord_3d.z).toFixed(3)})
    `;
  }

  drawSparkline();
  renderNeighbors(item);
}

function drawSparkline() {
  if (!spark) return;
  const ctx = spark.getContext("2d");
  const w = spark.width;
  const h = spark.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#111523";
  ctx.fillRect(0, 0, w, h);

  const values = sorted.map((it) => Number(it.coord_1d));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1e-9);

  ctx.strokeStyle = "#5ca7ff";
  ctx.lineWidth = 1.6;
  ctx.beginPath();

  for (let i = 0; i < values.length; i++) {
    const x = (i / Math.max(values.length - 1, 1)) * (w - 20) + 10;
    const y = h - 10 - ((values[i] - min) / range) * (h - 20);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const cx =
    (currentIndex / Math.max(values.length - 1, 1)) * (w - 20) + 10;
  const cy = h - 10 - ((values[currentIndex] - min) / range) * (h - 20);

  ctx.fillStyle = "#ff4040";
  ctx.beginPath();
  ctx.arc(cx, cy, 4.3, 0, Math.PI * 2);
  ctx.fill();

  if (sparkMeta) {
    sparkMeta.textContent = `Rango coord_1d: min ${min.toFixed(4)} · max ${max.toFixed(4)} · punto actual en rojo`;
  }
}

function renderNeighbors(base) {
  if (!neighbors || !neighborsMeta) return;

  const bx = Number(base.coord_3d.x);
  const by = Number(base.coord_3d.y);
  const bz = Number(base.coord_3d.z);

  const list = items
    .filter((it) => it.file !== base.file)
    .map((it) => {
      const dx = Number(it.coord_3d.x) - bx;
      const dy = Number(it.coord_3d.y) - by;
      const dz = Number(it.coord_3d.z) - bz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return { item: it, d, delta1d: Number(it.coord_1d) - Number(base.coord_1d) };
    })
    .sort((a, b) => a.d - b.d)
    .slice(0, 8);

  neighborsMeta.innerHTML = `Base: <strong>${base.file}</strong> · distancia euclídea en coord_3d`;
  neighbors.innerHTML = "";

  for (const n of list) {
    const card = document.createElement("article");
    card.className = "cat-card";

    const img = document.createElement("img");
    img.src = `${import.meta.env.BASE_URL}imagenes_generadas/${n.item.file}`;
    img.alt = n.item.file;
    img.title = "Click para usar esta imagen como base";
    img.addEventListener("click", () => {
      const idx = sorted.findIndex((it) => it.file === n.item.file);
      if (idx >= 0) setIndex(idx);
    });

    const text = document.createElement("div");
    text.className = "cat-card-meta";
    text.innerHTML = `
      <strong>${n.item.file}</strong><br>
      dist: ${n.d.toFixed(4)}<br>
      Δcoord_1d: ${n.delta1d.toFixed(4)}
    `;

    card.appendChild(img);
    card.appendChild(text);
    neighbors.appendChild(card);
  }
}

export function initCatalogo() {
  document.getElementById("catalogoBtn")?.addEventListener("click", ensureInit);
}
