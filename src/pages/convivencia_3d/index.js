import '../../styles/base.css'
import * as THREE from 'three'
import { createScene, startRenderLoop } from '../../lib/three-setup.js'
import { fetchLatents } from '../../lib/load-latents.js'
import { readImagePixels } from '../../lib/read-image-pixels.js'

const { scene, camera, renderer, controls, raycaster, pointer } = createScene({
  cameraPos: [0, 110, 290],
  background: 0x0f1014,
  far: 7000,
  controlsTarget: [0, 20, 0],
})

let points = []
let selectedPoint = null
let terrainMesh = null
let items = []

const pointGroup = new THREE.Group()
const terrainGroup = new THREE.Group()

const preview = document.getElementById('preview')
const meta = document.getElementById('meta')
const mapMeta = document.getElementById('mapMeta')
const randomMapBtn = document.getElementById('randomMapBtn')

scene.add(new THREE.AmbientLight(0xffffff, 0.9))

const light = new THREE.DirectionalLight(0xffffff, 0.85)
light.position.set(140, 180, 110)
scene.add(light)

pointGroup.position.set(-110, 0, 0)
terrainGroup.position.set(110, 0, 0)
scene.add(pointGroup)
scene.add(terrainGroup)

terrainGroup.add(new THREE.GridHelper(180, 18, 0x406080, 0x304050))

window.addEventListener('click', onClick)

randomMapBtn.addEventListener('click', () => {
  if (!items.length) return
  const randomItem = items[Math.floor(Math.random() * items.length)]
  buildMapFromItem(randomItem)
})

startRenderLoop(renderer, scene, camera, controls)
loadData()

async function loadData() {
  const data = await fetchLatents()
  items = data.items || []

  if (!items.length) {
    meta.textContent = 'No se encontraron items en latents.json'
    return
  }

  buildPointCloud(items)

  const firstRandom = items[Math.floor(Math.random() * items.length)]
  await buildMapFromItem(firstRandom)

  meta.innerHTML = `
    puntos: ${items.length}<br>
    click en un punto para actualizar el mapa
  `
}

function buildPointCloud(dataItems) {
  const SCALE = 8
  const R = 0.55

  const minCoord1d = Math.min(...dataItems.map((it) => Number(it.coord_1d) || 0))
  const maxCoord1d = Math.max(...dataItems.map((it) => Number(it.coord_1d) || 1))
  const rangeCoord1d = Math.max(maxCoord1d - minCoord1d, 1e-9)

  const sphere = new THREE.SphereGeometry(R, 10, 10)

  for (const item of dataItems) {
    const x = (item.coord_3d?.x ?? 0) * SCALE
    const y = (item.coord_3d?.y ?? 0) * SCALE
    const z = (item.coord_3d?.z ?? 0) * SCALE

    const t = (Number(item.coord_1d) - minCoord1d) / rangeCoord1d
    const c = new THREE.Color().setHSL(0.65 - t * 0.65, 0.9, 0.55)

    const point = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: c }))
    point.position.set(x, y, z)
    point.userData = { ...item, baseColorHex: c.getHex() }

    pointGroup.add(point)
    points.push(point)
  }

  const sorted = [...points].sort(
    (a, b) => (a.userData.coord_1d ?? 0) - (b.userData.coord_1d ?? 0),
  )

  const linePoints = []
  for (let i = 0; i < sorted.length - 1; i++) {
    linePoints.push(sorted[i].position, sorted[i + 1].position)
  }

  const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints)
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x6aa9ff,
    transparent: true,
    opacity: 0.35,
  })

  pointGroup.add(new THREE.LineSegments(lineGeo, lineMat))
}

async function buildMapFromItem(item) {
  const imagePath = `/imagenes_generadas/${item.file}`
  preview.src = imagePath

  if (selectedPoint) {
    selectedPoint.scale.set(1, 1, 1)
    selectedPoint.material.color.setHex(selectedPoint.userData.baseColorHex)
  }

  const match = points.find((p) => p.userData.file === item.file)
  if (match) {
    match.scale.set(1.9, 1.9, 1.9)
    match.material.color.set(0xff0000)
    selectedPoint = match
  }

  const imageData = await readImagePixels(imagePath)
  const { mesh, sampleW, sampleH, avgLum } = createTerrainFromImage(imageData)

  if (terrainMesh) {
    terrainGroup.remove(terrainMesh)
    terrainMesh.geometry.dispose()
    terrainMesh.material.dispose()
  }

  terrainMesh = mesh
  terrainGroup.add(terrainMesh)

  mapMeta.innerHTML = `
    <strong>${item.file}</strong><br>
    mapa: ${sampleW} x ${sampleH}<br>
    luminancia promedio: ${avgLum.toFixed(3)}<br>
    coord_1d: ${Number(item.coord_1d).toFixed(4)}
  `
}

function createTerrainFromImage(imageData) {
  const srcW = imageData.width
  const srcH = imageData.height
  const pixels = imageData.data

  const sampleW = 110
  const sampleH = Math.max(44, Math.round((srcH / srcW) * sampleW))
  const heightScale = 40

  const geo = new THREE.PlaneGeometry(160, (160 * srcH) / srcW, sampleW - 1, sampleH - 1)
  geo.rotateX(-Math.PI / 2)

  const pos = geo.attributes.position
  const colors = new Float32Array(sampleW * sampleH * 3)
  let lumAcc = 0

  for (let y = 0; y < sampleH; y++) {
    for (let x = 0; x < sampleW; x++) {
      const u = x / (sampleW - 1)
      const v = y / (sampleH - 1)

      const ix = Math.min(srcW - 1, Math.floor(u * (srcW - 1)))
      const iy = Math.min(srcH - 1, Math.floor(v * (srcH - 1)))
      const i = (iy * srcW + ix) * 4

      const r = pixels[i] / 255
      const g = pixels[i + 1] / 255
      const b = pixels[i + 2] / 255
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      lumAcc += lum

      const idx = y * sampleW + x
      pos.setY(idx, lum * heightScale)
      colors[idx * 3] = r
      colors[idx * 3 + 1] = g
      colors[idx * 3 + 2] = b
    }
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.DoubleSide,
  })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.y = -20

  return { mesh, sampleW, sampleH, avgLum: lumAcc / (sampleW * sampleH) }
}

function onClick(event) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1

  raycaster.setFromCamera(pointer, camera)
  const intersects = raycaster.intersectObjects(points)

  if (intersects.length > 0) {
    const item = intersects[0].object.userData
    buildMapFromItem(item)
  }
}
