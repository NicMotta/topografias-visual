import '../../styles/base.css'
import * as THREE from 'three'
import { createScene, startRenderLoop } from '../../lib/three-setup.js'
import { getRandomItem } from '../../lib/load-latents.js'
import { readImagePixels } from '../../lib/read-image-pixels.js'

const { scene, camera, renderer, controls } = createScene({
  cameraPos: [0, 120, 190],
  background: 0x0b0f17,
  far: 5000,
  controlsTarget: [0, 0, 0],
})

let terrainMesh = null
let rivers = null
let terrainData = null
let activeItem = null

const preview = document.getElementById('preview')
const meta = document.getElementById('meta')
const randomBtn = document.getElementById('randomBtn')
const liftSlider = document.getElementById('liftSlider')
const liftValue = document.getElementById('liftValue')
const thicknessSlider = document.getElementById('thicknessSlider')
const thicknessValue = document.getElementById('thicknessValue')

scene.add(new THREE.AmbientLight(0xffffff, 0.86))

const key = new THREE.DirectionalLight(0xffffff, 0.9)
key.position.set(100, 170, 90)
scene.add(key)

const fill = new THREE.DirectionalLight(0x6fb3ff, 0.26)
fill.position.set(-80, 80, -60)
scene.add(fill)

scene.add(new THREE.AxesHelper(28))

randomBtn.addEventListener('click', buildRandomScene)
liftSlider.addEventListener('input', onLiftChange)
thicknessSlider.addEventListener('input', onThicknessChange)

startRenderLoop(renderer, scene, camera, controls, () => {
  const t = performance.now() * 0.001
  updateRivers(t)
})

buildRandomScene()

async function buildRandomScene() {
  try {
    meta.textContent = 'Cargando datos...'

    const item = await getRandomItem()
    if (!item) {
      meta.textContent = 'No hay items en latents.json'
      return
    }

    activeItem = item
    const imagePath = `/imagenes_generadas/${item.file}`
    preview.src = imagePath

    const imageData = await readImagePixels(imagePath)
    const built = createTerrainFromImage(imageData)

    if (terrainMesh) {
      scene.remove(terrainMesh)
      terrainMesh.geometry.dispose()
      terrainMesh.material.dispose()
    }

    terrainMesh = built.mesh
    terrainData = built.data
    scene.add(terrainMesh)

    rebuildRivers()

    meta.innerHTML = `
      <strong>${item.file}</strong><br>
      terreno: ${terrainData.gridW} x ${terrainData.gridH}<br>
      ríos: ${rivers.particleCount}<br>
      coord_1d: ${Number(item.coord_1d).toFixed(4)}
    `
  } catch (error) {
    console.error(error)
    meta.textContent = 'Error al crear terreno con ríos'
  }
}

function createTerrainFromImage(imageData) {
  const srcW = imageData.width
  const srcH = imageData.height
  const pix = imageData.data

  const gridW = 120
  const gridH = Math.max(40, Math.round((srcH / srcW) * gridW))
  const widthWorld = 140
  const depthWorld = (140 * srcH) / srcW
  const heightScale = 42

  const geometry = new THREE.PlaneGeometry(widthWorld, depthWorld, gridW - 1, gridH - 1)
  geometry.rotateX(-Math.PI / 2)

  const pos = geometry.attributes.position
  const colors = new Float32Array(gridW * gridH * 3)
  const heights = new Float32Array(gridW * gridH)

  let maxH = -Infinity
  let minH = Infinity

  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const u = x / (gridW - 1)
      const v = y / (gridH - 1)

      const ix = Math.min(srcW - 1, Math.floor(u * (srcW - 1)))
      const iy = Math.min(srcH - 1, Math.floor(v * (srcH - 1)))
      const i = (iy * srcW + ix) * 4

      const r = pix[i] / 255
      const g = pix[i + 1] / 255
      const b = pix[i + 2] / 255
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      const h = lum * heightScale

      const idx = y * gridW + x
      heights[idx] = h
      pos.setY(idx, h)

      colors[idx * 3] = r
      colors[idx * 3 + 1] = g
      colors[idx * 3 + 2] = b

      if (h > maxH) maxH = h
      if (h < minH) minH = h
    }
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.05,
    side: THREE.DoubleSide,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = -18

  return {
    mesh,
    data: {
      gridW, gridH, widthWorld, depthWorld, heightScale,
      heights, minH, maxH, yOffset: -18, riverLift: 1.6,
    },
  }
}

function rebuildRivers() {
  if (!terrainData || !activeItem) return

  if (rivers) {
    scene.remove(rivers.line)
    rivers.line.geometry.dispose()
    rivers.line.material.dispose()
    rivers = null
  }

  const abs = (v) => Math.abs(v)
  const c1 = Number(activeItem.coord_1d || 0)
  const lx = Number(activeItem.coord_3d?.x || 0)
  const ly = Number(activeItem.coord_3d?.y || 0)
  const lz = Number(activeItem.coord_3d?.z || 0)

  const particleCount = Math.max(320, Math.min(1200, Math.floor(460 + abs(c1) * 150)))
  const step = 0.28 + abs(lx) * 0.04
  const turn = 0.2 + abs(ly) * 0.07
  const damping = 0.9
  const jitter = 0.07 + abs(lz) * 0.015

  const positions = new Float32Array(particleCount * 2 * 3)
  const colors = new Float32Array(particleCount * 2 * 3)
  const particles = new Array(particleCount)

  for (let i = 0; i < particleCount; i++) {
    particles[i] = spawnParticle()
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const lineWidth = Number(thicknessSlider.value)
  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    linewidth: lineWidth,
  })

  const line = new THREE.LineSegments(geo, mat)
  scene.add(line)

  rivers = {
    particleCount, particles, positions, colors, line,
    step, turn, damping, jitter,
    phase: Math.random() * 1000, lineWidth,
  }

  liftSlider.value = String(terrainData.riverLift)
  liftValue.textContent = Number(terrainData.riverLift).toFixed(2)
  thicknessValue.textContent = lineWidth.toFixed(1)
}

