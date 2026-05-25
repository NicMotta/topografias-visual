import { stack, note, rand, segment } from "@strudel/core";
import { miniAllStrings } from "@strudel/mini";
import "@strudel/tonal";
import { webaudioRepl, initAudio } from "@strudel/webaudio";
import { registerSynthSounds } from "superdough";
import { getRandomItem } from "./lib/load-latents.js";
import { settings, audioState } from "./lib/store.js";

registerSynthSounds();
miniAllStrings();

let repl = null;

const $ = (id) => document.getElementById(id.replace("#", ""));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mapRange = (val, inMin, inMax, outMin, outMax) =>
  outMin + ((val - inMin) / (inMax - inMin)) * (outMax - outMin);

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
  audioState.setKey("isPlaying", true);

  $("#preview").src = `./imagenes_generadas/${item.file}`;
  renderInfo(item);

  const c1d = item.coord_1d || 0;
  const { x = 0, y = 0, z = 0 } = item.coord_3d || {};

  const cpm = clamp(mapRange(c1d, -5, 5, 80, 180), 60, 240);
  const space = clamp(mapRange(x, -3, 3, 0.5, 1), 0, 1);
  const depth = Math.round(clamp(mapRange(y, -3, 3, 2, 10), 1, 16));
  const chaos = Math.round(clamp(mapRange(z, -3, 3, 4, 16), 1, 20));

  let mood = "C:minor";

  await initAudio({ maxPolyphony: 32 });
  if (!repl) {
    repl = webaudioRepl();
  }

  repl.scheduler.setCps(cpm / 60);

  const pattern = stack(
    note("<c2 eb2 g2 bb1>")
      .sound("sine")
      .slow(depth)
      .gain(0.35)
      .attack(2)
      .release(depth)
      .room(space),

    note("<c3 ~ ~ g3 ~ eb3 ~ ~>")
      .sound("sine")
      .slow(4)
      .gain(0.18)
      .attack(2)
      .release(5)
      .room(space),

    note("<~ c4 ~ ~ eb4 ~ g4 ~>")
      .sound("sine")
      .slow(3)
      .gain(0.12)
      .attack(1)
      .release(4)
      .delay(0.4)
      .room(space),

    note(segment(chaos, rand).scale(mood))
      .sound("sine")
      .slow(2)
      .gain(0.1)
      .attack(0.2)
      .release(2)
      .delay(0.5)
      .room(space),

    note("<~ ~ c5 ~ ~ eb5 ~ ~ g5 ~ ~ bb5 ~ ~ ~>")
      .sound("sine")
      .slow(2)
      .gain(0.03)
      .attack(0.05)
      .release(1.5)
      .delay(0.8)
      .room(0.95),
  );

  repl.scheduler.pattern = pattern;
  if (!repl.scheduler.started) {
    await repl.scheduler.start();
  }

  $("#startBtn").disabled = true;
  $("#stopBtn").disabled = false;
  $("#status").textContent = "▶ Sonando";
}

async function stop() {
  if (repl) {
    repl.scheduler.stop();
  }
  audioState.setKey("isPlaying", false);
  $("#startBtn").disabled = false;
  $("#stopBtn").disabled = true;
  $("#status").textContent = "⏹ Detenido";
}

$("#startBtn").addEventListener("click", start);
$("#stopBtn").addEventListener("click", stop);

$("#status").textContent = "Listo — presiona Iniciar";
