import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import { Build } from '../src/build/Build'
import { tierOf } from '../src/data/moments'
import { COMBOS, godPowers, lendPower, offer, partId, POWERS, powerPassive, relicPowerId, ultimateId, weaponId } from '../src/data/powers'
import type { GameContext } from '../src/game/context'
import { EventBus, type GameEvents } from '../src/game/events'
import { RelicPowers } from '../src/game/RelicPowers'
import { RelicSystem } from '../src/game/systems/Relics'
import { STAGE_DAMAGE } from '../src/gear/mythRelic'
import { ClassProgress } from '../src/myth/ClassProgress'
import { slotsPantheon } from '../src/myth/pantheon'
import { mergePowers, parsePowers, PowerProgress } from '../src/progress/Powers'
import { godDef } from '../src/relics/data'
import { parseSave } from '../src/save/SaveData'
import OLD_TEXT from './fixtures/save-v17-full.json?raw'

/** 칸을 전투에 맞추는 길 (`RelicSystem.syncPowers`가 하는 일의 뼈대): 진행의 칸 → 도는 칸 */
function rig() {
  const powers = new RelicPowers(new THREE.Group())
  const progress = new ClassProgress()
  const myth = new PowerProgress(() => 0)
  const build = new Build({ powers, progress })
  const sync = () => powers.setSlots(myth.slots)
  /** 힘을 갖고 칸에 끼운다 */
  const take = (...ids: string[]) => {
    for (const id of ids) {
      if (!myth.has(id)) myth.owned.push(id)
      myth.slot(id)
    }
    sync()
  }
  return { powers, progress, myth, build, sync, take }
}

const LIGHTNING = partId('thor', 'basicLightning')
const RAVENS = partId('odin', 'companions')

