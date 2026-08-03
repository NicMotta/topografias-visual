import "../../styles/base.css";

const $ = (id) => document.getElementById(id.replace("#", ""));

const gamepadSelect = $("#gamepadSelect");
const statusEl = $("#status");
const light = $("#light");
const eventName = $("#eventName");
const eventSub = $("#eventSub");
const historyEl = $("#history");
const mapButtonsEl = $("#mapButtons");
const mapAxesEl = $("#mapAxes");

let selectedIndex = null;
let lastEventAt = 0;
const lastButtons = {};
const lastAxes = {};

const AXIS_DEADZONE = 0.03;

const STANDARD_BUTTONS = [
  "A",
  "B",
  "X",
  "Y",
  "LB",
  "RB",
  "LT",
  "RT",
  "Atrás",
  "Inicio",
  "Stick Izq",
  "Stick Der",
  "Arriba",
  "Abajo",
  "Izquierda",
  "Derecha",
  "Home",
];

const STANDARD_AXES = {
  0: "Eje X izq",
  1: "Eje Y izq",
  2: "Eje X der",
  3: "Eje Y der",
  4: "Gatillo izq",
  5: "Gatillo der",
};

function getGamepads() {
  if (!navigator.getGamepads) return [];
  return [...navigator.getGamepads()].filter(Boolean);
}

function shortName(pad) {
  return (pad.id || "").split(" (")[0] || `Joystick ${pad.index}`;
}

function buttonLabel(index, pad) {
  if (pad.mapping === "standard" && STANDARD_BUTTONS[index] != null) {
    return { name: `Botón ${index}`, sub: STANDARD_BUTTONS[index] };
  }
  return { name: `Botón ${index}`, sub: "botón" };
}

function axisLabel(index, pad) {
  const standard = pad.mapping === "standard" && STANDARD_AXES[index] != null;
  return {
    name: `Eje ${index}`,
    sub: standard ? STANDARD_AXES[index] : "eje",
  };
}

function populate() {
  const pads = getGamepads();
  console.info(
    "[joystick-test] gamepads:",
    pads.map((p) => ({
      name: p.id,
      index: p.index,
      mapping: p.mapping,
      buttons: p.buttons.length,
      axes: p.axes.length,
    })),
  );

  const prev = gamepadSelect.value;
  gamepadSelect.innerHTML = '<option value="">Seleccionar joystick…</option>';
  for (const pad of pads) {
    const opt = document.createElement("option");
    opt.value = String(pad.index);
    opt.textContent = `${shortName(pad)} [${pad.index}]`;
    gamepadSelect.appendChild(opt);
  }
  gamepadSelect.disabled = pads.length === 0;

  if ([...gamepadSelect.options].some((o) => o.value === prev)) {
    gamepadSelect.value = prev;
  } else {
    gamepadSelect.value = "";
  }

  if (selectedIndex != null && !pads.some((p) => p.index === selectedIndex)) {
    selectedIndex = null;
    clearMap();
  }

  statusEl.textContent = pads.length
    ? "Seleccioná un joystick"
    : "Apretá un botón del joystick para que se detecte";
}

function clearMap() {
  mapButtonsEl.innerHTML = "";
  mapAxesEl.innerHTML = "";
}

function buildMap(pad) {
  clearMap();
  for (let i = 0; i < pad.buttons.length; i++) {
    const label = buttonLabel(i, pad);
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.dataset.index = String(i);
    chip.innerHTML =
      `<span class="chip-idx">${i}</span>` +
      `<span class="chip-name">${label.sub}</span>`;
    mapButtonsEl.appendChild(chip);
  }
  for (let i = 0; i < pad.axes.length; i++) {
    const label = axisLabel(i, pad);
    const row = document.createElement("div");
    row.className = "axis-row";
    row.dataset.index = String(i);
    row.innerHTML =
      `<span class="chip-idx">${i}</span>` +
      `<span class="chip-name">${label.sub}</span>` +
      `<div class="axis-track"><div class="axis-fill"></div></div>` +
      `<span class="axis-val">0.00</span>`;
    mapAxesEl.appendChild(row);
  }
}

function updateMap(pad) {
  const chips = mapButtonsEl.querySelectorAll(".chip");
  for (const chip of chips) {
    const btn = pad.buttons[Number(chip.dataset.index)];
    if (!btn) continue;
    chip.classList.toggle("on", btn.pressed);
    chip.style.opacity = String(0.35 + 0.65 * Math.min(1, btn.value));
  }

  const rows = mapAxesEl.querySelectorAll(".axis-row");
  for (const row of rows) {
    const i = Number(row.dataset.index);
    const v = pad.axes[i];
    if (v == null) continue;
    const fill = row.querySelector(".axis-fill");
    fill.style.width = `${Math.min(100, Math.max(0, ((v + 1) / 2) * 100))}%`;
    row.querySelector(".axis-val").textContent = v.toFixed(2);
    row.classList.toggle("on", Math.abs(v) > AXIS_DEADZONE);
  }
}

