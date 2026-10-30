import * as THREE from 'three'

import type { Game } from '../game/Game'
import { EFFECT_LAYER } from '../render/PixelRenderer'
import type { CircleCollider } from '../world/colliders'
import { heightAt } from '../world/terrain'

const SEGMENTS = 20
/** 길찾기 격자를 보여 줄 범위 (주인공 둘레, m) */
const NAV_RADIUS = 16

function material(color: number): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 })
}

/** 원들을 선분으로 그린다. 같은 색끼리 한 번에 그린다. */
function circleSegments(circles: readonly CircleCollider[], lift = 0.08): Float32Array {
  const out = new Float32Array(circles.length * SEGMENTS * 6)
  let i = 0
  for (const c of circles) {
    const y = heightAt(c.x, c.z) + lift
    for (let s = 0; s < SEGMENTS; s++) {
      const a0 = (s / SEGMENTS) * Math.PI * 2
      const a1 = ((s + 1) / SEGMENTS) * Math.PI * 2
      out.set([c.x + Math.sin(a0) * c.radius, y, c.z + Math.cos(a0) * c.radius, c.x + Math.sin(a1) * c.radius, y, c.z + Math.cos(a1) * c.radius], i)
      i += 6
    }
  }
  return out
}

/** 정점을 바꾼다. 길이가 같으면 붙어 있는 버퍼에 옮겨 쓰고(켜 둔 동안 프레임마다 GPU 버퍼를 새로 만들지 않게), 다를 때만 새로 붙인다 */
function setPositions(object: THREE.LineSegments | THREE.Line | THREE.Points, positions: Float32Array): void {
  const current = object.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  if (current && current.array.length === positions.length) {
    ;(current.array as Float32Array).set(positions)
    current.needsUpdate = true
  } else {
    object.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  }
  object.geometry.computeBoundingSphere()
}

/**
 * 개발 패널의 "충돌·길찾기 보기".
 * - 하늘색: 움직이지 않는 충돌체(나무, 바위) / 빨강: 길을 막는 적 / 주황: 밀고 지나갈 수 있는 적(적을 무시한 이동 중) / 초록: 주인공
 * - 회색 점: 길찾기 격자에서 막힌 칸 (주인공 둘레만) / 노랑: 지금 걷는 경로
 */
export class DebugOverlay {
  readonly object = new THREE.Group()
  colliders = false
  navigation = false

  private readonly statics = new THREE.LineSegments(new THREE.BufferGeometry(), material(0x5fd8ff))
  private readonly blocking = new THREE.LineSegments(new THREE.BufferGeometry(), material(0xff4a4a))
  private readonly passable = new THREE.LineSegments(new THREE.BufferGeometry(), material(0xffa040))
  private readonly hero = new THREE.LineSegments(new THREE.BufferGeometry(), material(0x6dff7a))
  private readonly cells = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({ color: 0x30343c, size: 2, sizeAttenuation: false, depthTest: false }),
  )
  private readonly path = new THREE.Line(new THREE.BufferGeometry(), material(0xffe14a))
  private readonly navCenter = new THREE.Vector2(Infinity, Infinity)
  /** 하늘색 원을 그린 충돌체 (첫 것과 수). 땅이 바뀌면 배열 속이 새 충돌체로 갈리므로 이것이 달라질 때 다시 그린다 */
  private staticsFirst: CircleCollider | undefined = undefined
  private staticsCount = -1

  constructor(private readonly game: Game) {
    for (const part of [this.statics, this.blocking, this.passable, this.hero, this.cells, this.path]) {
      part.layers.set(EFFECT_LAYER)
      part.renderOrder = 20
      part.frustumCulled = false
      this.object.add(part)
    }
    this.object.visible = false
    game.scene.add(this.object)
  }

  update(): void {
    this.object.visible = this.colliders || this.navigation
    if (!this.object.visible) return
    const g = this.game
    const position = g.hero.object.position

    for (const part of [this.statics, this.blocking, this.passable, this.hero]) part.visible = this.colliders
    if (this.colliders) {
      const statics = g.staticColliders
      if (statics[0] !== this.staticsFirst || statics.length !== this.staticsCount) {
        this.staticsFirst = statics[0]
        this.staticsCount = statics.length
        setPositions(this.statics, circleSegments(statics))
      }
      const plowing = g.orders.plowing
      const alive = g.encounter.alive
      setPositions(this.blocking, circleSegments(alive.filter((e) => !plowing || e.blocksPath).map((e) => e.collider)))
      setPositions(this.passable, circleSegments(alive.filter((e) => plowing && !e.blocksPath).map((e) => e.collider)))
      setPositions(this.hero, circleSegments([{ x: position.x, z: position.z, radius: g.heroRadius }]))
    }

    this.cells.visible = this.navigation
    this.path.visible = this.navigation
    if (!this.navigation) return
    // 막힌 칸은 주인공이 2m 넘게 움직였을 때만 다시 모은다.
    if (Math.hypot(position.x - this.navCenter.x, position.z - this.navCenter.y) > 2) {
      this.navCenter.set(position.x, position.z)
      setPositions(this.cells, this.blockedCells(position.x, position.z))
    }
    const points = [position, ...g.hero.path].map((p) => [p.x, heightAt(p.x, p.z) + 0.12, p.z]).flat()
    setPositions(this.path, new Float32Array(points))
  }

  private blockedCells(x: number, z: number): Float32Array {
    const nav = this.game.nav
    const min = nav.toCell({ x: x - NAV_RADIUS, z: z - NAV_RADIUS })
    const max = nav.toCell({ x: x + NAV_RADIUS, z: z + NAV_RADIUS })
    const out: number[] = []
    for (let cz = min.cz; cz <= max.cz; cz++) {
      for (let cx = min.cx; cx <= max.cx; cx++) {
        if (!nav.isBlockedCell(cx, cz)) continue
        const p = nav.toWorld(cx, cz)
        out.push(p.x, heightAt(p.x, p.z) + 0.06, p.z)
      }
    }
    return new Float32Array(out)
  }
}
