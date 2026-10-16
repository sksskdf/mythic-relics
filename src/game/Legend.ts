import * as THREE from 'three'

import { type Giant, GRUNT, UTGARD_KING } from '../enemies/Giant'
import { EFFECT_LAYER } from '../render/PixelRenderer'
import { buildVoxelGeometry, voxelMaterial } from '../voxel/mesher'
import { runestone } from '../voxel/models/props'
import type { Point2 } from '../world/colliders'
import { heightAt } from '../world/terrain'
import type { Encounter } from './Encounter'

export type LegendPhase = 'idle' | 'wave' | 'boss'

/** 승급 전설이 게임에 알리는 일 */
export interface LegendHost {
  /** 들어갈 수 있는가 (그 클래스로 발현했고, 경험치 바가 가득 찼다) */
  ready(): boolean
  heroAlive(): boolean
  heroPosition(): Point2
  /** 주인공이 움직일 수 있는 범위를 정한다. null이면 풀어 준다. */
  setArena(arena: { x: number; z: number; radius: number } | null): void
  onStart(): void
  onWin(): void
  onFail(): void
}

/** 결계 안에서 차례로 몰려오는 졸개 수 */
const WAVES = [5, 6]
/** 성소 가운데 이만큼 가까이 서면 전설이 시작된다. */
const ENTER_RADIUS = 1.6

/**
 * 승급 전설 「우트가르드 원정」 간이판. (DESIGN.md 5.2)
 * 성소에 발현한 채로 경험치 바를 채우고 들어서면 얼음 결계가 닫히고, 거인 무리 두 번 뒤에 우트가르드의 왕이 나온다.
 * 왕을 쓰러뜨리면 승급하고, 쓰러지면 결계가 풀리고 처음부터 다시 도전한다.
 */
export class UtgardLegend {
  readonly object = new THREE.Group()
  phase: LegendPhase = 'idle'
  boss: Giant | null = null

  private wave = 0
  private readonly giants: Giant[] = []
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
  private time = 0

  constructor(
    readonly center: Point2,
    /** 결계 반지름 */
    readonly radius: number,
  ) {
    const y = heightAt(center.x, center.z)
    this.object.position.set(center.x, y, center.z)

    // 둥글게 선 룬스톤 여섯 개와 바닥의 룬 고리
    const stoneGeometry = buildVoxelGeometry(runestone(41), { voxelSize: 0.12 })
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const stone = new THREE.Mesh(stoneGeometry, voxelMaterial())
      const sx = Math.sin(a) * 3.4
      const sz = Math.cos(a) * 3.4
      stone.position.set(sx, heightAt(center.x + sx, center.z + sz) - y, sz)
      stone.rotation.y = a + Math.PI
      stone.castShadow = true
      this.object.add(stone)
    }
    const glyph = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 6, 1), this.glyphMaterial)
    glyph.rotation.x = -Math.PI / 2
    glyph.position.y = 0.06
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 9, 6, 1, true), this.beamMaterial)
    beam.position.y = 4.5
    this.barrier = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 3.2, 64, 1, true), this.barrierMaterial)
    this.barrier.position.y = 1.4
    this.barrier.visible = false
    for (const mesh of [glyph, beam, this.barrier]) {
      mesh.layers.set(EFFECT_LAYER)
      mesh.renderOrder = 12
      this.object.add(mesh)
    }
  }

  get active(): boolean {
    return this.phase !== 'idle'
  }

  update(dt: number, encounter: Encounter, host: LegendHost): void {
    this.time += dt
    const ready = host.ready()
    // 들어갈 수 있을 때만 빛기둥이 서고 룬이 밝게 빛난다. (글 대신 빛으로 알려 준다)
    const pulse = 0.5 + Math.sin(this.time * 3) * 0.5
    this.beamMaterial.opacity = this.phase === 'idle' && ready ? 0.18 + pulse * 0.12 : 0
    this.glyphMaterial.opacity = this.phase !== 'idle' ? 0.15 : ready ? 0.5 + pulse * 0.4 : 0.2
    this.barrierMaterial.opacity = 0.22 + pulse * 0.08

    if (this.phase === 'idle') {
      const p = host.heroPosition()
      if (ready && host.heroAlive() && Math.hypot(p.x - this.center.x, p.z - this.center.z) < ENTER_RADIUS) {
        this.start(encounter, host)
      }
      return
    }

    if (!host.heroAlive()) {
      this.fail(encounter, host)
      return
    }

    const remaining = this.giants.filter((g) => !g.gone)
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

  private start(encounter: Encounter, host: LegendHost): void {
    this.phase = 'wave'
    this.wave = 0
    this.barrier.visible = true
    host.setArena({ x: this.center.x, z: this.center.z, radius: this.radius - 0.6 })
    host.onStart()
    this.spawnWave(encounter)
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
