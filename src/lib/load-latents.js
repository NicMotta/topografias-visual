let cache = null;

export async function fetchLatents() {
  if (cache) return cache;
  const latentsUrl = `${import.meta.env.BASE_URL}latents.json`;
  const res = await fetch(latentsUrl);

  if (!res.ok) {
    throw new Error(
      `No se pudo cargar latents.json (${res.status} ${res.statusText})`,
    );
  }

  const raw = await res.text();

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const preview = raw.slice(0, 80).replace(/\s+/g, " ");
    throw new Error(
      `Respuesta invalida al leer latents.json. Primeros caracteres: "${preview}"`,
    );
  }

  if (!data || !Array.isArray(data.items)) {
    throw new Error("latents.json no tiene el formato esperado: falta items[]");
  }

  cache = data;
  return data;
}

function imageUrl(file) {
  return `${import.meta.env.BASE_URL}imagenes_generadas/${file}`;
}

function imageExists(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

export async function getRandomItem() {
  const data = await fetchLatents();
  const items = data.items || [];
  if (!items.length) return null;

  for (let attempt = 0; attempt < 30; attempt++) {
    const item = items[Math.floor(Math.random() * items.length)];
    if (await imageExists(imageUrl(item.file))) return item;
  }

  for (const item of items) {
    if (await imageExists(imageUrl(item.file))) return item;
  }
  return items[0];
}

export async function getAllItems() {
  const data = await fetchLatents();
  return data.items || [];
}

export async function getDatasetInfo() {
  const data = await fetchLatents();
  return {
    total: data.items?.length ?? 0,
    modelName: data.model_name ?? "-",
    latentDim: data.latent_dim ?? "-",
  };
}