describe('칸의 힘만 전투에서 돈다 (재미 재설계 P2)', () => {
  it('칸에 토르의 번개와 오딘의 까마귀를 함께 두면 둘 다 돌고, 힘마다 제 부품만 든다', () => {
    const { build, take } = rig()
    expect(build.passives()).toEqual([])
    take(LIGHTNING, RAVENS)
    const list = build.passives()
    expect(list.map((p) => p.power)).toEqual([LIGHTNING, RAVENS])
    expect(list.map((p) => p.god)).toEqual(['thor', 'odin'])
    // 번개는 옮겨 붙는 번개와 한 힘이고, 폭풍(하늘에서 내리치기)은 다른 힘이라 끼우지 않으면 돌지 않는다
    expect(Object.keys(list[0]!.passive).sort()).toEqual(['attackSpeed', 'basicLightning', 'chainLightning', 'damageScale'])
    expect(list[0]!.passive.skyStrike).toBeUndefined()
    expect(list[1]!.passive.companions).toEqual(godDef('odin').passive.companions)
    // 피해 배율·공격 빠르기는 무기의 몫이다
    for (const p of list) expect([p.passive.damageScale, p.passive.attackSpeed]).toEqual([1, 1])
  })

  it('칸에서 빼면 멎고 다시 끼우면 돈다: 패시브 목록의 캐시도 칸을 따라 바뀐다', () => {
    const { build, myth, sync, take } = rig()
    take(LIGHTNING, RAVENS)
    const both = build.passives()
    // 칸이 그대로면 지난 목록 그대로
    expect(build.passives()).toBe(both)
    myth.unslot(RAVENS)
    sync()
    expect(build.passives().map((p) => p.power)).toEqual([LIGHTNING])
    myth.unslot(LIGHTNING)
    sync()
    expect(build.passives()).toEqual([])
    myth.slot(RAVENS)
    sync()
    expect(build.passives().map((p) => p.power)).toEqual([RAVENS])
    // 가진 힘은 그대로다
    expect(myth.owned).toEqual([LIGHTNING, RAVENS])
  })

  it('무기 칸이 오딘의 창이고 궁극기 칸이 토르의 심판이면 그대로 섞여 돈다. 무기가 없으면 맨손', () => {
    const { build, powers, myth, sync, take } = rig()
    expect(build.state.attack).toBe('blade')
    expect(powers.ultimate).toBeNull()
    take(weaponId('odin'), ultimateId('thor'))
    expect(build.state.attack).toBe(godDef('odin').attack)
    expect(build.state.attackSpeed).toBeCloseTo(godDef('odin').passive.attackSpeed)
    expect(build.chosen).toBe('odin')
    expect(build.heart).toBe('thor')
    expect(powers.manifested).toBe('odin')
    expect(powers.ultimate).not.toBeNull()
    expect(powers.loadout.pantheon).toEqual({ hand: 'odin', heart: 'thor', breath: [] })
    // 무기를 바꿔 끼우면 동작이 바뀌고, 빼면 맨손
    take(weaponId('thor'))
    expect(build.state.attack).toBe(godDef('thor').attack)
    myth.unslot(weaponId('thor'))
    sync()
    expect(build.state.attack).toBe('blade')
    expect(build.chosen).toBeNull()
    expect(build.heart).toBe('thor')
  })

  it('유물 힘은 칸에 있을 때만 깨어난다: 유물표에 켰는지, 그 신이 자리에 있는지는 보지 않는다', () => {
    const { build, powers, myth, sync, take } = rig()
    const plain = build.state.modifiers
    // 유물표에 켜기만 해서는 잠들어 있다 (그 신의 무기·궁극기·패시브를 다 끼워도)
    powers.equip('megingjord')
    take(weaponId('thor'), ultimateId('thor'), LIGHTNING)
    expect(powers.awake('megingjord')).toBe(false)
    expect(build.state.modifiers).toEqual(plain)
    // 유물표에 없는 유물도 그 힘이 칸에 있으면 깨어난다 (재료 유물의 힘이 불러올 때 사라지지 않는다)
    take(relicPowerId('lokiMask'))
    expect(powers.loadout.lit).toEqual(['megingjord'])
    expect(powers.awake('lokiMask')).toBe(true)
    expect(powers.effectOf('lokiMask')).not.toBeNull()
    expect(build.state.modifiers).not.toEqual(plain)
    expect(powers.slottedRelics).toEqual(['lokiMask'])
    // 켜기만 해도 붙는 배율이 아니다: 유물 힘을 칸에 끼워도 유물표의 칸 수(수집 층)는 그대로
    expect(build.state.lit).toBe(1)
    myth.unslot(relicPowerId('lokiMask'))
    sync()
    expect(powers.awake('lokiMask')).toBe(false)
    expect(build.state.modifiers).toEqual(plain)
  })

  it('한 신의 무기·궁극기·패시브를 모두 끼워도 덤이 없다: 힘은 그 신의 단계 그대로, 유물 효과는 유물 단계 그대로', () => {
    const { build, powers, progress, take } = rig()
    progress.open('thor')
    progress.ascend('thor')
    take(...godPowers('thor').map((p) => p.id))
    expect(slotsPantheon(powers.slots)).toEqual({ hand: 'thor', heart: 'thor', breath: ['thor'] })
    for (const p of build.passives()) expect(p.level, p.power).toBe(progress.level('thor'))
    expect(powers.effectOf('mjolnir')!.stageScale).toBe(STAGE_DAMAGE[0])
    powers.loadout.stages.set('mjolnir', 2)
    powers.refreshStages()
    expect(powers.effectOf('mjolnir')!.stageScale).toBe(STAGE_DAMAGE[1])
  })

  it('힘에는 단계가 없다: 만나기만 한 신(단계 0)의 힘도 1단계 값으로 돌고, 칸에 끼운 힘의 머리 부품은 단계와 상관없이 열려 있다', () => {
    const { build, progress, take } = rig()
    expect(progress.level('thor')).toBe(0)
    take(LIGHTNING, partId('thor', 'skyStrike'))
    expect(build.passives().map((p) => p.level)).toEqual([1, 1])
    // 폭풍은 신 3단계에 열리던 부품이다: 힘으로 끼우면 바로 돈다. 딸린 부품(옮겨 붙는 번개)은 제 단계를 그대로 읽는다
    expect(godDef('thor').passive.skyStrike!.minLevel).toBe(3)
    expect(powerPassive(partId('thor', 'skyStrike'))!.skyStrike!.minLevel).toBe(1)
    expect(powerPassive(LIGHTNING)!.chainLightning!.minLevel).toBe(godDef('thor').passive.chainLightning!.minLevel)
    for (const p of POWERS) {
      if (p.source.from !== 'passive') continue
      const head = (powerPassive(p.id) as unknown as Record<string, { minLevel?: number }>)[p.source.parts[0]!]!
      if ('minLevel' in head) expect(head.minLevel, p.id).toBe(1)
    }
    // 신 단계가 오르면 그 단계의 값으로
    progress.open('thor')
    progress.ascend('thor')
    expect(build.passives().map((p) => p.level)).toEqual([2, 2])
  })

  it('v17에서 옮긴 저장은 전과 같은 무기·궁극기로 싸운다', () => {
    const old = JSON.parse(OLD_TEXT) as { pantheon: { hand: string; heart: string } }
    const data = parseSave(JSON.stringify(old))!
    const { build, powers, myth, sync } = rig()
    myth.load(data.powers)
    sync()
    expect(build.chosen).toBe(old.pantheon.hand)
    expect(build.heart).toBe(old.pantheon.heart)
    expect(build.state.attack).toBe(godDef(old.pantheon.hand).attack)
    expect(powers.awake('mjolnir')).toBe(true)
    expect(data.pantheon.hand).toBe(old.pantheon.hand)
    expect(data.pantheon.heart).toBe(old.pantheon.heart)
  })
})

