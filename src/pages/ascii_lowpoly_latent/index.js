import '../../styles/base.css'
import { getRandomItem } from '../../lib/load-latents.js'
import { readImagePixels } from '../../lib/read-image-pixels.js'

const canvas = document.getElementById('canvas')
const ctx = canvas.getContext('2d')

const randomBtn = document.getElementById('randomBtn')
const preview = document.getElementById('preview')
const meta = document.getElementById('meta')

let W = 0
let H = 0
let current = null
let imageData = null
let chars = []
let grid = null
let animSeed = Math.random() * 1000

const charset = '@%#*+=-:. 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

resize()
window.addEventListener('resize', resize)
randomBtn.addEventListener('click', loadRandomArt)

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
    const imagePath = `/imagenes_generadas/${item.file}`
    preview.src = imagePath

    imageData = await readImagePixels(imagePath)
    rebuildLayout()
    animSeed = Math.random() * 1000

    meta.innerHTML = `
      <strong>${item.file}</strong><br>
      modo: ASCII + low poly<br>
      grid: ${grid.cols} x ${grid.rows}<br>
      coord_1d: ${Number(item.coord_1d).toFixed(4)}
    `
  } catch (e) {
    console.error(e)
    meta.textContent = 'Error cargando la pieza ASCII.'
  }
}

function rebuildLayout() {
  if (!imageData) return
  const imgW = imageData.width
  const imgH = imageData.height
  const aspect = imgW / imgH

  const cols = Math.max(46, Math.floor((W / 15) * 1.15))
  const rows = Math.max(28, Math.floor(cols / aspect))
  const cellW = W / cols
  const cellH = H / rows

  grid = { cols, rows, cellW, cellH, imgW, imgH }

  chars = new Array(cols * rows).fill(null).map((_, idx) => {
    const x = idx % cols
    const y = Math.floor(idx / cols)
    const { lum, r, g, b } = sampleAtGrid(x, y)
    const char = pickChar(lum)
    return {
      x, y, lum, r, g, b, char,
      z: (1 - lum) * 24,
      phase: Math.random() * Math.PI * 2,
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
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return { lum, r, g, b }
}

function pickChar(lum) {
  const idx = Math.max(0, Math.min(charset.length - 1, Math.floor((1 - lum) * (charset.length - 1))))
  return charset[idx]
}

function loop(ts) {
  const t = ts * 0.001

  ctx.fillStyle = '#06070a'
  ctx.fillRect(0, 0, W, H)

  if (grid && chars.length) {
    drawLowPolyAscii(t)
  }

  requestAnimationFrame(loop)
}

function drawLowPolyAscii(t) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${Math.max(11, Math.floor(grid.cellW * 0.86))}px ui-monospace, monospace`

  const wave = 0.5 + 0.5 * Math.sin(t * 0.8 + animSeed)

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

      const liftA = Math.sin(t * 1.3 + a.phase) * 2.5 + a.z * 0.12
      const liftB = Math.sin(t * 1.2 + b.phase) * 2.5 + b.z * 0.12
      const liftC = Math.sin(t * 1.1 + c.phase) * 2.5 + c.z * 0.12
      const liftD = Math.sin(t * 1.15 + d.phase) * 2.5 + d.z * 0.12

      ctx.beginPath()
      ctx.moveTo(x0, y0 - liftA)
      ctx.lineTo(x1, y0 - liftB)
      ctx.lineTo(x0, y1 - liftC)
      ctx.closePath()
      ctx.fillStyle = triColor(a, b, c, wave)
      ctx.fill()

      ctx.beginPath()
      ctx.moveTo(x1, y0 - liftB)
      ctx.lineTo(x1, y1 - liftD)
      ctx.lineTo(x0, y1 - liftC)
      ctx.closePath()
      ctx.fillStyle = triColor(b, d, c, 1 - wave)
      ctx.fill()
    }
  }

  for (const cell of chars) {
    const px = cell.x * grid.cellW + grid.cellW / 2
    const py = cell.y * grid.cellH + grid.cellH / 2 - Math.sin(t * 0.9 + cell.phase) * (1 + (1 - cell.lum) * 2.2)

    const alpha = 0.15 + (1 - cell.lum) * 0.85
    const glow = 80 + Math.floor((1 - cell.lum) * 120)

    ctx.fillStyle = `rgba(${glow}, ${Math.floor(cell.g * 0.65)}, ${Math.floor(cell.b * 0.95)}, ${alpha})`
    ctx.fillText(cell.char, px, py)
  }

  ctx.globalAlpha = 0.08
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < 120; i++) {
    const x = (Math.sin(i * 999 + t * 12) * 0.5 + 0.5) * W
    const y = (Math.cos(i * 777 + t * 10) * 0.5 + 0.5) * H
    ctx.fillRect(x, y, 1, 1)
  }
  ctx.globalAlpha = 1
}

function triColor(a, b, c, mix) {
  const r = Math.floor((a.r + b.r + c.r) / 3)
  const g = Math.floor((a.g + b.g + c.g) / 3)
  const b2 = Math.floor((a.b + b.b + c.b) / 3)
  const lum = (a.lum + b.lum + c.lum) / 3
  const boost = 0.4 + mix * 0.45
  return `rgba(${Math.floor(r * boost)}, ${Math.floor(g * boost)}, ${Math.floor(b2 * boost)}, ${0.18 + lum * 0.28})`
}

function getCell(x, y) {
  return chars[y * grid.cols + x]
}
