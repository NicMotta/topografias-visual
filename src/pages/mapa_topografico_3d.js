import * as THREE from 'three'
import { createScene, startRenderLoop } from '../lib/three-setup.js'
import { getRandomItem } from '../lib/load-latents.js'
import { readImagePixels } from '../lib/read-image-pixels.js'

const { scene, camera, renderer, controls } = createScene({
  cameraPos: [0, 135, 200],
  background: 0x0d1118,
  fov: 58,
  far: 5000,
  controlsTarget: [0, 0, 0],
})

let terrainMesh = null
let contourLines = null
let lastImageData = null
let currentItem = null

const preview = document.getElementById('preview')
const meta = document.getElementById('meta')
const randomBtn = document.getElementById('randomBtn')
const heightScaleInput = document.getElementById('heightScale')
const contourStepInput = document.getElementById('contourStep')
const heightScaleValue = document.getElementById('heightScaleValue')
const contourStepValue = document.getElementById('contourStepValue')

scene.add(new THREE.AmbientLight(0xffffff, 0.9))

const sun = new THREE.DirectionalLight(0xffffff, 0.9)
sun.position.set(110, 170, 90)
scene.add(sun)
scene.add(new THREE.AxesHelper(30))

randomBtn.addEventListener('click', buildRandomTopography)
heightScaleInput.addEventListener('input', rebuildFromCurrentImage)
contourStepInput.addEventListener('input', rebuildFromCurrentImage)

startRenderLoop(renderer, scene, camera, controls)
buildRandomTopography()

async function buildRandomTopography() {
  try {
    meta.textContent = 'Cargando datos...'

    const item = await getRandomItem()
    if (!item) {
      meta.textContent = 'No hay items en latents.json'
      return
    }

    currentItem = item
    const imagePath = `./imagenes_generadas/${item.file}`
    preview.src = imagePath

    lastImageData = await readImagePixels(imagePath)
    rebuildFromCurrentImage()
  } catch (error) {
    console.error(error)
    meta.textContent = 'Error generando topografía'
  }
}

function rebuildFromCurrentImage() {
  if (!lastImageData) return

  const heightScale = Number(heightScaleInput.value)
  const contourStep = Number(contourStepInput.value)

  heightScaleValue.textContent = heightScale.toFixed(0)
  contourStepValue.textContent = contourStep.toFixed(1)

  const built = createTerrainAndContours(lastImageData, { heightScale, contourStep })

  if (terrainMesh) {
    scene.remove(terrainMesh)
    terrainMesh.geometry.dispose()
    terrainMesh.material.dispose()
  }

  if (contourLines) {
    scene.remove(contourLines)
    contourLines.geometry.dispose()
    contourLines.material.dispose()
  }

  terrainMesh = built.terrainMesh
  contourLines = built.contourLines

  scene.add(terrainMesh)
  scene.add(contourLines)

  meta.innerHTML = `
    <strong>${currentItem?.file ?? '-'}</strong><br>
    curvas: ${built.levelCount} niveles<br>
    equidistancia: ${contourStep.toFixed(1)}<br>
    exageración: ${heightScale.toFixed(0)}
  `
}

function createTerrainAndContours(imageData, options) {
  const srcW = imageData.width
  const srcH = imageData.height
  const pix = imageData.data

  const gridW = 130
  const gridH = Math.max(46, Math.round((srcH / srcW) * gridW))
  const widthWorld = 145
  const depthWorld = (145 * srcH) / srcW
  const heightScale = options.heightScale
  const contourStep = options.contourStep

  const heights = new Float32Array(gridW * gridH)
  const colors = new Float32Array(gridW * gridH * 3)
  let minH = Infinity
  let maxH = -Infinity

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

      const t = lum
      const low = new THREE.Color(0x304733)
      const mid = new THREE.Color(0x8f8a62)
      const high = new THREE.Color(0xdeddd2)
      const c = t < 0.55
        ? low.clone().lerp(mid, t / 0.55)
        : mid.clone().lerp(high, (t - 0.55) / 0.45)

      colors[idx * 3] = c.r
      colors[idx * 3 + 1] = c.g
      colors[idx * 3 + 2] = c.b

      if (h < minH) minH = h
      if (h > maxH) maxH = h
    }
  }

  const geo = new THREE.PlaneGeometry(widthWorld, depthWorld, gridW - 1, gridH - 1)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  for (let i = 0; i < heights.length; i++) {
    pos.setY(i, heights[i])
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.04,
    side: THREE.DoubleSide,
    flatShading: true,
  })

  const terrainMesh = new THREE.Mesh(geo, terrainMat)
  terrainMesh.position.y = -18

  const contourPositions = []
  const contourLift = -18 + 0.35

  const startLevel = Math.ceil(minH / contourStep) * contourStep
  const endLevel = Math.floor(maxH / contourStep) * contourStep

  const levels = []
  for (let lv = startLevel; lv <= endLevel + 1e-6; lv += contourStep) {
    levels.push(lv)
  }

  for (const level of levels) {
    for (let y = 0; y < gridH - 1; y++) {
      for (let x = 0; x < gridW - 1; x++) {
        const x0 = (x / (gridW - 1) - 0.5) * widthWorld
        const x1 = ((x + 1) / (gridW - 1) - 0.5) * widthWorld
        const z0 = (y / (gridH - 1) - 0.5) * depthWorld
        const z1 = ((y + 1) / (gridH - 1) - 0.5) * depthWorld

        const h00 = heights[y * gridW + x]
        const h10 = heights[y * gridW + (x + 1)]
        const h11 = heights[(y + 1) * gridW + (x + 1)]
        const h01 = heights[(y + 1) * gridW + x]

        const pts = []
        addIntersection(pts, x0, z0, h00, x1, z0, h10, level)
        addIntersection(pts, x1, z0, h10, x1, z1, h11, level)
        addIntersection(pts, x1, z1, h11, x0, z1, h01, level)
        addIntersection(pts, x0, z1, h01, x0, z0, h00, level)

        if (pts.length === 2) {
          contourPositions.push(pts[0].x, contourLift + level, pts[0].z, pts[1].x, contourLift + level, pts[1].z)
        } else if (pts.length === 4) {
          contourPositions.push(pts[0].x, contourLift + level, pts[0].z, pts[1].x, contourLift + level, pts[1].z)
          contourPositions.push(pts[2].x, contourLift + level, pts[2].z, pts[3].x, contourLift + level, pts[3].z)
        }
      }
    }
  }

  const contourGeo = new THREE.BufferGeometry()
  contourGeo.setAttribute('position', new THREE.Float32BufferAttribute(contourPositions, 3))

  const contourMat = new THREE.LineBasicMaterial({
    color: 0x101010,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  })

  return {
    terrainMesh,
    contourLines: new THREE.LineSegments(contourGeo, contourMat),
    levelCount: levels.length,
  }
}

function addIntersection(out, xA, zA, hA, xB, zB, hB, level) {
  const dA = hA - level
  const dB = hB - level
  if (dA === 0 && dB === 0) return
  if (dA * dB > 0) return
  const t = dA === dB ? 0 : dA / (dA - dB)
  const x = xA + (xB - xA) * t
  const z = zA + (zB - zA) * t
  if (!Number.isFinite(x) || !Number.isFinite(z)) return
  out.push({ x, z })
}
