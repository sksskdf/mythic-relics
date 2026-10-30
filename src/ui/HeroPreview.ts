import * as THREE from 'three'

import type { BodyLook } from '../looks/body'
import type { Outfit } from '../looks/outfit'
import { buildHeroModel, type HeroRig } from '../world/heroModel'

/** 미리 보기의 저해상도 크기. 게임 화면처럼 픽셀이 보이도록 작게 그려 키운다. */
const WIDTH = 72
const HEIGHT = 96

/**
 * 신 탭 「외형」의 캐릭터 미리 보기 (시작 화면도 쓴다). 지금 모습(또는 커서를 올린 외형을 입혀 본 모습)을 천천히 돌려 보여 준다.
 * 게임 화면과 따로 작은 캔버스에 그리고, 탭이 보일 때만 돈다.
 */
export class HeroPreview {
  readonly canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer | null = null
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1.15, 1.15, 1.55, -1.5, 0.1, 20)
  private readonly rig: HeroRig
  private frame = 0
  private angle = 0.6
  private last = 0

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'hero-preview'
    this.canvas.width = WIDTH
    this.canvas.height = HEIGHT
    this.rig = buildHeroModel()
    this.scene.add(this.rig.root)
    this.scene.add(new THREE.HemisphereLight(0xc4d8ff, 0x4a5566, 1.1))
    const sun = new THREE.DirectionalLight(0xffe4bd, 2.4)
    sun.position.set(3, 5, 4)
    this.scene.add(sun)
    // 게임과 같은 쿼터뷰 각도에서 조금 더 정면으로
    this.camera.position.set(0, 2.6, 5)
    this.camera.lookAt(0, 0.9, 0)
  }

  wear(outfit: Outfit): void {
    this.rig.wear(outfit)
  }

  /** 기본 모습(피부·머리카락·옷 색)을 바꿔 칠한다. */
  setBody(body: BodyLook): void {
    this.rig.setBody(body)
  }

  /** 화면에 붙었을 때 돌기 시작한다. 떼어지거나 숨으면 저절로 멈춘다. */
  start(): void {
    if (this.frame) return
    if (!this.renderer) {
      try {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: true })
        this.renderer.setPixelRatio(1)
        this.renderer.setSize(WIDTH, HEIGHT, false)
      } catch {
        // WebGL을 더 만들 수 없는 환경이면 미리 보기 없이 둔다.
        return
      }
    }
    this.last = performance.now()
    const tick = (now: number) => {
      // 떼어졌거나 숨었으면(정보 화면을 닫으면 창만 숨기고 캔버스는 붙어 있다) 멈춘다. 다시 열면 start가 다시 돌린다
      if (!this.canvas.isConnected || this.canvas.offsetParent === null) {
        this.frame = 0
        return
      }
      const dt = Math.min(0.1, (now - this.last) / 1000)
      this.last = now
      this.angle += dt * 0.6
      this.rig.root.rotation.y = this.angle
      this.renderer!.render(this.scene, this.camera)
      this.frame = requestAnimationFrame(tick)
    }
    this.frame = requestAnimationFrame(tick)
  }
}
