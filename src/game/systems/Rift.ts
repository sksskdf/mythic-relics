import * as THREE from 'three'

import { REGIONS, type RegionDef } from '../../data/regions'
import { RIFT_BASE_THREAT, riftScale } from '../../data/rift'
import { threatElite, threatScale } from '../../data/threat'
import { ELITE_CHANCE } from '../../enemies/elite'
import { bossMaterial, materialName, PROTOTYPE } from '../../gear/materials'
import { EFFECT_LAYER } from '../../render/PixelRenderer'
import { heightAt } from '../../world/terrain'
import { riftFloor, type RiftFloor } from '../../world/riftFloor'
import { ENEMIES } from '../../enemies/Giant'
import type { GameContext } from '../context'
import type { ThreatSystem } from './Threat'

const bossMaterialOf = (enemyId: string): string | undefined => {
  const name = ENEMIES[enemyId]?.boss
  return name ? bossMaterial(name) : undefined
}

/** 그 신화권 지역 보스의 재료 */
function realmBossMaterial(realm: string | null | undefined): string | undefined {
  const region = Object.values(REGIONS).find((r) => r.realm === realm && r.boss)
  return region?.boss ? bossMaterialOf(region.boss.enemy ?? 'king') : undefined
}

/** 다음 층 문에 이만큼 다가가면 내려간다 */
const PORTAL_RADIUS = 1.8

/** 균열이 게임에 부탁하는 일 */
export interface RiftHost {
  /** 그 땅으로 바로 들어간다 (암전 없이) */
  enter(region: RegionDef): void
  /** 마을로 돌아간다 */
  home(): void
}

export interface RiftRun {
  depth: number
  seed: number
  floor: RiftFloor
  /** 이 층을 깼나 (깨면 다음 층 문이 열린다) */
  cleared: boolean
  /** 이 층에 들어온 뒤 흐른 시간 */
  t: number
}

/**
 * 균열 (E17-02~04, DESIGN.md 9.4).
 * 한계를 깬 뒤 마을에서 들어간다. 들어갈 때마다 1층부터, 층마다 땅이 바뀐다(`riftFloor`).
 * 층의 적을 모두 쓰러뜨리면 재료를 받고 다음 층 문(빛기둥)이 열린다 (축복 고르기는 E305-03에서 걷었다).
 * 들어온 문으로 나가거나 쓰러지면 끝: 깊이 기록·재료만 남는다.
 */
export class RiftSystem {
  run: RiftRun | null = null
  private readonly portal: THREE.Mesh
  private time = 0

