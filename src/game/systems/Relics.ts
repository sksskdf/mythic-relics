import * as THREE from 'three'

import { AUTOMATION } from '../../data/cycle'
import { type God, godDef, isRelicId, relicDef, type RelicId } from '../../relics/data'
import { effectScale, isMythRelic, relicMyth, stageName } from '../../gear/mythRelic'
import { GRADE_COLORS } from '../../art/palette'
import { statText } from '../../myth/alwaysText'
import { materialName } from '../../gear/materials'
import { GEAR, type GearItem, gearName, gearScore } from '../../gear/roll'
import { lendText, levelGains } from '../../myth/levelGains'
import { sceneId } from '../../data/scenes'
import { classIcon } from '../../ui/classIcons'
import { josa } from '../../ui/josa'
import { delta, gearIcon } from '../../ui/gearCard'
import type { GameContext } from '../context'
import type { LoadoutChange } from '../RelicPowers'
import { godMoment } from './godMoments'
import { autoFill, breathCount, DEMO_BREATH, fitBreath, inPantheon, MAX_BREATH, oathPantheon, type PartKind, withoutBreath, withPart } from '../../myth/pantheon'

/** 클래스가 발현되는 순간 주변 적을 밀어내는 범위와 피해 */
const MANIFEST_RADIUS = 4
const MANIFEST_DAMAGE = 20
/** 신화를 고를 때 터지는 충격의 대기 시간 (초): 번갈아 골라 공짜 피해를 쌓지 못하게 */
const MANIFEST_BURST_COOLDOWN = 10

/**
 * 유물: 땅의 유물 줍기, 장착·해제와 발현 연출, 유물 효과와 궁극기, 지속 효과 수치 적용.
 */
export class RelicSystem {
  /** 로키의 환영 분신. 거인은 가까이 있으면 주인공 대신 이것을 쫓는다. */
  decoy: { x: number; z: number; radius: number } | null = null
  private readonly lastWalk = new THREE.Vector2()
  /** 가방이 찼다는 알림을 다시 띄울 때까지 (초) */
  private fullWarned = 0
  /** 이번 프레임에 걸은 거리 (고유 효과 「회오리 걸음」이 읽는다) */
  walked = 0
  /** 주운 것 이름을 띄울 자리 (프레임마다 새로 만들지 않게) */
  private readonly labelAt = new THREE.Vector3()
  /** 신화를 고를 때 터지는 충격을 다시 쓸 수 있을 때까지 (초) */
  private burstCooldown = 0
  /** 새 부품의 자리가 차 있을 때 두 갈래 카드를 띄운다 (E302-03, 게임이 정한다). 없으면 그대로 둔다 */
  offerSwap: ((part: 'hand' | 'heart', incoming: God, current: God, choose: (take: boolean) => void) => void) | null = null

  constructor(private readonly ctx: GameContext) {
    ctx.bus.on('targetKilled', ({ target }) => {
      ctx.powers.onKill(target, ctx.skills)
      for (const passives of ctx.powers.allPassives) passives.onKill(target, ctx.skills)
    })
    ctx.bus.on('heroRevived', () => {
      this.decoy = null
    })
    // 조각 2 (E302): 그 신의 손 부품. 손이 비었으면(낡은 검) 저절로 쥔다: 동작이 바뀌는 순간
    // 조각 3 (수호자): 그 신의 심장 부품. 심장이 차 있으면 두 갈래 카드
    ctx.bus.on('fragment', ({ god, piece }) => {
      if (piece === 2) this.offer(god, 'hand')
      if (piece === 3) this.offer(god, 'heart')
    })
    // 장 정복 (E305-02): 숨 칸이 늘면 아직 숨에 없는 깨어난 신 하나를 빈 칸에 넣는다 (카드는 장 보스 장면 뒤에 함께)
    ctx.bus.on('chapterConquered', () => this.fillBreath())
    // 처음 깨어난 신: 손·심장·숨을 모두 그 신으로 (E12-04 → E302). 있으면 빈 자리에 저절로 넣는다
    ctx.bus.on('mythOpened', ({ god, quiet }) => {
      // 심장이 비었으면 첫 신이다 (손은 조각 2에 이미 쥐었을 수 있다): 세 자리에 몰고 깨어나는 장면
      if (!ctx.progress.pantheon.heart) this.choose(god, true)
      // 한꺼번에 열린 것(장 보스)은 신화권 카드가 함께 알린다
      // 장 보스·개발 지름길로 한꺼번에 열린 신은 카드 없이 빈 자리에만 (두 갈래는 조각으로 깨울 때만)
      else if (this.fill(god, ['heart', 'breath']).length && !quiet) {
        const def = godDef(god)
        ctx.bus.emit('moment', {
          id: 'mythLent',
          card: { kind: '빌린 힘', title: def.name, color: def.color, icon: classIcon(def.name), lines: [lendText(god, ctx.progress.level(god)), `${josa(relicDef(def.relic).name, '이')} 깨어난다`] },
        })
      }
    })
  }

