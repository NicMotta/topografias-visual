# topografias-visual

Visualización 3D de terrenos a partir de imágenes generadas por IA, con sonido generativo vinculado a coordenadas latentes.

## Estructura

```text
src/
  lib/                    ← lógica compartida
    store.js              estado global (nanostores)
    strudel-player.js     reproductor de audio con Strudel
    tone-player.js        reproductor de audio con Tone.js
    load-latents.js       fetch de latents.json e items aleatorios
    three-setup.js        escena Three.js preconfigurada
    read-image-pixels.js  lectura de píxeles de imagen
    luminance.js          cálculo de luminancia
    canvas-setup.js       canvas 2D preconfigurado
  pages/                  ← entry points (pruebas, no definitivos)
```

## Uso de `lib/`

```js
import { start, stop } from "./lib/strudel-player.js";

const item = await getRandomItem();
await start(item); // el sonido arranca automáticamente
stop(); // lo detiene
```

El player lee coordenadas del item (coord_1d, coord_3d) y las mapea a parámetros musicales (bpm, espacio, profundidad, caos).

## Comandos

```sh
npm run dev      # servidor de desarrollo
npm run build    # build de producción
npm run preview  # previsualizar build localmente
```

## Stack

- **Three.js** — renderizado 3D
- **Strudel / Tone.js** — audio generativo
- **Nanostores** — estado reactivo
- **Vite** — bundler
