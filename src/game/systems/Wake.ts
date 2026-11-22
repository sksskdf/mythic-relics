import * as THREE from 'three'

import { FREE_GODS, pickAwaken, WAKE, WAKE_GODS, wakeDef, GUARDIAN_LEASH, GUARDIAN_MEND, GUARDIAN_RADIUS, LATER_TEXT, ORDER_POWER, TRACE_DWELL, TRACE_LEASH, TRACE_RADIUS, TRACE_WIN_DELAY, traceStateOf, wakePower, type TraceState } from '../../data/wake'
import { sceneId } from '../../data/scenes'
import type { GiantSpec } from '../../data/schema'
import { ENEMIES, type Giant } from '../../enemies/Giant'
import { mythRelic } from '../../gear/mythRelic'
import { type God, godDef, relicDef, type RelicId } from '../../relics/data'
import { EFFECT_LAYER } from '../../render/PixelRenderer'
import { classIcon } from '../../ui/classIcons'
import { josa } from '../../ui/josa'
import { voxelMesh } from '../../voxel/mesher'
import { TRACE_VOXEL, traceGrid } from '../../voxel/models/traces'
import { WAKE_WON } from '../../progress/Wake'
import { guardianSource, traceSource } from '../../data/powers'
import { heightAt } from '../../world/terrain'
import type { GameContext } from '../context'

type Point2 = { x: number; z: number }

/** 다음에 할 일 (목표 한 줄·작은 지도·봇): 흔적에 다가가기, 수호자와 싸우기 */
export interface AwakenTarget {
  god: God
  kind: 'trace' | 'guardian'
  /** 그 일을 하는 땅 */
  region: string
  /** 그 땅 좌표 */
  spot: Point2
}

/** 흔적·수호자 빛기둥의 높이 (m) */
const BEAM_HEIGHT = 9
/** 1초 서기의 고리가 조여드는 끝 반지름 (m) */
const DWELL_END = 1.1

/**
 * 그 신의 수호자 (E239-03): 제 모습과 싸우는 방식은 enemies.json(역할 guardian)에 있다.
 * 수호자는 그 신의 신화권 적이고(재료·경험치), 물러나는 거리는 수호자 규칙(GUARDIAN_LEASH)을 따른다
 */
export function guardianSpec(god: God): GiantSpec | null {
  const def = wakeDef(god)
  const enemy = def ? ENEMIES[def.guardian.enemy] : undefined
  if (!def || !enemy) return null
  return { ...enemy, realm: godDef(god).realm, leashRange: GUARDIAN_LEASH }
}

/**
 * 흔적의 무리를 이겼을 때 뜨는 카드의 줄 (E307 손 QA → 2026-11-20 사냥 단계를 걷으며 조각 1·2 카드를 한 장으로):
 * 빌린 힘, 유물이 유물표에 켜져 그 힘이 깨어났다는 것, 다음에 할 일.
 * 「묠니르가 유물표에 켜졌다 · 바로 깨어난다」는 신이 지금 깨어난다는 말로 읽혔다:
 * 깨어난 것이 유물의 힘임을 적고, 신은 수호자를 쓰러뜨려야 깨어난다는 것을 마지막 줄에 적는다.
 * (유물은 칸·가방이 아니라 유물표에 켜진다. 「가방에 들어왔다 · 장비 탭에서 낀다」는 틀린 글이었다)
 */
export function traceWonLines(god: God): string[] {
  const def = godDef(god)
  const guardian = wakeDef(god)?.guardian.name ?? '수호자'
  // P5: 힘은 흔적의 카드에서 이미 골랐다. 유물은 얻기만 하고(유물표에 켜진다), 그 힘은 카드에서 고를 때 깨어난다.
  // 화면 글에는 「유물표」를 쓰지 않는다 (P5 손 QA: 처음 보는 사람은 그 말을 모른다)
  return [`${josa(relicDef(mythRelic(god)).name, '을')} 얻었다`, `다음: ${josa(guardian, '을')} 쓰러뜨리면 ${josa(def.name, '이')} 깨어난다`]
}