  /**
   * 한 신에 몰아 고른다 (E12-04 → E302): 손·심장·숨 첫 칸을 모두 그 신으로. 앞의 숨 칸 신들은 뒤로 물러난다.
   * 첫 신이 깨어날 때와 개발 지름길이 쓴다. 열린 신만 고를 수 있다
   */
  choose(god: God, announce: boolean): boolean {
    const { progress } = this.ctx
    if (!progress.isOpen(god)) return false
    const p = progress.pantheon
    // 이미 손에 쥔 신이면(조각 2) 손이 바뀌지 않아도 깨어나는 순간을 알린다
    const held = p.hand === god
    const breath = [god, ...p.breath.filter((g) => g !== god)].slice(0, Math.max(1, this.slots))
    this.apply({ hand: god, heart: god, breath }, announce)
    if (announce && held) this.announce(god)
    return true
  }

  /** 숨 칸 수 (E302): 깨어난 신 수, 정복한 장(E305-02), 지킨 홀로의 맹세(E305-01)로 정한다. 끝은 데모 4, 엔딩 뒤 5 */
  get slots(): number {
    const { progress, chapters, oaths, ending } = this.ctx
    return breathCount(progress.opened.length, chapters.conquered, oaths.breath, ending.reached ? MAX_BREATH : DEMO_BREATH)
  }

  /** 그 자리에 그 신을 낀다 (정보 화면 신 탭, 어디서나). 숨은 빈 칸이 있어야 한다 */
  place(part: PartKind, god: God): boolean {
    const { progress } = this.ctx
    if (!progress.isOpen(god)) return false
    const next = withPart(progress.pantheon, part, god, this.slots)
    if (next === progress.pantheon || (part !== 'breath' && progress.pantheon[part] === god)) return false
    this.apply(next, false)
    if (part === 'breath') this.ctx.bus.emit('mythLent', { god })
    return true
  }

  /** 숨 칸에서 뺀다 */
  unplace(god: God): boolean {
    const { progress } = this.ctx
    const next = withoutBreath(progress.pantheon, god)
    if (next === progress.pantheon) return false
    this.apply(next, false)
    return true
  }

  /** 숨 칸이 늘었다 (장 정복·홀로의 맹세): 아직 숨에 없는 깨어난 신 하나를 빈 칸에 넣는다 */
  fillBreath(): void {
    const p = this.ctx.progress.pantheon
    const god = this.ctx.progress.opened.find((g) => !p.breath.includes(g))
    if (god) this.fill(god, ['breath'])
  }

  /** 새로 얻은 부품을 빈 자리에 저절로 넣는다 (E302-03). 들어간 자리를 돌려준다 */
  fill(god: God, parts: readonly PartKind[]): PartKind[] {
    const { next, placed } = autoFill(this.ctx.progress.pantheon, god, parts, this.slots)
    if (placed.length) this.apply(next, false)
    return placed
  }

