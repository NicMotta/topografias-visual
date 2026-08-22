import { THREE } from "../../lib/three-setup.js";
import { getView, resetView } from "./terrain-3d.js";

const $ = (id) => document.getElementById(id.replace("#", ""));

const padSelect = $("#jsPadSelect");
const stateEl = $("#jsState");
const lastEventEl = $("#jsLastEvent");

const ROTATE_X_AXIS = 0;
const ROTATE_Y_AXIS = 1;
const ZOOM_IN_BTN = 7;
const ZOOM_OUT_BTN = 6;
const ZOOM_IN_DPAD = 12;
const ZOOM_OUT_DPAD = 13;
const RESET_BTN = 4;
const PAN_LEFT_BTN = 2;
const PAN_RIGHT_BTN = 0;
const PAN_UP_BTN = 9;
const PAN_DOWN_BTN = 8;

// PALANCA
const STICK_LEFT_RIGHT = 0;
const STICK_UP_DOWN = 1;
const BUTTON_BACK = 0;
const BUTTON_YELLOW = 1;
const BUTTON_RIGHT = 2;
const BUTTON_FRONT = 3;
const MINI_STICK = 9;
const DIMMER_UP = 2;
const DIMMER_DOWN = 3;

const ROTATE_SPEED = 0.02;
const ZOOM_STEP = 1.03;
const AXIS_DEADZONE = 0.06;

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

const STANDARD_AXES = [
  "Stick Izq X",
  "Stick Izq Y",
  "Stick Der X",
  "Stick Der Y",
];

let selectedIndex = null;
const lastButtons = {};
const lastAxes = {};

function getGamepads() {
  if (!navigator.getGamepads) return [];
  return [...navigator.getGamepads()].filter(Boolean);
}

function logPadInfo(pad) {
  console.log(
    `[joystick] ${pad.id} · mapping="${pad.mapping}" · botones=${pad.buttons.length} · ejes=${pad.axes.length}`,
  );
}

function buttonName(pad, i) {
  return pad.mapping === "standard" && STANDARD_BUTTONS[i] != null
    ? STANDARD_BUTTONS[i]
    : String(i);
}

function shortName(pad) {
  return (pad.id || "").split(" (")[0] || `Joystick ${pad.index}`;
}

function populate() {
  const pads = getGamepads();
  const prev = padSelect.value;
  padSelect.innerHTML = '<option value="">Seleccionar joystick…</option>';
  for (const pad of pads) {
    const opt = document.createElement("option");
    opt.value = String(pad.index);
    opt.textContent = `${shortName(pad)} [${pad.index}]`;
    padSelect.appendChild(opt);
  }
  padSelect.disabled = pads.length === 0;

  if ([...padSelect.options].some((o) => o.value === prev)) {
    padSelect.value = prev;
  } else {
    padSelect.value = "";
  }

  if (selectedIndex != null && !pads.some((p) => p.index === selectedIndex)) {
    selectedIndex = null;
  }

  updateState(pads.length);
}

function updateState(connectedCount) {
  if (selectedIndex != null) {
    const pad = getGamepads().find((p) => p.index === selectedIndex);
    stateEl.textContent = pad ? "Conectado" : "Desconectado";
  } else {
    stateEl.textContent = connectedCount ? "Seleccioná uno" : "No conectado";
  }
}

function rotateCamera(yaw, pitch) {
  const { camera, controls } = getView();
  if (!camera || !controls) return;
  const offset = new THREE.Vector3().subVectors(
    camera.position,
    controls.target,
  );
  const spherical = new THREE.Spherical().setFromVector3(offset);
  spherical.theta -= yaw;
  spherical.phi -= pitch;
  spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.05, Math.PI - 0.05);
  offset.setFromSpherical(spherical);
  camera.position.copy(controls.target).add(offset);
  camera.lookAt(controls.target);
}

function zoomCamera(factor) {
  const { camera, controls } = getView();
  if (!camera || !controls) return;
  const offset = new THREE.Vector3().subVectors(
    camera.position,
    controls.target,
  );
  offset.multiplyScalar(factor);
  camera.position.copy(controls.target).add(offset);
}

