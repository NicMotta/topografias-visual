import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export { THREE, OrbitControls }

export function createScene(options = {}) {
  const {
    background = 0x111111,
    cameraPos = [0, 0, 180],
    fov = 60,
    near = 0.1,
    far = 5000,
    controlsTarget = [0, 0, 0],
    pixelRatio = true,
    container = null,
  } = options

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(background)

  const camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, near, far)
  camera.position.set(...cameraPos)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  if (pixelRatio) renderer.setPixelRatio(window.devicePixelRatio)
  ;(container || document.body).appendChild(renderer.domElement)

  function applySize() {
    const width = container ? container.clientWidth : window.innerWidth
    const height = container ? container.clientHeight : window.innerHeight
    if (!width || !height) return
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
  }
  applySize()

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.target.set(...controlsTarget)

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()

  window.addEventListener('resize', applySize)
  if (container && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(applySize).observe(container)
  }

  return { scene, camera, renderer, controls, raycaster, pointer }
}

export function startRenderLoop(renderer, scene, camera, controls, beforeRender, isVisible) {
  function animate() {
    requestAnimationFrame(animate)
    if (isVisible && !isVisible()) return
    if (beforeRender) beforeRender()
    controls.update()
    renderer.render(scene, camera)
  }
  animate()
}