  /**
   * 새 신의 손·심장 부품이 왔다 (E302-03): 비었으면 저절로 넣고, 차 있으면 두 갈래 카드. 저절로 넣었으면 1
   */
  private offer(god: God, part: 'hand' | 'heart'): number {
    const current = this.ctx.progress.pantheon[part]
    if (current === god) return 0
    if (!current) return this.fill(god, [part]).length
    this.offerSwap?.(part, god, current, (take) => {
      if (take) this.apply(withPart(this.ctx.progress.pantheon, part, god, this.slots), false)
    })
    return 0
  }

  /** 자리를 바꿔 낀다: 기록·힘·연출을 함께 맞춘다 */
  private apply(next: typeof this.ctx.progress.pantheon, announce: boolean): void {
    const { progress, powers, bus } = this.ctx
    progress.pantheon = fitBreath(next, Math.max(1, this.slots))
    const change = powers.setPantheon(this.running(progress.pantheon))
    bus.emit('progressChanged', {})
    this.changed(change, announce)
  }

  /** 불러온 자리 셋을 연출 없이 낀다 (열린 신만) */
  restore(p: typeof this.ctx.progress.pantheon, anyBreath = false): void {
    const { progress, awaken } = this.ctx
    const open = (g: God | null) => (g && progress.isOpen(g) ? g : null)
    // 손은 조각 2를 모은 깨우는 신도 쥘 수 있다
    const hand = p.hand && awaken.waking === p.hand && awaken.fragments >= 2 ? p.hand : open(p.hand)
    const next = { hand, heart: open(p.heart), breath: p.breath.filter((g) => progress.isOpen(g)) }
    // 개발 지름길은 숨 칸 수를 장 진행에 맞추지 않는다
    if (anyBreath) {
      progress.pantheon = next
      this.changed(this.ctx.powers.setPantheon(this.running(next)), false)
      this.ctx.bus.emit('progressChanged', {})
    } else this.apply(next, false)
  }

  /** 도는 자리: 맹세를 건 동안 빈 손이면 손을 비우고, 홀로면 숨을 하나만 (저장되는 자리는 그대로) */
  private running(p: typeof this.ctx.progress.pantheon): typeof this.ctx.progress.pantheon {
    return oathPantheon(p, this.ctx.build.rules)
  }

  /** 맹세를 걸거나 풀었다 (E305-01): 저장된 자리 그대로 도는 자리만 다시 맞춘다 */
  reapply(): void {
    const { powers, progress, bus } = this.ctx
    this.changed(powers.setPantheon(this.running(progress.pantheon)), false)
    bus.emit('progressChanged', {})
  }

  /** 그 신이 자리에 들었나 */
  has(god: God): boolean {
    return inPantheon(this.ctx.progress.pantheon, god)
  }

  /**
   * 유물을 손에 넣었다 (엔딩 뒤에만): 그 신의 신화가 아직 닫혀 있으면 1단계로 연다 (E12-04). 히든 신화도 그 유물이 열쇠다.
   * 데모에서는 신을 깨워야(흔적·사냥·수호자) 열린다 (E238, E305-03: 그리스도 제우스를 깨운다). 점검용 실행은 Game이 따로 연다
   */
  private unlock(id: RelicId, announce: boolean): void {
    const { progress, bus, ending } = this.ctx
    const myth = relicMyth(id)
    if (!myth || !ending.reached) return
    for (const god of [myth]) {
      if (!progress.open(god)) continue
      bus.emit('progressChanged', {})
      if (announce) bus.emit('mythOpened', { god })
      else if (!progress.pantheon.hand) this.choose(god, false)
    }
  }

