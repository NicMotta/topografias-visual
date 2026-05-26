import '../../styles/base.css'
import { getRandomItem } from '../../lib/load-latents.js'
import { readImagePixels } from '../../lib/read-image-pixels.js'

const canvas = document.getElementById('c')
const ctx = canvas.getContext('2d')

const randomBtn = document.getElementById('randomBtn')
const preview = document.getElementById('preview')
const meta = document.getElementById('meta')

let W = 0
let H = 0
let current = null
let flow = null
let particles = []
let palette = ['#b8ecff', '#89d8ff', '#7fa8ff', '#c49bff', '#ffe5a9']

let params = {
  particleCount: 1800,
  step: 1.3,
  turn: 0.45,
  alphaFade: 0.08,
}

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
}

async function loadRandomArt() {
  try {
    const item = await getRandomItem()
    if (!item) return

    current = item
    const imagePath = `${import.meta.env.BASE_URL}imagenes_generadas/${item.file}`
    preview.src = imagePath

    const imageData = await readImagePixels(imagePath)
    palette = extractPalette(imageData, 6)
    flow = buildFlowField(imageData)
    params = buildParamsFromLatent(item, imageData)
    resetParticles()

    ctx.fillStyle = '#04070c'
    ctx.fillRect(0, 0, W, H)

    meta.innerHTML = `
      <strong>${item.file}</strong><br>
      partículas: ${params.particleCount}<br>
      giro de campo: ${params.turn.toFixed(3)}<br>
      paso: ${params.step.toFixed(2)}<br>
      coord_1d: ${Number(item.coord_1d).toFixed(4)}
    `
  } catch (e) {
    console.error(e)
    meta.textContent = 'Error cargando opción artística.'
  }
}

function extractPalette(imageData, n) {
  const d = imageData.data
  const buckets = new Map()

  for (let i = 0; i < d.length; i += 16) {
    const r = Math.floor(d[i] / 32) * 32
    const g = Math.floor(d[i + 1] / 32) * 32
    const b = Math.floor(d[i + 2] / 32) * 32
    const key = `${r},${g},${b}`
    buckets.set(key, (buckets.get(key) || 0) + 1)
  }

  const sorted = [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => {
      const [r, g, b] = k.split(',').map(Number)
      return `rgb(${r}, ${g}, ${b})`
    })

  return sorted.length ? sorted : ['#ffffff']
}

function buildFlowField(imageData) {
  const srcW = imageData.width
  const srcH = imageData.height
  const d = imageData.data

  const gridW = 170
  const gridH = Math.max(80, Math.round((srcH / srcW) * gridW))

  const field = new Float32Array(gridW * gridH)

  let idx = 0
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const u = x / (gridW - 1)
      const v = y / (gridH - 1)
      const ix = Math.min(srcW - 1, Math.floor(u * (srcW - 1)))
      const iy = Math.min(srcH - 1, Math.floor(v * (srcH - 1)))
      const i = (iy * srcW + ix) * 4

      const r = d[i] / 255
      const g = d[i + 1] / 255
      const b = d[i + 2] / 255
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b

      field[idx++] = lum
    }
  }

  return { gridW, gridH, field }
}

function buildParamsFromLatent(item, imageData) {
  const x = Number(item.coord_3d?.x || 0)
  const y = Number(item.coord_3d?.y || 0)
  const z = Number(item.coord_3d?.z || 0)
  const c1 = Number(item.coord_1d || 0)

  const abs = (v) => Math.abs(v)

  const d = imageData.data
  let acc = 0
  for (let i = 0; i < d.length; i += 24) {
    const r = d[i] / 255
    const g = d[i + 1] / 255
    const b = d[i + 2] / 255
    acc += 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const avgLum = acc / (d.length / 24)

  return {
    particleCount: 1200 + Math.floor(2200 * Math.min(avgLum + abs(c1) * 0.08, 1)),
    step: 0.8 + abs(x) * 0.22,
    turn: 0.15 + abs(y) * 0.2,
    alphaFade: 0.04 + abs(z) * 0.012,
  }
}

function resetParticles() {
  particles = []
  for (let i = 0; i < params.particleCount; i++) {
    particles.push(newParticle())
  }
}

function newParticle() {
  return {
    x: Math.random() * W,
    y: Math.random() * H,
    vx: 0,
    vy: 0,
    colorIdx: Math.floor(Math.random() * palette.length),
    life: 120 + Math.random() * 240,
  }
}

function sampleFlow(x, y) {
  if (!flow) return 0
  const gx = Math.max(0, Math.min(flow.gridW - 1, Math.floor((x / W) * flow.gridW)))
  const gy = Math.max(0, Math.min(flow.gridH - 1, Math.floor((y / H) * flow.gridH)))
  return flow.field[gy * flow.gridW + gx]
}

function loop(ts) {
  const t = ts * 0.001

  ctx.fillStyle = `rgba(4,7,12,${params.alphaFade})`
  ctx.fillRect(0, 0, W, H)

  if (current && flow && particles.length) {
    drawFlow(t)
  }

  requestAnimationFrame(loop)
}

function drawFlow(t) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]

    const lum = sampleFlow(p.x, p.y)
    const angle = lum * Math.PI * 4 + t * 0.1

    const tx = Math.cos(angle) * params.step
    const ty = Math.sin(angle + params.turn) * params.step

    p.vx = p.vx * 0.86 + tx * 0.6
    p.vy = p.vy * 0.86 + ty * 0.6

    const prevX = p.x
    const prevY = p.y

    p.x += p.vx
    p.y += p.vy
    p.life -= 1

    const out = p.x < 0 || p.x > W || p.y < 0 || p.y > H
    if (out || p.life <= 0) {
      particles[i] = newParticle()
      continue
    }

    ctx.strokeStyle = palette[p.colorIdx % palette.length]
    ctx.globalAlpha = 0.15 + lum * 0.65
    ctx.lineWidth = 0.5 + lum * 1.6
    ctx.beginPath()
    ctx.moveTo(prevX, prevY)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  ctx.globalAlpha = 1
}
