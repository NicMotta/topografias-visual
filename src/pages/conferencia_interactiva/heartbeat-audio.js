const $ = (id) => document.getElementById(id.replace("#", ""));

const toggleBtn = $("#heartbeatToggle");
const stateEl = $("#heartbeatState");
const volumeInput = $("#heartbeatVolume");
const volumeOut = $("#heartbeatVolumeOut");

const DEFAULT_VOLUME = 0.4;
const BPM = 85;

let audioCtx = null;
let masterGain = null;
let timer = null;
let nextBeatTime = 0;
let active = false;
let noiseBuffer = null;
let targetVolume = DEFAULT_VOLUME;

function getNoiseBuffer() {
  if (!noiseBuffer) {
    const length = Math.floor(audioCtx.sampleRate * 0.1);
    noiseBuffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function playAttack(time, velocity) {
  const src = audioCtx.createBufferSource();
  src.buffer = getNoiseBuffer();

  const bandpass = audioCtx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = 900;
  bandpass.Q.value = 1.1;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(velocity * 0.45, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);

  src.connect(bandpass);
  bandpass.connect(gain);
  gain.connect(masterGain);

  src.start(time);
  src.stop(time + 0.08);
}

function playThump(time, velocity) {
  const body = audioCtx.createOscillator();
  const bodyGain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();

  filter.type = "lowpass";
  filter.frequency.value = 220;

  body.type = "sine";
  body.frequency.setValueAtTime(135, time);
  body.frequency.exponentialRampToValueAtTime(48, time + 0.14);

  bodyGain.gain.setValueAtTime(0.0001, time);
  bodyGain.gain.exponentialRampToValueAtTime(velocity, time + 0.02);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);

  body.connect(bodyGain);
  bodyGain.connect(filter);
  filter.connect(masterGain);

  body.start(time);
  body.stop(time + 0.32);

  const harmonic = audioCtx.createOscillator();
  const harmonicGain = audioCtx.createGain();

  harmonic.type = "triangle";
  harmonic.frequency.setValueAtTime(270, time);
  harmonic.frequency.exponentialRampToValueAtTime(96, time + 0.14);

  harmonicGain.gain.setValueAtTime(0.0001, time);
  harmonicGain.gain.exponentialRampToValueAtTime(velocity * 0.4, time + 0.02);
  harmonicGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);

  harmonic.connect(harmonicGain);
  harmonicGain.connect(masterGain);

  harmonic.start(time);
  harmonic.stop(time + 0.26);

  playAttack(time, velocity);
}

function scheduler() {
  const period = 60 / BPM;
  const dubGap = Math.min(period * 0.3, 0.18);

  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
    timer = setTimeout(scheduler, 200);
    return;
  }

  if (nextBeatTime < audioCtx.currentTime) {
    nextBeatTime = audioCtx.currentTime + 0.05;
  }

  while (nextBeatTime < audioCtx.currentTime + 0.3) {
    playThump(nextBeatTime, 0.9);
    playThump(nextBeatTime + dubGap, 0.5);
    nextBeatTime += period;
  }

  timer = setTimeout(scheduler, 100);
}

function cleanup() {
  active = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  masterGain = null;
  noiseBuffer = null;
}

function applyVolume() {
  if (masterGain && audioCtx) {
    masterGain.gain.setTargetAtTime(targetVolume, audioCtx.currentTime, 0.02);
  }
}

function updateStateText() {
  stateEl.textContent = active
    ? `Activo · ${BPM} BPM · ${Math.round(targetVolume * 100)}%`
    : "Desactivado";
}

function updateUI() {
  toggleBtn.textContent = active ? "Desactivar" : "Activar";
  toggleBtn.classList.toggle("is-on", active);
  updateStateText();
}

function activate() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    stateEl.textContent = "Web Audio no disponible";
    return;
  }

  cleanup();

  audioCtx = new Ctx();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = targetVolume;
  masterGain.connect(audioCtx.destination);

  nextBeatTime = audioCtx.currentTime + 0.05;

  active = true;
  updateUI();
  scheduler();

  audioCtx.resume().catch(() => {});
}

function deactivate() {
  cleanup();
  updateUI();
}

export function initHeartbeatAudio() {
  toggleBtn?.addEventListener("click", () => {
    if (active) deactivate();
    else activate();
  });

  volumeInput?.addEventListener("input", () => {
    targetVolume = Number(volumeInput.value) / 100;
    if (volumeOut) volumeOut.textContent = volumeInput.value;
    applyVolume();
    updateStateText();
  });
}
