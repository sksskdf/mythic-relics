import * as THREE from 'three'

import type { LegendKind } from '../data/classKit'
import { type Giant, GRUNT, UTGARD_KING } from '../enemies/Giant'
import { EFFECT_LAYER } from '../render/PixelRenderer'
import { buildVoxelGeometry, voxelMaterial } from '../voxel/mesher'
import { runestone } from '../voxel/models/props'
import type { Point2 } from '../world/colliders'
import { heightAt } from '../world/terrain'
import type { Encounter } from './Encounter'

export type { LegendKind }
export type LegendPhase = 'idle' | 'wave' | 'boss' | 'bet' | 'survive'

/** 내기(tally): 제한 시간, 채워야 할 처치 수, 결계 안에 늘 있는 졸개 수, 졸개가 들어오는 간격 */
export const BET = { seconds: 50, kills: 24, crowd: 7, every: 0.9 }
/** 버티기(survive): 버틸 시간, 결계 안에 늘 있는 졸개 수, 졸개가 들어오는 간격 */
export const SURVIVE = { seconds: 45, crowd: 11, every: 0.6 }

/** 승급 전설이 게임에 알리는 일 */
export interface LegendHost {
  /** 들어갈 수 있으면 그 전설의 종류, 아니면 null (그 클래스로 발현했고, 경험치 바가 가득 찼다) */
  ready(): LegendKind | null
  heroAlive(): boolean
  heroPosition(): Point2
  /** 주인공이 움직일 수 있는 범위를 정한다. null이면 풀어 준다. */
  setArena(arena: { x: number; z: number; radius: number } | null): void
  onStart(): void
  onWin(): void
  onFail(): void
}

/** 결계 안에서 차례로 몰려오는 졸개 수 */
const WAVES = [6, 8]
/** 성소 가운데 이만큼 가까이 서면 전설이 시작된다. */
const ENTER_RADIUS = 1.6

/**
 * 승급 전설 간이판. (DESIGN.md 5.2) 성소에 발현한 채로 경험치 바를 채우고 들어서면 얼음 결계가 닫힌다.
 * - 「우트가르드 원정」(토르): 거인 무리 두 번 뒤에 우트가르드의 왕이 나온다. 왕을 쓰러뜨리면 승급
 * - 「대장장이들의 내기」(로키)형 tally: 끝없이 몰려오는 졸개를 제한 시간 안에 정한 수만큼 쓰러뜨리면 승급 (E6-04)
 * - survive: 점점 거세게 몰려오는 졸개 속에서 정한 시간을 버티면 승급 (E6-17)
 * 어느 신이 어느 종류인지는 gods.json의 legend.kind가 정한다.
 * 쓰러지거나 시간이 다 되면 결계가 풀리고 처음부터 다시 도전한다.
 */
export class UtgardLegend {
  readonly object = new THREE.Group()
  phase: LegendPhase = 'idle'
  boss: Giant | null = null

