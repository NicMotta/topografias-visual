import "../../styles/base.css";
import {
  DEVICES,
  connectAll,
  disconnectAll,
  connectDevice,
  disconnectDevice,
  sendBpm,
  sendBrightness,
  sendPanic,
  sendColors,
  onDeviceUpdate,
  onDeviceMessage,
} from "../conferencia_interactiva/devices.js";
import { extractPalette } from "../conferencia_interactiva/palette.js";
import { getRandomItem } from "../../lib/load-latents.js";
import { readImagePixels } from "../../lib/read-image-pixels.js";

const $ = (id) => document.getElementById(id.replace("#", ""));
const devicePanel = (id) => document.querySelector(`.device[data-device="${id}"]`);
const logEl = $("#log");

function log(message, type = "") {
  const time = new Date().toLocaleTimeString("es-AR", { hour12: false });
  const line = document.createElement("div");
  line.className = type ? `line ${type}` : "line";
  line.textContent = `[${time}] ${message}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

const prev = {};
for (const id of Object.keys(DEVICES)) {
  prev[id] = { connected: false, connecting: false };
}

function updateUI() {
  let anyConnected = false;
  for (const id of Object.keys(DEVICES)) {
    const d = DEVICES[id];
    const el = devicePanel(id);
    const stateEl = el.querySelector(".state");
    stateEl.textContent = d.connected
      ? "Conectado"
      : d.connecting
        ? "Conectando…"
        : "Desconectado";
    stateEl.classList.toggle("ok", d.connected);
    stateEl.classList.toggle("err", d.connecting);
    el.querySelector(".connect").disabled = d.connected || d.connecting;
    el.querySelector(".disconnect").disabled = !d.connected;

    const panicBtn = el.querySelector(".panic");
    panicBtn.textContent = d.state.panic ? "Pánico OFF" : "Pánico ON";
    panicBtn.classList.toggle("on", d.state.panic);

    if (d.connected) anyConnected = true;
  }

  const allState = $("#allState");
  allState.textContent = anyConnected ? "Conectado" : "Desconectado";
  allState.classList.toggle("ok", anyConnected);
  $("#disconnectAll").disabled = !anyConnected;
}

onDeviceUpdate(() => {
  for (const id of Object.keys(DEVICES)) {
    const d = DEVICES[id];
    const p = prev[id];
    if (d.connecting && !p.connecting) {
      log(`${d.label}: conectando…`, "info");
    }
    if (d.connected && !p.connected) {
      log(`${d.label}: conectado a ${d.url}`, "ok");
    }
    if (!d.connected && p.connected) {
      log(`${d.label}: desconectado`, "err");
    }
    p.connecting = d.connecting;
    p.connected = d.connected;
  }
  updateUI();
});

onDeviceMessage((id, data) => {
  log(`${DEVICES[id].label} → recibido: ${data}`, "in");
});

$("#connectAll").addEventListener("click", () => {
  connectAll();
  log("Conectando todos…", "info");
});

$("#disconnectAll").addEventListener("click", () => {
  disconnectAll();
  log("Desconectando todos…", "info");
});

$("#clearLog").addEventListener("click", () => {
  logEl.innerHTML = "";
});

for (const id of Object.keys(DEVICES)) {
  const el = devicePanel(id);
  const label = DEVICES[id].label;

  el.querySelector(".connect").addEventListener("click", () => connectDevice(id));
  el.querySelector(".disconnect").addEventListener("click", () =>
    disconnectDevice(id),
  );

  const bpmRange = el.querySelector(".bpm-range");
  const bpmOut = el.querySelector(".bpm-out");
  bpmRange.addEventListener("input", () => {
    bpmOut.value = bpmRange.value;
  });
  bpmRange.addEventListener("change", () => {
    sendBpm(id, Number(bpmRange.value));
    log(
      `${label} → enviado: ${JSON.stringify({ type: "bpm", device: id, bpm: Number(bpmRange.value) })}`,
      "out",
    );
  });
  for (const btn of el.querySelectorAll(".presets [data-bpm]")) {
    btn.addEventListener("click", () => {
      const value = Number(btn.dataset.bpm);
      bpmRange.value = value;
      bpmOut.value = value;
      sendBpm(id, value);
      log(
        `${label} → enviado: ${JSON.stringify({ type: "bpm", device: id, bpm: value })}`,
        "out",
      );
    });
  }

  const brightRange = el.querySelector(".bright-range");
  const brightOut = el.querySelector(".bright-out");
  brightRange.addEventListener("input", () => {
    brightOut.value = brightRange.value;
  });
  brightRange.addEventListener("change", () => {
    const value = Number(brightRange.value);
    sendBrightness(id, value);
    log(
      `${label} → enviado: ${JSON.stringify({ type: "brightness", device: id, brightness: value })}`,
      "out",
    );
  });

  el.querySelector(".panic").addEventListener("click", () => {
    const next = !DEVICES[id].state.panic;
    sendPanic(id, next);
    log(
      `${label} → enviado: ${JSON.stringify({ type: "panic", device: id, active: next })}`,
      "out",
    );
  });
}

const preview = $("#preview");
const meta = $("#meta");
const swatchesEl = $("#swatches");

async function loadRandomImage() {
  try {
    meta.textContent = "Cargando…";
    const item = await getRandomItem();
    if (!item) {
      meta.textContent = "No hay items en latents.json";
      return;
    }

    const imagePath = `${import.meta.env.BASE_URL}imagenes_generadas/${item.file}`;
    const imageData = await readImagePixels(imagePath);
    preview.src = imagePath;
    const palette = extractPalette(imageData, 3);
    sendColors(palette);

    swatchesEl.innerHTML = "";
    for (const color of palette) {
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = color;
      swatch.title = color;
      swatchesEl.appendChild(swatch);
    }
    meta.textContent =
      `${item.file} · ${imageData.width}x${imageData.height}` +
      ` · coord_1d ${item.coord_1d != null ? item.coord_1d.toFixed(3) : "-"}`;

    log(
      `Imagen ${item.file} → colores: ${palette.join(" · ")}`,
      "info",
    );
  } catch (error) {
    console.error(error);
    meta.textContent = "Error al cargar la imagen";
    log(`Error al cargar imagen: ${error.message}`, "err");
  }
}

$("#randomBtn").addEventListener("click", loadRandomImage);

updateUI();
loadRandomImage();
