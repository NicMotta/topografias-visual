import {
  SENSORS,
  isBluetoothAvailable,
  connectSensor,
  disconnectSensor,
} from "./heart-rate.js";

const $ = (id) => document.getElementById(id.replace("#", ""));
const config = (id) => document.querySelector(`.config[data-sensor="${id}"]`);

const modals = {
  menu: $("#menu"),
  credits: $("#credits"),
  terrain: $("#terrainModal"),
  catalogo: $("#catalogoModal"),
  capas: $("#capasModal"),
  extra3: $("#extra3Modal"),
  extra: $("#extraModal"),
};

const waitingMsg = $("#waitingMsg");

function setOpen(name, open) {
  for (const [key, el] of Object.entries(modals)) {
    if (key === name) el.hidden = !open;
    else el.hidden = true;
  }
  const anyOpen = Object.values(modals).some((el) => !el.hidden);
  waitingMsg.hidden = anyOpen;
}

function toggle(name) {
  setOpen(name, modals[name].hidden);
}

function closeAll() {
  setOpen(null, false);
}

function bindModal(name, btnId) {
  $(btnId).addEventListener("click", () => toggle(name));
  const modal = modals[name];
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeAll();
  });
}

export function initMenu() {
  bindModal("menu", "menuBtn");
  bindModal("credits", "creditsBtn");
  bindModal("terrain", "terrainBtn");
  bindModal("catalogo", "catalogoBtn");
  bindModal("capas", "capasBtn");
  bindModal("extra3", "extra3Btn");
  bindModal("extra", "extraBtn");

  $("#closeMenu").addEventListener("click", () => setOpen("menu", false));
  $("#closeCredits").addEventListener("click", () => setOpen("credits", false));
  $("#closeTerrain").addEventListener("click", () => closeAll());
  $("#closeCatalogo").addEventListener("click", () => closeAll());
  $("#closeCapas").addEventListener("click", () => closeAll());
  $("#closeExtra3").addEventListener("click", () => closeAll());
  $("#closeExtra").addEventListener("click", () => closeAll());

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAll();
      return;
    }
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === "t") {
      event.preventDefault();
      toggle("credits");
    } else if (key === "m") {
      event.preventDefault();
      toggle("menu");
    }
  });

  if (isBluetoothAvailable()) {
    for (const id of Object.keys(SENSORS)) {
      config(id)
        .querySelector(".connect")
        .addEventListener("click", () => connectSensor(id));
      config(id)
        .querySelector(".disconnect")
        .addEventListener("click", () => disconnectSensor(id));
    }
  }
}
