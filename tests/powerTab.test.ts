import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import { Build } from '../src/build/Build'
import { emptySlots, partId, power, relicPowerId, ultimateId, weaponId } from '../src/data/powers'
import type { GameContext } from '../src/game/context'
import { EventBus, type GameEvents } from '../src/game/events'
import { RelicPowers } from '../src/game/RelicPowers'
import { RelicSystem } from '../src/game/systems/Relics'
import { ClassProgress } from '../src/myth/ClassProgress'
import { PowerProgress } from '../src/progress/Powers'
import { combosLitBy, comboRows, LOCKED_LINE, ownedGroups, type PowerTabState, shownAuraSlots, slotCells, slotMove } from '../src/ui/menu/powersView'
import powersTabSource from '../src/ui/menu/powersTab.ts?raw'

const LIGHTNING = partId('thor', 'basicLightning')
const STORM = partId('thor', 'skyStrike')
const RAVENS = partId('odin', 'companions')
const SHADOWS = partId('loki', 'companions')
const MJOLNIR = relicPowerId('mjolnir')
const MASK = relicPowerId('lokiMask')

/** 탭이 읽는 상태 하나 */
const state = (owned: string[], slots: Partial<PowerTabState['slots']> = {}, auraSlots = 3): PowerTabState => ({ owned, slots: { ...emptySlots(), ...slots }, auraSlots })

describe('힘 탭의 칸 줄 (P7)', () => {
  it('무기 1 · 궁극기 1 · 도는 힘 N(지금 칸 수), 그리고 다음에 열릴 잠긴 칸 하나', () => {
    const cells = slotCells(state([weaponId('thor'), LIGHTNING], { weapon: weaponId('thor'), auras: [LIGHTNING] }))
    expect(cells.map((c) => [c.kind, c.id, c.locked])).toEqual([
      ['weapon', weaponId('thor'), false],
      ['ultimate', null, false],
      ['aura', LIGHTNING, false],
      ['aura', null, false],
      ['aura', null, false],
      ['aura', null, true],
    ])
    expect(LOCKED_LINE).toBe('귀환하면 하나 는다')
  })

  it('도는 힘 칸이 여섯이면 잠긴 칸이 없다. 점검용 실행이 칸 상한을 풀어도 보이는 칸은 여섯까지(끼운 것이 더 많으면 그만큼)', () => {
    expect(slotCells(state([], {}, 6)).filter((c) => c.locked)).toEqual([])
    expect(shownAuraSlots(state([], {}, 999))).toBe(6)
    const many = [LIGHTNING, STORM, RAVENS, SHADOWS, MJOLNIR, MASK, relicPowerId('gungnir')]
    expect(shownAuraSlots(state(many, { auras: many }, 999))).toBe(7)
  })
})

describe('가진 힘 목록 (P7)', () => {
  it('종류별로(무기 → 궁극기 → 도는 힘) 얻은 차례대로, 끼운 것은 표시. 없는 종류는 묶음을 만들지 않는다', () => {
    const groups = ownedGroups(state([LIGHTNING, weaponId('odin'), MJOLNIR, weaponId('thor')], { weapon: weaponId('thor'), auras: [MJOLNIR] }))
    expect(groups.map((g) => [g.label, g.items.map((i) => `${i.id}${i.slotted ? '*' : ''}`)])).toEqual([
      ['무기', [weaponId('odin'), `${weaponId('thor')}*`]],
      ['도는 힘', [LIGHTNING, `${MJOLNIR}*`]],
    ])
    expect(ownedGroups(state([]))).toEqual([])
  })
})

describe('조합 줄 (P7)', () => {
  it('켜진 조합, 그리고 재료 하나 이상을 가졌는데 아직 켜지지 않은 조합(남은 재료가 가졌는지·어느 신에게서 오는지)', () => {
    const rows = comboRows(state([LIGHTNING, RAVENS, MJOLNIR], { auras: [LIGHTNING, RAVENS] }))
    expect(rows.lit.map((c) => c.name)).toEqual(['발키리'])
    // 번개를 가졌으니 번개가 재료인 나머지 둘이 보이고, 재료가 하나도 없는 조합은 보이지 않는다
    expect(rows.near.map((c) => c.id)).toEqual(['thunderSpear', 'returningThunder'])
    const spear = rows.near.find((c) => c.id === 'thunderSpear')!
    expect(spear.parts.map((p) => [p.name, p.god, p.have, p.slotted])).toEqual([
      ['번개', '토르', true, true],
      [power(relicPowerId('gungnir'))!.name, '오딘', false, false],
    ])
    // 묠니르는 가졌지만 칸에 없다: 끼우기만 하면 켜진다
    expect(rows.near.find((c) => c.id === 'returningThunder')!.parts.map((p) => [p.have, p.slotted])).toEqual([
      [true, true],
      [true, false],
    ])
    expect(comboRows(state([weaponId('thor')]))).toEqual({ lit: [], near: [] })
  })

  it('끼우면 새로 켜지는 조합: 바꿀 칸을 빼고 셈한다 (번개를 빼고 까마귀를 넣으면 발키리는 켜지지 않는다)', () => {
    const s = state([LIGHTNING, STORM, MJOLNIR, RAVENS], { auras: [LIGHTNING, STORM, MJOLNIR] })
    expect(combosLitBy(s, RAVENS, STORM).map((c) => c.name)).toEqual(['발키리'])
    expect(combosLitBy(s, RAVENS, LIGHTNING)).toEqual([])
    expect(combosLitBy(s, weaponId('odin'))).toEqual([])
  })
})

