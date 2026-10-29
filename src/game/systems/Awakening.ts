import * as THREE from 'three'

import { AWAKEN, AWAKEN_GODS, awakenDef, canWakeMore, GUARDIAN_LEASH, GUARDIAN_MEND, GUARDIAN_RADIUS, TRACE_LEASH, TRACE_RADIUS, type TraceState } from '../../data/awaken'
import { REGIONS } from '../../data/regions'
import { sceneId } from '../../data/scenes'
import type { GiantSpec } from '../../data/schema'
import { ENEMIES, type Giant } from '../../enemies/Giant'
import { mythRelic } from '../../gear/mythRelic'
import { lendText } from '../../myth/levelGains'
import { type God, godDef, relicDef, type RelicId } from '../../relics/data'
import { EFFECT_LAYER } from '../../render/PixelRenderer'
import { classIcon } from '../../ui/classIcons'
import { josa } from '../../ui/josa'
import { voxelMesh } from '../../voxel/mesher'
import { TRACE_VOXEL, traceGrid } from '../../voxel/models/traces'
import { heightAt } from '../../world/terrain'
import type { GameContext } from '../context'

type Point2 = { x: number; z: number }

/** 다음에 할 일 (목표 한 줄·작은 지도·봇): 흔적에 다가가기, 그 땅에서 사냥, 수호자와 싸우기 */
export interface AwakenTarget {
  god: God
  kind: 'trace' | 'hunt' | 'guardian'
  /** 그 일을 하는 땅 */
  region: string
  /** 그 땅 좌표 (사냥은 그 땅 어디서나라 null) */
  spot: Point2 | null
}

/** 흔적·수호자 빛기둥의 높이 (m) */
const BEAM_HEIGHT = 9

/**
 * 그 신의 수호자 (E239-03): 제 모습과 싸우는 방식은 enemies.json(역할 guardian)에 있다.
 * 수호자는 그 신의 신화권 적이고(재료·경험치), 물러나는 거리는 수호자 규칙(GUARDIAN_LEASH)을 따른다
 */
export function guardianSpec(god: God): GiantSpec | null {
  const def = awakenDef(god)
  const enemy = def ? ENEMIES[def.guardian.enemy] : undefined
  if (!def || !enemy) return null
  return { ...enemy, realm: godDef(god).realm, leashRange: GUARDIAN_LEASH }
}

/**
 * 신을 깨우는 길 (E238, MYTHBUILD.md 3.2): 흔적 → 사냥 → 수호자, 조각 셋.
 * - 흔적: 그 땅에 흔적 모형과 빛기둥을 세운다. 다가가면 지키는 무리가 깨어나고, 다 쓰러뜨리면 조각 1(대표 힘을 빌린다)
 * - 사냥: 그 신의 땅에서 잡을 때마다 막대가 차고, 다 차면 조각 2(그 신의 유물이 손에 들어온다)
 * - 수호자: 그 땅 깊은 곳에 빛기둥이 서고, 다가가면 수호자가 나타난다. 쓰러뜨리면 그 신이 깨어난다
 * 깨우는 신은 한 번에 하나. 쓰러지면 무리와 수호자는 물러나고 조각은 그대로 남는다.
 * 무리의 마지막·수호자는 생명이 다한 순간 조각을 준다 (무너지는 동안 쓰러지거나 땅을 넘어도 잃지 않게).
 */
export class AwakeningSystem {
  private readonly group = new THREE.Group()
  /** 지금 땅의 흔적 (지금 땅 좌표) */
  private traces: { god: God; x: number; z: number; beam: THREE.Mesh }[] = []
  /** 깨어난 지키는 무리 */
  private pack: { god: God; x: number; z: number; giants: Giant[] } | null = null
  /** 물러난 수호자의 남은 생명 (그 신·비율·물러난 때, E239) */
  private wound: { god: God; ratio: number; at: number } | null = null
  /** 수호자 자리 (조각 2를 모았고 그 땅에 있을 때) */
  private lair: { god: God; x: number; z: number; beam: THREE.Mesh } | null = null
  /** 나타난 수호자 */
  private guardian: Giant | null = null
  /** 다른 신을 깨우는 중이라 응답하지 않은 흔적: 한 번만 알린다 */
  private told: God | null = null
  /** 이 시스템이 세운 적 (무리·수호자): 사냥 수에 넣지 않는다 */
  private readonly ours = new WeakSet<Giant>()
  private time = 0
  private readonly beamGeometry = new THREE.CylinderGeometry(0.22, 0.34, 1, 10, 1, true)