/**
 * 신을 깨우는 길 (E238, `DESIGN.md` 4.2.2): 흔적 → 수호자. 차례는 없다 (2026-11-22): 응답하는 흔적은 모두 함께 응답하고, 신마다 따로 간다.
 * - 흔적: 그 땅에 흔적 모형과 빛기둥을 세운다. 고리 안에 걷지도 싸우지도 않고 1초 서 있으면 응답하고(`traceAnswered`) 지키는 무리가 깨어난다.
 *   다 쓰러뜨리면 그 신을 만나고, 그 신의 유물이 켜지고, 그 신의 수호자가 선다 (멀리 물러나거나 쓰러지면 무리는 흩어지고 다시 서면 다시 깨어난다)
 * - 수호자: 무리를 이긴 신마다 그 신의 땅 깊은 곳에 빛기둥이 서고(여럿이 함께 설 수 있다), 다가가면 수호자가 나타난다.
 *   쓰러뜨리면 그 신이 깨어난다 (`guardianBeaten`)
 * 쓰러지면 무리와 수호자는 물러나고 이긴 것은 그대로 남는다.
 * 무리의 마지막·수호자는 생명이 다한 순간 이긴 것으로 친다 (무너지는 동안 쓰러지거나 땅을 넘어도 잃지 않게).
 */