  constructor(
    private readonly ctx: GameContext,
    private readonly threat: ThreatSystem,
    private readonly host: RiftHost,
    parent: THREE.Object3D,
  ) {
    this.portal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.3, 10, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xe6d2ff, transparent: true, opacity: 0.35, depthWrite: false }),
    )
    this.portal.layers.set(EFFECT_LAYER)
    this.portal.renderOrder = 12
    this.portal.visible = false
    parent.add(this.portal)
    ctx.bus.on('heroRevived', () => {
      if (this.run) this.end('fell')
    })
    ctx.bus.on('regionEntered', ({ id }) => {
      if (this.run && id !== 'rift') this.end('left')
    })
  }

  /** 균열이 열렸나 (한계를 깸) */
  get open(): boolean {
    return this.ctx.ending.has('rift') && this.ctx.threat.limitBroken
  }

  /** 지금 들어갈 수 있나: 열렸고, 마을이고, 이미 들어가 있지 않다 */
  get canEnter(): boolean {
    return this.open && !this.run && this.ctx.map.region.kind === 'hub'
  }

  /** 균열에 들어간다 (1층) */
  enter(seed = Math.floor(Math.random() * 1e6)): boolean {
    if (!this.canEnter) return false
    this.run = { depth: 0, seed, floor: riftFloor(1, seed), cleared: false, t: 0 }
    this.goFloor(1)
    return true
  }

  private goFloor(depth: number): void {
    const run = this.run!
    run.depth = depth
    run.floor = riftFloor(depth, run.seed)
    run.cleared = false
    run.t = 0
    this.portal.visible = false
    // 깊이 배율: 위협 5단계 × 층 (다음에 세우는 적부터라 들어가기 전에). 정예 확률도 고른 단계가 아니라 위협 5단계로
    const base = threatScale(RIFT_BASE_THREAT)
    const deep = riftScale(depth)
    this.ctx.encounter.threat = { hp: base.hp * deep.hp, damage: base.damage * deep.damage }
    this.ctx.encounter.eliteChance = threatElite(ELITE_CHANCE, RIFT_BASE_THREAT)
    this.host.enter(run.floor.region)
    this.ctx.bus.emit('riftFloor', { depth })
  }

  update(dt: number): void {
    const run = this.run
    this.time += dt
    if (!run || this.ctx.map.region.id !== 'rift') return
    run.t += dt
    const { encounter, hero, combat } = this.ctx
    if (!run.cleared && combat.alive && encounter.cleared) {
      run.cleared = true
      this.reward(run)
      this.openPortal(run)
    }
    if (!run.cleared) return
    const p = run.floor.portal
    const pulse = 0.5 + Math.sin(this.time * 3) * 0.5
    ;(this.portal.material as THREE.MeshBasicMaterial).opacity = 0.25 + pulse * 0.15
    const h = hero.object.position
    if (Math.hypot(h.x - p.x, h.z - p.z) < PORTAL_RADIUS) this.goFloor(run.depth + 1)
  }

  /** 층을 깼다: 다음 층 문(빛기둥)을 세운다 */
  private openPortal(run: RiftRun): void {
    const p = run.floor.portal
    this.portal.position.set(p.x, heightAt(p.x, p.z) + 5, p.z)
    this.portal.visible = true
  }

  /** 층을 깬 보상: 원형(깊을수록 많이, 대장간 값이 셋 배라 셋 배로), 보스 층은 귀한 재료. 깊이 기록을 올린다 */
  private reward(run: RiftRun): void {
    const { powers, rift, bus } = this.ctx
    const lines: string[] = []
    {
      const n = 3 * (2 + Math.floor(run.depth / 2))
      powers.loadout.addMaterial(PROTOTYPE, n)
      lines.push(`${materialName(PROTOTYPE)} ×${n}`)
    }
    // 보스 층의 귀한 재료: 그 보스의 재료, 없으면(종말 보스) 그 층 신화권 보스의 재료
    const bossId = run.floor.region.boss ? (run.floor.region.boss.enemy ?? 'king') : null
    const rare = bossId ? (bossMaterialOf(bossId) ?? realmBossMaterial(run.floor.region.realm)) : undefined
    if (rare) {
      powers.loadout.addMaterial(rare, 1 + Math.floor(run.depth / 10))
      lines.push(`${materialName(rare)} ×${1 + Math.floor(run.depth / 10)}`)
    }
    if (rift.reach(run.depth)) lines.push('새 기록')
    lines.push('다음 층 문이 열렸다')
    bus.emit('moment', { id: 'riftCleared', card: { kind: '균열', title: `${run.depth}층을 깼다`, color: '#e6d2ff', lines } })
    bus.emit('progressChanged', {})
  }

  /** 균열을 나왔다: 깊이 기록만 남는다 */
  private end(reason: 'left' | 'fell'): void {
    const run = this.run!
    this.run = null
    this.portal.visible = false
    this.threat.apply()
    // 다른 땅으로 나왔으면 그 땅은 이미 균열 배율로 적을 세웠다 (워프 등): 고른 위협 단계로 다시 세운다
    if (reason === 'left') this.ctx.encounter.resetAll()
    this.ctx.bus.emit('moment', { id: 'riftEnded', text: `균열 ${run.depth}층에서 ${reason === 'fell' ? '쓰러졌다' : '나왔다'} · 가장 깊이 ${this.ctx.rift.best}층` })
    this.ctx.bus.emit('riftEnded', { depth: run.depth, reason })
    this.ctx.bus.emit('progressChanged', {})
    if (reason === 'fell') this.host.home()
  }
}
