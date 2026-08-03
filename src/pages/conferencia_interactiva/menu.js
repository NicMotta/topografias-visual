import {
  SENSORS,
  isBluetoothAvailable,
  connectSensor,
  disconnectSensor,
} from "./heart-rate.js";

const $ = (id) => document.getElementById(id.replace("#", ""));
const menu = $("#menu");
const config = (id) => document.querySelector(`.config[data-sensor="${id}"]`);

function setMenu(open) {
  menu.hidden = !open;
}

export function initMenu() {
  $("#menuBtn").addEventListener("click", () => setMenu(menu.hidden));
  $("#closeMenu").addEventListener("click", () => setMenu(false));
  menu.addEventListener("click", (event) => {
    if (event.target === menu) setMenu(false);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      setMenu(false);
      return;
    }
    if (event.key.toLowerCase() === "m" && !event.repeat) {
      event.preventDefault();
      setMenu(menu.hidden);
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