  /**
   * 대장간 (E13-05): 그 신화의 유물을 만들거나 다음 단계로 올린다. 처음 만들면 그 신화가 열린다.
   * 마을에서만 하는 규칙은 부르는 쪽(정보 화면)이 지킨다.
   */
  forge(god: God): boolean {
    const { powers, view, bus } = this.ctx
    const made = powers.forge(god)
    if (!made) return false
    const def = godDef(god)
    const name = stageName(made.relic, made.stage)
    // 새 단계의 효과 배율과 한 신에 몰았을 때 (E21-04 → E303-04: 유물은 유물표에, 기본 수치 없음)
    const lines = [
      made.stage === 1 ? '대장간에서 처음 벼렸다 · 유물표에 켜짐' : `${made.stage}단계`,
      `유물 효과 피해 ×${effectScale(made.relic, made.stage, null)} (${josa(def.name, '으로')} 몰면 ×${effectScale(made.relic, made.stage, god)})`,
    ]
    // 큰 카드 (E23-03): 그 신의 색으로 번쩍임·하늘 기둥·북소리. 벼려서 다음 장이 열리면 그 장면은 이 카드 뒤에 온다
    bus.emit('moment', { id: 'forged', card: { kind: '대장간', title: name, color: def.color, icon: classIcon(def.name), lines } })
    bus.emit('forged', { relic: made.relic, stage: made.stage })
    if (made.stage === 1) this.unlock(made.relic, true)
    this.changed(made.change, true, made.relic)
    view.shake(0.2 + made.stage * 0.08)
    bus.emit('progressChanged', {})
    return true
  }

  /** 가방의 셋을 합친다 (E303, 어디서나): 한 등급 위 하나가 가방에, 카드로 알린다 */
  merge(uids: readonly string[]): GearItem | null {
    const { powers, bus } = this.ctx
    const out = powers.loadout.merge(uids, Math.random)
    if (!out) return null
    bus.emit('gearMerged', { item: out })
    const grade = GEAR.grades[out.grade].name
    const lines = [`셋 → ${grade}`, ...(out.unique ? [`고유 효과: ${GEAR.uniques[out.unique]!.name}`] : []), ...(out.unique2 ? [`고유 효과: ${GEAR.uniques[out.unique2]!.name}`] : [])]
    bus.emit('moment', { id: out.grade === 'hero' || out.grade === 'legend' ? 'mergedHigh' : 'merged', card: { kind: '합치기', title: gearName(out), color: GRADE_COLORS[out.grade], icon: gearIcon(out), lines } })
    bus.emit('progressChanged', {})
    return out
  }

  /** 일반 장비를 녹여 원형으로 (E303-04: 장비 탭의 「녹이기」·자동 녹이기) */
  melt(id: string): boolean {
    const { powers, bus } = this.ctx
    const item = powers.loadout.gear.get(id)
    const done = powers.melt(id)
    if (!done || !item) return false
    if (done.slot >= 0) this.changed(done.change, false)
    bus.emit('moment', { id: 'salvaged', text: `녹임 · ${materialName(done.material)} ×${done.count}` })
    bus.emit('progressChanged', {})
    return true
  }

