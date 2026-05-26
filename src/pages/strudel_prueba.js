import { getRandomItem } from "../lib/load-latents.js";
import { settings } from "../lib/store.js";
import { start as startAudio, stop as stopAudio } from "../lib/strudel-player.js";

const $ = (id) => document.getElementById(id.replace("#", ""));

function renderInfo(item) {
  $("#coord1d").textContent = item.coord_1d?.toFixed(4) ?? "-";
  const c3 = item.coord_3d;
  $("#coord3d").textContent = c3
    ? `${c3.x.toFixed(4)}, ${c3.y.toFixed(4)}, ${c3.z.toFixed(4)}`
    : "-";
  $("#hash").textContent = item.latent_hash_num ?? "-";
  $("#filename").textContent = item.file ?? "-";
}

async function start() {
  const item = await getRandomItem();

  settings.setKey("lastLatent", item);

  $("#preview").src = `./imagenes_generadas/${item.file}`;
  renderInfo(item);

  await startAudio(item);

  $("#startBtn").disabled = true;
  $("#stopBtn").disabled = false;
  $("#status").textContent = "▶ Sonando";
}

function stop() {
  stopAudio();
  $("#startBtn").disabled = false;
  $("#stopBtn").disabled = true;
  $("#status").textContent = "⏹ Detenido";
}

$("#startBtn").addEventListener("click", start);
$("#stopBtn").addEventListener("click", stop);

$("#status").textContent = "Listo — presiona Iniciar";
