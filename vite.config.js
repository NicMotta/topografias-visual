import { defineConfig } from 'vite'
import { resolve } from 'path'

const pages = [
  'index',
  'visualizador_3d',
  'mapa_color_3d',
  'mapa_topografico_3d',
  'terreno_rios_3d',
  'convivencia_3d',
  'arte_flujo_latent',
  'arte_kaleidoscopio_latent',
  'ascii_lowpoly_latent',
  'noir_ascii_latent',
  'dos_opciones_latents',
  'strudel_prueba',
  'tone_prueba',
  'prueba_microfono',
  'midi_test',
  'joystick_test',
  'conferencia_interactiva',
]

const input = {}
for (const name of pages) {
  input[name] = name === 'index'
    ? resolve(__dirname, 'index.html')
    : resolve(__dirname, `src/pages/${name}/index.html`)
}

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/topografias-visual/' : '/',
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: { input },
  },
}))
