import * as THREE from 'three'

import { EFFECT_LAYER } from '../render/PixelRenderer'

interface Mote {
  mesh: THREE.Mesh
  from: THREE.Vector3
  age: number
}

interface Burst {
  pillar: THREE.Mesh
  ring: THREE.Mesh
  motes: THREE.Mesh[]
  age: number
  life: number
  strength: number
}

/**
 * 강해지는 순간을 눈에 보이게: 유물을 낄 때마다, 발현할 때마다 신의 색 빛기둥과 땅을 훑는 고리,
 * 위로 솟는 빛 조각. 그리고 낀 힘만큼 발밑에서 맥박치는 빛 (단계가 오를수록 크고 밝다).
 */
export class PowerUp {
  readonly object = new THREE.Group()
  private readonly bursts: Burst[] = []
  private readonly motes: Mote[] = []
  private readonly rising: { mesh: THREE.Mesh; age: number }[] = []
  private readonly glow: THREE.Mesh
  private readonly glowMaterial: THREE.MeshBasicMaterial
  private glowLevel = 0
  /** 발현 레벨에 따른 모습: 0 없음, 1~4 */
  private ascension = 0
  private readonly ascendColor = new THREE.Color()
  private riseTimer = 0
  private readonly halos: THREE.Mesh[] = []
  private glowShown = 0
  private time = 0
  private readonly pillarGeometry = new THREE.CylinderGeometry(0.55, 0.75, 1, 12, 1, true)
  private readonly ringGeometry = new THREE.RingGeometry(0.85, 1, 40)
  private readonly moteGeometry = new THREE.BoxGeometry(0.09, 0.22, 0.09)

