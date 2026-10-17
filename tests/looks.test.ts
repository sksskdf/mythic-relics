import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { BASE_OUTFIT, LOOK_IDS, lookDef } from '../src/looks/catalog'
import { autoOutfit, Wardrobe } from '../src/looks/outfit'
import { godDef, relicDef } from '../src/relics/data'
import { LOOK_MODELS } from '../src/voxel/models/looks'
import { buildHeroModel } from '../src/world/heroModel'

const looksOf = (...relics: string[]) => relics.map((id) => relicDef(id).look)

/** 칸에 붙은 외형 메시 수 (실루엣 등 자식 메시는 빼고 관절 바로 아래만) */
function meshes(group: THREE.Object3D): THREE.Mesh[] {
  return group.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh)
}

describe('외형 목록', () => {
  it('기운(aura) 칸을 빼면 모든 외형에 복셀 모델이 있다', () => {
    for (const id of LOOK_IDS) {
      if (lookDef(id).slot === 'aura') continue
      expect(LOOK_MODELS[id], id).toBeTypeOf('function')
    }
  })

  it('처음 모습은 토르를 떠올리지 않는 모험가다 (뿔·날개 투구, 붉은 망토 없음)', () => {
    expect(BASE_OUTFIT.head).toBe('adventurerHood')
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
