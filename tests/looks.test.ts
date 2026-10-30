import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { BASE_OUTFIT, LOOK_IDS, lookDef } from '../src/looks/catalog'
import { GEAR_LOOKS, gearLook, parseGearLook } from '../src/looks/gearLooks'
import { autoOutfit, Wardrobe } from '../src/looks/outfit'
import { GEAR } from '../src/gear/roll'
import { GRADES } from '../src/data/gearData'
import { godDef, relicDef } from '../src/relics/data'
import { LOOK_MODELS } from '../src/voxel/models/looks'
import { buildHeroModel } from '../src/world/heroModel'

const looksOf = (...relics: string[]) => relics.map((id) => relicDef(id).look)

/** 칸에 붙은 외형 메시 수 (실루엣 등 자식 메시는 빼고 관절 바로 아래만) */
function meshes(group: THREE.Object3D): THREE.Mesh[] {
  return group.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh)
}

describe('외형 목록', () => {
  it('모든 외형에 복셀 모델이 있다', () => {
    for (const id of LOOK_IDS) expect(LOOK_MODELS[id], id).toBeTypeOf('function')
  })

  it('표식은 기운 연출을 함께 가진다', () => {
    for (const id of LOOK_IDS) if (lookDef(id).slot === 'mark') expect(lookDef(id).aura, id).toBeDefined()
  })

  it('처음 모습은 토르를 떠올리지 않는 모험가다 (쓰개 없이 머리카락, 붉은 망토 없음)', () => {
    expect(BASE_OUTFIT.head).toBe('adventurerHair')
    expect(BASE_OUTFIT.cape).toBeNull()
    expect(BASE_OUTFIT.weapon).toBe('shortSword')
  })
})

describe('장착에 따른 모습 (기본 < 유물 < 발현)', () => {
  it('유물을 끼면 그 유물의 칸만 바뀐다', () => {
    const outfit = autoOutfit({ relicLooks: looksOf('mjolnir'), manifestLooks: {} })
    expect(outfit.weapon).toBe('mjolnirHammer')
    expect({ ...outfit, weapon: BASE_OUTFIT.weapon }).toEqual(BASE_OUTFIT)
    const two = autoOutfit({ relicLooks: looksOf('mjolnir', 'megingjord'), manifestLooks: {} })
    expect(two.waist).toBe('megingjordBelt')
  })

  it('발현하면 발현 외형이 유물·기본 외형보다 앞선다. 발현이 정하지 않은 칸의 유물 외형은 그대로 보인다', () => {
    const outfit = autoOutfit({
      relicLooks: looksOf('mjolnir', 'megingjord', 'jarngreipr'),
      manifestLooks: { ...godDef('thor').looks, weapon: 'shortSword' },
    })
    expect(outfit.head).toBe('thorHelm')
    expect(outfit.cape).toBe('thorCape')
    expect(outfit.weapon).toBe('shortSword')
    expect(outfit.arms).toBe('ironGauntlets')
  })
})

describe('일반 장비 외형 (E18-04-5)', () => {
  const size = (id: string) => {
    const g = LOOK_MODELS[id]!()
    return [g.sizeX, g.sizeY, g.sizeZ].join('×')
  }
  const occupancy = (id: string) => {
    const g = LOOK_MODELS[id]!()
    return `${g.sizeX}×${g.sizeY}×${g.sizeZ}:${Array.from(g.cells, (c) => (c ? 1 : 0)).join('')}`
  }

  it('부위·바탕·등급마다 외형이 있고, 머리·발은 그 칸의 기본 외형과 격자 크기가 같다 (원점이 정해져 있다. 몸·손은 가운데 원점이라 더 넓어도 된다)', () => {
    const parts = ['weapon', 'head', 'body', 'hands', 'feet'] as const
    expect(GEAR_LOOKS.length).toBe(parts.reduce((n, p) => n + GEAR.parts[p].bases.length, 0) * GRADES.length)
    for (const look of GEAR_LOOKS) {
      expect(LOOK_MODELS[look.id], look.id).toBeTypeOf('function')
      expect(parseGearLook(look.id), look.id).not.toBeNull()
      const slot = lookDef(look.id).slot
      if (slot === 'head' || slot === 'legs') expect(size(look.id), look.id).toBe(size(BASE_OUTFIT[slot]!))
    }
  })

  it('같은 부위의 바탕끼리는 실루엣이 다르고, 등급이 오르면 모양은 두고 장식만 더한다 (E24-06)', () => {
    const cells = (id: string) => {
      const g = LOOK_MODELS[id]!()
      return { size: `${g.sizeX}×${g.sizeY}×${g.sizeZ}`, filled: Array.from(g.cells, (c) => c > 0) }
    }
    for (const part of ['weapon', 'head', 'body', 'hands', 'feet'] as const) {
      const bases = GEAR.parts[part].bases.map((_, i) => occupancy(`gear-${part}-${i}-common`))
      expect(new Set(bases).size, part).toBe(bases.length)
      GEAR.parts[part].bases.forEach((_, i) => {
        const steps = (['common', 'good', 'rare', 'hero'] as const).map((grade) => cells(`gear-${part}-${i}-${grade}`))
        for (let k = 1; k < steps.length; k++) {
          const [lower, upper] = [steps[k - 1]!, steps[k]!]
          expect(upper.size, `${part}-${i}`).toBe(lower.size)
          // 낮은 등급에 있던 칸은 모두 그대로 있고, 영웅은 보통보다 칸이 많다
          expect(lower.filled.every((f, n) => !f || upper.filled[n]), `${part}-${i} ${k}`).toBe(true)
        }
        expect(steps[3]!.filled.filter(Boolean).length, `${part}-${i}`).toBeGreaterThan(steps[0]!.filled.filter(Boolean).length)
      })
    }
  })

  it('낀 장비는 기본 모습만 덮고, 유물·신화 외형이 그 위에 온다. 장신구는 몸에 보이지 않는다', () => {
    const helm = gearLook({ part: 'head', base: '철 투구', grade: 'rare' })!
    const sword = gearLook({ part: 'weapon', base: '도끼', grade: 'good' })!
    expect(gearLook({ part: 'trinket', base: '부적', grade: 'hero' })).toBeNull()
    const plain = autoOutfit({ gearLooks: [helm, sword], relicLooks: [], manifestLooks: {} })
    expect(plain.head).toBe(helm)
    expect(plain.weapon).toBe(sword)
    const thor = autoOutfit({ gearLooks: [helm, sword], relicLooks: looksOf('mjolnir'), manifestLooks: godDef('thor').looks })
    expect(thor.head).toBe('thorHelm')
    expect(thor.weapon).toBe('mjolnirHammer')
  })
})

