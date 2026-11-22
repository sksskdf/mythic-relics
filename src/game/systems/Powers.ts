import * as THREE from 'three'

import type { AttackStyle } from '../../combat/styles'
import { activeCombos, guardianSource, parseSource, power, type Power, type PowerId, type PowerSlots, powerRelic, slotted, sourceGod, traceSource } from '../../data/powers'
import { REGIONS } from '../../data/regions'
import { TRACE_LEASH } from '../../data/wake'
import { ENEMIES } from '../../enemies/Giant'
import type { PowerLight } from '../../progress/Powers'
import { godDef } from '../../relics/data'
import { EFFECT_LAYER } from '../../render/PixelRenderer'
import { classIcon } from '../../ui/classIcons'
import type { PowerCardView, PowerRow } from '../../ui/powerCardView'
import { heightAt } from '../../world/terrain'
import type { GameContext } from '../context'

/** 힘 카드가 게임에서 쓰는 것 */
export interface PowerHost {
  /** 힘 카드 (`src/ui/PowerCard.ts`) */
  card: { readonly open: boolean; show(view: PowerCardView, pick: (id: string) => void): void; hide(): void }
  /** 다른 것이 화면을 쥐고 있나 (장면·느린 동작·기다리는 순간·다른 고르는 카드·땅을 옮기는 암전): 그동안 카드는 차례를 기다린다 */
  blocked(): boolean
  /** 그 무기의 마지막 타를 한 번 휘두르는 모습 (`AttackFx.swing`) */
  swing(style: AttackStyle): void
  /** 지금 상태를 저장한다 (카드를 띄울 때: 다시 불러와도 같은 셋이 뜨게) */
  save(): void
  /** 그 자리가 막혔으면 가까운 갈 수 있는 자리 (지금 땅 길찾기). 없으면 그대로 */
  free?(p: { x: number; z: number }): { x: number; z: number } | null
}

/** 빛을 밟는 거리 (m) */
const LIGHT_RADIUS = 1.6
/**
 * 빛을 밟으면 곧 카드가 뜬다: 이 거리(m) 안에 깨어 있는 적이 붙어 있지만 않으면 (2026-11-22 손 QA: 멀리서 던지는 적에게 맞는 동안은
 * 「맞은 지 2초」가 늘 0으로 돌아가 빛 위에 서 있어도 카드가 영영 뜨지 않았다)
 */
const CALM_RADIUS = 6
/** 고른 힘이 그 자리에서 한 번 터질 때 닿는 거리(m)와 피해 */
const BURST_RADIUS = 4
const BURST_DAMAGE = 20
/** 빛기둥의 높이 (m): 나무 너머로도 보이게 높게 */
const BEAM_HEIGHT = 22
/** 빛이 주인공에서 이 거리(m) 안에 서면 주인공 반대쪽으로 `LIGHT_PUSH`m 밀어 세운다 (장면이 끝나자마자 저절로 밟히지 않게, P5 손 QA) */
const LIGHT_NEAR = 2.5
const LIGHT_PUSH = 3
/** 흔적의 카드는 그 흔적에서 이 거리(m) 안에 있을 때만 뜬다 (`TRACE_LEASH`: 무리가 흩어지는 거리와 같다) */
const TRACE_NEAR = TRACE_LEASH

/** 종류 표시 */
const KIND_NAMES: Readonly<Record<Power['kind'], string>> = { weapon: '무기', ultimate: '궁극기', aura: '힘' }

/** 출처마다 머리줄의 한마디 */
const SAYS = { trace: '내 힘 가운데 하나를 가져가라', guardian: '내 수호자를 넘었구나. 하나를 더 가져가라', boss: '큰 싸움을 이겼다. 신들이 힘을 내민다', pack: '이긴 자에게 신들이 힘을 내민다' } as const

/**
 * 힘을 고르는 카드와 빛 (재미 재설계 P5, `docs/knowledge/review-e307/redesign.md` 1장 2·6):
 * - 흔적: 고리에 서서 응답하면(`traceAnswered`) 그 신이 힘 셋을 내민다. 고르면 그 힘이 한 번 터지고, 그 뒤 지키는 무리가 깨어난다 (`WakeSystem`이 `powerPicked`를 듣는다)
 * - 흔적의 무리·수호자·장 보스를 처음 이김(큰 싸움, `redesign.md` 0장 「고르는 순간」): 그 자리에 빛(그 신의 색 기둥, 작은 지도 표시)이 선다. 밟으면 곧 카드 (6m 안에 깨어 있는 적이 붙어 있지 않으면). 빛은 밟을 때까지 땅에서 기다리고 저장에 남는다
 * - 카드는 장면·느린 동작·다른 고르는 카드 중에는 뜨지 않고 차례를 기다린다. 뜬 동안 게임은 멈춘다
 * 고른 뒤의 일은 한 곳(`pick`)이다: 카드·봇·개발 지름길이 모두 이것을 부른다
 */
