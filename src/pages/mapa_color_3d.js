import * as THREE from 'three'
import { createScene, startRenderLoop } from '../lib/three-setup.js'
import { getRandomItem } from '../lib/load-latents.js'
import { readImagePixels } from '../lib/read-image-pixels.js'
import { start as startAudio } from '../lib/strudel-player.js'
import { settings } from '../lib/store.js'

const { scene, camera, renderer, controls } = createScene({
  cameraPos: [0, 110, 180],
  background: 0x0e0e0e,
  far: 5000,
  controlsTarget: [0, 0, 0],
})

let currentMesh = null

const preview = document.getElementById('preview')
const meta = document.getElementById('meta')
const randomBtn = document.getElementById('randomBtn')

scene.add(new THREE.AmbientLight(0xffffff, 0.9))

const keyLight = new THREE.DirectionalLight(0xffffff, 0.8)
keyLight.position.set(90, 160, 120)
scene.add(keyLight)
scene.add(new THREE.AxesHelper(35))

randomBtn.addEventListener('click', async () => {
  const item = await buildRandomMap()
  if (item) {
    await startAudio(item)
  }
})
startRenderLoop(renderer, scene, camera, controls)
buildRandomMap()

async function buildRandomMap() {
  try {
    meta.textContent = 'Cargando datos...'

    const item = await getRandomItem()
    if (!item) {
      meta.textContent = 'No hay items en latents.json'
      return null
    }

    settings.setKey('lastLatent', item)

    const imagePath = `./imagenes_generadas/${item.file}`
    const imageData = await readImagePixels(imagePath)
    const mesh = createHeightMeshFromImage(imageData)

    if (currentMesh) {
      scene.remove(currentMesh)
      currentMesh.geometry.dispose()
      currentMesh.material.dispose()
    }

    currentMesh = mesh
    scene.add(currentMesh)
    preview.src = imagePath

    meta.innerHTML = `
      <strong>${item.file}</strong><br>
      resolución: ${imageData.width} x ${imageData.height}<br>
      muestras usadas: ${mesh.userData.sampleW} x ${mesh.userData.sampleH}<br>
      escala altura: ${mesh.userData.heightScale}
    `

    return item
  } catch (error) {
    console.error(error)
    meta.textContent = 'Error al generar el mapa 3D'
    return null
  }
}

function createHeightMeshFromImage(imageData) {
  const srcW = imageData.width
  const srcH = imageData.height
  const data = imageData.data

  const targetW = 120
  const targetH = Math.max(40, Math.round((srcH / srcW) * targetW))

  const geometry = new THREE.PlaneGeometry(140, (140 * srcH) / srcW, targetW - 1, targetH - 1)
  geometry.rotateX(-Math.PI / 2)

  const positions = geometry.attributes.position
  const colors = new Float32Array(targetW * targetH * 3)
  const heightScale = 42

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const u = x / (targetW - 1)
      const v = y / (targetH - 1)

      const ix = Math.min(srcW - 1, Math.floor(u * (srcW - 1)))
      const iy = Math.min(srcH - 1, Math.floor(v * (srcH - 1)))
      const idx = (iy * srcW + ix) * 4

      const r = data[idx] / 255
      const g = data[idx + 1] / 255
      const b = data[idx + 2] / 255
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
      const h = luminance * heightScale

      const vertexIndex = y * targetW + x
      positions.setY(vertexIndex, h)

      colors[vertexIndex * 3] = r
      colors[vertexIndex * 3 + 1] = g
      colors[vertexIndex * 3 + 2] = b
    }
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.06,
    side: THREE.DoubleSide,
    flatShading: false,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = -18
  mesh.userData = { sampleW: targetW, sampleH: targetH, heightScale }

  return mesh
}
