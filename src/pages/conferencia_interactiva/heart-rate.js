import { sendBpm, setSyncColors } from "./devices.js";

const WINDOW_MS = 60_000;
const SYNC_ENTER_MS = 1200;
const SYNC_EXIT_MS = 2000;
const HEART_RATE_SERVICE = "heart_rate";
const HEART_RATE_MEASUREMENT = "heart_rate_measurement";
const BATTERY_SERVICE = "battery_service";
const BATTERY_LEVEL = "battery_level";

function makeSensor(id, label) {
  return {
    id,
    label,
    device: null,
    connecting: false,
    connected: false,
    battery: null,
    lastBpm: null,
    contactDetected: true,
    history: [],
    interval: 900,
    beatAt: 0,
  };
}

export const SENSORS = {
  claudia: makeSensor("claudia", "Claudia"),
  cecilia: makeSensor("cecilia", "Cecilia"),
};

const panel = (id) => document.querySelector(`.sensor-panel[data-sensor="${id}"]`);
const config = (id) => document.querySelector(`.config[data-sensor="${id}"]`);

let synced = false;
let matchAt = null;
let mismatchAt = null;
let emulatedSync = null;

export function isSynced() {
  return synced;
}

export function toggleEmulatedSync() {
  emulatedSync = emulatedSync === null ? !synced : null;
  console.log(
    emulatedSync === null
      ? "[sync] emulación desactivada"
      : `[sync] emulación activada (${emulatedSync ? "SÍ" : "no"})`,
  );
  evaluateSync(performance.now());
}

function bpmMatched() {
  const values = Object.values(SENSORS)
    .filter((s) => s.connected && s.lastBpm != null && s.lastBpm > 0)
    .map((s) => s.lastBpm);
  return values.length > 1 && new Set(values).size === 1;
}

function evaluateSync(now) {
  if (emulatedSync !== null) {
    setSynced(emulatedSync);
    return;
  }
  const matched = bpmMatched();
  if (!synced) {
    if (matched) {
      matchAt = matchAt ?? now;
      if (now - matchAt >= SYNC_ENTER_MS) setSynced(true);
    } else {
      matchAt = null;
    }
  } else if (!matched) {
    mismatchAt = mismatchAt ?? now;
    if (now - mismatchAt >= SYNC_EXIT_MS) setSynced(false);
  } else {
    mismatchAt = null;
  }
}

function positionSyncBeam() {
  const line = document.getElementById("syncBeamPath");
  const badge = document.getElementById("syncBadge");
  const a = panel("claudia");
  const b = panel("cecilia");
  if (!line || !a || !b) return;
  const ra = a.getBoundingClientRect();
  const rb = b.getBoundingClientRect();
  const x1 = ra.left + ra.width / 2;
  const y1 = ra.top + ra.height / 2;
  const x2 = rb.left + rb.width / 2;
  const y2 = rb.top + rb.height / 2;
  line.setAttribute("d", `M${x1} ${y1} L${x2} ${y2}`);
  if (badge) {
    badge.style.setProperty("--bx", `${(x1 + x2) / 2}px`);
    badge.style.setProperty("--by", `${(y1 + y2) / 2}px`);
  }
}

function setSynced(value) {
  if (synced === value) return;
  synced = value;
  matchAt = null;
  mismatchAt = null;
  document.body.classList.toggle("sync", value);
  setSyncColors(value);
  positionSyncBeam();
  const beam = document.getElementById("syncBeam");
  if (beam) beam.classList.toggle("active", value);
  const badge = document.getElementById("syncBadge");
  if (badge) badge.hidden = !value;
}

export function isBluetoothAvailable() {
  return "bluetooth" in navigator;
}

function parseHeartRate(value) {
  const view = ArrayBuffer.isView(value) ? value : new DataView(value);
  const flags = view.getUint8(0);
  const rate16Bits = Boolean(flags & 0x1);
  const contactDetected = Boolean(flags & 0x4);
  const energyPresent = Boolean(flags & 0x8);
  const rrPresent = Boolean(flags & 0x10);

  let offset = 1;
  let bpm;
  if (rate16Bits) {
    bpm = view.getUint16(offset, true);
    offset += 2;
  } else {
    bpm = view.getUint8(offset);
    offset += 1;
  }
  if (energyPresent) offset += 2;

  const rrIntervals = [];
  if (rrPresent) {
    for (; offset + 2 <= view.byteLength; offset += 2) {
      rrIntervals.push(view.getUint16(offset, true));
    }
  }

  return { bpm, contactDetected, rrIntervals };
}

function onHeartRate(id, event) {
  const s = SENSORS[id];
  const { bpm, contactDetected, rrIntervals } = parseHeartRate(event.target.value);
  if (!bpm || bpm <= 0) return;

  const now = performance.now();
  s.lastBpm = bpm;
  s.contactDetected = contactDetected;
  s.history.push({ t: now, bpm });
  const oldest = now - WINDOW_MS;
  while (s.history.length && s.history[0].t < oldest) {
    s.history.shift();
  }

  s.interval = Math.max(
    250,
    rrIntervals.length ? rrIntervals[rrIntervals.length - 1] : 60000 / bpm,
  );
  s.beatAt = now + s.interval;

  sendBpm(id, bpm);
  updateUI(id);
  evaluateSync(now);
}