describe('점검용 지름길과 칸 상한', () => {
  it('칸 상한을 풀면(점검용 실행) 도는 힘을 칸 수 넘게 끼울 수 있고, 평소에는 칸 수까지만', () => {
    const p = new PowerProgress(() => 0)
    p.grantAll('thor')
    p.grantAll('odin')
    expect(p.slots.auras).toHaveLength(3)
    const open = new PowerProgress(() => 0)
    open.uncapped = true
    open.grantAll('thor')
    open.grantAll('odin')
    expect(open.slots.auras).toEqual([...godPowers('thor'), ...godPowers('odin')].filter((x) => x.kind === 'aura').map((x) => x.id))
  })

  it('own은 힘을 갖기만 하고 칸은 건드리지 않는다. 대표 패시브의 힘은 신마다 있다', () => {
    const p = new PowerProgress(() => 0)
    p.own('loki')
    expect(p.owned).toEqual(godPowers('loki').map((x) => x.id))
    expect(p.slotted).toEqual([])
    expect(p.met).toEqual(['loki'])
    expect(lendPower('thor')).toBe(LIGHTNING)
    expect(lendPower('odin')).toBe(RAVENS)
  })
})

describe('P1 리뷰에서 고친 것', () => {
  const empty = { owned: [], slots: { weapon: null, ultimate: null, auras: [] }, claimed: [], met: [], seed: 7 }

  it('깨운 신은 있는데 힘이 빈 v18 저장은 깨운 신·자리 셋에서 셈한 힘으로 채워 읽는다 (맨손으로 굳지 않는다)', () => {
    const stale = {
      version: 18,
      classes: { thor: { level: 2 } },
      pantheon: { hand: 'thor', heart: 'thor', breath: ['thor'] },
      lit: ['mjolnir'],
      awaken: { waking: 'odin', fragments: 2 },
      powers: empty,
    }
    const data = parseSave(JSON.stringify(stale))!
    expect(data.powers.met).toEqual(['thor', 'odin'])
    expect(data.powers.owned).toEqual(expect.arrayContaining([...godPowers('thor').map((p) => p.id), weaponId('odin'), RAVENS]))
    expect(data.powers.slots.weapon).toBe(weaponId('thor'))
    expect(data.powers.slots.ultimate).toBe(ultimateId('thor'))
    expect(data.powers.slots.auras).toEqual([relicPowerId('mjolnir'), LIGHTNING, partId('thor', 'skyStrike')])
    expect(data.powers.claimed).toEqual(['trace:thor', 'guardian:thor', 'trace:odin'])
    // 씨앗은 저장된 것 그대로, 한 번 채운 뒤에는 다시 읽어도 같다
    expect(data.powers.seed).toBe(7)
    expect(parseSave(JSON.stringify(data))!.powers).toEqual(data.powers)
    expect(data.pantheon).toEqual({ hand: 'thor', heart: 'thor', breath: ['thor'] })
  })

  it('합칠 때 이미 만난 신의 힘과 칸은 저장된 그대로다: 일부러 뺀 힘을 다시 끼우지 않고, 고른 힘에 나머지를 얹지 않는다', () => {
    const saved = { owned: [weaponId('thor'), LIGHTNING], slots: { weapon: null, ultimate: null, auras: [] }, claimed: ['trace:thor'], met: ['thor'], seed: 3 }
    const derived = { owned: [...godPowers('thor'), ...godPowers('odin')].map((p) => p.id), slots: { weapon: weaponId('thor'), ultimate: ultimateId('odin'), auras: [LIGHTNING, RAVENS] }, claimed: ['trace:thor', 'guardian:thor', 'trace:odin', 'guardian:odin'], met: ['thor', 'odin'], seed: 9 }
    const out = mergePowers(saved, derived)
    expect(out.owned).toEqual([weaponId('thor'), LIGHTNING, ...godPowers('odin').map((p) => p.id)])
    // 토르의 무기는 가졌는데 뺀 것이라 그대로 비고, 새로 온 오딘의 힘만 빈 칸에 든다
    expect(out.slots).toEqual({ weapon: null, ultimate: ultimateId('odin'), auras: [RAVENS] })
    expect(out.claimed).toEqual(['trace:thor', 'trace:odin', 'guardian:odin'])
    expect(out.met).toEqual(['thor', 'odin'])
    expect(out.seed).toBe(3)
    // 모르는 신이 없으면 저장된 그대로
    expect(mergePowers(out, derived)).toBe(out)
  })

  it('수호자에서 고르면 그 신을 만난 것이다', () => {
    const p = new PowerProgress(() => 0, 11)
    expect(p.met).toEqual([])
    const [first] = p.offer('guardian:odin')
    expect(p.claim('guardian:odin', first!)).toBe(true)
    expect(p.met).toEqual(['odin'])
  })

  it('내밀 것이 없는 출처는 고를 수 없다: 다 가진 신의 수호자, 만난 신이 없는 무리', () => {
    const p = new PowerProgress(() => 0, 11)
    expect(p.canClaim('pack:midgard:1')).toBe(false)
    expect(p.canClaim('trace:thor')).toBe(true)
    p.own('thor')
    expect(p.canClaim('trace:thor')).toBe(false)
    expect(p.canClaim('guardian:thor')).toBe(false)
    expect(p.claimed.size).toBe(0)
  })

  it('첫 판에서는 첫 판의 신(북유럽 넷)의 힘만 내민다', () => {
    expect(offer('trace:zeus', { owned: [], met: [] }, 1)).toEqual([])
    expect(offer('guardian:zeus', { owned: [], met: ['zeus', 'thor'] }, 1).every((id) => id.includes('thor'))).toBe(true)
    expect(offer('pack:olympus:1', { owned: [], met: ['zeus'] }, 1)).toEqual([])
    expect(offer('trace:thor', { owned: [], met: [] }, 1)).toHaveLength(3)
  })
})