export class PowerSystem {
  /** 지금 떠 있는 카드 (봇·점검이 읽는다) */
  current: { source: string; rows: PowerRow[] } | null = null
  /** 차례를 기다리는 출처 (흔적·개발 지름길). 흔적이면 그 흔적의 땅과 자리: 그 곁에서만 뜬다 */
  private readonly queue: { source: string; at?: { region: string; x: number; z: number } }[] = []
  /** 빛의 색 (세울 때 정해 둔다: 프레임마다 내밀기를 다시 셈하지 않게) */
  private readonly colors = new Map<string, string>()
  /** 지금 땅의 빛 (땅이나 빛 목록이 바뀔 때만 다시 짓는다) */
  private spotList: { source: string; x: number; z: number; color: string }[] = []
  private spotKey: { region: string; lights: unknown; count: number } | null = null
  private time = 0
  private readonly group = new THREE.Group()
  private beams: { source: string; mesh: THREE.Mesh; core: THREE.Mesh }[] = []
  /** 빛기둥을 세운 땅과 빛들 (바뀌면 다시 세운다) */
  private built = ''
  private readonly beamGeometry = new THREE.CylinderGeometry(0.3, 0.45, 1, 10, 1, true)

  constructor(
    private readonly ctx: GameContext,
    private readonly relics: { syncPowers(): void },
    private readonly host: PowerHost,
  ) {
    const { bus, mythPowers } = ctx
    ctx.scene.add(this.group)
    bus.on('traceAnswered', ({ god, region, x, z }) => {
      const source = traceSource(god)
      if (mythPowers.canClaim(source)) this.request(source, region !== undefined && x !== undefined && z !== undefined ? { region, x, z } : undefined)
    })
    // 사건이 싸운 땅을 싣는다: 땅을 넘는 그 프레임에 정산돼도 빛은 싸운 땅에 선다
    bus.on('guardianBeaten', ({ god, region, x, z }) => this.light(guardianSource(god), region, x, z))
    // 흔적을 지키는 무리를 처음 이김 (큰 싸움): 마지막 적이 쓰러진 자리에 빛. 출처 `pack:<땅>:<신>`, 그 신의 힘 하나와 만난 신들의 힘을 내민다
    bus.on('packBeaten', ({ god, region, x, z }) => this.light(`pack:${region}:${god}`, region, x, z))
    // 장 보스를 이김 (거인 왕·키마이라·하늘의 왕): 출처 `boss:<땅>`. 무너지는 동안 통로를 넘었으면 그 땅의 보스 자리에
    bus.on('giantKilled', ({ giant }) => {
      const fell = ctx.encounter.fellRegion(giant)
      const here = ctx.map.region
      const region = fell && fell !== here.id ? (REGIONS[fell] ?? here) : here
      if (giant.spec.role !== 'boss' || !region.boss || region.kind === 'endless') return
      const at = region.id === here.id ? { x: giant.x, z: giant.z } : region.boss
      this.light(`boss:${region.id}`, region.id, at.x, at.z)
    })
    // 귀환으로 도는 힘의 칸이 늘었다: 가진 도는 힘으로 빈 칸을 채운다
    bus.on('expeditionReturned', () => mythPowers.fill() && this.relics.syncPowers())
    // 장을 정복해도 칸이 하나 는다 (P6): 같은 길로 채운다
    bus.on('chapterConquered', () => mythPowers.fill() && this.relics.syncPowers())
    // 땅을 옮기거나 쓰러지면 기다리던 흔적의 카드는 거둔다 (그 흔적에 다시 서면 다시 응답한다. 흔적도 이때 기다림을 푼다)
    const dropTraces = () => {
      for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i]!.at) this.queue.splice(i, 1)
    }
    bus.on('regionEntered', dropTraces)
    bus.on('heroDied', dropTraces)
  }

  /** 지금 칸 (봇이 읽는다) */
  get slots(): Readonly<PowerSlots> {
    return this.ctx.mythPowers.slots
  }

  /** 카드가 떠 있나 */
  get open(): boolean {
    return this.host.card.open
  }

  /** 지금 땅에 서 있는 빛 (작은 지도·봇) */
  get spots(): readonly { source: string; x: number; z: number; color: string }[] {
    const here = this.ctx.map.region.id
    const { lights } = this.ctx.mythPowers
    const key = this.spotKey
    if (!key || key.region !== here || key.lights !== lights || key.count !== lights.length) {
      this.spotKey = { region: here, lights, count: lights.length }
      this.spotList = lights.filter((l) => l.region === here).map((l) => ({ source: l.source, x: l.x, z: l.z, color: this.color(l.source) }))
    }
    return this.spotList
  }

  /** 그 출처의 카드를 차례에 세운다 (흔적·개발 지름길). 흔적이면 그 자리(at) 곁에서만 뜬다. 내밀 힘이 없으면 false */
  request(source: string, at?: { region: string; x: number; z: number }): boolean {
    if (!this.ctx.mythPowers.canClaim(source)) return false
    if (this.current?.source !== source && !this.queue.some((q) => q.source === source)) this.queue.push({ source, ...(at ? { at } : {}) })
    return true
  }

  /** 떠 있는 카드에서 그 줄을 고른다 (봇·점검). 카드가 없거나 그 줄이 없으면 false */
  choose(id: PowerId): boolean {
    const now = this.current
    return now !== null && now.rows.some((r) => r.id === id) && this.pick(now.source, id)
  }

  /**
   * 고른 뒤의 일 한 곳: 가진 힘에 더하고(그 출처는 한 번만) 빈 칸이 있으면 끼운다. 새 무기·궁극기면 그 칸을 바로 바꿔 끼운다 (옛 것은 가진 힘으로).
   * 전투에 맞추고(`syncPowers`) 그 힘을 그 자리에서 한 번 터뜨린다. 내밀지 않은 힘·이미 고른 출처면 false
   */
  pick(source: string, id: PowerId): boolean {
    const { mythPowers, bus } = this.ctx
    if (!mythPowers.claim(source, id)) {
      // 카드에서 눌렀는데 받지 못했다 (그사이 출처가 닫힘 등): 떠 있던 것을 비우고 그 출처를 다시 차례에 (그대로 두면 그 판 내내 카드가 안 뜬다)
      if (this.current?.source === source) {
        const at = this.currentAt
        this.current = null
        this.currentAt = undefined
        this.host.card.hide()
        if (mythPowers.canClaim(source)) this.queue.unshift({ source, ...(at ? { at } : {}) })
        else if (at) bus.emit('powerPicked', { source, id: null })
      }
      return false
    }
    const p = power(id)!
    if (p.kind !== 'aura' && mythPowers.slots[p.kind] !== id) mythPowers.slot(id)
    this.relics.syncPowers()
    this.dropLight(source)
    if (this.current?.source === source) {
      this.current = null
      this.currentAt = undefined
      this.host.card.hide()
    }
    this.burst(p)
    bus.emit('powerPicked', { source, id })
    bus.emit('progressChanged', {})
    return true
  }

  /** 프레임마다: 빛기둥, 기다리는 카드, 싸움이 풀린 뒤 밟은 빛 */
  update(dt: number): void {
    this.time += dt
    this.placeBeams()
    const pulse = Math.sin(this.time * 2.6) * 0.08
    for (const b of this.beams) {
      ;(b.mesh.material as THREE.MeshBasicMaterial).opacity = 0.42 + pulse
      ;(b.core.material as THREE.MeshBasicMaterial).opacity = 0.75 + pulse
    }
    if (this.current || this.host.card.open || this.host.blocked()) return
    const next = this.queue.shift()
    if (next) {
      // 흔적의 카드는 그 흔적 곁에서만: 멀어졌으면 거두고 흔적의 기다림을 푼다 (다시 서면 다시 응답한다)
      if (next.at && !this.near(next.at)) return void this.ctx.bus.emit('powerPicked', { source: next.source, id: null })
      return this.show(next.source, next.at)
    }
    const p = this.ctx.hero.object.position
    const light = this.spots.find((l) => Math.hypot(l.x - p.x, l.z - p.z) <= LIGHT_RADIUS)
    if (light && this.calm) this.show(light.source)
  }

  /** 카드를 띄워도 되나: 쓰러지지 않았고, 6m 안에 깨어 있는 적이 없다 (멀리서 맞는 중이어도 뜬다: 카드가 뜬 동안 게임은 멈춘다) */
  get calm(): boolean {
    const { combat, encounter, hero } = this.ctx
    if (!combat.alive) return false
    const p = hero.object.position
    return !encounter.alive.some((g) => g.state !== 'idle' && g.state !== 'return' && Math.hypot(g.x - p.x, g.z - p.z) <= CALM_RADIUS)
  }

  /** 주인공이 그 자리(그 땅) 곁에 있나 */
  private near(at: { region: string; x: number; z: number }): boolean {
    const p = this.ctx.hero.object.position
    return at.region === this.ctx.map.region.id && Math.hypot(p.x - at.x, p.z - at.z) <= TRACE_NEAR
  }

  /** 떠 있는 흔적 카드의 자리 */
  private currentAt: { region: string; x: number; z: number } | undefined

  /** 그 출처의 카드를 띄운다. 내밀 힘이 없으면 빛을 거두고 카드 없이 지나간다 */
  private show(source: string, at?: { region: string; x: number; z: number }): void {
    const { mythPowers, bus } = this.ctx
    const ids = mythPowers.offer(source)
    if (ids.length === 0) {
      this.dropLight(source)
      bus.emit('powerPicked', { source, id: null })
      return
    }
    const rows = ids.map((id) => this.row(id))
    this.current = { source, rows }
    this.currentAt = at
    // 띄울 때 한 번 저장한다: 고르기 전에 닫고 다시 불러와도 같은 셋이 뜬다 (뽑기는 씨앗·출처·가진 힘으로 정해진다)
    this.host.save()
    bus.emit('powerOffered', { source })
    this.host.card.show(this.view(source, rows), (id) => void this.pick(source, id))
  }

  /** 카드의 한 줄: 종류·이름·한 줄 풀이, 바꿔 끼우는 무기·궁극기, 끼우면 켜지는 조합, 칸이 차서 가진 힘으로만 남는가 */
  private row(id: PowerId): PowerRow {
    const { mythPowers } = this.ctx
    const p = power(id)!
    const now = mythPowers.slots
    const after = p.kind === 'aura' ? { ...now, auras: [...now.auras, id] } : { ...now, [p.kind]: id }
    const before = new Set(activeCombos(slotted(now)).map((c) => c.id))
    const spare = p.kind === 'aura' && now.auras.length >= mythPowers.auraSlots
    // 칸이 차서 가진 힘으로 남는 줄에는 켜지지 않을 조합을 붙이지 않는다
    const combo = spare ? undefined : activeCombos(slotted(after)).find((c) => !before.has(c.id))
    // 무기·궁극기는 칸을 바로 바꿔 끼운다: 무엇이 무엇으로 바뀌는지 한 줄
    const held = p.kind === 'aura' ? null : now[p.kind]
    const swap = held && held !== id ? `지금: ${power(held)?.name ?? held} → ${p.name}` : undefined
    return { id, kind: KIND_NAMES[p.kind], god: godDef(p.god).name, name: p.name, line: p.line, color: godDef(p.god).color, ...(swap ? { swap } : {}), ...(combo ? { combo: combo.name } : {}), ...(spare ? { spare: true } : {}) }
  }

  /** 머리줄: 흔적·수호자·무리는 그 신, 장 보스는 「<보스>의 자리」(색은 첫 줄의 신) */
  private view(source: string, rows: readonly PowerRow[]): PowerCardView {
    const at = parseSource(source)!
    const god = sourceGod(source)
    if (god) {
      const def = godDef(god)
      return { title: def.name, say: SAYS[at.kind], color: def.color, icon: classIcon(def.name), rows }
    }
    // 보스 자리에 enemy가 없으면 땅의 기본 보스(거인 왕)다 (`Encounter`·`chapters.ts`와 같은 셈)
    const boss = at.kind === 'boss' ? ENEMIES[REGIONS[at.arg]?.boss?.enemy ?? 'king']?.name : undefined
    return { title: boss ? `${boss}의 자리` : '신들의 빛', say: SAYS[at.kind], color: rows[0]?.color ?? godDef('thor').color, rows }
  }

  /** 빛의 색: 신이 있는 출처(흔적·수호자·그 신의 무리)는 그 신, 그 밖은 내밀 첫 힘의 신. 처음 셈한 것을 둔다 */
  private color(source: string): string {
    let color = this.colors.get(source)
    if (!color) {
      const god = sourceGod(source)
      const first = god ? null : this.ctx.mythPowers.offer(source)[0]
      color = godDef(god ?? (first ? power(first)!.god : 'thor')).color
      this.colors.set(source, color)
    }
    return color
  }

  /** 쓰러진 자리에 빛을 세운다: 내밀 힘이 없는 출처·이미 선 빛이면 세우지 않는다 */
  private light(source: string, region: string, x: number, z: number): void {
    const { mythPowers, bus } = this.ctx
    if (!mythPowers.canClaim(source) || mythPowers.lights.some((l) => l.source === source)) return
    const spot = region === this.ctx.map.region.id ? this.awayFromHero(x, z) : { x, z }
    const at: PowerLight = { source, region, x: spot.x, z: spot.z }
    mythPowers.lights.push(at)
    this.color(source)
    bus.emit('progressChanged', {})
  }

  /** 주인공 발밑에 서지 않게: 2.5m 안이면 주인공 반대쪽으로 3m 밀고, 막혔으면 가까운 갈 수 있는 자리 */
  private awayFromHero(x: number, z: number): { x: number; z: number } {
    const p = this.ctx.hero.object.position
    let dx = x - p.x
    let dz = z - p.z
    const d = Math.hypot(dx, dz)
    if (d > LIGHT_NEAR) return { x, z }
    // 거의 같은 자리면 주인공이 보는 쪽의 반대로 (쿼터뷰에서 화면 아래쪽)
    if (d < 0.05) [dx, dz] = [0, 1]
    const len = Math.hypot(dx, dz)
    const want = { x: x + (dx / len) * LIGHT_PUSH, z: z + (dz / len) * LIGHT_PUSH }
    return this.host.free?.(want) ?? want
  }

  private dropLight(source: string): void {
    const { mythPowers } = this.ctx
    mythPowers.lights = mythPowers.lights.filter((l) => l.source !== source)
  }

  /** 지금 땅의 빛기둥을 빛 목록에 맞춘다 (땅이나 빛이 바뀌었을 때만 다시 세운다) */
  private placeBeams(): void {
    const spots = this.spots
    const key = `${this.ctx.map.region.id}|${spots.map((s) => s.source).join(',')}`
    if (key === this.built) return
    this.built = key
    for (const b of this.beams) {
      this.group.remove(b.mesh, b.core)
      ;(b.mesh.material as THREE.Material).dispose()
      ;(b.core.material as THREE.Material).dispose()
    }
    // 깊이 검사를 끄고 늦게 그린다: 나무·바위·적에 가리지 않고 위로 길게 보인다 (겉은 그 신의 색, 속은 흰빛에 가까운 심)
    const beam = (color: THREE.Color, width: number, opacity: number, order: number) => {
      const mesh = new THREE.Mesh(this.beamGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false }))
      mesh.scale.set(width, BEAM_HEIGHT, width)
      mesh.layers.set(EFFECT_LAYER)
      mesh.renderOrder = order
      this.group.add(mesh)
      return mesh
    }
    this.beams = spots.map((s) => {
      const color = new THREE.Color(s.color)
      const mesh = beam(color, 1.8, 0.42, 30)
      const core = beam(color.clone().lerp(new THREE.Color(1, 1, 1), 0.6), 0.7, 0.75, 31)
      for (const m of [mesh, core]) m.position.set(s.x, heightAt(s.x, s.z) + BEAM_HEIGHT / 2, s.z)
      return { source: s.source, mesh, core }
    })
  }

  /**
   * 고른 힘이 그 자리에서 한 번 터진다 (있는 장치로 가장 가까운 것): 무기는 마지막 타를 한 번 휘두르고, 궁극기는 바로 한 번 나가고,
   * 유물 힘은 그 행동을 한 번, 패시브 힘은 그 신의 색으로 둘레를 한 번 친다
   */
  private burst(p: Power): void {
    const { hero, fx, view, powers, skills, encounter, bus } = this.ctx
    const at = hero.object.position
    const color = godDef(p.god).color
    fx.power.burst(at, color, 3)
    view.shake(0.25)
    const relic = powerRelic(p.id)
    if (p.kind === 'ultimate') {
      const ultimate = powers.ultimate
      // 침묵의 맹세 중·탄 동안은 궁극기를 쓸 수 없다 (평소 시전과 같은 규칙, `Relics.ts`): 그때는 둘레를 한 번 친다
      const barred = this.ctx.build.state.noUltimate || hero.riding
      if (ultimate && !barred && !powers.ultimateActive) {
        ultimate.start(skills)
        bus.emit('ultimateCast', {})
        return
      }
      if (!barred) return
    }
    if (relic) return void powers.effectOf(relic)?.forceFire?.(skills)
    if (p.source.from === 'attack') this.host.swing(p.source.style)
    else fx.puffs.burst(at, 20, 3)
    for (const enemy of encounter.alive) {
      const dx = enemy.x - at.x
      const dz = enemy.z - at.z
      const d = Math.hypot(dx, dz)
      if (d - enemy.radius > BURST_RADIUS) continue
      skills.hit(enemy, BURST_DAMAGE, dx / (d || 1), dz / (d || 1), 10, 'thunder')
    }
  }
}
