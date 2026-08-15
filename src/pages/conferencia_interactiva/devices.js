const $ = (id) => document.getElementById(id.replace("#", ""));

const DEFAULT_COLORS = ["#ff0000", "#00ff00", "#0000ff"];

function makeDevice(id, label, url) {
  return {
    id,
    label,
    url,
    socket: null,
    connected: false,
    connecting: false,
    shouldReconnect: false,
    retry: null,
    state: {
      colors: DEFAULT_COLORS,
      bpm: null,
      brightness: null,
      panic: false,
    },
  };
}

export const DEVICES = {
  claudia: makeDevice("claudia", "Claudia", "ws://claudia.local:81/"),
  cecilia: makeDevice("cecilia", "Cecilia", "ws://cecilia.local:81/"),
  nic: makeDevice("nic", "Nic", "ws://nic.local:81/"),
};

const listeners = [];
const messageListeners = [];

function emitUpdate() {
  for (const cb of listeners) cb();
}

export function onDeviceUpdate(cb) {
  listeners.push(cb);
}

export function onDeviceMessage(cb) {
  messageListeners.push(cb);
}

function sendTo(device, payload) {
  const d = DEVICES[device];
  if (!d || d.socket?.readyState !== WebSocket.OPEN) return false;
  d.socket.send(JSON.stringify(payload));
  return true;
}

function broadcast(payload) {
  for (const d of Object.values(DEVICES)) {
    if (d.socket?.readyState === WebSocket.OPEN) {
      d.socket.send(JSON.stringify(payload));
    }
  }
}

function setStatus(id, patch) {
  Object.assign(DEVICES[id], patch);
  emitUpdate();
}

function scheduleReconnect(id, delay) {
  const d = DEVICES[id];
  clearTimeout(d.retry);
  d.retry = setTimeout(() => connectDevice(id), delay);
}

export function connectDevice(id) {
  const d = DEVICES[id];
  if (!d || d.connected || d.connecting) return;

  d.shouldReconnect = true;
  d.connecting = true;
  emitUpdate();

  const socket = new WebSocket(d.url);
  d.socket = socket;

  socket.addEventListener("message", (event) => {
    for (const cb of messageListeners) cb(id, event.data);
  });

  socket.addEventListener("open", () => {
    d.socket = socket;
    setStatus(id, { connected: true, connecting: false });
    const s = d.state;
    sendTo(id, { type: "colors", colors: s.colors });
    if (s.bpm != null) sendTo(id, { type: "bpm", device: id, bpm: s.bpm });
    if (s.brightness != null) {
      sendTo(id, { type: "brightness", device: id, brightness: s.brightness });
    }
    if (s.panic) sendTo(id, { type: "panic", device: id, active: true });
  });

  socket.addEventListener("close", () => {
    if (d.socket === socket) d.socket = null;
    setStatus(id, { connected: false, connecting: false });
    if (d.shouldReconnect) scheduleReconnect(id, 3000);
  });

  socket.addEventListener("error", () => {});
}

export function disconnectDevice(id) {
  const d = DEVICES[id];
  if (!d) return;
  d.shouldReconnect = false;
  clearTimeout(d.retry);
  if (d.socket) {
    d.socket.close();
    d.socket = null;
  }
  setStatus(id, { connected: false, connecting: false });
}

export function connectAll() {
  for (const id of Object.keys(DEVICES)) connectDevice(id);
}

export function disconnectAll() {
  for (const id of Object.keys(DEVICES)) disconnectDevice(id);
}

export function sendColors(colors) {
  for (const d of Object.values(DEVICES)) d.state.colors = colors;
  broadcast({ type: "colors", colors });
  emitUpdate();
}

export function sendBpm(device, bpm) {
  const d = DEVICES[device];
  if (!d) return;
  d.state.bpm = bpm;
  sendTo(device, { type: "bpm", device, bpm });
  emitUpdate();
}

export function sendBrightness(device, brightness) {
  const d = DEVICES[device];
  if (!d) return;
  d.state.brightness = brightness;
  sendTo(device, { type: "brightness", device, brightness });
  emitUpdate();
}

