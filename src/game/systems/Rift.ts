import * as THREE from 'three'

import { REGIONS, type RegionDef } from '../../data/regions'
import { type Blessing, blessingDef, RIFT_BASE_THREAT, riftScale, rollBlessings, STAR_EVERY, STARS_PER_DOOM } from '../../data/rift'
import { threatElite, threatScale } from '../../data/threat'
import { ELITE_CHANCE } from '../../enemies/elite'
import { bossMaterial, materialName, realmMaterial } from '../../gear/materials'
import { EFFECT_LAYER } from '../../render/PixelRenderer'
import { heightAt } from '../../world/terrain'
import { riftFloor, type RiftFloor } from '../../world/riftFloor'
import { createRng } from '../../world/rng'
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
  /** 축복 셋을 보여 주고, 고르면 부른다 */
  offer(choices: readonly Blessing[], pick: (id: string) => void): void
  /** 축복 고르기 창을 닫는다 (고르지 않고 나왔을 때) */
  closeBlessings(): void
}

export interface RiftRun {
  depth: number
  seed: number
  /** 고른 축복 (겹쳐 쌓인다) */
  blessings: string[]
  floor: RiftFloor
  /** 이 층을 깼나, 축복을 골랐나 (고르면 다음 층 문이 열린다) */
  cleared: boolean
  picked: boolean
  /** 이 층에 들어온 뒤 흐른 시간 */
  t: number
  /** 지금 고를 수 있는 축복 셋 (고르기 전) */
  choices: Blessing[]
}

/**
 * 균열 (E17-02~04, DESIGN.md 9.4).
 * 한계를 깬 뒤 마을에서 들어간다. 들어갈 때마다 1층부터, 층마다 땅이 바뀐다(`riftFloor`).
 * 층의 적을 모두 쓰러뜨리면 재료를 받고 축복 셋 가운데 하나를 고른다. 고르면 다음 층 문(빛기둥)이 열린다.
 * 들어온 문으로 나가거나 쓰러지면 끝: 축복은 사라지고 깊이 기록·재료·별만 남는다.
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

  /** 지금 걸린 축복 (빌드 상태가 읽는다) */
  get blessings(): readonly string[] {
    return this.run?.blessings ?? []
  }

  /** 균열에 들어간다 (1층) */
  enter(seed = Math.floor(Math.random() * 1e6)): boolean {
    if (!this.canEnter) return false
    this.run = { depth: 0, seed, blessings: [], floor: riftFloor(1, seed), cleared: false, picked: false, t: 0, choices: [] }
    this.goFloor(1)
    return true
  }

  private goFloor(depth: number): void {
    const run = this.run!
    run.depth = depth
    run.floor = riftFloor(depth, run.seed)
    run.cleared = false
    run.picked = false
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
      run.choices = rollBlessings(createRng(run.seed * 31 + run.depth))
      this.host.offer(run.choices, (id) => this.pick(id))
    }
    if (!run.picked) return
    const p = run.floor.portal
    const pulse = 0.5 + Math.sin(this.time * 3) * 0.5
    ;(this.portal.material as THREE.MeshBasicMaterial).opacity = 0.25 + pulse * 0.15
    const h = hero.object.position
    if (Math.hypot(h.x - p.x, h.z - p.z) < PORTAL_RADIUS) this.goFloor(run.depth + 1)
  }

  /** 축복을 골랐다: 쌓고 다음 층 문을 연다 */
  pick(id: string): void {
    const run = this.run
    if (!run || !run.cleared || run.picked || !blessingDef(id)) return
    run.blessings.push(id)
    run.picked = true
    run.choices = []
    const p = run.floor.portal
    this.portal.position.set(p.x, heightAt(p.x, p.z) + 5, p.z)
    this.portal.visible = true
    this.ctx.hud.showToast(`${blessingDef(id)!.name} · 다음 층 문이 열렸다`)
  }

  /** 층을 깬 보상: 그 땅 공통 재료(깊을수록 많이, 시련 기록 배율), 보스 층은 귀한 재료, 종말 보스는 별 둘, 처음 닿은 5층마다 별 하나 */
  private reward(run: RiftRun): void {
    const { powers, trials, rift, hud, bus } = this.ctx
    const scale = trials.riftScale()
    const lines: string[] = []
    const common = run.floor.region.realm ? realmMaterial(run.floor.region.realm) : undefined
    if (common) {
      const n = Math.round((2 + Math.floor(run.depth / 2)) * scale)
      powers.loadout.addMaterial(common, n)
      lines.push(`${materialName(common)} ×${n}`)
    }
    // 보스 층의 귀한 재료: 그 보스의 재료, 없으면(종말 보스) 그 층 신화권 보스의 재료
    const bossId = run.floor.region.boss ? (run.floor.region.boss.enemy ?? 'king') : null
    const rare = bossId ? (bossMaterialOf(bossId) ?? realmBossMaterial(run.floor.region.realm)) : undefined
    if (rare) {
      powers.loadout.addMaterial(rare, 1 + Math.floor(run.depth / 10))
      lines.push(`${materialName(rare)} ×${1 + Math.floor(run.depth / 10)}`)
    }
    // 종말 보스의 별도 5층마다의 별처럼 처음 깬 층에서만
    const first = run.depth > rift.best
    let stars = rift.reach(run.depth, STAR_EVERY)
    if (run.floor.doom && first) {
      rift.stars += STARS_PER_DOOM
      stars += STARS_PER_DOOM
    }
    if (stars > 0) lines.push(`별 +${stars} (성좌판)`)
    hud.showGains('균열', `${run.depth}층을 깼다`, '#e6d2ff', '', lines)
    bus.emit('progressChanged', {})
  }

  /** 균열을 나왔다: 축복은 사라지고 깊이 기록만 남는다 */
  private end(reason: 'left' | 'fell'): void {
    const run = this.run!
    this.run = null
    this.portal.visible = false
    this.threat.apply()
    // 다른 땅으로 나왔으면 그 땅은 이미 균열 배율로 적을 세웠다 (워프 등): 고른 위협 단계로 다시 세운다
    if (reason === 'left') this.ctx.encounter.resetAll()
    this.host.closeBlessings()
    this.ctx.hud.showToast(`균열 ${run.depth}층에서 ${reason === 'fell' ? '쓰러졌다' : '나왔다'} · 가장 깊이 ${this.ctx.rift.best}층`)
    this.ctx.bus.emit('riftEnded', { depth: run.depth, reason })
    this.ctx.bus.emit('progressChanged', {})
    if (reason === 'fell') this.host.home()
  }
}