/** 가짜 게임: `RelicSystem`이 칸을 맞출 때 쓰는 것만 (버스·힘·진행·빌드) */
function game(returns = 0) {
  const bus = new EventBus<GameEvents>()
  const powers = new RelicPowers(new THREE.Group())
  const progress = new ClassProgress()
  const mythPowers = new PowerProgress(() => returns, 5)
  const build = new Build({ powers, progress })
  const moments: string[] = []
  bus.on('moment', (m) => moments.push(`${m.id}:${m.card?.title ?? ''}`))
  // 카드의 그림은 캔버스로 그린다: 그리지 못하면 빈 주소
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) })
  const ctx = { bus, powers, progress, mythPowers, build, ending: { has: () => false }, awaken: { waking: null, fragments: 0 } } as unknown as GameContext
  const relics = new RelicSystem(ctx)
  /** 힘을 갖고 칸에 끼운다 (개발 지름길 `dev.power`와 같은 길) */
  const take = (id: string) => {
    if (!mythPowers.has(id)) mythPowers.owned.push(id)
    return relics.slotPower(id)
  }
  return { bus, powers, progress, mythPowers, build, relics, moments, take }
}

describe('조합 (재미 재설계 P3)', () => {
  it('재료 둘이 칸에 있으면 켜지고 하나를 빼면 꺼진다. 켜진 동안만 그 일이 걸린다', () => {
    const { powers, relics, take } = game(3)
    take(LIGHTNING)
    expect(powers.combos).toEqual([])
    take(relicPowerId('mjolnir'))
    expect(powers.combos.map((c) => c.id)).toEqual(['returningThunder'])
    expect(powers.effectOf('mjolnir')!.combo).toEqual({ lightning: 5 })
    take(RAVENS)
    take(relicPowerId('gungnir'))
    expect(powers.combos.map((c) => c.id)).toEqual(['valkyrie', 'thunderSpear', 'returningThunder'])
    // 번개를 빼면 번개가 재료인 셋이 모두 꺼지고, 유물에 걸린 것도 걷힌다
    relics.unslotPower(LIGHTNING)
    expect(powers.combos).toEqual([])
    expect(powers.effectOf('mjolnir')!.combo).toBeNull()
    expect(powers.effectOf('gungnir')!.combo).toBeNull()
    relics.slotPower(LIGHTNING)
    expect(powers.combos).toHaveLength(3)
  })

  it('조합마다 재료가 칸에 있으면 그 일이 걸린다: 유물 조합은 그 유물들에, 발키리는 까마귀의 묶음에', () => {
    for (const combo of COMBOS) {
      const powers = new RelicPowers(new THREE.Group())
      powers.setSlots({ weapon: null, ultimate: null, auras: [...combo.needs] })
      expect(powers.combos.map((c) => c.id), combo.id).toEqual([combo.id])
      const e = combo.effect
      if (e.kind === 'relicBoost') for (const relic of e.relics) expect(powers.effectOf(relic)!.combo, `${combo.id}: ${relic}`).toEqual(e.boost)
      else {
        const build = new Build({ powers, progress: new ClassProgress() })
        powers.setLent(build.passives())
        const lit = powers.allPassives.filter((p) => p.comboLightning > 0)
        expect(lit.map((p) => p.bound?.passive.companions?.look), combo.id).toEqual(['raven'])
        expect(lit[0]!.comboLightning).toBe(e.damage)
      }
      // 재료 하나만으로는 아무것도 걸리지 않는다
      powers.setSlots({ weapon: null, ultimate: null, auras: [combo.needs[0]] })
      expect(powers.combos, combo.id).toEqual([])
      powers.setLent(new Build({ powers, progress: new ClassProgress() }).passives())
      expect(powers.allPassives.every((p) => p.comboLightning === 0), combo.id).toBe(true)
    }
  })

  it('조합이 처음 켜질 때 큰 카드가 한 번 뜬다: 꺼졌다 다시 켜질 때는 뜨지 않고, 켜 본 조합은 저장에 남는다', () => {
    const { mythPowers, relics, moments, take } = game(3)
    take(LIGHTNING)
    expect(moments).toEqual([])
    take(RAVENS)
    expect(moments).toEqual(['comboLit:발키리'])
    expect(tierOf('comboLit')).toBe(3)
    relics.unslotPower(RAVENS)
    relics.slotPower(RAVENS)
    relics.unslotPower(LIGHTNING)
    relics.slotPower(LIGHTNING)
    expect(moments).toEqual(['comboLit:발키리'])
    // 다른 조합은 따로 한 번
    take(relicPowerId('mjolnir'))
    expect(moments).toEqual(['comboLit:발키리', 'comboLit:돌아오는 천둥'])
    // 저장 왕복: 불러온 판에서도 다시 뜨지 않는다
    const data = parsePowers(JSON.parse(JSON.stringify(mythPowers.toData())))
    expect(data.combos).toEqual(['valkyrie', 'returningThunder'])
    const again = game(3)
    again.mythPowers.load(data)
    again.relics.reapply()
    again.relics.unslotPower(RAVENS)
    again.relics.slotPower(RAVENS)
    expect(again.moments).toEqual([])
    // 켜 본 조합이 없으면 키를 쓰지 않는다 (옛 저장 모양 그대로), 모르는 조합은 버린다
    expect('combos' in new PowerProgress().toData()).toBe(false)
    expect(parsePowers({ combos: ['valkyrie', 'nothing', 'valkyrie', 3] }).combos).toEqual(['valkyrie'])
  })

  it('불러올 때 이미 켜져 있던 조합과 점검용 실행(칸 상한을 푼 판)은 카드 없이 켜 본 것으로만 적는다', () => {
    const loaded = game(3)
    loaded.mythPowers.load({ owned: [LIGHTNING, RAVENS], slots: { weapon: null, ultimate: null, auras: [LIGHTNING, RAVENS] }, claimed: [], met: ['thor', 'odin'], seed: 1 })
    loaded.relics.reapply()
    expect(loaded.powers.combos.map((c) => c.id)).toEqual(['valkyrie'])
    expect(loaded.moments).toEqual([])
    expect([...loaded.mythPowers.combos]).toEqual(['valkyrie'])
    const trial = game()
    trial.mythPowers.uncapped = true
    trial.take(LIGHTNING)
    trial.take(RAVENS)
    expect(trial.moments).toEqual([])
  })
})