export class WakeSystem {
  private readonly group = new THREE.Group()
  /** 지금 땅의 흔적 (지금 땅 좌표) */
  private traces: { god: God; x: number; z: number; beam: THREE.Mesh }[] = []
  /** 고리 안에 서 있는 흔적과 선 초 (걷거나 싸우거나 고리를 나가면 처음부터) */
  private dwell: { god: God; t: number } | null = null
  /** 흔적이 응답해 힘 카드를 기다리는 신 (P5): 고를 때까지 다시 응답하지 않고, 고르면 지키는 무리가 깨어난다 */
  private asking: God | null = null
  /** 깨어난 지키는 무리 (한 번에 한 흔적: 두 흔적의 고리는 겹치지 않는다) */
  private pack: { god: God; region: string; x: number; z: number; giants: Giant[]; at: number } | null = null
  /** 무리에서 생명이 다한 것들과 마지막 것 (빛의 자리) */
  private readonly fallen = new Set<Giant>()
  private lastFallen: Giant | null = null
  /** 물러난 수호자의 남은 생명 (신마다: 비율·물러난 때, E239) */
  private readonly wounds = new Map<God, { ratio: number; at: number; roared: boolean }>()
  /** 지금 땅의 수호자 자리 (무리를 이긴 신마다) */
  private lairs: { god: God; x: number; z: number; beam: THREE.Mesh }[] = []
  /** 나타난 수호자와 그 자리 */
  private guardian: { god: God; region: string; giant: Giant; x: number; z: number } | null = null
  /** 엔딩 뒤에 응답하는 흔적: 한 번만 알린다 */
  private told: God | null = null
  /** 쓰러질 때 싸우던 수호자의 이름 (상처를 남기고 물러났다): 일어나면 한 줄로 알린다 */
  private scarred: string | null = null
  private time = 0
  private readonly beamGeometry = new THREE.CylinderGeometry(0.22, 0.34, 1, 10, 1, true)
  /** 고리 안에 서 있는 동안 땅에서 조여드는 고리 (1초 서기의 진행, 글 없이): 고리 끝에서 흔적 둘레까지 줄어든다 */
  private readonly dwellRing = new THREE.Mesh(new THREE.RingGeometry(0.78, 1, 48), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }))

  constructor(
    private readonly ctx: GameContext,
    /** 그 자리가 막혔으면 가까운 빈 자리 (지금 땅 길찾기) */
    private readonly free: (p: Point2) => Point2 | null,
    /** 무리를 이긴 신의 유물을 유물표에 켠다 (E303-04: 유물은 칸에 들지 않는다). announce면 켜는 연출과 함께 */
    private readonly give: (relic: RelicId, announce: boolean) => void,
    /** 흔적이 다가가도 응답하지 않는다 (점검용 실행: 다른 신의 힘이 재는 값에 섞이지 않게. 개발 패널 「다음 조각」은 된다) */
    private readonly quiet: () => boolean = () => false,
  ) {
    ctx.scene.add(this.group)
    this.dwellRing.rotation.x = -Math.PI / 2
    this.dwellRing.layers.set(EFFECT_LAYER)
    this.dwellRing.renderOrder = 12
    this.dwellRing.visible = false
    ctx.scene.add(this.dwellRing)
    ctx.bus.on('regionEntered', () => this.refresh())
    // 쓰러지면 무리와 수호자는 물러난다 (이긴 것은 남는다)
    ctx.bus.on('heroDied', () => {
      const guardian = this.fighting
      this.scarred = guardian && guardian.health.ratio < 1 ? guardian.spec.name : null
      this.calm()
    })
    // 흔적의 카드에서 골랐다 (P5): 그 흔적 곁에 아직 있으면 지키는 무리가 깨어난다
    ctx.bus.on('powerPicked', ({ source }) => {
      const god = this.asking
      if (!god || source !== traceSource(god)) return
      this.asking = null
      const t = this.traces.find((tr) => tr.god === god)
      const p = ctx.hero.object.position
      if (t && !this.pack && Math.hypot(p.x - t.x, p.z - t.z) <= TRACE_LEASH) this.rouse(t)
    })
    // 일어났다: 수호자의 깎아 둔 생명은 남아 있다 (처음부터 다시가 아니라는 것을 한 줄로)
    ctx.bus.on('heroRevived', () => {
      if (this.scarred) ctx.bus.emit('moment', { id: 'woundKept', text: `${this.scarred}의 상처는 남아 있다` })
      this.scarred = null
    })
  }

  /** 무리를 이겨 수호자가 선 신들 (다른 길로 이미 열린 신은 빼고, 이긴 차례) */
  get waking(): God[] {
    const { awaken, progress } = this.ctx
    return awaken.waking.filter((g) => !progress.isOpen(g))
  }

  /** 흔적이 지금 어떤가 (그리스 셋은 엔딩 뒤에 응답한다 E241) */
  traceState(god: God): TraceState {
    const { progress, awaken, ending } = this.ctx
    return traceStateOf(god, { open: progress.isOpen(god), waking: awaken.stage(god) >= WAKE_WON, ending: ending.has('realms') })
  }

  /** 나타나 싸우는 수호자 (보스 막대) */
  get fighting(): Giant | null {
    return this.guardian?.giant.alive ? this.guardian.giant : null
  }

  /** 지금 땅의 흔적 자리 (작은 지도·커서 카드) */
  get spots(): readonly { god: God; x: number; z: number; state: TraceState }[] {
    return this.traces.map((t) => ({ god: t.god, x: t.x, z: t.z, state: this.traceState(t.god) }))
  }

  /** 흔적을 지키는 무리가 깨어나 있나 (봇: 그동안은 흔적으로 걸어가지 않고 싸운다) */
  get roused(): boolean {
    return this.pack !== null
  }

  /** 흔적을 지키는 무리 (봇: 무리는 다 잡아야 하니 멈춤 끊기에서도 피하지 않는다, E241) */
  get guards(): readonly Giant[] {
    return this.pack?.giants ?? []
  }

  /** 지금 땅의 수호자 자리 (작은 지도·점검) */
  get lairSpots(): readonly { god: God; x: number; z: number }[] {
    return this.lairs.map((l) => ({ god: l.god, x: l.x, z: l.z }))
  }

  /** 지금 땅의 첫 수호자 자리 (점검 스크립트) */
  get lairSpot(): Point2 | null {
    const lair = this.lairs[0]
    return lair ? { x: lair.x, z: lair.z } : null
  }

  /**
   * 지금 할 수 있는 깨우는 일 모두: 서 있는 수호자(무리를 이긴 차례), 그다음 열린 땅의 응답하는 흔적 (목표 한 줄·지도 표시·봇).
   * realm을 주면 그 신화권 신의 것만 (장 할 일의 신화권)
   */
  targets(realm?: string): AwakenTarget[] {
    const { chapters } = this.ctx
    const mine = (god: God) => !realm || godDef(god).realm === realm
    const guardians = this.waking.filter(mine).flatMap((god): AwakenTarget[] => {
      const g = wakeDef(god)?.guardian
      return g ? [{ god, kind: 'guardian', region: g.region, spot: { x: g.x, z: g.z } }] : []
    })
    const traces = WAKE_GODS.filter((g) => mine(g) && this.traceState(g) === 'open' && chapters.isOpen(WAKE[g]!.trace.region)).map((god): AwakenTarget => {
      const t = WAKE[god]!.trace
      return { god, kind: 'trace', region: t.region, spot: { x: t.x, z: t.z } }
    })
    return [...guardians, ...traces]
  }

  /** 다음에 할 일 하나 (`pickAwaken`). 깨울 신이 남지 않았으면 null */
  target(prefer?: string, first?: God | null, realm?: string): AwakenTarget | null {
    const p = this.ctx.hero.object.position
    return pickAwaken(this.targets(realm), {
      here: this.ctx.map.region.id,
      prefer,
      first,
      distance: (t) => {
        const spot = this.placed(t)
        return Math.hypot(spot.x - p.x, spot.z - p.z)
      },
    })
  }

  /** 지금 땅 좌표로 본 자리: 흔적·수호자 자리는 세울 때 빈 곳으로 옮긴 자리 */
  placed(target: AwakenTarget): Point2 {
    if (target.region !== this.ctx.map.region.id) return target.spot
    const at = target.kind === 'trace' ? this.traces.find((t) => t.god === target.god) : this.lairs.find((l) => l.god === target.god)
    return at ? { x: at.x, z: at.z } : target.spot
  }

  /** 땅에 들어섰다: 그 땅의 흔적과 수호자 자리를 다시 세운다 */
  refresh(): void {
    this.calm()
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      child.traverse((o) => this.dispose(o))
    }
    this.traces = []
    this.lairs = []
    const region = this.ctx.map.region
    if (region.kind !== 'field') return
    for (const god of WAKE_GODS) {
      const def = WAKE[god]!
      if (def.trace.region !== region.id) continue
      const spot = this.free(def.trace) ?? def.trace
      const root = new THREE.Group()
      root.position.set(spot.x, heightAt(spot.x, spot.z), spot.z)
      root.add(voxelMesh(traceGrid(def.trace.model), { voxelSize: TRACE_VOXEL }))
      const beam = this.beam(godDef(god).color)
      root.add(beam)
      this.group.add(root)
      this.traces.push({ god, x: spot.x, z: spot.z, beam })
    }
    this.placeLairs()
  }

  /** 무리를 이긴 신마다 그 수호자 자리에 빛기둥 (그 땅에 있을 때, 아직 세우지 않은 것만) */
  private placeLairs(): void {
    const { map } = this.ctx
    if (map.region.kind !== 'field') return
    for (const god of this.waking) {
      const def = wakeDef(god)
      if (!def || def.guardian.region !== map.region.id || this.lairs.some((l) => l.god === god)) continue
      const spot = this.free(def.guardian) ?? def.guardian
      const beam = this.beam(godDef(god).color)
      beam.position.set(spot.x, heightAt(spot.x, spot.z), spot.z)
      beam.scale.set(1.8, BEAM_HEIGHT * 1.4, 1.8)
      this.group.add(beam)
      this.lairs.push({ god, x: spot.x, z: spot.z, beam })
    }
  }

  /** 수호자 자리의 빛기둥을 거둔다 */
  private dropLair(god: God): void {
    const lair = this.lairs.find((l) => l.god === god)
    if (!lair) return
    this.group.remove(lair.beam)
    this.dispose(lair.beam)
    this.lairs = this.lairs.filter((l) => l !== lair)
  }

  /** 빛기둥: 땅에 떨어진 것의 빛기둥처럼 효과 레이어에 (외곽선 없이 뒤의 것을 가리지 않게) */
  private beam(color: string): THREE.Mesh {
    const mesh = new THREE.Mesh(this.beamGeometry, new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.3, depthWrite: false }))
    mesh.scale.set(1, BEAM_HEIGHT, 1)
    mesh.layers.set(EFFECT_LAYER)
    mesh.renderOrder = 12
    return mesh
  }

  /** 흔적 모형과 빛기둥을 내린다 (빛기둥 원통은 함께 쓴다) */
  private dispose(o: THREE.Object3D): void {
    if (!(o instanceof THREE.Mesh)) return
    if (o.geometry !== this.beamGeometry) o.geometry.dispose()
    // 흔적 모형은 복셀 공용 재질이라 빛기둥의 재질만
    if (o.material instanceof THREE.MeshBasicMaterial) o.material.dispose()
  }

  /**
   * 무리의 마지막·수호자의 생명이 다했으면 바로 이긴 것으로 친다 (무너지는 0.55초를 기다리지 않는다).
   * 쓰러졌는지는 생명으로 본다: 땅을 옮기며(워프) 지운 적도 alive가 꺼지지만 쓰러뜨린 것이 아니다.
   * 무리는 깨어난 뒤 `TRACE_WIN_DELAY`초가 지나야 이긴 것으로 친다 (now면 기다리지 않는다: 무리를 거둘 때)
   */
  private settleDeaths(now = false): void {
    // 무리에서 마지막으로 생명이 다한 것 (그 자리에 빛이 선다)
    if (this.pack) for (const g of this.pack.giants) if (g.health.dead && !this.fallen.has(g)) {
      this.fallen.add(g)
      this.lastFallen = g
    }
    if (this.pack && (now || this.time - this.pack.at >= TRACE_WIN_DELAY) && this.pack.giants.every((g) => g.health.dead)) {
      const { god, region, giants } = this.pack
      const last = this.lastFallen ?? giants[giants.length - 1]!
      this.pack = null
      this.lastFallen = null
      this.fallen.clear()
      this.won(god, { region, x: last.x, z: last.z })
    }
    if (this.guardian?.giant.health.dead) {
      const { god, giant, region } = this.guardian
      this.guardian = null
      this.awaken(god, { region, x: giant.x, z: giant.z })
    }
  }

  /** 걷지도 싸우지도 않고 서 있나 (흔적이 응답하는 때) */
  private get still(): boolean {
    const { hero, combat, orders } = this.ctx
    return !hero.isMoving && !combat.engaged && orders.attackTarget === null
  }

  /** 프레임마다: 빛기둥, 흔적에 서 있으면 지키는 무리, 수호자 자리에 다가가면 수호자 */
  update(dt: number): void {
    this.time += dt
    this.settleDeaths()
    // 무리를 이긴 신이 다른 길(엔딩 뒤 대장간·떨어진 유물)로 먼저 열렸다: 그 길을 비운다 (E241)
    for (const god of this.ctx.awaken.waking) if (this.ctx.progress.isOpen(god)) this.forget(god)
    const pulse = 0.22 + Math.sin(this.time * 2.6) * 0.08
    for (const t of this.traces) {
      // 응답하는 흔적에만 빛기둥 (깨운 신·무리를 이긴 신이면 꺼진다)
      t.beam.visible = this.traceState(t.god) === 'open' && this.pack?.god !== t.god
      t.beam.position.y = BEAM_HEIGHT / 2
      ;(t.beam.material as THREE.MeshBasicMaterial).opacity = pulse
    }
    for (const lair of this.lairs) {
      lair.beam.visible = this.guardian?.god !== lair.god
      lair.beam.position.y = heightAt(lair.x, lair.z) + (BEAM_HEIGHT * 1.4) / 2
      ;(lair.beam.material as THREE.MeshBasicMaterial).opacity = pulse + 0.08
    }
    const { hero, combat, map } = this.ctx
    if (!combat.alive || map.region.kind !== 'field' || this.quiet()) {
      this.dwell = null
      this.dwellRing.visible = false
      return
    }
    const p = hero.object.position
    if (this.pack) {
      // 멀리 달아나면 무리는 흩어지고 흔적은 다시 응답한다
      if (Math.hypot(p.x - this.pack.x, p.z - this.pack.z) > TRACE_LEASH) this.scatter()
      else {
        // 거리를 두고 던지는 적만 남았으면 다가오게 한다: 멈춰 선 주인공은 닿는 적만 치니, 그대로 두면 싸우지 않고 맞기만 한다
        const left = this.pack.giants.filter((g) => g.alive && !g.health.dead)
        if (left.every((g) => g.spec.keepAway)) for (const g of left) g.closeIn = true
      }
    } else this.watchTraces(dt, p)
    this.showDwell()
    if (this.guardian) {
      if (!this.guardian.giant.alive) return
      // 멀리 물러나면 수호자도 물러난다 (다시 다가가면 입은 상처는 그대로, E239)
      if (Math.hypot(p.x - this.guardian.x, p.z - this.guardian.z) > GUARDIAN_LEASH) this.dismiss()
    } else {
      const lair = this.lairs.find((l) => Math.hypot(p.x - l.x, p.z - l.z) <= GUARDIAN_RADIUS)
      if (lair) this.summon(lair)
    }
  }

  /** 1초 서기의 진행: 고리 끝(반지름 `TRACE_RADIUS`)에서 흔적 곁까지 조여든다. 서 있지 않으면 보이지 않는다 */
  private showDwell(): void {
    const dwell = this.dwell
    const t = dwell && this.traces.find((tr) => tr.god === dwell.god)
    this.dwellRing.visible = !!t
    if (!dwell || !t) return
    const k = Math.min(1, dwell.t / TRACE_DWELL)
    // 끝은 주인공 몸에 가리지 않을 만큼 (0.6m에서는 마지막 0.3초가 몸 밑에 묻혔다, P5 손 QA)
    const r = TRACE_RADIUS * (1 - k) + DWELL_END * k
    this.dwellRing.scale.set(r, r, 1)
    this.dwellRing.position.set(t.x, heightAt(t.x, t.z) + 0.06, t.z)
    ;(this.dwellRing.material as THREE.MeshBasicMaterial).color.set(godDef(dwell.god).color)
  }

  /** 흔적의 고리: 응답하는 흔적 안에 걷지도 싸우지도 않고 `TRACE_DWELL`초 서 있으면 응답한다. 엔딩 뒤에 응답하는 흔적은 한 번 알린다 */
  private watchTraces(dt: number, p: { x: number; z: number }): void {
    const t = this.traces.find((tr) => Math.hypot(p.x - tr.x, p.z - tr.z) <= TRACE_RADIUS)
    const state = t ? this.traceState(t.god) : null
    if (this.asking) return
    if (!t || state !== 'open' || !this.still) {
      this.dwell = null
      if (t && state === 'later' && this.told !== t.god) {
        this.told = t.god
        this.ctx.bus.emit('moment', { id: 'traceBusy', text: LATER_TEXT })
      }
      return
    }
    this.dwell = this.dwell?.god === t.god ? { god: t.god, t: this.dwell.t + dt } : { god: t.god, t: 0 }
    if (this.dwell.t < TRACE_DWELL) return
    this.dwell = null
    // 그 흔적에서 아직 고르지 않았으면 힘 카드를 기다린다 (P5, `PowerSystem`): 고른 뒤 무리가 깨어난다. 골랐으면(무리에 지고 다시 섬) 무리만
    const ask = this.ctx.mythPowers.canClaim(traceSource(t.god))
    if (ask) this.asking = t.god
    this.ctx.bus.emit('traceAnswered', { god: t.god, region: this.ctx.map.region.id, x: t.x, z: t.z })
    if (!ask) this.rouse(t)
  }

  /** 그 신의 흔적의 무리·수호자를 세울 세기: 이미 이긴 무리 수(그 신을 빼고)와 그 땅의 세기로 (`wakePower`) */
  private power(god: God): number {
    const { encounter, progress, awaken, ending } = this.ctx
    const beaten = WAKE_GODS.filter((g) => g !== god && (progress.isOpen(g) || awaken.stage(g) >= WAKE_WON)).length
    return wakePower(encounter.power, beaten, ending.reached, FREE_GODS.includes(god))
  }

  /**
   * 수호자의 세기: 무리를 이긴 때 정해 둔 것 (없으면 지금 셈). 첫 판의 넷은 무리와 같은 표(`ORDER_POWER`)를 따르니
   * 옛 표(1·4·7·9)로 정해 둔 저장도 표의 끝을 넘지 않게 한다 (P5 손 QA)
   */
  private guardianPower(god: God): number {
    const stored = this.ctx.awaken.guardianPower(god)
    if (stored === undefined || stored === null) return this.power(god)
    return FREE_GODS.includes(god) && !this.ctx.ending.reached ? Math.min(stored, ORDER_POWER[ORDER_POWER.length - 1]!) : stored
  }

  /** 흔적이 응답했다: 지키는 무리가 흔적 둘레에서 깨어난다 */
  private rouse(t: { god: God; x: number; z: number }): void {
    const def = wakeDef(t.god)!
    const giants: Giant[] = []
    const members = def.pack.flatMap((m) => Array.from({ length: m.count }, () => m.enemy))
    const power = this.power(t.god)
    members.forEach((enemy, i) => {
      const spec = ENEMIES[enemy]
      if (!spec) return
      const a = (i / members.length) * Math.PI * 2 + 0.4
      const at = { x: t.x + Math.sin(a) * 4, z: t.z + Math.cos(a) * 4 }
      const giant = this.ctx.encounter.spawn(spec, this.free(at) ?? at, true, power)
      giants.push(giant)
      this.ctx.fx.puffs.burst(giant.object.position, 10, 2)
    })
    if (giants.length === 0) return this.won(t.god, { region: this.ctx.map.region.id, x: t.x, z: t.z })
    this.fallen.clear()
    this.lastFallen = null
    this.pack = { god: t.god, region: this.ctx.map.region.id, x: t.x, z: t.z, giants, at: this.time }
    this.ctx.fx.power.burst(new THREE.Vector3(t.x, heightAt(t.x, t.z), t.z), godDef(t.god).color, 2)
    this.ctx.view.shake(0.25)
    this.ctx.bus.emit('moment', { id: 'traceRoused', text: `${josa(def.trace.name, '을')} 지키는 것들이 깨어났다` })
  }

  /** 무리가 흩어진다 (멀리 달아남): 살아 있는 것은 사라지고 흔적은 다시 응답한다 */
  private scatter(): void {
    if (!this.pack) return
    for (const giant of this.pack.giants) if (giant.alive) this.ctx.encounter.remove(giant)
    this.pack = null
  }

  /** 수호자가 물러난다 (멀리 달아남·쓰러짐·땅을 옮김): 다시 다가가면 그동안 조금 아문 만큼으로 돌아온다 */
  private dismiss(): void {
    if (!this.guardian) return
    // 수호자가 불러낸 졸개도 함께 거둔다 (물러났다 다시 올 때마다 졸개가 쌓이지 않게, E239)
    const { god, giant } = this.guardian
    // 깎아 둔 생명은 기억해 둔다 (E239): 다시 나타나면 그동안 조금씩 아문 만큼만
    if (!giant.health.dead) this.wounds.set(god, { ratio: giant.health.ratio, at: this.time, roared: giant.roared })
    for (const minion of this.ctx.encounter.alive.filter((g) => g.summoner === giant)) this.ctx.encounter.remove(minion)
    if (giant.alive) this.ctx.encounter.remove(giant)
    this.guardian = null
    this.ctx.bus.emit('music', { theme: null })
  }

  /** 이미 열린 신의 깨우는 길을 비운다: 그 수호자와 빛기둥을 거두고, 그 신의 단계를 처음으로 */
  private forget(god: God): void {
    const { awaken, bus } = this.ctx
    if (this.guardian?.god === god) this.dismiss()
    this.dropLair(god)
    this.wounds.delete(god)
    awaken.forget(god)
    bus.emit('progressChanged', {})
  }

  /** 무리와 수호자를 거둔다 (땅을 옮김·쓰러짐·전설 시작). 이미 쓰러뜨린 것은 이긴 것으로 */
  private calm(): void {
    this.settleDeaths(true)
    this.scatter()
    this.dismiss()
    this.told = null
    this.dwell = null
    this.asking = null
  }

  /**
   * 흔적을 지키는 무리를 물리쳤다: 그 신의 수호자가 선다 (세기는 지금 정해 둔다: 흔적부터 다 돌아도 첫 수호자가 세지지 않게).
   * 그 신의 유물이 유물표에 켜진다 (땅에 두면 잃을 수 있어 바로). 그 신을 만난 것은 흔적의 카드에서 고른 때다 (P5, `PowerProgress.claim`).
   * 그 신의 한마디 장면 뒤 큰 카드 한 장
   */
  private won(god: God, at: Point2 & { region: string }): void {
    const { awaken, bus, fx, hero, hud, powers } = this.ctx
    if (!awaken.trace(god, this.power(god))) return
    const def = godDef(god)
    hud.flash(def.color)
    fx.power.burst(hero.object.position, def.color, 4)
    const relic = mythRelic(god)
    if (!powers.loadout.has(relic)) this.give(relic, true)
    const card = { kind: '신의 흔적', title: `${def.name}의 흔적`, color: def.color, icon: classIcon(def.name), lines: traceWonLines(god) }
    // 흔적에서 그 신이 처음 말을 건다 (E23 장면): 어느 흔적부터 서는지가 곧 어느 신부터 만나는지다 (`DESIGN.md` 4.2.2)
    bus.emit('moment', { id: 'fragment', scene: sceneId('trace', god), card, slow: true })
    bus.emit('fragment', { god, piece: 1 })
    bus.emit('fragment', { god, piece: 2 })
    bus.emit('packBeaten', { god, region: at.region, x: at.x, z: at.z })
    this.placeLairs()
    bus.emit('progressChanged', {})
  }

  /** 수호자 자리에 다가갔다: 그 신의 수호자가 나타난다 */
  private summon(lair: { god: God; x: number; z: number }): void {
    const { god } = lair
    const spec = guardianSpec(god)
    if (!spec) return
    const giant = this.ctx.encounter.spawn(spec, { x: lair.x, z: lair.z }, true, this.guardianPower(god))
    this.guardian = { god, region: this.ctx.map.region.id, giant, x: lair.x, z: lair.z }
    const wound = this.wounds.get(god)
    if (wound) {
      const health = giant.health
      health.hp = health.max * Math.min(1, wound.ratio + (this.time - wound.at) * GUARDIAN_MEND)
      // 이미 포효했으면 다시 나타나자마자 또 포효하지 않게
      giant.roared = wound.roared
    }
    this.wounds.delete(god)
    this.ctx.fx.power.burst(giant.object.position, godDef(god).color, 4)
    this.ctx.fx.puffs.burst(giant.object.position, 30, 4)
    this.ctx.view.shake(0.5)
    this.ctx.bus.emit('music', { theme: 'boss' })
    this.ctx.bus.emit('guardianAppeared', { god })
  }

  /** 그 신의 수호자를 쓰러뜨렸다(at: 쓰러진 자리). 그 신이 깨어난다 (첫 신이면 세 자리에 들며 장면, 아니면 큰 카드) */
  private awaken(god: God, at: Point2 & { region: string }): void {
    const { awaken, progress, bus } = this.ctx
    bus.emit('music', { theme: null })
    this.dropLair(god)
    if (!awaken.awaken(god) || !progress.open(god)) return
    const first = progress.opened.length === 1
    bus.emit('mythOpened', { god, quiet: !first })
    // 신이 깨어난다 (P5): 힘은 주지 않는다. 쓰러진 자리에 빛이 서고(`PowerSystem`, 내밀 힘이 남았을 때) 싸움이 풀린 뒤 밟으면 하나를 더 고른다.
    // 첫 신은 그 신의 장면 뒤 큰 카드, 그다음 신은 큰 카드
    const def = godDef(god)
    const lines = this.ctx.mythPowers.canClaim(guardianSource(god)) ? ['쓰러진 자리에 빛이 섰다 · 밟으면 힘을 하나 더 고른다'] : [`${def.name}의 옷은 힘 탭 「외형」에`]
    const card = { kind: '신이 깨어남', title: def.name, color: def.color, icon: classIcon(def.name), lines }
    bus.emit('moment', first ? { id: 'mythChosen', scene: sceneId('myth', god), card } : { id: 'godAwakened', card })
    bus.emit('fragment', { god, piece: 3 })
    bus.emit('guardianBeaten', { god, region: at.region, x: at.x, z: at.z })
    bus.emit('progressChanged', {})
  }

  /**
   * 개발 지름길: god(없으면 서 있는 첫 수호자의 신, 그것도 없으면 응답하는 첫 흔적)의 다음 걸음을 한 것으로.
   * 수호자가 선 신이면 수호자를 쓰러뜨린 것으로, 응답하는 흔적이면 그 무리를 이긴 것으로. 한 걸음을 한 신 (한 것이 없으면 null)
   */
  skip(god?: God): God | null {
    const next = god ?? this.waking[0] ?? WAKE_GODS.find((g) => this.traceState(g) === 'open')
    if (!next) return null
    const state = this.traceState(next)
    if (state !== 'open' && state !== 'waking') return null
    this.calm()
    // 빛은 그 일을 하는 땅의 그 자리에 선다 (지금 땅이 아니어도)
    if (state === 'open') {
      const t = WAKE[next]!.trace
      const placed = this.traces.find((tr) => tr.god === next)
      this.won(next, placed ? { region: this.ctx.map.region.id, x: placed.x, z: placed.z } : { region: t.region, x: t.x, z: t.z })
    } else {
      const g = wakeDef(next)!.guardian
      const lair = this.lairs.find((l) => l.god === next)
      this.awaken(next, lair ? { region: this.ctx.map.region.id, x: lair.x, z: lair.z } : { region: g.region, x: g.x, z: g.z })
    }
    return next
  }

  /**
   * 불러온 뒤: 무리를 이긴 신들의 유물을 유물표에 (저장에는 단계만 있다. 사냥하던 옛 저장(조각 1)도 「무리를 이김」으로 읽힌다).
   * 흔적·수호자 자리는 refresh가 세운다. 힘은 주지 않는다 (P5: 힘은 카드에서 고른 것만)
   */
  settle(): void {
    const { powers } = this.ctx
    // 유물을 잃었으면(옛 판) 다시 준다
    for (const god of this.waking) if (!powers.loadout.has(mythRelic(god))) this.give(mythRelic(god), false)
  }
}
