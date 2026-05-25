let cache = null

export async function fetchLatents() {
  if (cache) return cache
  const res = await fetch('./latents.json')
  const data = await res.json()
  cache = data
  return data
}

export async function getRandomItem() {
  const data = await fetchLatents()
  const items = data.items || []
  return items[Math.floor(Math.random() * items.length)]
}

export async function getAllItems() {
  const data = await fetchLatents()
  return data.items || []
}

export async function getDatasetInfo() {
  const data = await fetchLatents()
  return {
    total: data.items?.length ?? 0,
    modelName: data.model_name ?? '-',
    latentDim: data.latent_dim ?? '-',
  }
}