describe('임시 다리: 지금의 깨우는 흐름이 힘을 준다 (P2)', () => {
  it('흔적의 무리를 이기면(조각 2) 그 신을 만나고 무기와 대표 패시브를 갖고 빈 칸에 끼운다. 함께 켜진 유물의 힘도', () => {
    const { bus, mythPowers, build, relics } = game()
    relics.equip('mjolnir', false)
    bus.emit('fragment', { god: 'thor', piece: 2 })
    expect(mythPowers.met).toEqual(['thor'])
    expect(mythPowers.owned).toEqual([relicPowerId('mjolnir'), LIGHTNING, weaponId('thor')])
    expect(mythPowers.slots).toEqual({ weapon: weaponId('thor'), ultimate: null, auras: [relicPowerId('mjolnir'), LIGHTNING] })
    expect(build.state.attack).toBe(godDef('thor').attack)
    expect(build.passives().map((p) => p.power)).toEqual([LIGHTNING])
    // 불러온 뒤 다시 맞추는 조각 2(조용히)는 아무것도 더하지 않는다
    bus.emit('fragment', { god: 'thor', piece: 2, silent: true })
    expect(mythPowers.owned).toHaveLength(3)
  })

  it('둘째 신의 무리를 이기면 무기 칸이 차 있어 두 갈래 카드로 묻고, 고르면 무기 칸만 바뀐다', () => {
    const { bus, mythPowers, relics, build } = game(1)
    bus.emit('fragment', { god: 'thor', piece: 2 })
    const asked: string[] = []
    let answer: ((take: boolean) => void) | null = null
    relics.offerSwap = (part, incoming, current, choose) => {
      asked.push(`${part}:${incoming}:${current}`)
      answer = choose
    }
    let after: (() => void) | undefined
    bus.on('moment', (m) => {
      if (m.id === 'swapOffer') after = m.after
    })
    bus.emit('fragment', { god: 'odin', piece: 2 })
    // 힘은 바로 갖고(빈 도는 힘 칸에 까마귀), 무기 칸은 묻기 전까지 그대로
    expect(mythPowers.has(weaponId('odin'))).toBe(true)
    expect(mythPowers.slots.weapon).toBe(weaponId('thor'))
    expect(mythPowers.slots.auras).toEqual([LIGHTNING, RAVENS])
    after!()
    expect(asked).toEqual(['hand:odin:thor'])
    answer!(true)
    expect(mythPowers.slots.weapon).toBe(weaponId('odin'))
    expect(build.state.attack).toBe(godDef('odin').attack)
    expect(mythPowers.slots.auras).toEqual([LIGHTNING, RAVENS])
  })
})
