# Requerimientos - Conferencia Interactiva (migración a Godot)

## Visión General

Aplicación interactiva para conferencia que integra sensores biométricos (frecuencia cardíaca), control de dispositivos ESP32 vía WebSocket, visualización 3D de terrenos generados a partir de imágenes, entrada por joystick/gamepad, y visualización de audio de micrófono.

---

## 1. Frecuencia Cardíaca (Heart Rate)

### 1.1 Conexión Bluetooth
- Usar Web Bluetooth (en Godot:BLE o conexión externa)
- Servicio: `heart_rate` / Characteristic: `heart_rate_measurement`
- Servicio batería: `battery_service` / `battery_level` (opcional)
- Dos sensores simultáneos: **Claudia** y **Cecilia**
- Autoreconexión con retry cada 3 segundos si `shouldReconnect = true`
- Verificar que el dispositivo no esté ocupado por otro sensor

### 1.2 Parsing de datos
- Parsear flags del primer byte:
  - Bit 0: BPM en 16 bits
  - Bit 2: `contactDetected`
  - Bit 3: energía presente
  - Bit 10: intervalos RR presentes
- Extraer BPM y intervalos RR
- Mantener historial de BPM por sensor (ventana de 60 segundos)

### 1.3 UI de sensores
- Panel por sensor con: dot de estado (verde/gris), nombre, BPM grande, label "BPM"
- Canvas con gráfico de BPM en tiempo real (60s, rango 40-220 BPM)
- Animación de "glow" del corazón sincronizada con el intervalo entre latidos
- Estilo `.no-contact` cuando `contactDetected = false`

### 1.4 Sincronización (Sync)
- **Condición**: ambos sensores conectados con el mismo BPM exacto
- **Entrada**: mantener match ≥ 1200ms
- **Salida**: mantener mismatch ≥ 2000ms
- Al sincronizar:
  - Cambiar fondo de escena a blanco (`#f2f2f2`) con interpolación suave
  - Mostrar beam SVG animado entre los dos paneles de sensor
  - Mostrar badge "Sincronizados" centrado entre ambos
  - Cambiar colores de dispositivos ESP32 a `#f5f5f5`
  - Estilos `.sync` en body: bordes blancos, glow blanco
- Tecla `P`: toggle emulación de sync (para testing)

---

## 2. Dispositivos ESP32 (Devices)

### 2.1 Conexión WebSocket
- Tres dispositivos:
  - `claudia` → `ws://claudia.local:81/`
  - `cecilia` → `ws://cecilia.local:81/`
  - `nic` → `ws://nic.local:81/`
- Autoreconexión cada 3 segundos
- Al conectar: enviar estado actual (colores, BPM, brillo, pánico)

### 2.2 Mensajes (enviados)
```json
{ "type": "colors", "colors": ["#ff0000", "#00ff00", "#0000ff"] }
{ "type": "bpm", "device": "claudia", "bpm": 72 }
{ "type": "brightness", "device": "claudia", "brightness": 128 }
{ "type": "panic", "device": "claudia", "active": true }
```

### 2.3 Control desde UI
- **Colores**: 3 inputs type="color" (sync a todos los dispositivos)
- **Brillo**: slider 0-255 (enviado a todos)
- **Pánico**: botón toggle (enviado a todos)
- **Conectar/Desconectar todos**: botón único

### 2.4 Dashboard (panel fijo arriba a la izquierda)
- Dot de estado general (verde si todos conectados)
- Swatches de colores actuales
- Por cada dispositivo: dot, nombre, BPM, Brillo, Pánico (SÍ/no)

---

## 3. Terreno 3D (Terrain)

### 3.1 Escena Three.js
- Cámara en `(0, 110, 180)` mirando al origen
- Fondo normal: `#0e0e0e`, fondo sync: `#f2f2f2` (interpolado con `lerp`)
- Luz ambiental blanca (0.9) + luz direccional (0.8) en `(90, 160, 120)`
- Renderer en posición fixed, z-index 0, cubre toda la pantalla

### 3.2 Generación del mesh
- Seleccionar imagen aleatoria de `imagenes_generadas/` (vía `getRandomItem()`)
- Leer píxeles de la imagen
- Crear `PlaneGeometry` (140 unidades de ancho, proporcional en alto)
  - Resolución muestreo: 120 columnas, filas proporcionales
  - Rotar -90° en X (horizontal)
- **Altura**: luminancia del píxel × `heightScale` (42)
- **Color**: RGB directo del píxel como vertex colors
- Material: `MeshStandardMaterial` con vertexColors, roughness 0.85, metalness 0.06, DoubleSide
- Posición Y del mesh: -18
- Grupo (Group) con scale Y inicial = 0.7

