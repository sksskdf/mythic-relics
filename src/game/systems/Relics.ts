import { josa } from '../../ui/josa'
import * as THREE from 'three'

import { AUTOMATION } from '../../data/cycle'
import { WAKE_WON } from '../../progress/Wake'
import { type God, godDef, isRelicId, relicDef, type RelicId } from '../../relics/data'
import { effectScale, isMythRelic, relicMyth, stageName } from '../../gear/mythRelic'
import { GRADE_COLORS } from '../../art/palette'
import { statText } from '../../myth/alwaysText'
import { materialName } from '../../gear/materials'
import { GEAR, type GearItem, gearName, gearScore } from '../../gear/roll'
import { levelGains } from '../../myth/levelGains'
import { sceneId } from '../../data/scenes'
import { classIcon } from '../../ui/classIcons'
import { betterLines, gearIcon } from '../../ui/gearCard'
import type { GameContext } from '../context'
import type { LoadoutChange } from '../RelicPowers'
import { godMoment } from './godMoments'
import { godPowers, power, type PowerId, powerRelic, ultimateId, weaponId } from '../../data/powers'
import { inPantheon, oathSlots, type PartKind, slotsPantheon } from '../../myth/pantheon'

/** 신이 깨어나 손에 드는 순간 주변 적을 밀어내는 범위와 피해 */
const MANIFEST_RADIUS = 4
const MANIFEST_DAMAGE = 20
/** 신화를 고를 때 터지는 충격의 대기 시간 (초): 번갈아 골라 공짜 피해를 쌓지 못하게 */
const MANIFEST_BURST_COOLDOWN = 10
/** 날마다 있는 장비인가 (보통·좋음): 그 장비의 일은 카드가 아니라 작은 알림으로 알린다 (카드 예산 E307, `src/data/moments.ts`) */
const everyday = (gear: GearItem) => gear.grade === 'common' || gear.grade === 'good'

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

  constructor(private readonly ctx: GameContext) {
    ctx.bus.on('targetKilled', ({ target }) => {
      ctx.powers.onKill(target, ctx.skills)
      for (const passives of ctx.powers.allPassives) passives.onKill(target, ctx.skills)
    })
    ctx.bus.on('heroRevived', () => {
      this.decoy = null
    })
  }

  /**
   * 칸의 힘을 전투에 맞춘다 (재미 재설계 P2). 전투의 원천은 `ctx.mythPowers`의 칸이다:
   * 무기 = 칸의 무기(없으면 맨손), 궁극기 = 칸의 궁극기, 늘 도는 힘 = 칸의 도는 힘들.
   * 자리 셋(손·심장·숨)은 칸에서 읽은 모습일 뿐이라(`slotsPantheon`) 자리 셋을 읽는 화면·규칙이 그대로 돈다.
   * 칸을 바꾼 뒤에는 꼭 이것을 부른다. 맹세를 건 동안은 줄어든 칸이 돈다 (저장되는 칸은 그대로)
   */
  syncPowers(announce = false, quiet = false): void {
    const { progress, powers, mythPowers, bus } = this.ctx
    progress.pantheon = slotsPantheon(mythPowers.slots)
    const change = powers.setSlots(oathSlots(mythPowers.slots, this.ctx.build.rules))
    this.litCombos(quiet)
    bus.emit('progressChanged', {})
    this.changed(change, announce)
  }

  /**
   * 조합 (P3): 처음 켜진 조합은 큰 카드 한 번 (이름과 한 줄). 켜 본 조합은 저장에 남아, 꺼졌다 다시 켜져도 뜨지 않는다.
   * 불러올 때·맹세로 도는 칸이 바뀔 때(quiet)와 점검용 실행(`?relics=`)은 카드 없이 켜 본 것으로만 적는다
   */
  private litCombos(quiet: boolean): void {
    const { powers, mythPowers, bus } = this.ctx
    for (const combo of powers.combos) {
      if (mythPowers.combos.has(combo.id)) continue
      mythPowers.combos.add(combo.id)
      if (quiet || mythPowers.testRun) continue
      const def = godDef(power(combo.needs[0])!.god)
      const parts = combo.needs.map((id) => power(id)!.name).join(' + ')
      bus.emit('moment', { id: 'comboLit', card: { kind: '조합', title: combo.name, color: def.color, icon: classIcon(def.name), lines: [combo.line, parts] } })
    }
  }

  /** 가진 힘을 칸에 끼운다 (무기·궁극기는 바꿔 끼우고, 도는 힘은 빈 칸이 있을 때만). 끼웠으면 true */
  slotPower(id: PowerId, announce = false): boolean {
    if (!this.ctx.mythPowers.slot(id)) return false
    this.syncPowers(announce)
    return true
  }

  /**
   * 칸에서 뺀다 (힘은 그대로 갖는다). 무기·궁극기는 힘 탭에서 비울 수 없지만(바꾸기만), 점검용 지름길은 비울 수 있다.
   * 뺀 유물 힘의 효과는 `RelicPowers.setSlots`가 쉬게 한다 (그 자리에 굳지 않게)
   */
  unslotPower(id: PowerId): boolean {
    if (!this.ctx.mythPowers.unslot(id)) return false
    this.syncPowers()
    return true
  }

  /** 끼운 도는 힘을 가진 도는 힘으로 바꾼다 (힘 탭: 칸이 다 찼을 때, 같은 칸 자리에). 바꿨으면 true */
  swapPower(out: PowerId, id: PowerId): boolean {
    if (!this.ctx.mythPowers.swap(out, id)) return false
    this.syncPowers()
    return true
  }

  /** 힘을 갖는다: 빈 칸이 있으면 끼운다. 새로 가졌으면 true */
  gainPower(id: PowerId): boolean {
    if (!this.ctx.mythPowers.gain(id)) return false
    this.syncPowers()
    return true
  }

  /**
   * 점검용 지름길 (개발 도구·`?relics=`·점검 스크립트): 그 신의 힘을 모두 갖고 칸에 끼운다. 무기·궁극기는 그 신의 것으로 바뀐다.
   * 유물 힘은 유물표에 켠 것만 칸에 둔다 (점검 스크립트의 빌드가 낀 유물만 돌게). 열린 신만 고를 수 있다
   */
  choose(god: God, announce: boolean): boolean {
    const { progress, mythPowers, powers } = this.ctx
    if (!progress.isOpen(god)) return false
    // 이미 그 신의 무기를 쥐었으면 무기가 바뀌지 않아도 깨어나는 순간을 알린다
    const held = progress.pantheon.hand === god
    mythPowers.grantAll(god)
    for (const p of godPowers(god)) {
      const relic = powerRelic(p.id)
      if (relic && !powers.loadout.lit.includes(relic)) mythPowers.unslot(p.id)
    }
    this.syncPowers(announce)
    if (announce && held) this.announce(god)
    return true
  }

  /**
   * 그 자리에 그 신을 낀다 (점검용 지름길, P7부터 화면은 힘 탭의 끼우기·바꾸기): 손 = 그 신의 무기를 무기 칸에, 심장 = 그 신의 궁극기를 궁극기 칸에,
   * 숨 = 그 신의 패시브 힘을 빈 도는 힘 칸에 (들어가는 만큼). 가진 힘만 낄 수 있다
   */
  place(part: PartKind, god: God): boolean {
    const { mythPowers } = this.ctx
    if (part !== 'breath') return this.slotPower(part === 'hand' ? weaponId(god) : ultimateId(god))
    let placed = false
    for (const p of godPowers(god)) if (p.source.from === 'passive' && mythPowers.slot(p.id)) placed = true
    if (!placed) return false
    this.syncPowers()
    this.ctx.bus.emit('mythLent', { god })
    return true
  }

  /** 숨 칸에서 뺀다: 그 신의 패시브 힘을 칸에서 뺀다 */
  unplace(god: God): boolean {
    const { mythPowers } = this.ctx
    let removed = false
    for (const p of godPowers(god)) if (p.source.from === 'passive' && mythPowers.unslot(p.id)) removed = true
    if (removed) this.syncPowers()
    return removed
  }

  /** 장 정복·홀로의 맹세로 숨 칸이 늘던 자리. 도는 힘의 칸은 귀환이 늘리니 여기서 할 일은 없다 (그 카드의 말은 흐름 갈래가 고친다) */
  fillBreath(): void {}

  /** 맹세를 걸거나 풀었다 (E305-01)·저장을 불러왔다: 저장된 칸 그대로 도는 칸만 다시 맞춘다 */
  reapply(): void {
    this.syncPowers(false, true)
  }

  /** 그 신이 자리에 들었나 (칸에 그 신의 무기·궁극기·패시브 힘이 있나) */
  has(god: God): boolean {
    return inPantheon(this.ctx.progress.pantheon, god)
  }

  /**
   * 유물을 손에 넣었다 (엔딩 뒤에만): 그 신의 신화가 아직 닫혀 있으면 1단계로 연다 (E12-04). 히든 신화도 그 유물이 열쇠다.
   * 데모에서는 신을 깨워야(흔적·사냥·수호자) 열린다 (E238, E305-03: 그리스도 제우스를 깨운다). 점검용 실행은 Game이 따로 연다.
   * 엔딩 뒤에도 흔적의 무리를 이겨 받은 유물은 신을 열지 않는다 (받을 때도, 불러와 다시 낄 때도): 그 신은 수호자를 쓰러뜨려야 깨어난다 (E241)
   */
  private unlock(id: RelicId, announce: boolean): void {
    const { progress, bus, ending, awaken } = this.ctx
    const myth = relicMyth(id)
    if (!myth || !ending.has('realms') || awaken.stage(myth) >= WAKE_WON) return
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
    // 새 단계의 효과 배율: 지금 자리로 실제 도는 값만 (E21-04 → E303-04: 유물은 유물표에, 기본 수치 없음. E307: 「몰면」 글을 걷음)
    const lines = [
      made.stage === 1 ? '대장간에서 처음 벼렸다' : `${made.stage}단계`,
      `유물 효과 피해 ×${effectScale(made.relic, made.stage, null)}`,
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

  /**
   * 가방의 셋을 합친다 (E303, 어디서나): 한 등급 위 하나가 가방에.
   * 좋음이 되면 작은 알림, 희귀는 카드, 영웅·전설은 큰 카드 (카드 예산 E307: 저절로 합쳐지는 것까지 카드로 뜨면 싸움을 덮는다)
   */
  merge(uids: readonly string[]): GearItem | null {
    const { powers, bus } = this.ctx
    const out = powers.loadout.merge(uids, Math.random)
    if (!out) return null
    bus.emit('gearMerged', { item: out })
    if (everyday(out)) bus.emit('moment', { id: 'merged', text: `합치기 · ${gearName(out)}` })
    else {
      const grade = GEAR.grades[out.grade].name
      const lines = [`셋 → ${grade}`, ...(out.unique ? [`고유 효과: ${GEAR.uniques[out.unique]!.name}`] : []), ...(out.unique2 ? [`고유 효과: ${GEAR.uniques[out.unique2]!.name}`] : [])]
      bus.emit('moment', { id: out.grade === 'rare' ? 'mergedRare' : 'mergedHigh', card: { kind: '합치기', title: gearName(out), color: GRADE_COLORS[out.grade], icon: gearIcon(out), lines } })
    }
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
    // 주운 것의 이름이 머리 위로 떠오른다 (사용자 의견 2026-10-28: 얻는 표현이 모자라다). 이어 주우면 앞 이름 위로 한 줄씩 쌓인다 (`DamageNumbers.label`)
    const label = (text: string, color: string) => this.ctx.numbers.label(this.labelAt.copy(this.ctx.hero.object.position).setY(this.ctx.hero.object.position.y + 2.2), text, color)
    if (gear) {
      label(gearName(gear), GRADE_COLORS[gear.grade])
      // 같은 부위에 지금 낀 장비 (가방으로 가면 견준다)
      const wornId = powers.loadout.slots.find((s) => s && powers.loadout.gear.has(s) && powers.loadout.partOf(s) === gear.part)
      const worn = wornId ? powers.loadout.gear.get(wornId) : undefined
      powers.loadout.addGear(gear)
      bus.emit('gearPicked', { item: gear })
      this.equip(id, true)
      // 줍기는 머리 위 이름 하나로만 알린다 (E307: 같은 줍기를 이름·아래 알림·카드 세 곳이 알렸다). 그 밖에 알릴 일이 생겼을 때만 더한다:
      // 빈 칸에 끼었거나 가방으로 갔는데 지금 낀 것보다 좋으면, 보통·좋음은 작은 알림, 희귀부터는 카드
      const card = { title: gearName(gear), color: GRADE_COLORS[gear.grade], icon: gearIcon(gear) }
      if (powers.loadout.slots.includes(id)) {
        if (everyday(gear)) bus.emit('moment', { id: 'gearWorn', text: `${gearName(gear)} · 낌` })
        else bus.emit('moment', { id: 'gearWornRare', card: { kind: '장비', ...card, lines: gear.stats.map((st) => statText(st.kind, st.value)) } })
      } else if (worn && gearScore(gear) > gearScore(worn)) {
        if (everyday(gear)) bus.emit('moment', { id: 'gearBetter', text: `더 좋은 장비 · ${gearName(gear)}` })
        else bus.emit('moment', { id: 'gearBetterRare', card: { kind: '더 좋은 장비 · 가방', ...card, lines: betterLines(gear, worn) } })
        bus.emit('gearBetter', { item: gear })
      }
    } else if (!isMythRelic(id)) {
      label(relicDef(id).name, godDef(relicDef(id).god).color)
      powers.loadout.addMaterial(id)
      bus.emit('moment', { id: 'materialPicked', text: `${relicDef(id).name} · 재료` })
      bus.emit('relicPicked', { id })
    } else {
      label(relicDef(id).name, godDef(relicDef(id).god).color)
      bus.emit('moment', { id: 'gearPicked', text: `${josa(relicDef(id).name, '을')} 얻었다` })
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
    skills.godLevel ??= (god) => this.ctx.progress.level(god)
    // 칸의 패시브 힘마다 그 부품을 그 신 단계로 돌린다
    powers.setLent(this.ctx.build.passives())
    this.updateGlow()

    // 걸은 거리 (이동 연동 효과). 순간이동처럼 한 번에 크게 옮긴 것은 빼고, 밀려난 것은 걸음으로 치지 않는다.
    // 탄 동안(E241)은 걸음으로 치지 않는다 (걸음 충전·회오리 걸음이 쉰다)
    const step = Math.hypot(position.x - this.lastWalk.x, position.z - this.lastWalk.y)
    const walking = hero.isMoving && !hero.riding && step < 1
    if (walking) powers.onWalk(step, skills)
    this.walked = walking ? step : 0
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
      // 탄 동안(E241)은 유물 행동·오라·동료가 쉰다: 쓰러졌을 때처럼 적을 비워 새로 맞히지 않는다 (날아가던 것은 마저 간다)
      if (hero.riding) skills.enemies = []
      powers.update(dt, skills)
    } else {
      pickups.update(dt, position.x, position.z, () => false)
      // 쓰러져 있는 동안에도 날아가던 망치·고리 같은 연출은 마저 움직인다. 적을 비워 새로 맞히지는 않는다
      skills.enemies = []
      powers.update(dt, skills)
    }

    // 궁극기: 칸에 궁극기가 있고 심장 게이지가 가득 차고, 쓸 만한 때가 오면 저절로 나간다.
    const boss = encounter.boss
    const bossNear = !!boss && boss.alive && Math.hypot(boss.x - position.x, boss.z - position.z) < 10
    const ultimate = powers.ultimate
    if (combat.alive && !hero.riding && ultimate && combat.heartGauge >= 1 && !powers.ultimateActive && !this.ctx.build.state.noUltimate && ultimate.worthUsing(skills, bossNear)) {
      combat.heartGauge = 0
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
    combat.heartScale = 1 + stats.ultCharge
    skills.area = 1 + stats.areaSize
    const awakening = this.ctx.powers.awakening
    awakening.levels = build.awakening
    awakening.maxHp = build.maxHp
  }

  /** 장비를 끼우거나 유물을 유물표에 켠다. announce가 false면 발현 연출 없이 (불러오기·점검용) */
  equip(id: RelicId, announce: boolean): void {
    this.changed(this.ctx.powers.equip(id), announce, id)
    this.unlock(id, announce)
    // 유물표에 켜도 그 유물 힘은 생기지 않는다 (P5: 힘은 카드에서 고른 것만 가진다)
  }

  /**
   * 발밑 빛: 손에 쥔 신의 색(2 + 신 단계). 손이 비었으면 가장 많이 켠 신의 색으로 유물 하나에 1단계.
   * 몸에서 피어오르는 빛 조각도 손의 신 단계를 따른다. 머리 위 빛 고리는 여기서 띄우지 않는다 (고른 표식에 딸린다: `Appearance.update`, E307)
   */
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

  /** 장착이 바뀌었다: 손의 신이 새로 들거나 빠졌을 때의 연출 */
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

  /**
   * 신이 깨어나 손에 드는 순간: 장면이나 카드, 번쩍임, 주변 적 밀어내기.
   * 주인공의 모습·초상은 바뀌지 않는다 (E307, 사용자 의견 4): 그 신의 옷은 보관함에 풀릴 뿐이고, 카드는 칭호가 아니라 신의 이름으로 뜬다
   */
  announce(id: God): void {
    const { bus, hud, progress, hero, fx, view, feel, encounter, skills } = this.ctx
    bus.emit('manifested', { god: id })
    const god = godDef(id)
    // 처음 깨어난 신은 장면(E23-02): 그 신의 색으로 번쩍·하늘 기둥, 그 신의 장면 뒤에 큰 카드. 자리를 바꿔 들면 카드
    const first = progress.opened.length === 1
    if (first) {
      hud.flash(god.color)
      fx.power.column(hero.object.position, god.color)
    } else fx.power.burst(hero.object.position, god.color, 4)
    // 신마다 다른 깨어나는 순간: 번개 기둥, 흩어지는 그림자, 여섯 칼날
    godMoment(this.ctx, god.id, 1)
    // 무엇이 생기는지: 그 신의 힘과 지금 단계까지 열린 것
    const gains: string[] = []
    for (let lv = 1; lv <= progress.level(god.id); lv++) {
      for (const g of levelGains(god.id, lv)) if (lv === 1 || g.kind === 'power') gains.push(g.text)
    }
    const ultimate = `궁극기 「${god.ultimate.name}」`
    // 첫 신의 큰 카드는 네 줄로 (E307: 여섯 줄이면 세로 화면에서 주인공까지 덮는다): 공격과 궁극기를 한 줄에, 힘은 둘까지(나머지는 신 탭의 단계 목록),
    // 마지막 줄은 모습이 그대로라는 것과 그 신의 옷이 풀린 곳 (그 뒤의 신은 「외형」 알약의 새 표시로만)
    const lines = first ? [`${gains[0]} · ${ultimate}`, ...gains.slice(1, 3), `모습은 그대로 · ${god.name}의 옷은 신 탭 「외형」에`] : [...gains, ultimate]
    const card = { kind: first ? '신이 깨어남' : '손에 쥠', title: god.name, color: god.color, icon: classIcon(god.name), lines }
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
