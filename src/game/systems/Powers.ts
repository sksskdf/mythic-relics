import * as THREE from 'three'

import type { AttackStyle } from '../../combat/styles'
import { activeCombos, guardianSource, parseSource, power, type Power, type PowerId, type PowerSlots, powerRelic, slotted, traceSource } from '../../data/powers'
import { REGIONS } from '../../data/regions'
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
}

/** 빛을 밟는 거리 (m) */
const LIGHT_RADIUS = 1.6
/** 싸움이 풀렸다고 보는 때: 맞은 지 이 초가 지났고, 이 거리(m) 안에 깨어 있는 적이 없다 */
const CALM_SECONDS = 2
const CALM_RADIUS = 12
/** 고른 힘이 그 자리에서 한 번 터질 때 닿는 거리(m)와 피해 */
const BURST_RADIUS = 4
const BURST_DAMAGE = 20
/** 빛기둥의 높이 (m) */
const BEAM_HEIGHT = 11

/** 종류 표시 */
const KIND_NAMES: Readonly<Record<Power['kind'], string>> = { weapon: '무기', ultimate: '궁극기', aura: '힘' }

/** 출처마다 머리줄의 한마디 */
const SAYS = { trace: '내 힘 가운데 하나를 가져가라', guardian: '내 수호자를 넘었구나. 하나를 더 가져가라', boss: '큰 싸움을 이겼다. 신들이 힘을 내민다', pack: '이긴 자에게 신들이 힘을 내민다' } as const

/**
 * 힘을 고르는 카드와 빛 (재미 재설계 P5, `docs/knowledge/review-e307/redesign.md` 1장 2·6):
 * - 흔적: 고리에 서서 응답하면(`traceAnswered`) 그 신이 힘 셋을 내민다. 고르면 그 힘이 한 번 터지고, 그 뒤 지키는 무리가 깨어난다 (`WakeSystem`이 `powerPicked`를 듣는다)
 * - 흔적의 무리·수호자·장 보스를 처음 이김(큰 싸움, `redesign.md` 0장 「고르는 순간」): 그 자리에 빛(그 신의 색 기둥, 작은 지도 표시)이 선다. 싸움이 풀린 뒤 밟으면 카드. 빛은 밟을 때까지 땅에서 기다리고 저장에 남는다
 * - 카드는 장면·느린 동작·다른 고르는 카드 중에는 뜨지 않고 차례를 기다린다. 뜬 동안 게임은 멈춘다
 * 고른 뒤의 일은 한 곳(`pick`)이다: 카드·봇·개발 지름길이 모두 이것을 부른다
 */
