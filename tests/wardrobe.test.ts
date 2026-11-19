import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { BODY_OPTIONS, type BodyLook, bodyKey, DEFAULT_BODY } from '../src/looks/body'
import { BASE_OUTFIT, type LookSlot, WARDROBE_SLOTS } from '../src/looks/catalog'
import { gearLookId } from '../src/looks/gearLooks'
import { autoOutfit, type LookChoice, Wardrobe } from '../src/looks/outfit'
import { godDef } from '../src/relics/data'
import { buildHeroModel } from '../src/world/heroModel'
import { dressDoll, isPinned, OPTIONAL, wardrobeChips } from '../src/ui/wardrobeChips'

/**
 * 신 탭 「외형」의 칩 줄 (E307 손 QA): 칩을 눌러 고른 뒤에도 칩의 차례와 자리가 그대로다.
 * 전에는 장비를 안 낀 부위에서 옷을 고르면 칩이 하나 늘며 뒤가 밀려, 같은 자리를 한 번 더 누르면 다른 옷이 골라졌다
 */
describe('외형 보관함의 칩 줄 (E307)', () => {
  const thor = godDef('thor')
  /** 토르를 깨운 직후의 보관함: 기본 옷과 두건, 토르의 옷·표식·망치 */
  const awake = (): Wardrobe => {
    const wardrobe = new Wardrobe()
    wardrobe.unlock([...Object.values(thor.looks), thor.mark, 'mjolnirHammer'])
    return wardrobe
  }
  /** 그 칸의 칩 줄 (지금 고른 것으로) */
  const row = (wardrobe: Wardrobe, slot: LookSlot, auto: string | null) => wardrobeChips(slot, auto, wardrobe.options(slot), wardrobe.choice(slot))
  const order = (chips: readonly { choice: LookChoice }[]) => chips.map((c) => c.choice)

  it.each([
    ['장비를 안 낀 부위 (새 판)', autoOutfit({ handWeapon: 'mjolnirHammer' })],
    ['장비를 낀 부위', autoOutfit({ gearLooks: [gearLookId('head', 0, 'common'), gearLookId('body', 0, 'common'), gearLookId('hands', 0, 'common'), gearLookId('feet', 0, 'common')], handWeapon: 'mjolnirHammer' })],
    ['맨손 (낡은 검)', autoOutfit({})],
  ] as const)('%s: 어느 칩을 골라도 칩의 차례와 개수가 그대로다', (_name, auto) => {
    for (const slot of WARDROBE_SLOTS) {
      const wardrobe = awake()
      const before = order(row(wardrobe, slot, auto[slot]))
      expect(before[0], slot).toBe('auto')
      expect(new Set(before).size, slot).toBe(before.length)
      for (const choice of before) {
        expect(wardrobe.choose(slot, choice), `${slot} ${choice}`).toBe(true)
        const chips = row(wardrobe, slot, auto[slot])
        expect(order(chips), `${slot}에서 ${choice}를 고른 뒤`).toEqual(before)
        // 켜진 칩은 방금 고른 그 칩 하나
        expect(chips.filter((c) => c.on).map((c) => c.choice), `${slot} ${choice}`).toEqual([choice])
      }
    }
  })

  it('같은 자리를 두 번 눌러도 같은 옷이다: 「털 어깨 전투복」을 고른 뒤 그 자리의 칩은 여전히 「털 어깨 전투복」', () => {
    const wardrobe = awake()
    const auto = autoOutfit({ handWeapon: 'mjolnirHammer' })
    for (const slot of ['head', 'torso'] as const) {
      const look = thor.looks[slot]!
      const at = order(row(wardrobe, slot, auto[slot])).indexOf(look)
      expect(at, slot).toBeGreaterThan(0)
      wardrobe.choose(slot, look)
      // 둘째 누름: 같은 자리의 칩을 다시 고른다
      const again = row(wardrobe, slot, auto[slot])[at]!
      expect(again.choice, slot).toBe(look)
      wardrobe.choose(slot, again.choice)
      expect(wardrobe.dress(auto)[slot], slot).toBe(look)
    }
  })

  it('맨 앞 칩은 장착을 따른다: 자동이 입히는 외형의 이름을 달고, 그 외형의 칩을 따로 두지 않는다', () => {
    const wardrobe = awake()
    const chips = row(wardrobe, 'torso', BASE_OUTFIT.torso)
    expect(chips[0]).toEqual({ choice: 'auto', kind: 'auto', look: 'adventurerTunic', on: true })
    expect(order(chips)).toEqual(['auto', thor.looks.torso])
    // 장비를 끼면 자동은 그 장비의 모습이고, 기본 옷은 고를 수 있는 칩으로 나온다
    const armor = gearLookId('body', 0, 'common')
    const worn = row(wardrobe, 'torso', armor)
    expect(worn[0]).toMatchObject({ choice: 'auto', look: armor, on: true })
    expect(order(worn)).toEqual(['auto', 'adventurerTunic', thor.looks.torso])
  })

  it('장비를 낀 채 골라 둔 기본 옷이 장비를 벗어 자동과 같아지면 맨 앞 칩이 켜진 것으로 보인다 (켜진 칩이 없는 줄은 없다)', () => {
    const wardrobe = awake()
    wardrobe.choose('torso', 'adventurerTunic')
    const armor = gearLookId('body', 0, 'common')
    expect(row(wardrobe, 'torso', armor).filter((c) => c.on).map((c) => c.choice)).toEqual(['adventurerTunic'])
    expect(isPinned('torso', armor, wardrobe.choice('torso'))).toBe(true)
    const bare = row(wardrobe, 'torso', BASE_OUTFIT.torso)
    expect(bare.filter((c) => c.on).map((c) => c.choice)).toEqual(['auto'])
    expect(isPinned('torso', BASE_OUTFIT.torso, wardrobe.choice('torso'))).toBe(false)
  })

  it('고르지 않으면 비는 칸(얼굴·허리·등·표식)은 맨 앞이 「비우기」 하나: 옛 저장의 「비우기」도 그 칩이 켜진다', () => {
    for (const slot of OPTIONAL) {
      const wardrobe = awake()
      expect(row(wardrobe, slot, null)[0], slot).toEqual({ choice: 'auto', kind: 'none', look: null, on: true })
      wardrobe.choose(slot, null)
      const chips = row(wardrobe, slot, null)
      expect(chips.filter((c) => c.on).map((c) => c.choice), slot).toEqual(['auto'])
      expect(isPinned(slot, null, wardrobe.choice(slot)), slot).toBe(false)
    }
    // 표식은 깨운 신의 것 가운데 고른다
    const wardrobe = awake()
    expect(order(row(wardrobe, 'mark', null))).toEqual(['auto', thor.mark])
    wardrobe.choose('mark', thor.mark)
    expect(isPinned('mark', null, wardrobe.choice('mark'))).toBe(true)
  })
})

