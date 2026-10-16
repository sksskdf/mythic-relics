import * as THREE from 'three'

import { frameDelta } from './clock'

/** 게임 전체를 묶는 최상위 객체. 렌더러, 장면, 카메라, 메인 루프를 가진다. */
export class Game {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  frame = 0

  private lastTime = performance.now()
  private readonly marker: THREE.Mesh

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false })
    this.renderer.setPixelRatio(1)
    container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200)
    this.camera.position.set(10, 12, 10)
    this.camera.lookAt(0, 0, 0)

    this.scene.background = new THREE.Color(0x1a2330)
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x303848, 1.2))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(6, 10, 4)
    this.scene.add(sun)

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0xc9d3dd }),
    )
    ground.rotation.x = -Math.PI / 2
    this.scene.add(ground)

    // 화면이 실제로 그려지는지 확인하기 위한 임시 표식
    this.marker = new THREE.Mesh(
      new THREE.BoxGeometry(1, 2, 1),
      new THREE.MeshStandardMaterial({ color: 0x3f6fd8 }),
    )
    this.marker.position.y = 1
    this.scene.add(this.marker)

    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  start(): void {
    this.renderer.setAnimationLoop((now) => this.tick(now))
  }

  private tick(now: number): void {
    const dt = frameDelta(this.lastTime, now)
    this.lastTime = now
    this.marker.rotation.y += dt
    this.renderer.render(this.scene, this.camera)
    this.frame += 1
  }

  private resize(): void {
    const { clientWidth: width, clientHeight: height } = this.container
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / Math.max(height, 1)
    this.camera.updateProjectionMatrix()
  }
}