describe('외형 보관함', () => {
  it('고른 외형은 장착이 바뀌어도 유지되고, "자동"이면 장착을 따른다', () => {
    const wardrobe = new Wardrobe()
    wardrobe.unlock(['mjolnirHammer', 'thorCape'])
    expect(wardrobe.choose('weapon', 'shortSword')).toBe(true)
    expect(wardrobe.choose('cape', 'thorCape')).toBe(true)
    const withHammer = autoOutfit({ relicLooks: looksOf('mjolnir'), manifestLooks: {} })
    expect(wardrobe.dress(withHammer).weapon).toBe('shortSword')
    expect(wardrobe.dress(withHammer).cape).toBe('thorCape')
    expect(wardrobe.dress(autoOutfit({ relicLooks: [], manifestLooks: {} })).cape).toBe('thorCape')
    wardrobe.choose('weapon', 'auto')
    expect(wardrobe.dress(withHammer).weapon).toBe('mjolnirHammer')
  })

  it('얻지 않은 외형이나 다른 칸의 외형은 고를 수 없고, 비우기(null)는 고를 수 있다', () => {
    const wardrobe = new Wardrobe()
    expect(wardrobe.choose('cape', 'thorCape')).toBe(false)
    wardrobe.unlock(['thorCape'])
    expect(wardrobe.choose('head', 'thorCape')).toBe(false)
    expect(wardrobe.choose('cape', null)).toBe(true)
    expect(wardrobe.dress(BASE_OUTFIT).cape).toBeNull()
  })

  it('새로 얻은 외형만 알려 준다', () => {
    const wardrobe = new Wardrobe()
    expect(wardrobe.unlock(['shortSword', 'mjolnirHammer'])).toEqual(['mjolnirHammer'])
    expect(wardrobe.unlock(['mjolnirHammer'])).toEqual([])
    expect(wardrobe.options('weapon')).toEqual(['shortSword', 'mjolnirHammer'])
  })
})

describe('주인공 모델', () => {
  it('외형을 바꿔 입으면 그 칸의 모델만 바뀐다. 팔·다리는 양쪽 다 바뀐다', () => {
    const rig = buildHeroModel()
    const sleeve = meshes(rig.leftArm)[0]!
    const head = meshes(rig.head)[0]!
    expect(meshes(rig.cape)).toHaveLength(0)
    rig.wear({ ...BASE_OUTFIT, arms: 'ironGauntlets', cape: 'thorCape' })
    expect(meshes(rig.leftArm)[0]).not.toBe(sleeve)
    expect(meshes(rig.rightArm)).toHaveLength(1)
    expect(meshes(rig.head)[0]).toBe(head)
    expect(meshes(rig.cape)).toHaveLength(1)
    expect(rig.outfit.arms).toBe('ironGauntlets')
    rig.wear(BASE_OUTFIT)
    expect(meshes(rig.cape)).toHaveLength(0)
  })

  it('무기를 바꿔도 무기 관절(오른손)은 그대로 팔에 붙어 있다', () => {
    const rig = buildHeroModel()
    rig.wear({ ...BASE_OUTFIT, weapon: 'mjolnirHammer', arms: 'ironGauntlets' })
    expect(rig.weapon.parent).toBe(rig.rightArm)
    expect(meshes(rig.weapon)).toHaveLength(1)
  })
})

describe('조사 붙이기', async () => {
  const { josa } = await import('../src/ui/josa')
  it('받침에 따라 으로/로, 을/를을 고른다', () => {
    expect(josa('토르', '으로')).toBe('토르로')
    expect(josa('천둥의 신', '으로')).toBe('천둥의 신으로')
    expect(josa('우트가르드 원정', '을')).toBe('우트가르드 원정을')
    expect(josa('천둥의 길', '으로')).toBe('천둥의 길로')
  })

  it('숫자는 끝자리를 읽은 소리로 고른다 (귀환 카드 「원정 2를 마친다」)', () => {
    expect(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map((n) => josa(`원정 ${n}`, '을').slice(-1))).toEqual(['을', '를', '을', '를', '를', '을', '을', '을', '를', '을'])
    expect(josa('깊이 7', '으로')).toBe('깊이 7로')
    expect(josa('깊이 3', '으로')).toBe('깊이 3으로')
    expect(josa('깊이 2', '이')).toBe('깊이 2가')
  })
})