### 3.3 Transiciones
- Fade a negro (overlay opacity 0→1, 650ms) antes de cambiar mapa
- Cargar nueva imagen, crear mesh, reemplazar
- Extraer paleta de 3 colores → enviar a ESP32
- Fade desde negro (overlay opacity 1→0)

### 3.4 Respuesta al BPM
- **Cecilia**: controla escala Y del grupo
  - `targetScale = 0.7 + normalize(cecilia.bpm) * 1.3`
  - Interpolado suavemente (factor 0.08)
  - BPM normalizado: `(bpm - 40) / (200 - 40)`, clamp 0-1
- **Claudia**: actualmente no afecta el terreno (preparado para futuro uso)

### 3.5 HUD Panel (panel fijo arriba a la derecha)
- Preview de la imagen seleccionada
- Metadata: nombre archivo, resolución, muestras, escala, coord_1d, colores
- Botón "Elegir otra imagen aleatoria" → `loadRandomMap()`

---

## 4. Joystick / Gamepad

### 4.1 Detección
- Usar Gamepad API (`navigator.getGamepads()`)
- Polling en `requestAnimationFrame`
- Selector de dispositivo en configuración
- Botón "Buscar dispositivos" para re-escanear

### 4.2 Mapeo de controles
| Acción | Botón/Eje | Función |
|--------|-----------|---------|
| Rotar modelo | Stick izquierdo (ejes 0, 1) | `rotateCamera()` |
| Paneo izquierda | Botón 2 (X) | `panCamera(1, 0)` |
| Paneo derecha | Botón 0 (A) | `panCamera(-1, 0)` |
| Paneo arriba | Botón 9 (Inicio) | `panCamera(0, 1)` |
| Paneo abajo | Botón 8 (Atrás) | `panCamera(0, -1)` |
| Acercar | RT (7) + DPad Arriba (12) | `zoomCamera(1/1.03^n)` |
| Alejar | LT (6) + DPad Abajo (13) | `zoomCamera(1.03^n)` |
| Reset | LB (4) | `resetView()` |

### 4.3 Cámara
- Rotación: esférica (theta/phi), phi clamp 0.05 - PI-0.05
- Zoom: multiplicar offset por factor
- Pan: mover cámara + target en ejes derecha/arriba de la cámara
- Deadzone de ejes: 0.06

---

## 5. Micrófono

### 5.1 Captura de audio
- `getUserMedia` con `echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false`
- Selección de dispositivo de entrada
- Selector de volumen de monitor (0-100)

### 5.2 Visualización
- Canvas con forma de onda en tiempo real (time domain data)
- FFT size: 1024, smoothing: 0.6
- Cuando inactivo: línea horizontal plana

### 5.3 UI
- Panel fijo abajo a la derecha
- Dot de estado (verde si activo)
- Botón Activar/Desactivar

---

## 6. Paleta de colores

### 6.1 Extracción (K-means)
- Función `extractPalette(imageData, count=3)`
- Muestreo: max 6000 píxeles, step calculado por raíz cuadrada
- K-means con 10 iteraciones
- Retorna array de hex strings ordenados por frecuencia

---

## 7. Menú / Configuración

### 7.1 Overlay
- Acceso por botón "CONFIGURACIÓN" o tecla `M`
- Cerrar con Escape, click fuera, o botón cerrar
- Grid de columnas auto-fill (min 280px)

### 7.2 Secciones
- **Sensores**: conexión/desconexión por Bluetooth (por cada sensor)
- **Micrófono**: activar, seleccionar dispositivo, volumen
- **Joystick**: buscar, seleccionar, leyenda de controles
- **Dispositivos ESP32**: conectar todos, colores, brillo, pánico

### 7.3 Créditos
- Acceso por tecla `T`
- Lista de participantes: Claudia Valente, Cecilia Vazquez, Nic Motta
- Año 2026

---

## 8. Atajos de teclado

| Tecla | Acción |
|-------|--------|
| `M` | Abrir/cerrar menú configuración |
| `T` | Abrir/cerrar créditos |
| `Escape` | Cerrar menú o créditos |
| `P` | Toggle emulación de sync |

---

## 9. Layout / Responsive

- **Móvil (< 560px)**: sensores en columna única, dashboard más angosto, side-col abajo
- **Desktop**: sensores en grid 2 columnas, side-col fijo a la derecha, dashboard fijo arriba a la izquierda
- Paneles con backdrop-filter blur, bordes redondeados, fondo semitransparente

---

## 10. Dependencias externas (en el código actual)

- `three` (THREE.js) - escena 3D
- `../../lib/three-setup.js` - helper de escena
- `../../lib/load-latents.js` - carga de imágenes aleatorias
- `../../lib/read-image-pixels.js` - lectura de píxeles
- Web Bluetooth API
- Web Audio API
- Gamepad API
