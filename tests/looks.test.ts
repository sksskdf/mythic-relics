import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { BASE_OUTFIT, LOOK_IDS, lookDef } from '../src/looks/catalog'
import { GEAR_LOOKS, gearLook, parseGearLook } from '../src/looks/gearLooks'
import { autoOutfit, earnedLooks, Wardrobe } from '../src/looks/outfit'
import { GEAR } from '../src/gear/roll'
import { GRADES } from '../src/data/gearData'
import { godDef, GODS, relicDef } from '../src/relics/data'
import { LOOK_MODELS } from '../src/voxel/models/looks'
import { buildHeroModel } from '../src/world/heroModel'
import { EventBus, type GameEvents } from '../src/game/events'
import { AppearanceSystem } from '../src/game/systems/Appearance'

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

describe('장착에 따른 모습 (E307: 신을 깨워도 내 모습 그대로, 무기만 손의 신을 따른다)', () => {
  it('손에 쥔 신의 무기만 바뀌고 나머지 칸은 기본 모습 그대로다', () => {
    const outfit = autoOutfit({ handWeapon: 'mjolnirHammer' })
    expect(outfit.weapon).toBe('mjolnirHammer')
    expect({ ...outfit, weapon: BASE_OUTFIT.weapon }).toEqual(BASE_OUTFIT)
    // 손이 비면(낡은 검) 기본 모습
    expect(autoOutfit({ handWeapon: null })).toEqual(BASE_OUTFIT)
    expect(autoOutfit({})).toEqual(BASE_OUTFIT)
  })

  it('깨운 신의 옷·표식과 켠 유물의 외형은 보관함에 풀릴 뿐 입혀지지 않는다', () => {
    const thor = godDef('thor')
    const earned = earnedLooks({ relicLooks: looksOf('mjolnir'), gods: [thor] })
    expect(earned).toEqual(expect.arrayContaining(['mjolnirHammer', 'thorHelm', 'thorTunic', 'thorCape', 'thorStormHalo']))
    const wardrobe = new Wardrobe()
    wardrobe.unlock(earned)
    // 풀리기만 해서는 그대로: 머리카락이 보이고 망토·표식이 없다
    const dressed = wardrobe.dress(autoOutfit({ handWeapon: 'mjolnirHammer' }))
    expect(dressed.head).toBe('adventurerHair')
    expect(dressed.torso).toBe('adventurerTunic')
    expect(dressed.cape).toBeNull()
    expect(dressed.mark).toBeNull()
    // 부위마다 직접 고르면 입는다
    for (const [slot, id] of Object.entries(thor.looks)) expect(wardrobe.choose(slot as keyof typeof thor.looks, id), slot).toBe(true)
    const chosen = wardrobe.dress(autoOutfit({ handWeapon: 'mjolnirHammer' }))
    expect(chosen.head).toBe('thorHelm')
    expect(chosen.cape).toBe('thorCape')
  })
})