export function sendPanic(device, active) {
  const d = DEVICES[device];
  if (!d) return;
  d.state.panic = active;
  sendTo(device, { type: "panic", device, active });
  emitUpdate();
}

export function sendBrightnessAll(brightness) {
  for (const id of Object.keys(DEVICES)) {
    DEVICES[id].state.brightness = brightness;
    sendTo(id, { type: "brightness", device: id, brightness });
  }
  emitUpdate();
}

export function sendPanicAll(active) {
  for (const id of Object.keys(DEVICES)) {
    DEVICES[id].state.panic = active;
    sendTo(id, { type: "panic", device: id, active });
  }
  emitUpdate();
}

function renderDashboard() {
  const dot = $("#devicesDot");
  dot.classList.toggle(
    "on",
    Object.values(DEVICES).every((d) => d.connected),
  );

  const swatchesEl = $("#dashColors");
  swatchesEl.innerHTML = "";
  for (const color of DEVICES.claudia.state.colors) {
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = color;
    swatchesEl.appendChild(swatch);
  }

  for (const id of Object.keys(DEVICES)) {
    const d = DEVICES[id];
    const el = document.querySelector(`.dash-device[data-device="${id}"]`);
    el.querySelector(".status-dot").classList.toggle("on", d.connected);

    const bpmEl = el.querySelector(".dash-bpm");
    bpmEl.textContent = d.state.bpm == null ? "—" : String(d.state.bpm);

    const brightEl = el.querySelector(".dash-brightness");
    brightEl.textContent =
      d.state.brightness == null ? "—" : String(d.state.brightness);

    const panicEl = el.querySelector(".dash-panic");
    panicEl.textContent = d.state.panic ? "SÍ" : "no";
    panicEl.classList.toggle("on", d.state.panic);
  }
}

function renderConfig() {
  const connectAllBtn = $("#devicesConnectAll");
  const anyConnected = Object.values(DEVICES).some((d) => d.connected);
  connectAllBtn.textContent = anyConnected ? "Desconectar todos" : "Conectar todos";
  connectAllBtn.classList.toggle("danger", anyConnected);

  const colors = DEVICES.claudia.state.colors;
  for (let i = 0; i < 3; i++) {
    const el = $(`devColor${i}`);
    if (colors[i] && el.value !== colors[i]) el.value = colors[i];
  }

  const brightness = DEVICES.claudia.state.brightness;
  if (brightness != null) {
    const range = document.querySelector(".brightness-range");
    if (range.value !== String(brightness)) range.value = brightness;
    document.querySelector(".brightness-output").textContent = brightness;
  }

  const panicBtn = document.querySelector(".panic-btn");
  const anyPanic = Object.values(DEVICES).some((d) => d.state.panic);
  panicBtn.classList.toggle("danger", anyPanic);
  panicBtn.textContent = anyPanic ? "Desactivar pánico" : "Pánico";
}

export function initDevices() {
  $("#devicesConnectAll").addEventListener("click", () => {
    const anyConnected = Object.values(DEVICES).some((d) => d.connected);
    if (anyConnected) disconnectAll();
    else connectAll();
  });

  const brightRange = document.querySelector(".brightness-range");
  brightRange.addEventListener("input", () => {
    document.querySelector(".brightness-output").textContent = brightRange.value;
  });
  brightRange.addEventListener("change", () => {
    sendBrightnessAll(Number(brightRange.value));
  });

  document.querySelector(".panic-btn").addEventListener("click", () => {
    const anyPanic = Object.values(DEVICES).some((d) => d.state.panic);
    sendPanicAll(!anyPanic);
  });

  const colorInputs = ["devColor0", "devColor1", "devColor2"].map((name) =>
    $(name),
  );
  const readColors = () => colorInputs.map((el) => el.value);
  for (const el of colorInputs) {
    el.addEventListener("input", () => sendColors(readColors()));
  }

  onDeviceUpdate(renderConfig);
  onDeviceUpdate(renderDashboard);
  renderConfig();
  renderDashboard();
}
