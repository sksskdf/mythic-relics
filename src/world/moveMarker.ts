import * as THREE from 'three'

import { EFFECT_LAYER } from '../render/PixelRenderer'
import { heightAt } from './terrain'

const BLUE = 0x5fd0ff
/** 눈밭 위에서도 잘 보이도록 흰색 대신 금색을 쓴다. */
const GOLD = 0xffc23d
const RED = 0xff3b2a
/** 밝은 눈밭에서 고리가 묻히지 않도록 아래에 까는 어두운 테두리 색 */
const BACKING = 0x141a26

function flat(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.layers.set(EFFECT_LAYER)
  mesh.renderOrder = 13
  return mesh
}

/** 색 고리 아래에 조금 더 굵은 어두운 고리를 깔아 눈 위에서도 윤곽이 서게 한다. */
function backedRing(inner: number, outer: number, material: THREE.Material, backing: THREE.Material): THREE.Group {
  const group = new THREE.Group()
  const back = flat(new THREE.RingGeometry(inner - 0.08, outer + 0.08, 32), backing)
  back.renderOrder = 12
  group.add(back, flat(new THREE.RingGeometry(inner, outer, 32), material))
  return group
}

/** 고리 둘레 네 방향에 놓는 화살촉(삼각형). 안쪽을 가리킨다. */
function chevrons(radius: number, size: number, material: THREE.Material): THREE.Group {
  const group = new THREE.Group()
  const shape = new THREE.Shape()
  shape.moveTo(0, -size * 0.6)
  shape.lineTo(size, size * 0.6)
  shape.lineTo(-size, size * 0.6)
  shape.closePath()
  const geometry = new THREE.ShapeGeometry(shape)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const tip = flat(geometry, material)
    tip.position.set(Math.sin(a) * radius, 0, Math.cos(a) * radius)
    // 눕힌 뒤 고리 중심을 가리키도록 돌린다.
    tip.rotation.z = -a
    group.add(tip)
  }
  return group
}

/**
 * 클릭한 지점 표시. 지시마다 모양과 색을 확실히 다르게 한다.
 * - 이동(한 번 누름): 파란 고리가 퍼지며 사라진다.
 * - 적을 무시한 이동(두 번 누름): 금색 고리 + 안쪽을 가리키는 화살촉 넷, 더 크고 오래 남는다.
 */
export class MoveMarker {
  readonly object = new THREE.Group()
  private readonly ringMaterial = new THREE.MeshBasicMaterial({ color: BLUE, transparent: true, depthWrite: false })
  private readonly backMaterial = new THREE.MeshBasicMaterial({ color: BACKING, transparent: true, depthWrite: false })
  private readonly ring = backedRing(0.5, 0.74, this.ringMaterial, this.backMaterial)
  private readonly tips = chevrons(1.15, 0.26, this.ringMaterial)
  private life = 0
  private duration = 0.6
  private forced = false

  constructor() {
    this.object.add(this.ring, this.tips)
    this.object.visible = false
  }

  /** forced면 적을 무시하는 이동(금색, 화살촉), 아니면 일반 이동(파란색) */
  show(x: number, z: number, forced = false): void {
    this.forced = forced
    this.ringMaterial.color.setHex(forced ? GOLD : BLUE)
    this.tips.visible = forced
    this.duration = forced ? 0.9 : 0.6
    this.life = this.duration
    this.object.position.set(x, heightAt(x, z) + 0.05, z)
    this.object.visible = true
  }

  update(dt: number): void {
    if (this.life <= 0) return
    this.life = Math.max(0, this.life - dt)
    const t = this.life / this.duration
    if (this.forced) {
      // 화살촉이 안쪽으로 모여들며 "여기까지 간다"를 보여 준다.
      this.ring.scale.setScalar(1.3)
      this.tips.scale.setScalar(0.6 + t * 0.7)
    } else {
      this.ring.scale.setScalar(0.6 + (1 - t) * 0.8)
    }
    this.ringMaterial.opacity = Math.min(1, t * 2)
    this.backMaterial.opacity = this.ringMaterial.opacity * 0.55
    this.object.visible = this.life > 0
  }
}

/**
 * 공격 대상 표시: 적 발밑의 붉은 고리와, 그 둘레를 천천히 도는 화살촉 넷. 깜빡이듯 맥박친다.
 */
export class TargetMarker {
  readonly object = new THREE.Group()
  private readonly material = new THREE.MeshBasicMaterial({ color: RED, transparent: true, depthWrite: false })
  private readonly backMaterial = new THREE.MeshBasicMaterial({ color: BACKING, transparent: true, opacity: 0.5, depthWrite: false })
  private readonly tips = chevrons(1.5, 0.28, this.material)
  private time = 0

  constructor() {
    this.object.add(backedRing(0.88, 1.12, this.material, this.backMaterial), this.tips)
    this.object.visible = false
  }

  /** 대상이 있으면 그 발밑에, 없으면 숨긴다. */
  update(dt: number, target: { x: number; z: number; radius: number } | null): void {
    this.object.visible = target !== null
    if (!target) return
    this.time += dt
    this.object.position.set(target.x, heightAt(target.x, target.z) + 0.08, target.z)
    this.object.scale.setScalar(target.radius + 0.2)
    this.tips.rotation.y = this.time * 1.2
    this.material.opacity = 0.85 + Math.sin(this.time * 8) * 0.15
  }
}

/**
 * 적을 무시하고 걷는 동안 주인공에서 목적지까지 금색 점선을 긋는다.
 * 지금 "무조건 이동" 중이라는 것을 이동 내내 보여 준다.
 */
export class PathLine {
  readonly object: THREE.Line
  private readonly positions = new Float32Array(6)

  constructor() {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    const material = new THREE.LineDashedMaterial({ color: GOLD, dashSize: 0.35, gapSize: 0.25, transparent: true, opacity: 0.85, depthTest: false })
    this.object = new THREE.Line(geometry, material)
    this.object.layers.set(EFFECT_LAYER)
    this.object.renderOrder = 13
    this.object.frustumCulled = false
    this.object.visible = false
  }

  update(from: THREE.Vector3, to: { x: number; z: number } | null): void {
    this.object.visible = to !== null
    if (!to) return
    this.positions.set([from.x, from.y + 0.1, from.z, to.x, heightAt(to.x, to.z) + 0.1, to.z])
    this.object.geometry.attributes.position!.needsUpdate = true
    this.object.computeLineDistances()
  }
}