describe('외형 시스템 (E307: 신을 깨워도 주인공은 그대로)', () => {
  /** 게임 없이 외형 시스템만 세운다: 손의 신·켠 유물·깨운 신을 바꿔 가며 본다 */
  function setup() {
    const bus = new EventBus<GameEvents>()
    const state = { hand: null as string | null, lit: [] as string[], opened: [] as string[], levels: {} as Record<string, number> }
    const ctx = {
      bus,
      wardrobe: new Wardrobe(),
      hero: { rig: buildHeroModel() },
      powers: { loadout: { slots: [] as (string | null)[], gear: new Map(), get relics() { return state.lit } } },
      build: { get chosen() { return state.hand } },
      progress: { get opened() { return state.opened }, level: (god: string) => state.levels[god] ?? 0 },
    }
    const system = new AppearanceSystem(ctx as never)
    const change = () => bus.emit('loadoutChanged', { change: {} as never, announce: false })
    return { ctx, state, system, change, bus }
  }

  it('첫 신이 깨어나 세 자리에 들어도 머리·옷·망토·표식은 그대로고, 손의 무기만 바뀐다', () => {
    const { ctx, state, change } = setup()
    expect(ctx.hero.rig.outfit).toEqual(BASE_OUTFIT)
    // 조각 2: 묠니르를 쥔다
    state.hand = 'thor'
    state.lit = ['mjolnir']
    change()
    expect(ctx.hero.rig.outfit).toEqual({ ...BASE_OUTFIT, weapon: 'mjolnirHammer' })
    // 수호자 뒤: 토르가 깨어난다
    state.opened = ['thor']
    state.levels.thor = 1
    change()
    expect(ctx.hero.rig.outfit).toEqual({ ...BASE_OUTFIT, weapon: 'mjolnirHammer' })
    // 그 신의 옷과 표식은 보관함에 풀렸다
    for (const id of [...Object.values(godDef('thor').looks), godDef('thor').mark]) expect(ctx.wardrobe.unlocked.has(id), id).toBe(true)
  })

  it('신 스물하나 누구를 깨워 손에 쥐어도 무기 말고는 기본 모습이다 (얼굴·허리·손 유물도 저절로 붙지 않는다)', () => {
    for (const id of Object.keys(GODS)) {
      const { ctx, state, change } = setup()
      state.hand = id
      state.lit = [godDef(id).relic]
      state.opened = [id]
      state.levels[id] = 3
      change()
      expect({ ...ctx.hero.rig.outfit, weapon: null }, id).toEqual({ ...BASE_OUTFIT, weapon: null })
      // 유물의 외형도 보관함에는 풀린다
      expect(ctx.wardrobe.unlocked.has(relicDef(godDef(id).relic).look), id).toBe(true)
    }
  })

  it('보관함에서 고르면 입혀진다: 깨운 신의 옷은 부위마다, 표식도', () => {
    const { ctx, state, system, change } = setup()
    state.hand = 'thor'
    state.opened = ['thor', 'odin']
    state.levels = { thor: 2, odin: 1 }
    change()
    system.choose('head', 'thorHelm')
    system.choose('cape', 'odinCape')
    system.choose('mark', 'odinRavens')
    expect(ctx.hero.rig.outfit).toMatchObject({ head: 'thorHelm', cape: 'odinCape', mark: 'odinRavens', torso: 'adventurerTunic', weapon: 'mjolnirHammer' })
    // 손을 바꿔도 고른 옷은 남는다
    state.hand = 'odin'
    change()
    expect(ctx.hero.rig.outfit).toMatchObject({ head: 'thorHelm', cape: 'odinCape', mark: 'odinRavens', weapon: 'odinGungnir' })
    // 깨우지 않은 신의 옷은 고를 수 없다
    system.choose('head', 'zeusLaurel')
    expect(ctx.hero.rig.outfit.head).toBe('thorHelm')
  })

  it('자리에 들지 못한 신도 깨어나면(mythOpened) 옷이 풀리고, 새 외형을 알린다', () => {
    const { ctx, state, bus } = setup()
    const told: string[] = []
    bus.on('looksUnlocked', ({ ids }) => told.push(...ids))
    state.opened = ['zeus']
    state.levels.zeus = 1
    bus.emit('mythOpened', { god: 'zeus', quiet: true })
    expect(told).toEqual(expect.arrayContaining(['zeusLaurel', 'zeusRobe', 'zeusCape', 'zeusWings']))
    expect(ctx.hero.rig.outfit).toEqual(BASE_OUTFIT)
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

  it('낀 장비는 기본 모습을 덮고, 손에 쥔 신의 무기가 장비 무기 위에 온다. 장신구는 몸에 보이지 않는다', () => {
    const helm = gearLook({ part: 'head', base: '철 투구', grade: 'rare' })!
    const sword = gearLook({ part: 'weapon', base: '도끼', grade: 'good' })!
    expect(gearLook({ part: 'trinket', base: '부적', grade: 'hero' })).toBeNull()
    const plain = autoOutfit({ gearLooks: [helm, sword] })
    expect(plain.head).toBe(helm)
    expect(plain.weapon).toBe(sword)
    // 신을 손에 쥐어도 낀 투구는 그대로 (E307: 신의 투구가 덮지 않는다)
    const thor = autoOutfit({ gearLooks: [helm, sword], handWeapon: 'mjolnirHammer' })
    expect(thor.head).toBe(helm)
    expect(thor.weapon).toBe('mjolnirHammer')
  })
})

describe('외형 보관함', () => {
  it('고른 외형은 장착이 바뀌어도 유지되고, "자동"이면 장착을 따른다', () => {
    const wardrobe = new Wardrobe()
    wardrobe.unlock(['mjolnirHammer', 'thorCape'])
    expect(wardrobe.choose('weapon', 'shortSword')).toBe(true)
    expect(wardrobe.choose('cape', 'thorCape')).toBe(true)
    const withHammer = autoOutfit({ handWeapon: 'mjolnirHammer' })
    expect(wardrobe.dress(withHammer).weapon).toBe('shortSword')
    expect(wardrobe.dress(withHammer).cape).toBe('thorCape')
    expect(wardrobe.dress(autoOutfit({})).cape).toBe('thorCape')
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

  it('표식도 얻은 것 가운데 고른다. 고르지 않으면 없다 (E307)', () => {
    const wardrobe = new Wardrobe()
    expect(wardrobe.choose('mark', 'thorStormHalo')).toBe(false)
    wardrobe.unlock(['thorStormHalo', 'odinRavens'])
    expect(wardrobe.dress(BASE_OUTFIT).mark).toBeNull()
    expect(wardrobe.choose('mark', 'odinRavens')).toBe(true)
    expect(wardrobe.dress(BASE_OUTFIT).mark).toBe('odinRavens')
    expect(wardrobe.options('mark')).toEqual(['thorStormHalo', 'odinRavens'])
    wardrobe.choose('mark', 'auto')
    expect(wardrobe.dress(BASE_OUTFIT).mark).toBeNull()
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