describe('눌렀을 때 할 수 있는 일 (P7)', () => {
  it('도는 힘: 빈 칸이 있으면 끼우기, 다 찼으면 바꿀 칸을 이어서 누른다, 끼운 것은 빼기', () => {
    const open = state([LIGHTNING, STORM], { auras: [LIGHTNING] })
    expect(slotMove(open, STORM)).toEqual({ kind: 'slot' })
    expect(slotMove(open, LIGHTNING)).toEqual({ kind: 'unslot' })
    const full = state([LIGHTNING, STORM, MJOLNIR, RAVENS], { auras: [LIGHTNING, STORM, MJOLNIR] })
    expect(slotMove(full, RAVENS)).toEqual({ kind: 'choose', choices: [LIGHTNING, STORM, MJOLNIR] })
  })

  it('무기·궁극기: 칸이 비었으면 끼우기, 차 있으면 그것과 바꾸기, 끼운 것은 비울 수 없다', () => {
    const s = state([weaponId('thor'), weaponId('odin'), ultimateId('thor')], { weapon: weaponId('thor') })
    expect(slotMove(s, ultimateId('thor'))).toEqual({ kind: 'slot' })
    expect(slotMove(s, weaponId('odin'))).toEqual({ kind: 'replace', out: weaponId('thor') })
    expect(slotMove(s, weaponId('thor'))).toEqual({ kind: 'fixed' })
    // 안 가진 힘은 할 일이 없다
    expect(slotMove(s, weaponId('loki'))).toBeNull()
  })

  it('화면은 무기·궁극기에 「빼기」를 두지 않는다 (fixed는 설명 한 줄만)', () => {
    const card = powersTabSource.slice(powersTabSource.indexOf('private powerCard('), powersTabSource.indexOf('private comboBox('))
    expect(card).toContain("move.kind === 'unslot'")
    expect(card.match(/'빼기'/g)).toHaveLength(1)
  })
})

/** 게임 쪽 한 곳: 진행의 칸 → 전투 (`RelicSystem`) */
function game(returns = 0) {
  const bus = new EventBus<GameEvents>()
  const powers = new RelicPowers(new THREE.Group())
  const progress = new ClassProgress()
  const mythPowers = new PowerProgress(() => returns, 5)
  const build = new Build({ powers, progress })
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) })
  const ctx = { bus, powers, progress, mythPowers, build, ending: { has: () => false }, awaken: { waking: [], stage: () => 0 } } as unknown as GameContext
  const relics = new RelicSystem(ctx)
  const own = (...ids: string[]) => ids.forEach((id) => mythPowers.owned.push(id))
  return { bus, powers, mythPowers, build, relics, own }
}

describe('끼우기·빼기·바꾸기가 곧바로 전투에 맞춘다 (P7)', () => {
  it('바꾸기는 같은 칸 자리에 들고, 끼우고 빼고 바꿀 때마다 syncPowers가 도는 칸을 맞춘다', () => {
    const { powers, mythPowers, relics, own } = game()
    own(LIGHTNING, STORM, MJOLNIR, RAVENS)
    const sync = vi.spyOn(relics, 'syncPowers')
    for (const id of [LIGHTNING, STORM, MJOLNIR]) expect(relics.slotPower(id)).toBe(true)
    // 칸이 다 찼다: 넷째는 끼우지 못하고, 바꾸기로 폭풍 자리에 든다
    expect(relics.slotPower(RAVENS)).toBe(false)
    expect(relics.swapPower(STORM, RAVENS)).toBe(true)
    expect(mythPowers.slots.auras).toEqual([LIGHTNING, RAVENS, MJOLNIR])
    expect(powers.slots.auras).toEqual([LIGHTNING, RAVENS, MJOLNIR])
    expect(powers.combos.map((c) => c.id)).toEqual(['valkyrie', 'returningThunder'])
    expect(relics.unslotPower(MJOLNIR)).toBe(true)
    expect(powers.slots.auras).toEqual([LIGHTNING, RAVENS])
    expect(sync).toHaveBeenCalledTimes(5)
    // 안 가진 힘·끼우지 않은 칸·이미 끼운 힘으로는 바꾸지 않는다
    expect(relics.swapPower(STORM, MASK)).toBe(false)
    expect(relics.swapPower(MJOLNIR, STORM)).toBe(false)
    expect(relics.swapPower(LIGHTNING, RAVENS)).toBe(false)
    expect(relics.swapPower(LIGHTNING, weaponId('thor'))).toBe(false)
  })

  it('칸에서 뺀 유물 힘은 쉰다: 떠 있던 연출을 걷고 효과를 버린다. 다시 끼우면 새로 돈다 (분신이 그 자리에 굳지 않는다)', () => {
    const { powers, relics, own } = game()
    own(MASK, MJOLNIR, STORM)
    relics.slotPower(MASK)
    relics.slotPower(MJOLNIR)
    const mask = powers.effectOf('lokiMask')!
    const gone = vi.spyOn(mask, 'dispose')
    relics.unslotPower(MASK)
    expect(gone).toHaveBeenCalledTimes(1)
    expect(powers.effectOf('lokiMask')).toBeNull()
    expect(powers.awake('lokiMask')).toBe(false)
    // 칸에 남은 유물은 그대로
    expect(powers.effectOf('mjolnir')).not.toBeNull()
    relics.slotPower(MASK)
    expect(powers.effectOf('lokiMask')).not.toBeNull()
    expect(powers.effectOf('lokiMask')).not.toBe(mask)
    // 바꾸기로 빠져도 쉰다
    const again = vi.spyOn(powers.effectOf('lokiMask')!, 'dispose')
    relics.swapPower(MASK, STORM)
    expect(again).toHaveBeenCalledTimes(1)
    expect(powers.effectOf('lokiMask')).toBeNull()
  })
})