function panCamera(dx, dy) {
  const { camera, controls } = getView();
  if (!camera || !controls) return;
  camera.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
  const dist = camera.position.distanceTo(controls.target);
  const scale = dist * 0.008;
  const delta = new THREE.Vector3();
  delta.addScaledVector(right, -dx * scale);
  delta.addScaledVector(up, dy * scale);
  camera.position.add(delta);
  controls.target.add(delta);
  camera.lookAt(controls.target);
}

function poll() {
  const pad = getGamepads().find((p) => p.index === selectedIndex) || null;

  if (pad) {
    const ax = pad.axes[ROTATE_X_AXIS] ?? 0;
    const ay = pad.axes[ROTATE_Y_AXIS] ?? 0;
    if (Math.abs(ax) > AXIS_DEADZONE) rotateCamera(ax * ROTATE_SPEED, 0);
    if (Math.abs(ay) > AXIS_DEADZONE) rotateCamera(0, ay * ROTATE_SPEED);

    if (pad.buttons[PAN_LEFT_BTN]?.pressed) panCamera(1, 0);
    if (pad.buttons[PAN_RIGHT_BTN]?.pressed) panCamera(-1, 0);
    if (pad.buttons[PAN_UP_BTN]?.pressed) panCamera(0, 1);
    if (pad.buttons[PAN_DOWN_BTN]?.pressed) panCamera(0, -1);

    const zoomIn =
      (pad.buttons[ZOOM_IN_BTN]?.value ?? 0) +
      (pad.buttons[ZOOM_IN_DPAD]?.pressed ? 1 : 0);
    const zoomOut =
      (pad.buttons[ZOOM_OUT_BTN]?.value ?? 0) +
      (pad.buttons[ZOOM_OUT_DPAD]?.pressed ? 1 : 0);
    const net = zoomIn - zoomOut;
    if (net > 0.05) zoomCamera(1 / Math.pow(ZOOM_STEP, net));
    else if (net < -0.05) zoomCamera(Math.pow(ZOOM_STEP, -net));

    for (let i = 0; i < pad.buttons.length; i++) {
      const btn = pad.buttons[i];
      if (!btn) continue;
      const prevVal = lastButtons[i] ?? 0;
      const value = btn.value ?? 0;
      const pressed = Boolean(btn.pressed);
      if (pressed !== Boolean(prevVal) || Math.abs(value - prevVal) > 0.05) {
        const name = buttonName(pad, i);
        if (pressed) {
          if (i === RESET_BTN) resetView();
          console.log(
            `[joystick] botón ${i} (${name}) presionado · value=${value.toFixed(2)}`,
          );
          lastEventEl.textContent = `Último: Botón ${name}`;
        } else if (Math.abs(value - prevVal) > 0.05) {
          console.log(
            `[joystick] botón ${i} (${name}) analógico · value=${value.toFixed(2)}`,
          );
        } else {
          console.log(`[joystick] botón ${i} (${name}) soltado`);
        }
      }
      lastButtons[i] = value;
    }

    for (let i = 0; i < pad.axes.length; i++) {
      const value = pad.axes[i] ?? 0;
      const prev = lastAxes[i] ?? 0;
      if (Math.abs(value - prev) > 0.05) {
        const name =
          pad.mapping === "standard" && STANDARD_AXES[i] != null
            ? STANDARD_AXES[i]
            : String(i);
        console.log(`[joystick] eje ${i} (${name}) = ${value.toFixed(2)}`);
        lastEventEl.textContent = `Último: Eje ${name}`;
        lastAxes[i] = value;
      }
    }
  }

  requestAnimationFrame(poll);
}

export function initJoystick() {
  padSelect.addEventListener("change", () => {
    selectedIndex = padSelect.value === "" ? null : Number(padSelect.value);
    for (const k of Object.keys(lastButtons)) delete lastButtons[k];
    for (const k of Object.keys(lastAxes)) delete lastAxes[k];
    const pad = getGamepads().find((p) => p.index === selectedIndex);
    if (pad) logPadInfo(pad);
    updateState(getGamepads().length);
  });

  $("#jsRescanBtn").addEventListener("click", () => {
    lastEventEl.textContent = "Último: —";
    populate();
  });

  window.addEventListener("gamepadconnected", populate);
  window.addEventListener("gamepaddisconnected", populate);

  for (const pad of getGamepads()) logPadInfo(pad);

  populate();
  requestAnimationFrame(poll);
}
