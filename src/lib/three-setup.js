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
  } = options

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(background)

  const camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, near, far)
  camera.position.set(...cameraPos)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  if (pixelRatio) renderer.setPixelRatio(window.devicePixelRatio)
  document.body.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.target.set(...controlsTarget)

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  return { scene, camera, renderer, controls, raycaster, pointer }
}

export function startRenderLoop(renderer, scene, camera, controls, beforeRender) {
  function animate() {
    requestAnimationFrame(animate)
    if (beforeRender) beforeRender()
    controls.update()
    renderer.render(scene, camera)
  }
  animate()
}
