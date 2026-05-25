import * as Tone from "tone";
import { getRandomItem } from "./lib/load-latents.js";
import { settings, audioState } from "./lib/store.js";

const $ = (id) => document.getElementById(id.replace("#", ""));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mapRange = (val, inMin, inMax, outMin, outMax) =>
  outMin + ((val - inMin) / (inMax - inMin)) * (outMax - outMin);

let reverb, delay;
let droneSynth, pad2Synth, padAgudoSynth, textureSynth, pulsoSynth;
let droneSeq, pad2Seq, padAgudoSeq, pulsoSeq, textureSeq;
let isPlaying = false;

const droneNotes = ["C2", "Eb2", "G2", "Bb1"];
const pad2Notes = ["C3", null, null, "G3", null, "Eb3", null, null];
const padAgudoNotes = [null, "C4", null, null, "Eb4", null, "G4", null];
const pulsoNotes = [
  null,
  null,
  "C5",
  null,
  null,
  "Eb5",
  null,
  null,
  "G5",
  null,
  null,
  "Bb5",
  null,
  null,
  null,
  null,
];

function renderInfo(item) {
  $("#coord1d").textContent = item.coord_1d?.toFixed(4) ?? "-";
  const c3 = item.coord_3d;
  $("#coord3d").textContent = c3
    ? `${c3.x.toFixed(4)}, ${c3.y.toFixed(4)}, ${c3.z.toFixed(4)}`
    : "-";
  $("#hash").textContent = item.latent_hash_num ?? "-";
  $("#filename").textContent = item.file ?? "-";
}

function buildAudioGraph(space) {
  reverb = new Tone.Reverb({ roomSize: space, wet: 0.6 }).toDestination();
  delay = new Tone.FeedbackDelay({
    delayTime: "4n",
    feedback: 0.4,
    wet: 0.4,
  }).connect(reverb);

  droneSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
  }).connect(reverb);
  pad2Synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
  }).connect(reverb);
  padAgudoSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
  }).connect(delay);
  textureSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
  }).connect(delay);
  pulsoSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
  }).connect(reverb);

  droneSynth.volume.value = Tone.gainToDb(0.35);
  pad2Synth.volume.value = Tone.gainToDb(0.18);
  padAgudoSynth.volume.value = Tone.gainToDb(0.12);
  textureSynth.volume.value = Tone.gainToDb(0.1);
  pulsoSynth.volume.value = Tone.gainToDb(0.03);
}

function buildPatterns(depth, chaos) {
  let droneIdx = 0;
  droneSeq = Tone.Transport.scheduleRepeat((time) => {
    const nota = droneNotes[droneIdx % droneNotes.length];
    droneIdx++;
    droneSynth.triggerAttackRelease(nota, `${depth * 1.8}m`, time);
  }, `${depth}m`);

  pad2Seq = new Tone.Sequence(
    (time, note) => {
      if (note) pad2Synth.triggerAttackRelease(note, "2m", time);
    },
    pad2Notes,
    "2n",
  ).start(0);

  padAgudoSeq = new Tone.Sequence(
    (time, note) => {
      if (note) padAgudoSynth.triggerAttackRelease(note, "1m", time);
    },
    padAgudoNotes,
    "2n",
  ).start(0);

  pulsoSeq = new Tone.Sequence(
    (time, note) => {
      if (note) pulsoSynth.triggerAttackRelease(note, "8n", time);
    },
    pulsoNotes,
    "4n",
  ).start(0);

  const cMinorScale = ["C4", "D4", "Eb4", "F4", "G4", "Ab4", "Bb4", "C5"];
  textureSeq = Tone.Transport.scheduleRepeat((time) => {
    if (Math.random() < chaos / 10) {
      const nota = cMinorScale[Math.floor(Math.random() * cMinorScale.length)];
      textureSynth.triggerAttackRelease(nota, "1n", time);
    }
  }, "2n");
}

async function start() {
  try {
    const item = await getRandomItem();

    if (!item) {
      throw new Error("No hay items disponibles en latents.json");
    }

    settings.setKey("lastLatent", item);
    audioState.setKey("isPlaying", true);

    $("#preview").src = `./imagenes_generadas/${item.file}`;
    renderInfo(item);

    const c1d = item.coord_1d || 0;
    const { x = 0, y = 0, z = 0 } = item.coord_3d || {};

    const bpm = clamp(mapRange(c1d, -5, 5, 80, 180), 60, 240);
    const space = clamp(mapRange(x, -3, 3, 0.5, 1), 0, 1);
    const depth = Math.round(clamp(mapRange(y, -3, 3, 2, 10), 1, 16));
    const chaos = Math.round(clamp(mapRange(z, -3, 3, 4, 16), 1, 20));

    if (isPlaying) {
      await stop();
    }

    await Tone.start();
    buildAudioGraph(space);
    Tone.Transport.bpm.value = bpm;
    buildPatterns(depth, chaos);
    Tone.Transport.start();
    isPlaying = true;

    $("#startBtn").disabled = true;
    $("#stopBtn").disabled = false;
    $("#status").textContent = "▶ Sonando";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("Error al iniciar Tone + Latents:", err);
    audioState.setKey("isPlaying", false);
    $("#startBtn").disabled = false;
    $("#stopBtn").disabled = true;
    $("#status").textContent = `Error: ${message}`;
  }
}

async function stop() {
  Tone.Transport.stop();
  Tone.Transport.cancel();

  if (droneSeq !== undefined) Tone.Transport.clear(droneSeq);
  if (pad2Seq) pad2Seq.stop();
  if (padAgudoSeq) padAgudoSeq.stop();
  if (pulsoSeq) pulsoSeq.stop();
  if (textureSeq !== undefined) Tone.Transport.clear(textureSeq);

  droneSynth?.dispose();
  pad2Synth?.dispose();
  padAgudoSynth?.dispose();
  textureSynth?.dispose();
  pulsoSynth?.dispose();
  reverb?.dispose();
  delay?.dispose();

  droneSynth =
    pad2Synth =
    padAgudoSynth =
    textureSynth =
    pulsoSynth =
      undefined;
  reverb = delay = undefined;
  droneSeq = pad2Seq = padAgudoSeq = pulsoSeq = textureSeq = undefined;
  isPlaying = false;

  audioState.setKey("isPlaying", false);
  $("#startBtn").disabled = false;
  $("#stopBtn").disabled = true;
  $("#status").textContent = "⏹ Detenido";
}

$("#startBtn").addEventListener("click", start);
$("#stopBtn").addEventListener("click", stop);

$("#status").textContent = "Listo — presiona Iniciar";
