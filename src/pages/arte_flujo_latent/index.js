import '../../styles/base.css'
import * as THREE from 'three'
import { createScene, startRenderLoop } from '../../lib/three-setup.js'
import { getRandomItem } from '../../lib/load-latents.js'
import { readImagePixels } from '../../lib/read-image-pixels.js'

const { scene, camera, renderer, controls } = createScene({
  cameraPos: [0, 25, 180],
  background: 0x05060a,
  fov: 62,
  far: 5000,
})

let particles = null
let basePositions = null
let phaseAttr = null

const preview = document.getElementById('preview')
const meta = document.getElementById('meta')
const randomBtn = document.getElementById('randomBtn')

scene.add(new THREE.AmbientLight(0xffffff, 0.7))

const d = new THREE.DirectionalLight(0xffffff, 0.5)
d.position.set(120, 160, 100)
scene.add(d)

randomBtn.addEventListener('click', loadRandomArtwork)

startRenderLoop(renderer, scene, camera, controls, () => {
  if (particles && basePositions && phaseAttr) {
    const pos = particles.geometry.attributes.position.array
    const t = performance.now() * 0.001

    for (let i = 0; i < phaseAttr.length; i++) {
      const i3 = i * 3
      const baseX = basePositions[i3]
      const baseY = basePositions[i3 + 1]
      const baseZ = basePositions[i3 + 2]
      const ph = phaseAttr[i]

      pos[i3] = baseX + Math.sin(t * 1.3 + ph) * 0.9
      pos[i3 + 1] = baseY + Math.cos(t * 2.0 + ph * 0.7) * 1.7
      pos[i3 + 2] = baseZ + Math.sin(t * 1.1 + ph * 1.2) * 0.9
    }

    particles.geometry.attributes.position.needsUpdate = true
    particles.rotation.y += 0.0018
  }
})

loadRandomArtwork()

async function loadRandomArtwork() {
  try {
    const item = await getRandomItem()
    if (!item) return

    const imagePath = `${import.meta.env.BASE_URL}imagenes_generadas/${item.file}`

    const imageData = await readImagePixels(imagePath)
    buildParticleArtwork(imageData)

    preview.src = imagePath
    meta.innerHTML = `
      <strong>${item.file}</strong><br>
      modo: puntos aditivos + oscilación temporal<br>
      coord_1d: ${Number(item.coord_1d).toFixed(4)}
    `
  } catch (e) {
    console.error(e)
    meta.textContent = 'Error generando la visualización artística.'
  }
}

function buildParticleArtwork(imageData) {
  if (particles) {
    scene.remove(particles)
    particles.geometry.dispose()
    particles.material.dispose()
    particles = null
  }

  const srcW = imageData.width
  const srcH = imageData.height
  const px = imageData.data

  const targetW = 170
  const targetH = Math.max(60, Math.round((srcH / srcW) * targetW))

  const count = targetW * targetH
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const phase = new Float32Array(count)

  const widthWorld = 180
  const heightWorld = (widthWorld * srcH) / srcW

  let p = 0

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const u = x / (targetW - 1)
      const v = y / (targetH - 1)

      const ix = Math.min(srcW - 1, Math.floor(u * (srcW - 1)))
      const iy = Math.min(srcH - 1, Math.floor(v * (srcH - 1)))
      const i = (iy * srcW + ix) * 4

      const r = px[i] / 255
      const g = px[i + 1] / 255
      const b = px[i + 2] / 255
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b

      const wx = u * widthWorld - widthWorld / 2
      const wz = v * heightWorld - heightWorld / 2
      const wy = (lum - 0.5) * 28

      positions[p * 3] = wx
      positions[p * 3 + 1] = wy
      positions[p * 3 + 2] = wz

      colors[p * 3] = Math.min(1, r * 1.25)
      colors[p * 3 + 1] = Math.min(1, g * 1.25)
      colors[p * 3 + 2] = Math.min(1, b * 1.25)

      phase[p] = Math.random() * Math.PI * 2
      p++
    }
  }

  basePositions = new Float32Array(positions)
  phaseAttr = phase

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const material = new THREE.PointsMaterial({
    size: 1.15,
    vertexColors: true,
    transparent: true,
    opacity: 0.86,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  particles = new THREE.Points(geometry, material)
  scene.add(particles)
}
