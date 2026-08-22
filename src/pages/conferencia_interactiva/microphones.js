const $ = (id) => document.getElementById(id.replace("#", ""));

const deviceSelect = $("#micDevice");
const volumeInput = $("#micVolume");
const toggleBtn = $("#micToggle");
const stateEl = $("#micState");
const waveCanvas = $("#micWave");
const micDot = $("#micDot");

let stream = null;
let audioCtx = null;
let source = null;
let gainNode = null;
let analyser = null;
let raf = 0;
let active = false;

async function populateDevices() {
  const options = [];
  if (navigator.mediaDevices?.enumerateDevices) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      for (const d of devices.filter((d) => d.kind === "audioinput")) {
        options.push({
          value: d.deviceId,
          label:
            d.label ||
            (d.deviceId
              ? `Micrófono ${d.deviceId.slice(0, 8)}`
              : "Micrófono predeterminado"),
        });
      }
    } catch (err) {
      console.error("No se pudieron listar dispositivos:", err);
    }
  }

  const prev = deviceSelect.value;
  deviceSelect.innerHTML = '<option value="">Micrófono predeterminado</option>';
  for (const opt of options) {
    const el = document.createElement("option");
    el.value = opt.value;
    el.textContent = opt.label;
    deviceSelect.appendChild(el);
  }
  deviceSelect.disabled = false;
  if ([...deviceSelect.options].some((o) => o.value === prev)) {
    deviceSelect.value = prev;
  }
}

function buildGraph() {
  audioCtx = new AudioContext();
  source = audioCtx.createMediaStreamSource(stream);

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.6;
  source.connect(analyser);

  gainNode = audioCtx.createGain();
  gainNode.gain.value = volumeInput.value / 100;
  gainNode.connect(audioCtx.destination);

  // Monitor directo: mic -> volumen -> salida, sin delay ni eco
  source.connect(gainNode);
}

function drawWave() {
  if (!active || !analyser) return;
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);

  const ctx = waveCanvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = waveCanvas.clientWidth;
  const h = waveCanvas.clientHeight;
  if (!w || !h) return;

  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (waveCanvas.width !== pw) waveCanvas.width = pw;
  if (waveCanvas.height !== ph) waveCanvas.height = ph;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = "#e8e8e8";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  const step = Math.max(1, Math.floor(data.length / w));
  for (let x = 0; x < w; x++) {
    const i = Math.min(data.length - 1, x * step);
    const v = data[i] / 128 - 1;
    const y = h / 2 + v * (h / 2) * 0.85;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  raf = requestAnimationFrame(drawWave);
}

function drawFlatWave() {
  const ctx = waveCanvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = waveCanvas.clientWidth;
  const h = waveCanvas.clientHeight;
  if (!w || !h) return;

  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (waveCanvas.width !== pw) waveCanvas.width = pw;
  if (waveCanvas.height !== ph) waveCanvas.height = ph;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
}

function updateUI() {
  toggleBtn.textContent = active ? "Desactivar" : "Activar";
  toggleBtn.classList.toggle("danger", active);
  stateEl.textContent = active ? "Activo" : "Desactivado";
  deviceSelect.disabled = active;
  micDot.classList.toggle("on", active);
  if (!active) drawFlatWave();
}

function cleanup() {
  active = false;
  cancelAnimationFrame(raf);
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  source = null;
  gainNode = null;
  analyser = null;
}

async function activate() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Este navegador no soporta captura de audio");
    }
    const constraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    };
    if (deviceSelect.value) {
      constraints.audio.deviceId = { exact: deviceSelect.value };
    }

    stream = await navigator.mediaDevices.getUserMedia(constraints);
    buildGraph();
    await audioCtx.resume();

    active = true;
    updateUI();
    drawWave();
    populateDevices();
  } catch (err) {
    cleanup();
    updateUI();
    stateEl.textContent =
      err instanceof DOMException && err.name === "NotAllowedError"
        ? "Permiso denegado"
        : "No se pudo acceder al micrófono";
    console.error("Error al activar micrófono:", err);
  }
}

function deactivate() {
  cleanup();
  updateUI();
}

export function initMicrophones() {
  toggleBtn.addEventListener("click", () => {
    if (active) deactivate();
    else activate();
  });

  volumeInput.addEventListener("input", () => {
    if (gainNode) gainNode.gain.value = volumeInput.value / 100;
  });

  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", () => {
      if (!active) populateDevices();
    });
  }

  window.addEventListener("resize", () => {
    if (active) drawWave();
    else drawFlatWave();
  });

  populateDevices();
  drawFlatWave();
}
