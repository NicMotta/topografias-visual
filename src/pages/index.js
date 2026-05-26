import { getDatasetInfo } from '../lib/load-latents.js'

async function loadStats() {
  const statsEl = document.getElementById('stats')
  try {
    const info = await getDatasetInfo()
    statsEl.innerHTML =
      `<strong>Dataset:</strong> ${info.modelName} · ` +
      `<strong>Imágenes:</strong> ${info.total} · ` +
      `<strong>Latent dim:</strong> ${info.latentDim}`
  } catch {
    statsEl.textContent = 'No se pudieron cargar las métricas del catálogo.'
  }
}

loadStats()