  /**
   * 땅에서 주웠다 (E13-02): 일반 장비는 그 부위의 빈 칸이나 가방으로, 신화의 유물은 유물표에 켜며 신화를 연다,
   * 재료가 된 유물(E13-03)은 재료 주머니로.
   */
  take(id: string, gear?: GearItem): void {
    const { powers, bus } = this.ctx
    // 주운 것의 이름이 머리 위로 떠오른다 (사용자 의견 2026-10-28: 얻는 표현이 모자라다)
    const label = (text: string, color: string) => this.ctx.numbers.label(this.labelAt.copy(this.ctx.hero.object.position).setY(this.ctx.hero.object.position.y + 2.2), text, color)
    if (gear) {
      label(gearName(gear), GRADE_COLORS[gear.grade])
      // 같은 부위에 지금 낀 장비 (가방으로 가면 견준다)
      const wornId = powers.loadout.slots.find((s) => s && powers.loadout.gear.has(s) && powers.loadout.partOf(s) === gear.part)
      const worn = wornId ? powers.loadout.gear.get(wornId) : undefined
      powers.loadout.addGear(gear)
      bus.emit('gearPicked', { item: gear })
      this.equip(id, true)
      // 빈 칸에 끼었으면 카드, 가방으로 갔는데 지금 낀 것보다 좋으면 견준 카드, 아니면 작은 알림 (E23-01)
      const card = { title: gearName(gear), color: GRADE_COLORS[gear.grade], icon: gearIcon(gear) }
      if (powers.loadout.slots.includes(id)) {
        bus.emit('moment', { id: 'gearWorn', card: { kind: '장비', ...card, lines: gear.stats.map((st) => statText(st.kind, st.value)) } })
      } else if (worn && gearScore(gear) > gearScore(worn)) {
        const lines = gear.stats.map((st) => {
          const same = worn.stats.find((w) => w.kind === st.kind)
          const d = same ? delta(st.kind, st.value, same.value) : { text: '새 수치' }
          return d ? `${statText(st.kind, st.value)} ${d.text}` : statText(st.kind, st.value)
        })
        bus.emit('moment', { id: 'gearBetter', card: { kind: '더 좋은 장비 · 가방', ...card, lines } })
        bus.emit('gearBetter', { item: gear })
      } else bus.emit('moment', { id: 'gearPicked', text: `${gearName(gear)} · 가방` })
    } else if (!isMythRelic(id)) {
      label(relicDef(id).name, godDef(relicDef(id).god).color)
      powers.loadout.addMaterial(id)
      bus.emit('moment', { id: 'materialPicked', text: `${relicDef(id).name} · 재료` })
      bus.emit('relicPicked', { id })
    } else {
      label(relicDef(id).name, godDef(relicDef(id).god).color)
      bus.emit('moment', { id: 'gearPicked', text: `${relicDef(id).name} · 유물표` })
      bus.emit('relicPicked', { id })
      this.equip(id, true)
    }
    bus.emit('progressChanged', {})
  }

  update(dt: number): void {
    this.burstCooldown = Math.max(0, this.burstCooldown - dt)
    this.fullWarned = Math.max(0, this.fullWarned - dt)
    const { hero, combat, powers, pickups, encounter, skills, feel } = this.ctx
    const position = hero.object.position
    skills.enemies = encounter.alive
    skills.manifested = this.ctx.build.chosen
    skills.level = this.ctx.build.level
    // 숨 (E302): 숨 칸의 신마다 그 신의 패시브를 그 신 단계로 돌린다 (깨우는 신의 숨도)
    powers.setLent(this.ctx.build.passives())
    this.updateGlow()

    // 걸은 거리 (이동 연동 효과). 순간이동처럼 한 번에 크게 옮긴 것은 빼고, 밀려난 것은 걸음으로 치지 않는다.
    const step = Math.hypot(position.x - this.lastWalk.x, position.z - this.lastWalk.y)
    if (hero.isMoving && step < 1) powers.onWalk(step, skills)
    this.walked = hero.isMoving && step < 1 ? step : 0
    this.lastWalk.set(position.x, position.z)

    if (combat.alive) {
      // 자동 줍기 (E305-03, 엔딩 뒤 자동화): 둘레 장비는 걸어가지 않아도, 재료 유물은 어디서나
      const auto = this.ctx.automation.now.autoPickup
      const picked = pickups.update(
        dt,
        position.x,
        position.z,
        // 가방이 차면(E303) 새 장비는 땅에 남는다: 합쳐서 자리를 비우거나 두고 간다
        (id, gear) => {
          if (powers.loadout.has(id)) return false
          if (!gear || powers.loadout.canTake(gear.part)) return true
          if (this.fullWarned <= 0) {
            this.ctx.bus.emit('moment', { id: 'bagFull', text: '가방이 찼다 · 셋을 합치면 자리가 난다' })
            this.fullWarned = 8
          }
          return false
        },
        (id, gear) => (!auto ? 0 : gear ? AUTOMATION.pickup.radius : !isMythRelic(id) ? Infinity : 0),
      )
      for (const { id, gear } of picked) this.take(id, gear)
      powers.update(dt, skills)
    } else {
      pickups.update(dt, position.x, position.z, () => false)
      // 쓰러져 있는 동안에도 날아가던 망치·고리 같은 연출은 마저 움직인다. 적을 비워 새로 맞히지는 않는다
      skills.enemies = []
      powers.update(dt, skills)
    }

    // 궁극기: 발현 상태에서 신위 게이지가 가득 차고, 쓸 만한 때가 오면 저절로 나간다.
    const boss = encounter.boss
    const bossNear = !!boss && boss.alive && Math.hypot(boss.x - position.x, boss.z - position.z) < 10
    const ultimate = powers.ultimate
    if (combat.alive && ultimate && combat.divine >= 1 && !powers.ultimateActive && !this.ctx.build.state.noUltimate && ultimate.worthUsing(skills, bossNear)) {
      combat.divine = 0
      ultimate.start(skills)
      this.ctx.bus.emit('ultimateCast', {})
      feel.stop(0.12)
    }

    // 유물 지속 효과
    const build = this.ctx.build.state
    combat.knockbackScale = build.modifiers.knockbackDealt
    combat.knockbackTakenScale = build.modifiers.knockbackTaken
    // 고유 효과 (E303): 바위 껍질이 켜진 동안 받는 피해가 줄고, 순례자는 지역을 옮긴 뒤 빨라진다
    combat.damageTakenScale = build.damageTaken * this.ctx.uniques.takenScale
    combat.attackSpeed = build.attackSpeed
    combat.setStyle(build.attack)
    hero.speedScale = build.moveSpeed * this.ctx.uniques.moveScale
    // 상시 효과 수치 (E12-03)
    const stats = build.stats
    // 시련 「마른 샘」(E16): 생명이 차오르지 않는다
    combat.healScale = build.noHeal ? 0 : 1 + stats.healingTaken
    combat.bonusRegen = build.noHeal ? 0 : stats.regen
    // 장비·별·수련(불굴)을 겹쳐도 피해를 아예 안 받게 되지는 않게 (받는 피해와 같은 하한)
    combat.lowHpTakenScale = Math.max(0.1, 1 + stats.lowHpGuard)
    combat.divineScale = 1 + stats.ultCharge
    skills.area = 1 + stats.areaSize
    const awakening = this.ctx.powers.awakening
    awakening.levels = build.awakening
    awakening.maxHp = build.maxHp
  }