  private wave = 0
  private readonly giants: Giant[] = []
  /** 내기: 남은 시간, 쓰러뜨린 수, 다음 졸개까지 */
  private betLeft = 0
  kills = 0
  private spawnTimer = 0
  private readonly glyphMaterial = new THREE.MeshBasicMaterial({
    color: 0x7fd4ff,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  })
  private readonly beamMaterial = new THREE.MeshBasicMaterial({
    color: 0x9fe3ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
  private readonly barrierMaterial = new THREE.MeshBasicMaterial({
    color: 0xbfe9ff,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  private readonly barrier: THREE.Mesh
  private readonly stones: THREE.Mesh[] = []
  private time = 0
  center: Point2 = { x: 0, z: 0 }
  /** 결계 반지름 */
  radius = 0
  /** 이 지역에 성소가 있나 (마을에는 없다) */
  present = true

  constructor(center: Point2, radius: number) {
    // 둥글게 선 룬스톤 여섯 개와 바닥의 룬 고리
    const stoneGeometry = buildVoxelGeometry(runestone(41), { voxelSize: 0.12 })
    for (let i = 0; i < 6; i++) {
      const stone = new THREE.Mesh(stoneGeometry, voxelMaterial())
      stone.rotation.y = (i / 6) * Math.PI * 2 + Math.PI
      stone.castShadow = true
      this.stones.push(stone)
      this.object.add(stone)
    }
    const glyph = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 6, 1), this.glyphMaterial)
    glyph.rotation.x = -Math.PI / 2
    glyph.position.y = 0.06
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 9, 6, 1, true), this.beamMaterial)
    beam.position.y = 4.5
    this.barrier = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 3.2, 64, 1, true), this.barrierMaterial)
    this.barrier.position.y = 1.4
    this.barrier.visible = false
    for (const mesh of [glyph, beam, this.barrier]) {
      mesh.layers.set(EFFECT_LAYER)
      mesh.renderOrder = 12
      this.object.add(mesh)
    }
    this.moveTo(center, radius)
  }

  /** 성소를 옮긴다 (지역을 바꾸거나 편집기로 옮길 때). null이면 이 지역에는 성소가 없다. 진행 중인 전설이 있으면 옮기지 않는다 */
  moveTo(center: Point2 | null, radius = 0): void {
    if (this.active) return
    this.present = center !== null
    this.object.visible = this.present
    if (!center) return
    this.center = { x: center.x, z: center.z }
    this.radius = radius
    const y = heightAt(center.x, center.z)
    this.object.position.set(center.x, y, center.z)
    this.stones.forEach((stone, i) => {
      const a = (i / 6) * Math.PI * 2
      const sx = Math.sin(a) * 3.4
      const sz = Math.cos(a) * 3.4
      stone.position.set(sx, heightAt(center.x + sx, center.z + sz) - y, sz)
    })
    this.barrier.scale.set(radius, 1, radius)
  }

  get active(): boolean {
    return this.phase !== 'idle'
  }

  /** 내기·버티기 진행도 0~1 (HUD 막대). 둘 다 아니면 null */
  get betProgress(): number | null {
    if (this.phase === 'bet') return Math.min(1, this.kills / BET.kills)
    if (this.phase === 'survive') return Math.min(1, 1 - this.betLeft / SURVIVE.seconds)
    return null
  }

  /** 내기 남은 시간 (초) */
  get betSeconds(): number {
    return Math.max(0, this.betLeft)
  }

  update(dt: number, encounter: Encounter, host: LegendHost): void {
    this.time += dt
    const kind = this.present ? host.ready() : null
    const ready = kind !== null
    // 들어갈 수 있을 때만 빛기둥이 서고 룬이 밝게 빛난다. (글 대신 빛으로 알려 준다)
    const pulse = 0.5 + Math.sin(this.time * 3) * 0.5
    this.beamMaterial.opacity = this.phase === 'idle' && ready ? 0.18 + pulse * 0.12 : 0
    this.glyphMaterial.opacity = this.phase !== 'idle' ? 0.15 : ready ? 0.5 + pulse * 0.4 : 0.2
    this.barrierMaterial.opacity = 0.22 + pulse * 0.08

    if (this.phase === 'idle') {
      const p = host.heroPosition()
      if (kind && host.heroAlive() && Math.hypot(p.x - this.center.x, p.z - this.center.z) < ENTER_RADIUS) {
        this.start(kind, encounter, host)
      }
      return
    }

    if (!host.heroAlive()) {
      this.fail(encounter, host)
      return
    }

    this.keepInside()
    const remaining = this.giants.filter((g) => !g.gone)
    if (this.phase === 'bet' || this.phase === 'survive') {
      this.kills += this.giants.length - remaining.length
      this.giants.splice(0, this.giants.length, ...remaining)
      this.updateBet(dt, encounter, host)
      return
    }
    this.giants.splice(0, this.giants.length, ...remaining)
    if (remaining.length > 0) return

    if (this.phase === 'wave') {
      this.wave += 1
      if (this.wave < WAVES.length) this.spawnWave(encounter)
      else this.spawnBoss(encounter)
    } else {
      this.finish(host)
      host.onWin()
    }
  }

  /**
   * 결계는 적도 막는다: 밀쳐 내기나 쫓기로 결계 밖에 나간 적을 안으로 되돌린다.
   * 주인공은 결계 밖으로 나갈 수 없어서, 밖에 남은 적이 있으면 전설이 끝나지 않았다 (E11-06 봇에서 발견).
   */
  private keepInside(): void {
    const limit = this.radius - 0.6
    for (const giant of this.giants) {
      if (!giant.alive) continue
      const position = giant.rig.root.position
      const dx = position.x - this.center.x
      const dz = position.z - this.center.z
      const dist = Math.hypot(dx, dz)
      const max = Math.max(0, limit - giant.radius)
      if (dist <= max) continue
      const x = this.center.x + (dx / dist) * max
      const z = this.center.z + (dz / dist) * max
      position.set(x, heightAt(x, z), z)
    }
  }

  private start(kind: LegendKind, encounter: Encounter, host: LegendHost): void {
    this.barrier.visible = true
    host.setArena({ x: this.center.x, z: this.center.z, radius: this.radius - 0.6 })
    host.onStart()
    if (kind === 'tally' || kind === 'survive') {
      this.phase = kind === 'tally' ? 'bet' : 'survive'
      this.betLeft = kind === 'tally' ? BET.seconds : SURVIVE.seconds
      this.kills = 0
      this.spawnTimer = 0
      return
    }
    this.phase = 'wave'
    this.wave = 0
    this.spawnWave(encounter)
  }

  /** 내기·버티기: 결계 둘레에서 졸개가 끊임없이 들어온다. 내기는 시간 안에 처치 수를 채우면, 버티기는 시간이 다 될 때까지 살아 있으면 이긴다 */
  private updateBet(dt: number, encounter: Encounter, host: LegendHost): void {
    this.betLeft -= dt
    const survive = this.phase === 'survive'
    const rule = survive ? SURVIVE : BET
    if (survive ? this.betLeft <= 0 : this.kills >= BET.kills) {
      for (const giant of this.giants) encounter.remove(giant)
      this.giants.length = 0
      this.finish(host)
      host.onWin()
      return
    }
    if (this.betLeft <= 0) {
      this.fail(encounter, host)
      return
    }
    this.spawnTimer -= dt
    if (this.spawnTimer > 0 || this.giants.length >= rule.crowd) return
    this.spawnTimer = rule.every
    const a = Math.random() * Math.PI * 2
    const r = this.radius * 0.8
    this.giants.push(encounter.spawn(GRUNT, { x: this.center.x + Math.sin(a) * r, z: this.center.z + Math.cos(a) * r }, true))
  }

  private spawnWave(encounter: Encounter): void {
    const count = WAVES[this.wave]!
    const offset = Math.random() * Math.PI * 2
    for (let i = 0; i < count; i++) {
      const a = offset + (i / count) * Math.PI * 2
      const r = this.radius * 0.75
      this.giants.push(
        encounter.spawn(GRUNT, { x: this.center.x + Math.sin(a) * r, z: this.center.z + Math.cos(a) * r }, true),
      )
    }
  }

  private spawnBoss(encounter: Encounter): void {
    this.phase = 'boss'
    const r = this.radius * 0.6
    this.boss = encounter.spawn(UTGARD_KING, { x: this.center.x, z: this.center.z - r }, true)
    this.giants.push(this.boss)
  }

  private fail(encounter: Encounter, host: LegendHost): void {
    for (const giant of this.giants) encounter.remove(giant)
    this.giants.length = 0
    this.finish(host)
    host.onFail()
  }

  private finish(host: LegendHost): void {
    this.phase = 'idle'
    this.boss = null
    this.barrier.visible = false
    host.setArena(null)
  }
}
