import { getRandomItem } from "../lib/load-latents.js";
import { settings } from "../lib/store.js";
import { start as startAudio, stop as stopAudio } from "../lib/tone-player.js";

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
  try {
    const item = await getRandomItem();

    if (!item) {
      throw new Error("No hay items disponibles en latents.json");
    }

    settings.setKey("lastLatent", item);

    $("#preview").src = `./imagenes_generadas/${item.file}`;
    renderInfo(item);

    await startAudio(item);

    $("#startBtn").disabled = true;
    $("#stopBtn").disabled = false;
    $("#status").textContent = "▶ Sonando";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("Error al iniciar Tone + Latents:", err);
    stopAudio();
    $("#startBtn").disabled = false;
    $("#stopBtn").disabled = true;
    $("#status").textContent = `Error: ${message}`;
  }
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