  /** 장비를 끼우거나 유물을 유물표에 켠다. announce가 false면 발현 연출 없이 (불러오기·점검용) */
  equip(id: RelicId, announce: boolean): void {
    this.changed(this.ctx.powers.equip(id), announce, id)
    this.unlock(id, announce)
  }

  /** 발밑 빛: 가장 많이 낀 신의 색. 유물 하나에 1단계, 발현하면 3 + 레벨 */
  updateGlow(): void {
    const { powers, progress, fx } = this.ctx
    const counts = new Map<string, number>()
    for (const id of powers.loadout.relics) if (id) counts.set(relicDef(id).god, (counts.get(relicDef(id).god) ?? 0) + 1)
    const manifested = this.ctx.build.chosen
    if (manifested) {
      fx.power.setGlow(godDef(manifested).color, 2 + progress.level(manifested))
      fx.power.setAscension(godDef(manifested).color, progress.level(manifested))
      return
    }
    fx.power.setAscension(null, 0)
    let best: string | null = null
    for (const [god, n] of counts) if (!best || n > counts.get(best)!) best = god
    fx.power.setGlow(best ? godDef(best as never).color : null, best ? counts.get(best)! : 0)
  }

  /** 칸의 장비 하나를 뺀다. drop이면 발밑에 내려놓고, 아니면 없앤다(개발 패널). */
  unequip(slot: number, drop: boolean): void {
    const result = this.ctx.powers.unequip(slot)
    if (!result) return
    this.ctx.bus.emit('progressChanged', {})
    if (drop) {
      const p = this.ctx.hero.object.position
      this.ctx.pickups.drop(result.id, p.x, p.z, false, this.ctx.powers.loadout.gear.get(result.id))
    }
    this.changed(result.change, drop)
  }