function onLiftChange() {
  if (!terrainData) return
  terrainData.riverLift = Number(liftSlider.value)
  liftValue.textContent = terrainData.riverLift.toFixed(2)
}

function onThicknessChange() {
  const v = Number(thicknessSlider.value)
  thicknessValue.textContent = v.toFixed(1)
  if (!rivers?.line?.material) return
  rivers.line.material.linewidth = v
  rivers.line.material.needsUpdate = true
}

function spawnParticle() {
  const p = { x: 0, z: 0, vx: 0, vz: 0, life: 0 }
  for (let k = 0; k < 32; k++) {
    const x = (Math.random() - 0.5) * terrainData.widthWorld
    const z = (Math.random() - 0.5) * terrainData.depthWorld
    const h = sampleHeight(x, z)
    if (h > terrainData.minH + (terrainData.maxH - terrainData.minH) * 0.55) {
      p.x = x; p.z = z; p.life = 80 + Math.random() * 220; return p
    }
  }
  p.x = (Math.random() - 0.5) * terrainData.widthWorld
  p.z = (Math.random() - 0.5) * terrainData.depthWorld
  p.life = 80 + Math.random() * 220
  return p
}

function sampleHeight(x, z) {
  const u = THREE.MathUtils.clamp(x / terrainData.widthWorld + 0.5, 0, 1)
  const v = THREE.MathUtils.clamp(z / terrainData.depthWorld + 0.5, 0, 1)
  const fx = u * (terrainData.gridW - 1)
  const fz = v * (terrainData.gridH - 1)
  const x0 = Math.floor(fx); const z0 = Math.floor(fz)
  const x1 = Math.min(terrainData.gridW - 1, x0 + 1)
  const z1 = Math.min(terrainData.gridH - 1, z0 + 1)
  const tx = fx - x0; const tz = fz - z0
  const h00 = terrainData.heights[z0 * terrainData.gridW + x0]
  const h10 = terrainData.heights[z0 * terrainData.gridW + x1]
  const h01 = terrainData.heights[z1 * terrainData.gridW + x0]
  const h11 = terrainData.heights[z1 * terrainData.gridW + x1]
  const h0 = h00 * (1 - tx) + h10 * tx
  const h1 = h01 * (1 - tx) + h11 * tx
  return h0 * (1 - tz) + h1 * tz
}

function sampleGradient(x, z) {
  const epsX = terrainData.widthWorld / terrainData.gridW
  const epsZ = terrainData.depthWorld / terrainData.gridH
  const hL = sampleHeight(x - epsX, z)
  const hR = sampleHeight(x + epsX, z)
  const hD = sampleHeight(x, z - epsZ)
  const hU = sampleHeight(x, z + epsZ)
  const dhdx = (hR - hL) / (2 * epsX)
  const dhdz = (hU - hD) / (2 * epsZ)
  const len = Math.hypot(-dhdx, -dhdz) || 1
  return { x: -dhdx / len, z: -dhdz / len }
}

function updateRivers(time) {
  if (!rivers || !terrainData) return

  const positions = rivers.positions
  const colors = rivers.colors
  const w2 = terrainData.widthWorld * 0.5
  const d2 = terrainData.depthWorld * 0.5

  for (let i = 0; i < rivers.particleCount; i++) {
    let p = rivers.particles[i]

    const px = p.x
    const pz = p.z
    const py = sampleHeight(px, pz) + terrainData.yOffset + terrainData.riverLift

    const grad = sampleGradient(px, pz)
    const lumN = (sampleHeight(px, pz) - terrainData.minH) / Math.max(terrainData.maxH - terrainData.minH, 1e-6)

    const ang = lumN * Math.PI * 4 + time * 0.2 + rivers.phase
    const swirlX = Math.cos(ang) * rivers.turn
    const swirlZ = Math.sin(ang + 1.2) * rivers.turn

    const ax = grad.x * rivers.step + swirlX * 0.22
    const az = grad.z * rivers.step + swirlZ * 0.22

    p.vx = p.vx * rivers.damping + ax + (Math.random() - 0.5) * rivers.jitter
    p.vz = p.vz * rivers.damping + az + (Math.random() - 0.5) * rivers.jitter

    p.x += p.vx
    p.z += p.vz
    p.life -= 1

    const nx = p.x
    const nz = p.z
    const ny = sampleHeight(nx, nz) + terrainData.yOffset + terrainData.riverLift

    const out = nx < -w2 || nx > w2 || nz < -d2 || nz > d2
    if (out || p.life <= 0) {
      rivers.particles[i] = spawnParticle()
      p = rivers.particles[i]
    }

    const i6 = i * 6
    positions[i6] = px
    positions[i6 + 1] = py
    positions[i6 + 2] = pz
    positions[i6 + 3] = nx
    positions[i6 + 4] = ny
    positions[i6 + 5] = nz

    const brightness = 0.35 + lumN * 0.65
    colors[i6] = 0.1 * brightness
    colors[i6 + 1] = 0.6 * brightness
    colors[i6 + 2] = 1.0 * brightness
    colors[i6 + 3] = 0.1 * brightness
    colors[i6 + 4] = 0.6 * brightness
    colors[i6 + 5] = 1.0 * brightness
  }

  rivers.line.geometry.attributes.position.needsUpdate = true
  rivers.line.geometry.attributes.color.needsUpdate = true
}