function addHistory(name, sub) {
  const last = historyEl.firstElementChild;
  if (last && last.dataset.name === name) {
    last.querySelector(".h-sub").textContent = sub;
    return;
  }
  const li = document.createElement("li");
  li.dataset.name = name;
  li.innerHTML = `<span class="h-name">${name}</span><span class="h-sub">${sub}</span>`;
  historyEl.prepend(li);
  while (historyEl.children.length > 20) {
    historyEl.lastChild.remove();
  }
}

function fire(name, sub) {
  lastEventAt = performance.now();
  eventName.textContent = name;
  eventSub.textContent = sub;
  addHistory(name, sub);
}

/* ---------------------------------------------------------------------- */
/* Panel de diagnóstico crudo                                              */
/* Muestra en vivo TODOS los botones y ejes tal cual los reporta el        */
/* navegador, sin ninguna traducción/etiqueta. Sirve para identificar en   */
/* qué índice cae cada botón que "no se detecta" (izquierda/derecha,       */
/* L2/R2, etc.) en controles con mapeo no estándar.                        */
/* ---------------------------------------------------------------------- */
let debugPanel = null;
let debugPre = null;
let debugVisible = true;

function ensureDebugPanel() {
  if (debugPanel) return;

  debugPanel = document.createElement("div");
  debugPanel.style.cssText = `
    position: fixed;
    bottom: 10px;
    right: 10px;
    max-width: 420px;
    max-height: 60vh;
    overflow: auto;
    background: rgba(10, 10, 10, 0.92);
    color: #6f6;
    font: 12px/1.4 monospace;
    padding: 10px 12px;
    border-radius: 8px;
    z-index: 99999;
    white-space: pre;
    border: 1px solid #333;
  `;

  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;color:#fff;font-weight:bold;";
  header.innerHTML = `<span>Diagnóstico crudo (botones/ejes)</span>`;

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "ocultar";
  closeBtn.style.cssText =
    "background:#333;color:#fff;border:none;padding:2px 8px;border-radius:4px;cursor:pointer;font:11px monospace;";
  closeBtn.addEventListener("click", () => {
    debugVisible = !debugVisible;
    debugPre.style.display = debugVisible ? "block" : "none";
    closeBtn.textContent = debugVisible ? "ocultar" : "mostrar";
  });
  header.appendChild(closeBtn);

  debugPre = document.createElement("div");

  debugPanel.appendChild(header);
  debugPanel.appendChild(debugPre);
  document.body.appendChild(debugPanel);
}

function updateDebugPanel(pad) {
  ensureDebugPanel();
  if (!debugVisible) return;

  if (!pad) {
    debugPre.textContent = "Sin joystick seleccionado.";
    return;
  }

  const btnLines = pad.buttons
    .map((b, i) => {
      const mark = b.pressed ? "●" : "○";
      return `B${i}:${mark}${b.value.toFixed(2)}`;
    })
    .join("  ");

  const axLines = pad.axes.map((v, i) => `A${i}:${v.toFixed(2)}`).join("  ");

  debugPre.textContent =
    `mapping: ${pad.mapping || "(sin mapeo estándar)"}\n\n` +
    `Botones:\n${btnLines}\n\n` +
    `Ejes:\n${axLines}`;
}

function poll() {
  const pads = getGamepads();
  const pad = pads.find((p) => p.index === selectedIndex) || null;

  if (pad) {
    pad.buttons.forEach((btn, i) => {
      const wasPressed = Boolean(lastButtons[i]);
      if (btn.pressed && !wasPressed) {
        const label = buttonLabel(i, pad);
        fire(label.name, label.sub);
      }
      lastButtons[i] = btn.pressed;
    });

    pad.axes.forEach((value, i) => {
      const prev = lastAxes[i] ?? value;
      if (Math.abs(value - prev) > AXIS_DEADZONE) {
        lastAxes[i] = value;
        const label = axisLabel(i, pad);
        fire(label.name, `${label.sub} · ${value.toFixed(2)}`);
      }
    });

    updateMap(pad);
  }

  updateDebugPanel(pad);

  requestAnimationFrame(poll);
}

function tick() {
  const age = performance.now() - lastEventAt;
  const lit = age < 500;
  light.classList.toggle("on", lit);
  if (lit) {
    const intensity = 0.25 + 0.75 * Math.max(0, 1 - age / 500);
    light.style.opacity = String(intensity);
  } else {
    light.style.opacity = "";
  }
  requestAnimationFrame(tick);
}

gamepadSelect.addEventListener("change", () => {
  selectedIndex =
    gamepadSelect.value === "" ? null : Number(gamepadSelect.value);

  for (const k of Object.keys(lastButtons)) delete lastButtons[k];
  for (const k of Object.keys(lastAxes)) delete lastAxes[k];

  if (selectedIndex == null) {
    clearMap();
    statusEl.textContent = "Seleccioná un joystick";
    return;
  }
  const pad = getGamepads().find((p) => p.index === selectedIndex);
  if (pad) {
    buildMap(pad);
    statusEl.textContent = `▶ Escuchando · ${pad.mapping || "sin mapeo"}`;
  }
});

$("#rescanBtn").addEventListener("click", populate);

window.addEventListener("gamepadconnected", populate);
window.addEventListener("gamepaddisconnected", populate);

populate();
requestAnimationFrame(poll);
requestAnimationFrame(tick);
