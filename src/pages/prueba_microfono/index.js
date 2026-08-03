import "../../styles/base.css";

const $ = (id) => document.querySelector(id);

const deviceSelect = $("#deviceSelect");
const volumeInput = $("#volume");
const meterBar = $("#meterBar");
const statusEl = $("#status");
const startBtn = $("#startBtn");
const stopBtn = $("#stopBtn");

let stream = null;
let audioCtx = null;
let gainNode = null;
let analyser = null;
let meterRaf = 0;

async function requestPermission() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este navegador no soporta captura de audio");
  }
  const temp = await navigator.mediaDevices.getUserMedia({ audio: true });
  temp.getTracks().forEach((t) => t.stop());
}

async function listDevices() {
  try {
    await requestPermission();
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((d) => d.kind === "audioinput");
    deviceSelect.innerHTML =
      '<option value="">Seleccionar dispositivo…</option>';
    for (const device of inputs) {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent =
        device.label ||
        (device.deviceId
          ? `Micrófono ${device.deviceId.slice(0, 8)}`
          : "Micrófono predeterminado");
      deviceSelect.appendChild(option);
    }
    if (inputs.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Micrófono predeterminado";
      deviceSelect.appendChild(option);
    }
    deviceSelect.disabled = false;
    statusEl.textContent = "Listo";
  } catch (err) {
    deviceSelect.innerHTML =
      '<option value="">Micrófono predeterminado</option>';
    deviceSelect.disabled = false;
    statusEl.textContent = "Presiona Escuchar para pedir permiso";
    console.error("No se pudieron listar dispositivos:", err);
  }
}

function setMeter() {
  if (!analyser || !stream) return;
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i] - 128) / 128;
    if (v > peak) peak = v;
  }
  meterBar.style.width = `${Math.min(100, peak * 100)}%`;
  meterRaf = requestAnimationFrame(setMeter);
}

async function start() {
  try {
    const deviceId = deviceSelect.value;
    const constraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    };
    if (deviceId) {
      constraints.audio.deviceId = { exact: deviceId };
    }

    stream = await navigator.mediaDevices.getUserMedia(constraints);
    audioCtx = new AudioContext();

    const source = audioCtx.createMediaStreamSource(stream);

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);

    gainNode = audioCtx.createGain();
    gainNode.gain.value = volumeInput.value / 100;
    gainNode.connect(audioCtx.destination);

    // Monitor directo: mic -> volumen -> salida, sin delay ni eco
    source.connect(gainNode);

    await audioCtx.resume();

    startBtn.disabled = true;
    stopBtn.disabled = false;
    deviceSelect.disabled = true;
    statusEl.textContent = "▶ Monitoreando";
    setMeter();
  } catch (err) {
    statusEl.textContent =
      err instanceof DOMException && err.name === "NotAllowedError"
        ? "Permiso denegado para el micrófono"
        : "No se pudo acceder al micrófono";
    console.error(err);
    cleanup();
  }
}

function cleanup() {
  cancelAnimationFrame(meterRaf);
  meterBar.style.width = "0%";
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  gainNode = null;
  analyser = null;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  deviceSelect.disabled = false;
}

startBtn.addEventListener("click", start);
stopBtn.addEventListener("click", () => {
  cleanup();
  statusEl.textContent = "⏹ Detenido";
});

volumeInput.addEventListener("input", () => {
  if (gainNode) gainNode.gain.value = volumeInput.value / 100;
});

if (navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener("devicechange", () => {
    if (!stream) listDevices();
  });
}

listDevices();