  constructor() {
    this.glowMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTexture() })
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.glowMaterial)
    this.glow.rotation.x = -Math.PI / 2
    this.glow.layers.set(EFFECT_LAYER)
    this.object.add(this.glow)
    // 머리 위 빛 고리 둘 (Lv3에 하나, Lv4에 둘)
    for (let i = 0; i < 2; i++) {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.42 + i * 0.16, 0.035, 6, 32),
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      )
      halo.rotation.x = -Math.PI / 2
      halo.visible = false
      halo.layers.set(EFFECT_LAYER)
      this.object.add(halo)
      this.halos.push(halo)
    }
  }

  /**
   * 발현 레벨만큼 화려해진다: 레벨마다 몸에서 피어오르는 빛 조각이 많아지고,
   * Lv3에 머리 위 빛 고리, Lv4에 고리 둘과 더 큰 발밑 빛.
   */
  setAscension(color: string | number | null, level: number): void {
    this.ascension = color === null ? 0 : level
    if (color !== null) this.ascendColor.set(color)
    this.halos.forEach((h, i) => {
      h.visible = this.ascension >= 3 + i
      ;(h.material as THREE.MeshBasicMaterial).color.copy(this.ascendColor)
    })
  }

  /** 빛기둥 한 번. strength 1 = 유물 하나, 3 = 발현 */
  burst(at: THREE.Vector3, color: string | number, strength: number): void {
    const material = () => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    const pillar = new THREE.Mesh(this.pillarGeometry, material())
    const ring = new THREE.Mesh(this.ringGeometry, material())
    ring.rotation.x = -Math.PI / 2
    const motes: THREE.Mesh[] = []
    for (let i = 0; i < 6 + strength * 6; i++) {
      const m = new THREE.Mesh(this.moteGeometry, material())
      const a = Math.random() * Math.PI * 2
      const r = 0.3 + Math.random() * (0.6 + strength * 0.3)
      m.position.set(at.x + Math.sin(a) * r, at.y + Math.random() * 0.6, at.z + Math.cos(a) * r)
      m.userData.speed = 2 + Math.random() * 2.5 * strength
      motes.push(m)
    }
    pillar.position.copy(at)
    ring.position.set(at.x, at.y + 0.05, at.z)
    for (const o of [pillar, ring, ...motes]) {
      o.layers.set(EFFECT_LAYER)
      this.object.add(o)
    }
    this.bursts.push({ pillar, ring, motes, age: 0, life: 0.7 + strength * 0.25, strength })
  }

  /** 원천 결정 한 조각: 그 자리에서 튀어 올랐다가 주인공에게 빨려 든다. 너무 많으면 건너뛴다. */
  essence(from: THREE.Vector3, color: string | number): void {
    if (this.motes.length > 60) return
    const mesh = new THREE.Mesh(this.moteGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    mesh.scale.set(1.4, 0.8, 1.4)
    mesh.layers.set(EFFECT_LAYER)
    mesh.position.copy(from)
    this.object.add(mesh)
    this.motes.push({ mesh, from: from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8)), age: 0 })
  }

  /** 발밑 빛: color는 가장 많이 낀 신의 색, level 0(없음)~6(발현 Lv4) */
  setGlow(color: string | number | null, level: number): void {
    this.glowLevel = color === null ? 0 : level
    if (color !== null) this.glowMaterial.color.set(color)
  }

  update(dt: number, center: THREE.Vector3): void {
    this.time += dt
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]!
      b.age += dt
      const t = b.age / b.life
      const fade = Math.max(0, 1 - t)
      // 기둥: 빠르게 솟았다가 가늘어지며 사라진다
      const height = (3 + b.strength * 2.5) * Math.min(1, t * 5)
      b.pillar.scale.set((1 - t * 0.7) * (0.7 + b.strength * 0.25), height, (1 - t * 0.7) * (0.7 + b.strength * 0.25))
      b.pillar.position.y = center.y + height / 2
      b.pillar.position.x = center.x
      b.pillar.position.z = center.z
      ;(b.pillar.material as THREE.MeshBasicMaterial).opacity = fade * 0.8
      // 고리: 땅을 훑으며 퍼진다
      const radius = 0.5 + t * (2.5 + b.strength * 1.8)
      b.ring.scale.set(radius, radius, radius)
      b.ring.position.set(center.x, center.y + 0.05, center.z)
      ;(b.ring.material as THREE.MeshBasicMaterial).opacity = fade
      for (const m of b.motes) {
        m.position.y += (m.userData.speed as number) * dt
        ;(m.material as THREE.MeshBasicMaterial).opacity = fade
      }
      if (t >= 1) {
        for (const o of [b.pillar, b.ring, ...b.motes]) {
          this.object.remove(o)
          ;(o.material as THREE.Material).dispose()
        }
        this.bursts.splice(i, 1)
      }
    }
    // 발현 레벨: 몸에서 빛 조각이 피어오르고, 머리 위 고리가 돈다
    if (this.ascension > 0) {
      this.riseTimer -= dt
      if (this.riseTimer <= 0) {
        this.riseTimer = 0.5 / this.ascension
        const a = Math.random() * Math.PI * 2
        const r = 0.3 + Math.random() * 0.4
        const m = new THREE.Mesh(this.moteGeometry, new THREE.MeshBasicMaterial({ color: this.ascendColor, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
        m.position.set(center.x + Math.sin(a) * r, center.y + 0.2 + Math.random() * 0.6, center.z + Math.cos(a) * r)
        m.userData.speed = 0.8 + Math.random() * (0.5 + this.ascension * 0.3)
        m.layers.set(EFFECT_LAYER)
        this.object.add(m)
        this.rising.push({ mesh: m, age: 0 })
      }
    }
    for (let i = this.rising.length - 1; i >= 0; i--) {
      const r = this.rising[i]!
      r.age += dt
      r.mesh.position.y += (r.mesh.userData.speed as number) * dt
      ;(r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - r.age / 1.2)
      if (r.age >= 1.2) {
        this.object.remove(r.mesh)
        ;(r.mesh.material as THREE.Material).dispose()
        this.rising.splice(i, 1)
      }
    }
    this.halos.forEach((h, i) => {
      if (!h.visible) return
      h.position.set(center.x, center.y + 2.15 + i * 0.12 + Math.sin(this.time * 2 + i) * 0.04, center.z)
      h.rotation.z += dt * (i ? -1.2 : 0.8)
      ;(h.material as THREE.MeshBasicMaterial).opacity = 0.75 + Math.sin(this.time * 3 + i) * 0.2
    })
    // 결정 조각: 0.15초 튀어 오르고 0.45초 동안 주인공 가슴께로
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i]!
      m.age += dt
      const t = m.age
      if (t < 0.15) {
        m.mesh.position.set(m.from.x, m.from.y + t * 6, m.from.z)
      } else {
        const k = Math.min(1, (t - 0.15) / 0.45)
        const e = k * k
        m.mesh.position.set(
          m.from.x + (center.x - m.from.x) * e,
          m.from.y + 0.9 + (center.y + 1.1 - m.from.y - 0.9) * e,
          m.from.z + (center.z - m.from.z) * e,
        )
      }
      m.mesh.rotation.y += dt * 8
      if (t >= 0.6) {
        this.object.remove(m.mesh)
        ;(m.mesh.material as THREE.Material).dispose()
        this.motes.splice(i, 1)
      }
    }
    // 발밑 빛: 단계에 따라 크기·밝기, 천천히 맥박친다
    this.glowShown += (this.glowLevel - this.glowShown) * Math.min(1, dt * 4)
    const pulse = 1 + Math.sin(this.time * 3) * 0.08
    const size = (1.4 + this.glowShown * 0.45) * pulse
    this.glow.scale.set(size, size, 1)
    this.glow.position.set(center.x, center.y + 0.04, center.z)
    this.glowMaterial.opacity = Math.min(0.9, this.glowShown * 0.14) * pulse
    this.glow.visible = this.glowShown > 0.02
  }
}

/** 가운데가 밝고 가장자리로 사라지는 둥근 빛 */
function glowTexture(): THREE.Texture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  return texture
}