  constructor(
    private readonly ctx: GameContext,
    /** 그 자리가 막혔으면 가까운 빈 자리 (지금 땅 길찾기) */
    private readonly free: (p: Point2) => Point2 | null,
    /** 조각 2의 유물을 손에 넣는다 (빈 칸이면 끼고 아니면 가방). announce면 끼는 연출과 함께 */
    private readonly give: (relic: RelicId, announce: boolean) => void,
    /** 흔적이 다가가도 응답하지 않는다 (점검용 실행: 다른 신의 힘이 재는 값에 섞이지 않게. 개발 패널 「다음 조각」은 된다) */
    private readonly quiet: () => boolean = () => false,
  ) {
    ctx.scene.add(this.group)
    ctx.bus.on('regionEntered', () => this.refresh())
    // 쓰러지면 무리와 수호자는 물러난다 (조각은 남는다). 성소의 전설이 시작돼도 (결계 안 싸움과 곡이 섞이지 않게)
    ctx.bus.on('heroDied', () => this.calm())
    ctx.bus.on('legendStarted', () => this.calm())
    ctx.bus.on('giantKilled', ({ giant }) => this.killed(giant))
  }

  /** 깨우는 중인 신 (다른 길로 이미 열렸으면 없음) */
  private get waking(): God | null {
    const god = this.ctx.awaken.waking
    return god && !this.ctx.progress.isOpen(god) ? god : null
  }

  /** 흔적이 지금 어떤가 */
  traceState(god: God): TraceState {
    const { progress, build, ending } = this.ctx
    if (progress.isOpen(god)) return 'awake'
    const waking = this.waking
    if (waking === god) return 'waking'
    if (waking) return 'busy'
    return canWakeMore(progress.opened.length, build.level, ending.reached) ? 'open' : 'sealed'
  }

  /** 다음 신이 응답하는 주신 단계 (주신 단계가 모자라 흔적이 잠잠할 때) */
  get sealedUntil(): number {
    return this.ctx.progress.opened.length + 1
  }

  /** 나타나 싸우는 수호자 (보스 막대) */
  get fighting(): Giant | null {
    return this.guardian?.alive ? this.guardian : null
  }

  /** 지금 땅의 흔적 자리 (작은 지도·커서 카드) */
  get spots(): readonly { god: God; x: number; z: number; state: TraceState }[] {
    return this.traces.map((t) => ({ god: t.god, x: t.x, z: t.z, state: this.traceState(t.god) }))
  }

  /** 흔적을 지키는 무리가 깨어나 있나 (봇: 그동안은 흔적으로 걸어가지 않고 싸운다) */
  get roused(): boolean {
    return this.pack !== null
  }

  /** 수호자 자리 (작은 지도) */
  get lairSpot(): Point2 | null {
    return this.lair ? { x: this.lair.x, z: this.lair.z } : null
  }

  /**
   * 다음에 할 일: 깨우는 신이 있으면 그 신의 사냥·수호자, 없으면 응답하는 흔적 (목표 땅의 것부터, 다음은 열린 땅의 것).
   * 깨울 신이 남지 않았으면 null
   */
  target(prefer?: string): AwakenTarget | null {
    const { awaken, chapters } = this.ctx
    const waking = this.waking
    if (waking) {
      const def = awakenDef(waking)!
      if (awaken.fragments >= 2) return { god: waking, kind: 'guardian', region: def.guardian.region, spot: { x: def.guardian.x, z: def.guardian.z } }
      if (awaken.fragments >= 1) return { god: waking, kind: 'hunt', region: def.land, spot: null }
    }
    const open = AWAKEN_GODS.filter((g) => this.traceState(g) === 'open' && chapters.isOpen(AWAKEN[g]!.trace.region))
    const god = open.find((g) => AWAKEN[g]!.trace.region === prefer) ?? open[0]
    if (!god) return null
    const t = AWAKEN[god]!.trace
    return { god, kind: 'trace', region: t.region, spot: { x: t.x, z: t.z } }
  }

  /** 지금 땅 좌표로 본 자리: 흔적·수호자 자리는 세울 때 빈 곳으로 옮긴 자리 */
  placed(target: AwakenTarget): Point2 | null {
    if (target.region !== this.ctx.map.region.id || !target.spot) return target.spot
    if (target.kind === 'trace') return this.traces.find((t) => t.god === target.god) ?? target.spot
    return this.lair ?? target.spot
  }

