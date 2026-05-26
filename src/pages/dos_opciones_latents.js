import { fetchLatents } from '../lib/load-latents.js'

let items = []
let sorted = []
let currentIndex = 0

const slider = document.getElementById('indexSlider')
const mainImg = document.getElementById('mainImg')
const mainMeta = document.getElementById('mainMeta')
const spark = document.getElementById('spark')
const sparkMeta = document.getElementById('sparkMeta')
const neighbors = document.getElementById('neighbors')
const neighborsMeta = document.getElementById('neighborsMeta')

document.getElementById('prevBtn').addEventListener('click', () => {
  setIndex(Math.max(0, currentIndex - 1))
})

document.getElementById('nextBtn').addEventListener('click', () => {
  setIndex(Math.min(sorted.length - 1, currentIndex + 1))
})

document.getElementById('randomBtn').addEventListener('click', () => {
  setIndex(Math.floor(Math.random() * sorted.length))
})

slider.addEventListener('input', (e) => {
  setIndex(Number(e.target.value))
})

init()

async function init() {
  const data = await fetchLatents()
  items = data.items || []

  sorted = [...items].sort((a, b) => Number(a.coord_1d) - Number(b.coord_1d))

  slider.max = String(Math.max(sorted.length - 1, 0))
  setIndex(Math.floor(sorted.length / 2))
}

function setIndex(index) {
  currentIndex = index
  slider.value = String(index)
  renderCurrent()
}

function renderCurrent() {
  if (!sorted.length) return
  const item = sorted[currentIndex]

  mainImg.src = `./imagenes_generadas/${item.file}`

  const percentile = ((currentIndex / Math.max(sorted.length - 1, 1)) * 100).toFixed(1)

  mainMeta.innerHTML = `
    <strong>${item.file}</strong><br>
    id: ${item.id}<br>
    índice ordenado: ${currentIndex + 1} / ${sorted.length}<br>
    percentil coord_1d: ${percentile}%<br>
    coord_1d: ${Number(item.coord_1d).toFixed(5)}<br>
    coord_3d: (${Number(item.coord_3d.x).toFixed(3)}, ${Number(item.coord_3d.y).toFixed(3)}, ${Number(item.coord_3d.z).toFixed(3)})
  `

  drawSparkline()
  renderNeighbors(item)
}

function drawSparkline() {
  const ctx = spark.getContext('2d')
  const w = spark.width
  const h = spark.height

  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#111523'
  ctx.fillRect(0, 0, w, h)

  const values = sorted.map((it) => Number(it.coord_1d))
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(max - min, 1e-9)

  ctx.strokeStyle = '#5ca7ff'
  ctx.lineWidth = 1.6
  ctx.beginPath()

  for (let i = 0; i < values.length; i++) {
    const x = (i / Math.max(values.length - 1, 1)) * (w - 20) + 10
    const y = h - 10 - ((values[i] - min) / range) * (h - 20)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()

  const cx = (currentIndex / Math.max(values.length - 1, 1)) * (w - 20) + 10
  const cy = h - 10 - ((values[currentIndex] - min) / range) * (h - 20)

  ctx.fillStyle = '#ff4040'
  ctx.beginPath()
  ctx.arc(cx, cy, 4.3, 0, Math.PI * 2)
  ctx.fill()

  sparkMeta.textContent = `Rango coord_1d: min ${min.toFixed(4)} · max ${max.toFixed(4)} · punto actual en rojo`
}

function renderNeighbors(base) {
  const bx = Number(base.coord_3d.x)
  const by = Number(base.coord_3d.y)
  const bz = Number(base.coord_3d.z)

  const list = items
    .filter((it) => it.file !== base.file)
    .map((it) => {
      const dx = Number(it.coord_3d.x) - bx
      const dy = Number(it.coord_3d.y) - by
      const dz = Number(it.coord_3d.z) - bz
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      return { item: it, d, delta1d: Number(it.coord_1d) - Number(base.coord_1d) }
    })
    .sort((a, b) => a.d - b.d)
    .slice(0, 8)

  neighborsMeta.innerHTML =
    `Base: <strong>${base.file}</strong> · distancia euclídea en coord_3d`

  neighbors.innerHTML = ''

  for (const n of list) {
    const card = document.createElement('article')
    card.className = 'card'

    const img = document.createElement('img')
    img.src = `./imagenes_generadas/${n.item.file}`
    img.alt = n.item.file
    img.title = 'Click para usar esta imagen como base'
    img.addEventListener('click', () => {
      const idx = sorted.findIndex((it) => it.file === n.item.file)
      if (idx >= 0) setIndex(idx)
    })

    const text = document.createElement('div')
    text.className = 'small'
    text.innerHTML = `
      <strong>${n.item.file}</strong><br>
      dist: ${n.d.toFixed(4)}<br>
      Δcoord_1d: ${n.delta1d.toFixed(4)}
    `

    card.appendChild(img)
    card.appendChild(text)
    neighbors.appendChild(card)
  }
}