function onDisconnected(id) {
  const s = SENSORS[id];
  s.device = null;
  s.connecting = false;
  s.connected = false;
  s.battery = null;
  s.lastBpm = null;
  s.history = [];
  s.beatAt = 0;
  updateUI(id);
  evaluateSync(performance.now());
}

export function disconnectSensor(id) {
  const s = SENSORS[id];
  if (s.device?.gatt.connected) {
    s.device.gatt.disconnect();
  }
  onDisconnected(id);
}

export async function connectSensor(id) {
  const s = SENSORS[id];
  if (s.connecting || s.connected) return;

  s.connecting = true;
  updateUI(id);
  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [HEART_RATE_SERVICE] }],
    });

    const other = Object.values(SENSORS).find(
      (candidate) =>
        candidate !== s && candidate.device && candidate.device.id === device.id,
    );
    if (other) {
      s.connecting = false;
      updateUI(id);
      config(id).querySelector(".conn-state").textContent = `Ocupado por ${other.label}`;
      return;
    }

    s.device = device;
    s.device.addEventListener("gattserverdisconnected", () => onDisconnected(id));

    const server = await s.device.gatt.connect();
    const service = await server.getPrimaryService(HEART_RATE_SERVICE);
    const characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT);
    characteristic.addEventListener("characteristicvaluechanged", (event) =>
      onHeartRate(id, event),
    );
    await characteristic.startNotifications();

    let battery = null;
    try {
      const batteryService = await server.getPrimaryService(BATTERY_SERVICE);
      const batteryCharacteristic = await batteryService.getCharacteristic(BATTERY_LEVEL);
      battery = (await batteryCharacteristic.readValue()).getUint8(0);
    } catch {}

    s.battery = battery;
    s.connected = true;
    s.connecting = false;
    s.history = [];
    updateUI(id);
  } catch (err) {
    s.connecting = false;
    s.device = null;
    s.connected = false;
    updateUI(id);
    if (
      err?.name !== "NotFoundError" &&
      err?.name !== "SecurityError" &&
      err?.name !== "NotAllowedError"
    ) {
      console.error("Error al conectar:", err);
      config(id).querySelector(".conn-state").textContent = "Error de conexión";
    }
  }
}

function drawChart(id) {
  const s = SENSORS[id];
  const canvas = panel(id).querySelector(".chart");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;

  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw) canvas.width = pw;
  if (canvas.height !== ph) canvas.height = ph;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!s.history.length) return;

  const now = performance.now();
  const oldest = now - WINDOW_MS;
  const MIN = 40;
  const MAX = 220;
  const yFor = (bpm) => h - ((bpm - MIN) / (MAX - MIN)) * h;

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, yFor(120));
  ctx.lineTo(w, yFor(120));
  ctx.stroke();

  ctx.strokeStyle = "#e8e8e8";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  let started = false;
  for (const p of s.history) {
    if (p.t < oldest) continue;
    const x = ((p.t - oldest) / WINDOW_MS) * w;
    const y = yFor(p.bpm);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

function updateUI(id) {
  const s = SENSORS[id];

  const p = panel(id);
  const bpmEl = p.querySelector(".bpm");
  bpmEl.textContent = s.connected && s.lastBpm ? String(s.lastBpm) : "—";
  bpmEl.classList.toggle("no-contact", s.connected && !s.contactDetected);
  p.querySelector(".status-dot").classList.toggle("on", s.connected);
  p.style.setProperty("--beat-duration", `${s.interval / 1000}s`);

  const c = config(id);
  c.querySelector(".connect").disabled = s.connecting || s.connected;
  c.querySelector(".disconnect").disabled = !s.connected;
  const stateEl = c.querySelector(".conn-state");
  if (s.connecting) {
    stateEl.textContent = "Buscando…";
  } else if (s.connected) {
    stateEl.textContent =
      s.battery == null ? "Conectado" : `Conectado · ${s.battery}%`;
  } else {
    stateEl.textContent = "Desconectado";
  }

  drawChart(id);
}

function pulse(now) {
  for (const s of Object.values(SENSORS)) {
    if (s.beatAt && now >= s.beatAt) {
      s.beatAt = now + s.interval;
      panel(s.id).querySelector(".heart-glow").classList.add("active");
    }
  }
  requestAnimationFrame(pulse);
}

export function initHeartRate() {
  if (!isBluetoothAvailable()) {
    for (const id of Object.keys(SENSORS)) {
      config(id).querySelector(".connect").disabled = true;
      config(id).querySelector(".connect").textContent = "No disponible";
    }
  }

  for (const id of Object.keys(SENSORS)) {
    panel(id)
      .querySelector(".heart-glow")
      .addEventListener("animationend", (event) => {
        event.currentTarget.classList.remove("active");
      });
    drawChart(id);
  }

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (event.key.toLowerCase() !== "p") return;
    if (event.target.matches("input, select, textarea")) return;
    toggleEmulatedSync();
  });

  window.addEventListener("resize", () => {
    for (const id of Object.keys(SENSORS)) drawChart(id);
    positionSyncBeam();
  });

  positionSyncBeam();
  requestAnimationFrame(pulse);
}