  /** 땅에 들어섰다: 그 땅의 흔적과 수호자 자리를 다시 세운다 */
  refresh(): void {
    this.calm()
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      child.traverse((o) => this.dispose(o))
    }
    this.traces = []
    this.lair = null
    const region = this.ctx.map.region
    if (region.kind !== 'field') return
    for (const god of AWAKEN_GODS) {
      const def = AWAKEN[god]!
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
    this.placeLair()
  }

  /** 조각 2를 모은 신의 수호자 자리에 빛기둥 (그 땅에 있을 때) */
  private placeLair(): void {
    const { awaken, map } = this.ctx
    const god = awaken.waking
    const def = god ? awakenDef(god) : undefined
    if (this.lair || !god || !def || awaken.fragments < 2 || def.guardian.region !== map.region.id) return
    const spot = this.free(def.guardian) ?? def.guardian
    const beam = this.beam(godDef(god).color)
    beam.position.set(spot.x, heightAt(spot.x, spot.z), spot.z)
    beam.scale.set(1.8, BEAM_HEIGHT * 1.4, 1.8)
    this.group.add(beam)
    this.lair = { god, x: spot.x, z: spot.z, beam }
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

  /** 무리의 마지막·수호자의 생명이 다했으면 바로 조각을 준다 (무너지는 0.55초를 기다리지 않는다) */
  private settleDeaths(): void {
    if (this.pack && this.pack.giants.every((g) => !g.alive)) {
      const god = this.pack.god
      this.pack = null
      this.piece1(god)
    }
    if (this.guardian && !this.guardian.alive) {
      this.guardian = null
      this.awaken()
    }
  }

  /** 프레임마다: 빛기둥, 흔적에 다가가면 지키는 무리, 수호자 자리에 다가가면 수호자 */
  update(dt: number): void {
    this.time += dt
    this.settleDeaths()
    const pulse = 0.22 + Math.sin(this.time * 2.6) * 0.08
    for (const t of this.traces) {
      // 응답하는 흔적에만 빛기둥 (깨운 신·다른 신을 깨우는 중이면 꺼진다)
      t.beam.visible = this.traceState(t.god) === 'open' && this.pack?.god !== t.god
      t.beam.position.y = BEAM_HEIGHT / 2
      ;(t.beam.material as THREE.MeshBasicMaterial).opacity = pulse
    }
    if (this.lair) {
      this.lair.beam.visible = !this.guardian
      this.lair.beam.position.y = heightAt(this.lair.x, this.lair.z) + (BEAM_HEIGHT * 1.4) / 2
      ;(this.lair.beam.material as THREE.MeshBasicMaterial).opacity = pulse + 0.08
    }
    const { hero, combat, legend, map } = this.ctx
    if (!combat.alive || legend.active || map.region.kind !== 'field' || this.quiet()) return
    const p = hero.object.position
    if (this.pack) {
      // 멀리 달아나면 무리는 흩어지고 흔적은 다시 응답한다
      if (Math.hypot(p.x - this.pack.x, p.z - this.pack.z) > TRACE_LEASH) this.scatter()
    } else {
      for (const t of this.traces) {
        if (Math.hypot(p.x - t.x, p.z - t.z) > TRACE_RADIUS) continue
        const state = this.traceState(t.god)
        if (state === 'open') this.rouse(t)
        else if ((state === 'busy' || state === 'sealed') && this.told !== t.god) {
          this.told = t.god
          const waking = this.waking
          const text = waking ? `${josa(godDef(waking).name, '이')} 깨어난 뒤에 응답한다` : `주신이 ${this.sealedUntil}단계가 되면 응답한다`
          this.ctx.bus.emit('moment', { id: 'traceBusy', text })
        }
      }
    }
    if (this.guardian) {
      if (!this.guardian.alive) return
      // 멀리 물러나면 수호자도 물러난다 (다시 다가가면 처음부터)
      if (this.lair && Math.hypot(p.x - this.lair.x, p.z - this.lair.z) > GUARDIAN_LEASH) this.dismiss()
    } else if (this.lair && Math.hypot(p.x - this.lair.x, p.z - this.lair.z) <= GUARDIAN_RADIUS) this.summon(this.lair.god)
  }

  /** 흔적에 다가갔다: 지키는 무리가 흔적 둘레에서 깨어난다 */
  private rouse(t: { god: God; x: number; z: number }): void {
    const def = awakenDef(t.god)!
    const giants: Giant[] = []
    const members = def.pack.flatMap((m) => Array.from({ length: m.count }, () => m.enemy))
    members.forEach((enemy, i) => {
      const spec = ENEMIES[enemy]
      if (!spec) return
      const a = (i / members.length) * Math.PI * 2 + 0.4
      const at = { x: t.x + Math.sin(a) * 4, z: t.z + Math.cos(a) * 4 }
      const giant = this.ctx.encounter.spawn(spec, this.free(at) ?? at, true)
      this.ours.add(giant)
      giants.push(giant)
      this.ctx.fx.puffs.burst(giant.object.position, 10, 2)
    })
    if (giants.length === 0) return this.piece1(t.god)
    this.pack = { god: t.god, x: t.x, z: t.z, giants }
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

  /** 수호자가 물러난다 (멀리 달아남·쓰러짐·땅을 옮김): 다시 다가가면 처음부터 */
  private dismiss(): void {
    if (!this.guardian) return
    // 수호자가 불러낸 졸개도 함께 거둔다 (물러났다 다시 올 때마다 졸개가 쌓이지 않게, E239)
    const guardian = this.guardian
    // 깎아 둔 생명은 기억해 둔다 (E239): 다시 나타나면 그동안 조금씩 아문 만큼만
    if (guardian.alive && this.lair) this.wound = { god: this.lair.god, ratio: guardian.health.ratio, at: this.time }
    for (const giant of this.ctx.encounter.alive.filter((g) => g.summoner === guardian)) this.ctx.encounter.remove(giant)
    if (this.guardian.alive) this.ctx.encounter.remove(this.guardian)
    this.guardian = null
    this.ctx.bus.emit('music', { theme: null })
  }

  /** 무리와 수호자를 거둔다 (땅을 옮김·쓰러짐·전설 시작). 이미 쓰러뜨린 것은 조각으로 */
  private calm(): void {
    this.settleDeaths()
    this.scatter()
    this.dismiss()
    this.told = null
  }

  /** 적이 쓰러졌다 (무너지고 난 뒤): 사냥 수. 무리·수호자는 생명이 다한 순간 이미 조각을 주었다 */
  private killed(giant: Giant): void {
    const { awaken, map, legend, bus } = this.ctx
    if (this.ours.has(giant)) return
    // 사냥: 그 신의 땅에서 잡을 때마다 (성소의 전설·시련 싸움은 빼고)
    const waking = this.waking
    if (!waking || awaken.fragments !== 1 || legend.active || map.region.id !== awakenDef(waking)?.land) return
    if (awaken.addKill()) this.piece2(waking)
    else bus.emit('progressChanged', {})
  }

  /** 조각 1: 지키는 무리를 물리쳤다. 그 신을 깨우기 시작하고 대표 힘을 바로 빌린다 */
  private piece1(god: God): void {
    const { awaken, bus, fx, hero, hud } = this.ctx
    if (!awaken.trace(god)) return
    const def = godDef(god)
    const path = awakenDef(god)!
    hud.flash(def.color)
    fx.power.burst(hero.object.position, def.color, 3)
    const card = {
      kind: '신의 조각 1/3',
      title: `${def.name}의 흔적`,
      color: def.color,
      icon: classIcon(def.name),
      lines: [`빌린 힘: ${lendText(god, 1)}`, `다음 조각: ${REGIONS[path.land]?.name ?? path.land}에서 사냥한다`],
    }
    // 흔적에서 그 신이 처음 말을 건다 (E23 장면): 첫 흔적을 고르는 것이 곧 첫 신을 고르는 순간 (MYTHBUILD 3.3)
    bus.emit('moment', { id: 'fragment', scene: sceneId('trace', god), card, slow: true })
    bus.emit('fragment', { god, piece: 1 })
    bus.emit('progressChanged', {})
  }

  /** 조각 2: 그 땅에서 사냥을 마쳤다. 그 신의 유물이 손에 들어오고(땅에 두면 잃을 수 있어 바로), 조각 2부터 그 유물이 깨어난다 */
  private piece2(god: God): void {
    const { powers, hero, bus, fx } = this.ctx
    const relic = mythRelic(god)
    powers.loadout.waking = god
    const p = hero.object.position
    if (!powers.loadout.has(relic)) this.give(relic, true)
    const worn = powers.loadout.slots.includes(relic)
    const def = godDef(god)
    const path = awakenDef(god)!
    fx.power.burst(p, def.color, 4)
    const card = {
      kind: '신의 조각 2/3',
      title: relicDef(relic).name,
      color: def.color,
      icon: classIcon(def.name),
      lines: [worn ? `${josa(relicDef(relic).name, '이')} 손에 들어왔다` : `${josa(relicDef(relic).name, '이')} 가방에 들어왔다 · 장비 탭에서 낀다`, `마지막 조각: ${josa(path.guardian.name, '을')} 쓰러뜨린다`],
    }
    bus.emit('moment', { id: 'fragmentRelic', card })
    bus.emit('fragment', { god, piece: 2 })
    this.placeLair()
    bus.emit('progressChanged', {})
  }

  /** 수호자 자리에 다가갔다: 수호자가 나타난다 */
  private summon(god: God): void {
    const spec = guardianSpec(god)
    if (!spec || !this.lair) return
    const at = { x: this.lair.x, z: this.lair.z }
    this.guardian = this.ctx.encounter.spawn(spec, at, true)
    this.ours.add(this.guardian)
    const wound = this.wound?.god === god ? this.wound : null
    if (wound) {
      const health = this.guardian.health
      health.hp = health.max * Math.min(1, wound.ratio + (this.time - wound.at) * GUARDIAN_MEND)
    }
    this.wound = null
    this.ctx.fx.power.burst(this.guardian.object.position, godDef(god).color, 4)
    this.ctx.fx.puffs.burst(this.guardian.object.position, 30, 4)
    this.ctx.view.shake(0.5)
    this.ctx.bus.emit('music', { theme: 'boss' })
    this.ctx.bus.emit('guardianAppeared', { god })
  }

  /** 조각 3: 수호자를 쓰러뜨렸다. 그 신이 깨어난다 (첫 신이면 주신으로 장면, 아니면 빈 칸에 큰 카드) */
  private awaken(): void {
    const { awaken, progress, powers, bus } = this.ctx
    const god = awaken.awaken()
    bus.emit('music', { theme: null })
    if (this.lair) {
      this.group.remove(this.lair.beam)
      this.dispose(this.lair.beam)
    }
    this.lair = null
    powers.loadout.waking = null
    if (!god || !progress.open(god)) return
    const first = progress.opened.length === 1
    // 첫 신은 RelicSystem이 주신으로 고르며 장면을 띄운다. 그다음 신은 빈 칸에 조용히 들어가고 여기서 큰 카드 (번쩍임·빛기둥은 큰 카드가)
    bus.emit('mythOpened', { god, quiet: !first })
    if (!first) {
      const def = godDef(god)
      const lent = progress.chosen.includes(god)
      const lines = [`빌린 힘: ${lendText(god, progress.level(god))}`, lent ? `빌린 칸에 들어갔다 · 신위 칸 ${progress.chosen.length}` : '마을이나 성소에서 신위 칸에 넣는다', `${josa(relicDef(def.relic).name, '이')} 깨어난다`]
      bus.emit('moment', { id: 'godAwakened', card: { kind: '신이 깨어남', title: progress.title(god), color: def.color, icon: classIcon(def.name), lines } })
    }
    bus.emit('fragment', { god, piece: 3 })
    bus.emit('progressChanged', {})
  }

  /** 개발 지름길: 깨우는 신의 다음 조각을 바로 얻는다 (깨우는 신이 없으면 god부터) */
  skip(god?: God): boolean {
    const { awaken } = this.ctx
    const waking = this.waking
    if (!waking) {
      const next = god ?? AWAKEN_GODS.find((g) => this.traceState(g) === 'open')
      if (!next || this.traceState(next) !== 'open') return false
      this.calm()
      this.piece1(next)
      return true
    }
    if (awaken.fragments === 1) {
      while (!awaken.addKill()) {
        /* 막대를 채운다 */
      }
      this.piece2(waking)
      return true
    }
    this.calm()
    this.awaken()
    return true
  }

  /** 불러온 뒤: 조각 2를 모은 신이면 유물이 깨어나게 (저장에는 조각만 있다). 흔적·수호자 자리는 refresh가 세운다 */
  settle(): void {
    const { awaken, powers } = this.ctx
    const waking = this.waking
    powers.loadout.waking = waking && awaken.fragments >= 2 ? waking : null
    // 조각 2의 유물을 잃었으면(옛 판) 다시 준다
    if (powers.loadout.waking && !powers.loadout.has(mythRelic(powers.loadout.waking))) this.give(mythRelic(powers.loadout.waking), false)
  }
}

