import "../../styles/base.css";

const $ = (id) => document.getElementById(id.replace("#", ""));

const midiInput = $("#midiInput");
const statusEl = $("#status");
const light = $("#light");
const eventName = $("#eventName");
const eventSub = $("#eventSub");
const historyEl = $("#history");

let midiAccess = null;
let currentInput = null;
let lastEventAt = 0;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function noteName(note) {
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
}

function eventLabel(data) {
  const status = data[0] & 0xf0;
  const channel = (data[0] & 0x0f) + 1;
  const d1 = data[1];
  const d2 = data[2];

  switch (status) {
    case 0x90:
      return d2 > 0
        ? { name: `Nota ${d1}`, sub: `${noteName(d1)} · velocity ${d2}`, channel }
        : { name: `Nota ${d1}`, sub: `${noteName(d1)} · release`, channel };
    case 0x80:
      return { name: `Nota ${d1}`, sub: `${noteName(d1)} · release`, channel };
    case 0xb0:
      return { name: `Control ${d1}`, sub: `valor ${d2}`, channel };
    case 0xa0:
      return { name: `Aftertouch ${d1}`, sub: `valor ${d2}`, channel };
    case 0xc0:
      return { name: "Programa", sub: `preset ${d1}`, channel };
    case 0xd0:
      return { name: "Channel Pressure", sub: `valor ${d1}`, channel };
    case 0xe0:
      return { name: "Pitch Bend", sub: `LSB ${d1} · MSB ${d2}`, channel };
    default:
      return { name: `MIDI ${data[0]}`, sub: `${d1 ?? "-"}, ${d2 ?? "-"}`, channel };
  }
}

function addHistory(name, sub, channel) {
  const li = document.createElement("li");
  li.innerHTML =
    `<span class="h-name">${name}</span>` +
    `<span class="h-sub">${sub}</span>` +
    `<span class="h-ch">CH ${channel}</span>`;
  historyEl.prepend(li);
  while (historyEl.children.length > 20) {
    historyEl.lastChild.remove();
  }
}

function handleMessage(event) {
  const data = event.data;
  if (!data || !data.length) return;

  lastEventAt = performance.now();
  const { name, sub, channel } = eventLabel(data);
  eventName.textContent = name;
  eventSub.textContent = sub;
  addHistory(name, sub, channel);
}

function populateInputs() {
  const inputs = midiAccess ? [...midiAccess.inputs.values()] : [];
  console.info(
    `[midi-test] ${inputs.length} entradas:`,
    inputs.map((i) => ({ name: i.name, id: i.id, state: i.state, connection: i.connection })),
  );
  const prev = midiInput.value;
  midiInput.innerHTML = '<option value="">Seleccionar entrada…</option>';
  for (const input of inputs) {
    const opt = document.createElement("option");
    opt.value = input.id;
    opt.textContent = input.name || `Entrada ${input.id.slice(0, 8)}`;
    midiInput.appendChild(opt);
  }
  midiInput.disabled = false;

  if ([...midiInput.options].some((o) => o.value === prev)) {
    midiInput.value = prev;
  } else {
    midiInput.value = "";
  }

  if (currentInput && ![...midiInput.options].some((o) => o.value === currentInput.id)) {
    currentInput.onmidimessage = null;
    currentInput = null;
    statusEl.textContent = "Seleccioná una entrada";
  }
}

function connectInput(id) {
  if (currentInput) {
    currentInput.onmidimessage = null;
    currentInput = null;
  }
  if (!id) {
    statusEl.textContent = "Seleccioná una entrada";
    return;
  }
  const input = midiAccess?.inputs.get(id);
  if (!input) {
    statusEl.textContent = "Entrada no disponible";
    return;
  }
  currentInput = input;
  currentInput.onmidimessage = handleMessage;
  statusEl.textContent = "▶ Escuchando";
}

async function requestMidi() {
  if (!("requestMIDIAccess" in navigator)) {
    statusEl.textContent = "MIDI no soportado en este navegador";
    midiInput.innerHTML = '<option value="">No disponible</option>';
    console.error("[midi-test] Web MIDI API no disponible. Usá Chrome/Edge.");
    return;
  }
  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: false });
  } catch (err) {
    statusEl.textContent = "Permiso MIDI denegado. Reintentá con el botón.";
    console.error("No se pudo acceder a MIDI:", err);
    midiInput.innerHTML = '<option value="">No disponible</option>';
    return;
  }

  const reconnectId = currentInput?.id ?? midiInput.value;

  midiAccess.onstatechange = (event) => {
    console.info("[midi-test] onstatechange:", event.port?.name, event.port?.state);
    populateInputs();
  };
  populateInputs();

  const inputs = [...midiAccess.inputs.values()];
  statusEl.textContent = inputs.length
    ? "Seleccioná una entrada"
    : "No se detectaron entradas. Conectá el instrumento y probá 'Buscar dispositivos'";

  if (reconnectId) {
    const input = midiAccess.inputs.get(reconnectId);
    if (input) {
      midiInput.value = reconnectId;
      connectInput(reconnectId);
    }
  }
}

function tick() {
  const age = performance.now() - lastEventAt;
  const lit = age < 500;
  light.classList.toggle("on", lit);
  if (lit) {
    const intensity = 0.25 + 0.75 * Math.max(0, 1 - age / 500);
    light.style.opacity = String(intensity);
  } else {
    light.style.opacity = "";
  }
  requestAnimationFrame(tick);
}

midiInput.addEventListener("change", () => connectInput(midiInput.value));
$("#rescanBtn").addEventListener("click", () => {
  statusEl.textContent = "Buscando…";
  requestMidi();
});

requestMidi();
requestAnimationFrame(tick);