export class PowerSystem {
  /** 지금 떠 있는 카드 (봇·점검이 읽는다) */
  current: { source: string; rows: PowerRow[] } | null = null
  /** 차례를 기다리는 출처 (흔적·개발 지름길) */
  private readonly queue: string[] = []
  private sinceHurt = CALM_SECONDS
  private time = 0
  private readonly group = new THREE.Group()
  private beams: { source: string; mesh: THREE.Mesh }[] = []
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
    bus.on('traceAnswered', ({ god }) => {
      const source = traceSource(god)
      if (mythPowers.canClaim(source)) this.request(source)
    })
    bus.on('guardianBeaten', ({ god, x, z }) => this.light(guardianSource(god), ctx.map.region.id, x, z))
    // 흔적을 지키는 무리를 처음 이김 (조각 2, 큰 싸움): 그 자리(주인공 발밑)에 빛. 출처 `pack:<땅>:<신>`, 만난 신들의 힘을 섞어 내민다
    bus.on('fragment', ({ god, piece }) => {
      if (piece !== 2) return
      const p = ctx.hero.object.position
      this.light(`pack:${ctx.map.region.id}:${god}`, ctx.map.region.id, p.x, p.z)
    })
    // 장 보스를 이김 (거인 왕·키마이라·하늘의 왕): 출처 `boss:<땅>`. 무너지는 동안 통로를 넘었으면 그 땅의 보스 자리에
    bus.on('giantKilled', ({ giant }) => {
      const fell = ctx.encounter.fellRegion(giant)
      const here = ctx.map.region
      const region = fell && fell !== here.id ? (REGIONS[fell] ?? here) : here
      if (giant.spec.role !== 'boss' || !region.boss || region.kind === 'endless') return
      const at = region.id === here.id ? { x: giant.x, z: giant.z } : region.boss
      this.light(`boss:${region.id}`, region.id, at.x, at.z)
    })
    bus.on('heroHurt', () => (this.sinceHurt = 0))
    // 귀환으로 도는 힘의 칸이 늘었다: 가진 도는 힘으로 빈 칸을 채운다
    bus.on('expeditionReturned', () => mythPowers.fill() && this.relics.syncPowers())
    // 땅을 옮기면 기다리던 흔적의 카드는 거둔다 (그 흔적에 다시 서면 다시 응답한다)
    bus.on('regionEntered', () => {
      for (let i = this.queue.length - 1; i >= 0; i--) if (parseSource(this.queue[i]!)?.kind === 'trace') this.queue.splice(i, 1)
    })
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
    return this.ctx.mythPowers.lights.filter((l) => l.region === here).map((l) => ({ source: l.source, x: l.x, z: l.z, color: this.color(l.source) }))
  }

  /** 그 출처의 카드를 차례에 세운다 (흔적·개발 지름길). 내밀 힘이 없으면 false */
  request(source: string): boolean {
    if (!this.ctx.mythPowers.canClaim(source)) return false
    if (this.current?.source !== source && !this.queue.includes(source)) this.queue.push(source)
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
    if (!mythPowers.claim(source, id)) return false
    const p = power(id)!
    if (p.kind !== 'aura' && mythPowers.slots[p.kind] !== id) mythPowers.slot(id)
    this.relics.syncPowers()
    this.dropLight(source)
    if (this.current?.source === source) {
      this.current = null
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
    this.sinceHurt += dt
    this.placeBeams()
    const pulse = 0.3 + Math.sin(this.time * 2.6) * 0.08
    for (const b of this.beams) (b.mesh.material as THREE.MeshBasicMaterial).opacity = pulse
    if (this.current || this.host.card.open || this.host.blocked()) return
    const next = this.queue.shift()
    if (next) return this.show(next)
    const p = this.ctx.hero.object.position
    const light = this.spots.find((l) => Math.hypot(l.x - p.x, l.z - p.z) <= LIGHT_RADIUS)
    if (light && this.calm) this.show(light.source)
  }

  /** 싸움이 풀렸나: 쓰러지지 않았고, 싸우지 않고, 맞은 지 2초가 지났고, 둘레에 깨어 있는 적이 없다 */
  get calm(): boolean {
    const { combat, encounter, hero } = this.ctx
    if (!combat.alive || combat.engaged || this.sinceHurt < CALM_SECONDS) return false
    const p = hero.object.position
    return !encounter.alive.some((g) => g.state !== 'idle' && g.state !== 'return' && Math.hypot(g.x - p.x, g.z - p.z) <= CALM_RADIUS)
  }

  /** 그 출처의 카드를 띄운다. 내밀 힘이 없으면 빛을 거두고 카드 없이 지나간다 */
  private show(source: string): void {
    const { mythPowers, bus } = this.ctx
    const ids = mythPowers.offer(source)
    if (ids.length === 0) {
      this.dropLight(source)
      bus.emit('powerPicked', { source, id: null })
      return
    }
    const rows = ids.map((id) => this.row(id))
    this.current = { source, rows }
    // 띄울 때 한 번 저장한다: 고르기 전에 닫고 다시 불러와도 같은 셋이 뜬다 (뽑기는 씨앗·출처·가진 힘으로 정해진다)
    this.host.save()
    bus.emit('powerOffered', { source })
    this.host.card.show(this.view(source, rows), (id) => void this.pick(source, id))
  }

  /** 카드의 한 줄: 종류·이름·한 줄 풀이, 끼우면 켜지는 조합, 칸이 차서 가진 힘으로만 남는가 */
  private row(id: PowerId): PowerRow {
    const { mythPowers } = this.ctx
    const p = power(id)!
    const now = mythPowers.slots
    const after = p.kind === 'aura' ? { ...now, auras: [...now.auras, id] } : { ...now, [p.kind]: id }
    const before = new Set(activeCombos(slotted(now)).map((c) => c.id))
    const combo = activeCombos(slotted(after)).find((c) => !before.has(c.id))
    const spare = p.kind === 'aura' && now.auras.length >= mythPowers.auraSlots
    return { id, kind: KIND_NAMES[p.kind], name: p.name, line: p.line, color: godDef(p.god).color, ...(combo ? { combo: combo.name } : {}), ...(spare ? { spare: true } : {}) }
  }

  /** 머리줄: 흔적·수호자는 그 신, 장 보스·무리는 「신들의 빛」(색은 첫 줄의 신) */
  private view(source: string, rows: readonly PowerRow[]): PowerCardView {
    const at = parseSource(source)!
    if (at.kind === 'trace' || at.kind === 'guardian') {
      const def = godDef(at.arg)
      return { title: def.name, say: SAYS[at.kind], color: def.color, icon: classIcon(def.name), rows }
    }
    const boss = at.kind === 'boss' ? ENEMIES[REGIONS[at.arg]?.boss?.enemy ?? '']?.name : undefined
    return { title: boss ? `${boss}의 자리` : '신들의 빛', say: SAYS[at.kind], color: rows[0]?.color ?? godDef('thor').color, rows }
  }

  /** 빛의 색: 수호자는 그 신, 그 밖은 내밀 첫 힘의 신 */
  private color(source: string): string {
    const at = parseSource(source)
    if (at?.kind === 'guardian' || at?.kind === 'trace') return godDef(at.arg).color
    const first = this.ctx.mythPowers.offer(source)[0]
    return godDef(first ? power(first)!.god : 'thor').color
  }

  /** 쓰러진 자리에 빛을 세운다: 내밀 힘이 없는 출처·이미 선 빛이면 세우지 않는다 */
  private light(source: string, region: string, x: number, z: number): void {
    const { mythPowers, bus } = this.ctx
    if (!mythPowers.canClaim(source) || mythPowers.lights.some((l) => l.source === source)) return
    const at: PowerLight = { source, region, x, z }
    mythPowers.lights.push(at)
    bus.emit('progressChanged', {})
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
      this.group.remove(b.mesh)
      ;(b.mesh.material as THREE.Material).dispose()
    }
    this.beams = spots.map((s) => {
      const mesh = new THREE.Mesh(this.beamGeometry, new THREE.MeshBasicMaterial({ color: new THREE.Color(s.color), transparent: true, opacity: 0.3, depthWrite: false }))
      mesh.scale.set(1.6, BEAM_HEIGHT, 1.6)
      mesh.position.set(s.x, heightAt(s.x, s.z) + BEAM_HEIGHT / 2, s.z)
      mesh.layers.set(EFFECT_LAYER)
      mesh.renderOrder = 12
      this.group.add(mesh)
      return { source: s.source, mesh }
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
      if (ultimate && !powers.ultimateActive) {
        ultimate.start(skills)
        bus.emit('ultimateCast', {})
      }
      return
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