/**
 * 신 탭 「외형」의 미리 보기 인형 (E307 손 QA): 캐릭터 만들기에서 붉은 머리를 골랐는데 미리 보기만 기본 갈색 머리였다.
 * 게임 속 주인공·초상과 같은 기본 모습(피부·머리카락·옷 색)으로 칠한다
 */
describe('외형 보관함의 미리 보기 인형 (E307)', () => {
  /** 머리 모델에 그 색(바탕색)의 꼭짓점이 있나 */
  const painted = (rig: ReturnType<typeof buildHeroModel>, hex: number): boolean => {
    const want = new THREE.Color(hex)
    let found = false
    rig.head.traverse((o) => {
      const colors = (o as THREE.Mesh).geometry?.getAttribute('color')
      if (!colors) return
      for (let i = 0; i < colors.count && !found; i++) {
        found = Math.abs(colors.getX(i) - want.r) < 0.004 && Math.abs(colors.getY(i) - want.g) < 0.004 && Math.abs(colors.getZ(i) - want.b) < 0.004
      }
    })
    return found
  }
  const [BROWN] = BODY_OPTIONS.hair[0]
  const [RED] = BODY_OPTIONS.hair[3]

  it('고른 머리카락 색으로 칠한다: 붉은 머리를 고른 사람의 인형은 갈색 머리가 아니다', () => {
    const rig = buildHeroModel()
    // 기본 모습은 맨머리다 (머리카락이 보인다)
    expect(BASE_OUTFIT.head).toBe('adventurerHair')
    const body: BodyLook = { skin: 0, hair: 3, cloth: 1 }
    // 고치기 전: 입히기만 했다
    rig.wear(BASE_OUTFIT)
    expect(painted(rig, BROWN)).toBe(true)
    expect(painted(rig, RED)).toBe(false)
    const key = dressDoll(rig, body, BASE_OUTFIT, bodyKey(DEFAULT_BODY))
    expect(key).toBe(bodyKey(body))
    expect(painted(rig, RED)).toBe(true)
    expect(painted(rig, BROWN)).toBe(false)
    expect(rig.outfit.head).toBe('adventurerHair')
  })

  it('기본 모습은 바뀌었을 때만 다시 칠하고, 입히기는 늘 한다', () => {
    const calls: string[] = []
    const doll = { wear: () => calls.push('wear'), setBody: (body: BodyLook) => calls.push(`body ${bodyKey(body)}`) }
    const red: BodyLook = { skin: 0, hair: 3, cloth: 1 }
    // 기본 색으로 만들어진 인형에 기본 모습: 칠하지 않는다
    let key = dressDoll(doll, DEFAULT_BODY, BASE_OUTFIT, bodyKey(DEFAULT_BODY))
    expect(calls).toEqual(['wear'])
    // 붉은 머리: 한 번 칠하고, 다시 그릴 때는 입히기만
    key = dressDoll(doll, red, BASE_OUTFIT, key)
    key = dressDoll(doll, red, BASE_OUTFIT, key)
    expect(calls).toEqual(['wear', 'body 031', 'wear', 'wear'])
    // 칠한 뒤에 입힌다 (칠하면 입은 것을 모두 다시 만든다)
    expect(calls.indexOf('body 031')).toBeLessThan(calls.lastIndexOf('wear'))
    expect(key).toBe('031')
  })
})