  /** 유물표에서 끈다 (개발 패널) */
  unlight(id: RelicId): void {
    const change = this.ctx.powers.unlight(id)
    if (!change) return
    this.ctx.bus.emit('progressChanged', {})
    this.changed(change, false)
  }

  /** 장비 화면: 칸의 장비를 가방에 넣는다. */
  stow(slot: number): void {
    const change = this.ctx.powers.stow(slot)
    if (!change) return
    this.ctx.bus.emit('progressChanged', {})
    this.changed(change, true)
  }

  /** 장비 화면: 가방의 장비를 칸에 끼운다. */
  wield(id: string, slot: number): void {
    const change = this.ctx.powers.wield(id, slot)
    if (!change) return
    this.ctx.bus.emit('progressChanged', {})
    this.changed(change, true, id)
  }

  /** 발현이 새로 일어나거나 풀렸을 때의 연출 */
  private changed(change: LoadoutChange | null, announce: boolean, worn?: RelicId): void {
    if (!change) return
    const { before, after } = change
    const { bus, hero, fx, view } = this.ctx
    bus.emit('loadoutChanged', { change, announce })
    // 유물을 낄 때마다: 그 신의 색 빛기둥. 같은 신 유물이 많을수록 크다.
    if (announce && worn && isRelicId(worn)) {
      const god = relicDef(worn).god
      const count = this.ctx.powers.loadout.relics.filter((id) => id && relicDef(id).god === god).length
      fx.power.burst(hero.object.position, godDef(god).color, count)
      view.shake(0.12 + count * 0.06)
    }
    if (before.manifested !== after.manifested && !after.manifested) this.decoy = null
    if (!after.manifested || before.manifested === after.manifested) return
    if (!announce) return
    this.announce(after.manifested)
  }

  /** 신이 손에 들어 깨어나는 순간: 장면이나 카드, 번쩍임, 주변 적 밀어내기 */
  private announce(id: God): void {
    const { bus, hud, progress, hero, fx, view, feel, encounter, skills } = this.ctx
    bus.emit('manifested', { god: id })
    const god = godDef(id)
    // 처음 고른 신화는 장면(E23-02): 그 신의 색으로 번쩍·하늘 기둥, 그 신의 장면 뒤에 큰 카드. 바꿔 고르면 카드
    const first = progress.opened.length === 1
    if (first) {
      hud.flash(god.color)
      fx.power.column(hero.object.position, god.color)
    } else fx.power.burst(hero.object.position, god.color, 4)
    // 신마다 다른 발현 순간: 번개 기둥, 흩어지는 그림자, 여섯 칼날
    godMoment(this.ctx, god.id, 1)
    // 발현하면 무엇이 생기는지: 그 신의 힘과 지금 레벨까지 열린 것
    const lines: string[] = []
    for (let lv = 1; lv <= progress.level(god.id); lv++) {
      for (const g of levelGains(god.id, lv)) if (lv === 1 || g.kind === 'power') lines.push(g.text)
    }
    lines.push(`궁극기 「${god.ultimate.name}」`)
    const card = { kind: '한 신에 몰기', title: progress.title(god.id), color: god.color, icon: classIcon(god.name), lines }
    bus.emit('moment', first ? { id: 'mythChosen', scene: sceneId('myth', god.id), card } : { id: 'mythSwitched', card })
    // 주변 적을 밀어낸다 (피해는 대기 시간마다 한 번, 멈춘 화면에서 번갈아 골라도 한 번)
    const p = hero.object.position
    fx.puffs.burst(p, 30, 4)
    view.shake(0.5)
    feel.stop(0.15)
    if (this.burstCooldown > 0) return
    this.burstCooldown = MANIFEST_BURST_COOLDOWN
    for (const enemy of encounter.alive) {
      const dx = enemy.x - p.x
      const dz = enemy.z - p.z
      const dist = Math.hypot(dx, dz)
      if (dist - enemy.radius > MANIFEST_RADIUS) continue
      skills.hit(enemy, MANIFEST_DAMAGE, dx / (dist || 1), dz / (dist || 1), 12, 'thunder')
    }
  }
}
