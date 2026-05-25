import { getRandomItem } from './lib/load-latents.js'
import { readImagePixels } from './lib/read-image-pixels.js'

const canvas = document.getElementById('canvas')
const ctx = canvas.getContext('2d')

const randomBtn = document.getElementById('randomBtn')
const preview = document.getElementById('preview')
const meta = document.getElementById('meta')
const contrastSlider = document.getElementById('contrastSlider')
const contrastValue = document.getElementById('contrastValue')
const densitySlider = document.getElementById('densitySlider')
const densityValue = document.getElementById('densityValue')

let W = 0
let H = 0
let current = null
let imageData = null
let grid = null
let cells = []
let seed = Math.random() * 1000

const charset = '@%#*+=-:. '
let params = {
  contrast: Number(contrastSlider.value),
  density: Number(densitySlider.value),
}

resize()
window.addEventListener('resize', resize)
randomBtn.addEventListener('click', loadRandomArt)
contrastSlider.addEventListener('input', () => {
  params.contrast = Number(contrastSlider.value)
  contrastValue.textContent = params.contrast.toFixed(2)
  if (imageData) rebuildLayout()
})
densitySlider.addEventListener('input', () => {
  params.density = Number(densitySlider.value)
  densityValue.textContent = params.density.toFixed(2)
  if (imageData) rebuildLayout()
})

loadRandomArt()
requestAnimationFrame(loop)

function resize() {
  W = window.innerWidth
  H = window.innerHeight
  canvas.width = W
  canvas.height = H
  if (imageData) rebuildLayout()
}

async function loadRandomArt() {
  try {
    const item = await getRandomItem()
    if (!item) return

    current = item
    const imagePath = `./imagenes_generadas/${item.file}`
    preview.src = imagePath

    imageData = await readImagePixels(imagePath)
    rebuildLayout()
    seed = Math.random() * 1000

    meta.innerHTML = `
      <strong>${item.file}</strong><br>
      modo: noir ascii / grabado<br>
      grid: ${grid.cols} x ${grid.rows}<br>
      coord_1d: ${Number(item.coord_1d).toFixed(4)}
    `
  } catch (e) {
    console.error(e)
    meta.textContent = 'Error cargando la pieza noir.'
  }
}

function rebuildLayout() {
  if (!imageData) return

  const imgW = imageData.width
  const imgH = imageData.height
  const aspect = imgW / imgH

  const cols = Math.max(60, Math.floor((W / 11) * params.density))
  const rows = Math.max(32, Math.floor(cols / aspect))
  const cellW = W / cols
  const cellH = H / rows

  grid = { cols, rows, cellW, cellH }

  cells = new Array(cols * rows).fill(null).map((_, idx) => {
    const x = idx % cols
    const y = Math.floor(idx / cols)
    const sample = sampleAtGrid(x, y)
    return {
      x, y, ...sample,
      char: pickChar(sample.lum),
      phase: Math.random() * Math.PI * 2,
      depth: (1 - sample.lum) * 30,
    }
  })
}

function sampleAtGrid(gx, gy) {
  const u = gx / Math.max(grid?.cols - 1 || 1, 1)
  const v = gy / Math.max(grid?.rows - 1 || 1, 1)
  const ix = Math.min(imageData.width - 1, Math.floor(u * (imageData.width - 1)))
  const iy = Math.min(imageData.height - 1, Math.floor(v * (imageData.height - 1)))
  const i = (iy * imageData.width + ix) * 4

  const r = imageData.data[i]
  const g = imageData.data[i + 1]
  const b = imageData.data[i + 2]
  const lumRaw = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  const lum = clamp((lumRaw - 0.5) * params.contrast + 0.5, 0, 1)
  return { lum, lumRaw, r, g, b }
}

function pickChar(lum) {
  const idx = Math.max(0, Math.min(charset.length - 1, Math.floor((1 - lum) * (charset.length - 1))))
  return charset[idx]
}

function loop(ts) {
  const t = ts * 0.001
  ctx.fillStyle = '#050505'
  ctx.fillRect(0, 0, W, H)

  if (grid && cells.length) {
    drawNoirAscii(t)
  }

  requestAnimationFrame(loop)
}

function drawNoirAscii(t) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${Math.max(10, Math.floor(grid.cellW * 0.88))}px ui-monospace, monospace`

  for (let y = 0; y < grid.rows - 1; y++) {
    for (let x = 0; x < grid.cols - 1; x++) {
      const a = getCell(x, y)
      const b = getCell(x + 1, y)
      const c = getCell(x, y + 1)
      const d = getCell(x + 1, y + 1)

      const x0 = x * grid.cellW
      const y0 = y * grid.cellH
      const x1 = (x + 1) * grid.cellW
      const y1 = (y + 1) * grid.cellH

      const wave = Math.sin(t * 0.9 + a.phase) * 1.7
      const liftA = a.depth * 0.12 + wave
      const liftB = b.depth * 0.12 + Math.cos(t * 0.8 + b.phase) * 1.7
      const liftC = c.depth * 0.12 + Math.sin(t * 0.7 + c.phase) * 1.7
      const liftD = d.depth * 0.12 + Math.cos(t * 0.75 + d.phase) * 1.7

      const avg = (a.lum + b.lum + c.lum) / 3
      const avg2 = (b.lum + c.lum + d.lum) / 3

      ctx.beginPath()
      ctx.moveTo(x0, y0 - liftA)
      ctx.lineTo(x1, y0 - liftB)
      ctx.lineTo(x0, y1 - liftC)
      ctx.closePath()
      ctx.fillStyle = `rgba(255,255,255,${0.05 + (1 - avg) * 0.12})`
      ctx.fill()
      ctx.strokeStyle = `rgba(255,255,255,${0.05 + (1 - avg) * 0.18})`
      ctx.lineWidth = 0.35
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(x1, y0 - liftB)
      ctx.lineTo(x1, y1 - liftD)
      ctx.lineTo(x0, y1 - liftC)
      ctx.closePath()
      ctx.fillStyle = `rgba(255,255,255,${0.05 + (1 - avg2) * 0.12})`
      ctx.fill()
      ctx.strokeStyle = `rgba(255,255,255,${0.05 + (1 - avg2) * 0.18})`
      ctx.stroke()
    }
  }

  for (const cell of cells) {
    const wobble = Math.sin(t * 0.95 + cell.phase) * (1.2 + (1 - cell.lum) * 2.4)
    const px = cell.x * grid.cellW + grid.cellW / 2
    const py = cell.y * grid.cellH + grid.cellH / 2 + wobble - cell.depth * 0.02

    const ink = Math.floor(255 * (0.16 + cell.lum * 0.84))
    const alpha = 0.2 + (1 - cell.lum) * 0.8

    ctx.fillStyle = `rgba(${ink},${ink},${ink},${alpha})`
    ctx.fillText(cell.char, px, py)
  }

  ctx.globalAlpha = 0.09
  for (let i = 0; i < 140; i++) {
    const x = (Math.sin(i * 497 + seed + t * 15) * 0.5 + 0.5) * W
    const y = (Math.cos(i * 339 + seed * 0.7 + t * 12) * 0.5 + 0.5) * H
    ctx.fillStyle = i % 2 ? '#ffffff' : '#000000'
    ctx.fillRect(x, y, 1, 1)
  }
  ctx.globalAlpha = 1
}

function getCell(x, y) {
  return cells[y * grid.cols + x]
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}
