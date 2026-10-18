import { describe, expect, it } from 'vitest'

import { ATTACK_STYLES, type AttackStyle, STYLES, styleSignature } from '../src/combat/styles'
import { DATA } from '../src/data'
import { HeroController } from '../src/game/HeroController'
import { type CombatTarget, PlayerCombat, swingTargets } from '../src/game/PlayerCombat'
import { buildHeroModel, type HeroRig } from '../src/world/heroModel'
import { NavGrid } from '../src/world/navGrid'

const DEG = Math.PI / 180

function dummy(x: number, z: number, name = ''): CombatTarget & { name: string; hits: number[] } {
  const hits: number[] = []
  return {
    name,
    x,
    z,
    radius: 0.5,
    alive: true,
    hits,
    takeHit: (damage) => {
      hits.push(damage)
      return damage
    },
  }
}

/** 자세를 숫자 목록으로 (팔·몸의 회전과 몸 높이) */
function poseVector(rig: HeroRig): number[] {
  const { body, leftArm, rightArm } = rig
  return [body.rotation.x, body.rotation.y, body.position.y, leftArm.rotation.x, leftArm.rotation.z, rightArm.rotation.x, rightArm.rotation.z]
}

function posed(style: AttackStyle, index: number, wind: number, strike: number, settle: number): number[] {
  const rig = buildHeroModel()
  STYLES[style].pose(rig, { index, last: index === 2, wind, strike, settle })
  return poseVector(rig)
}

describe('공격 모션 (E6-10): 숫자', () => {
  it.each(ATTACK_STYLES)('%s: 3연타이고, 시간·판정 시점·피해·사거리가 올바르며 마지막 타가 가장 세다', (style) => {
    const combo = STYLES[style].combo
    expect(combo.length).toBe(3)
    for (const swing of combo) {
      expect(swing.duration).toBeGreaterThan(0.15)
      expect(swing.hitTime).toBeGreaterThan(0)
      expect(swing.hitTime).toBeLessThan(swing.duration)
      expect(swing.damage).toBeGreaterThan(0)
      expect(swing.range).toBeGreaterThan(1)
      if (swing.shape === 'line' || swing.shape === 'burst') expect(swing.width).toBeGreaterThan(0)
    }
    const [a, b, last] = combo
    expect(last!.damage).toBeGreaterThan(a!.damage)
    expect(last!.damage).toBeGreaterThan(b!.damage)
    expect(STYLES[style].name.length).toBeGreaterThan(0)
  })

  it('스타일마다 판정 모양·사거리·빠르기가 모두 다르다 (같은 공격을 이름만 바꿔 쓰지 않는다)', () => {
    const signatures = ATTACK_STYLES.map(styleSignature)
    expect(new Set(signatures).size).toBe(ATTACK_STYLES.length)
  })

  it('초당 피해는 스타일끼리 크게 벌어지지 않는다 (맨손 검의 0.6~1.6배)', () => {
    const dps = (style: AttackStyle) => {
      const combo = STYLES[style].combo
      return combo.reduce((s, c) => s + c.damage * (c.shots ?? 1), 0) / combo.reduce((s, c) => s + c.duration, 0)
    }
    const base = dps('blade')
    for (const style of ATTACK_STYLES) {
      expect(dps(style) / base, style).toBeGreaterThan(0.6)
      expect(dps(style) / base, style).toBeLessThan(1.6)
    }
  })
})

describe('공격 모션: 판정 모양별로 맞는 적', () => {
  // 주인공은 원점에서 +z(앞)를 본다
  const front = dummy(0, 2, 'front')
  const back = dummy(0, -2, 'back')
  const side = dummy(2.2, 0, 'side')
  const far = dummy(0, 4.2, 'far')
  const all = [front, back, side, far]
  const names = (list: CombatTarget[]) => list.map((t) => (t as { name: string }).name).sort()

  it('부채꼴: 앞만, 뒤와 먼 적은 아니다', () => {
    expect(names(swingTargets({ duration: 0.3, hitTime: 0.1, damage: 1, range: 2.4, halfAngle: 55 * DEG, knockback: 0, lunge: 0 }, 0, 0, 0, all))).toEqual(['front'])
  })

  it('둘레: 사거리 안이면 앞뒤옆 모두', () => {
    expect(names(swingTargets({ duration: 0.3, hitTime: 0.1, damage: 1, range: 2.4, halfAngle: 0, knockback: 0, lunge: 0, shape: 'ring' }, 0, 0, 0, all))).toEqual(['back', 'front', 'side'])
  })

  it('직선: 앞으로 멀리까지 닿지만 옆은 닿지 않는다', () => {
    expect(names(swingTargets({ duration: 0.3, hitTime: 0.1, damage: 1, range: 4.4, halfAngle: 0, knockback: 0, lunge: 0, shape: 'line', width: 0.6 }, 0, 0, 0, all))).toEqual(['far', 'front'])
  })

  it('앞쪽 폭발: 사거리 끝 둘레만 맞고 바로 옆은 아니다', () => {
    const hit = swingTargets({ duration: 0.3, hitTime: 0.1, damage: 1, range: 5, halfAngle: 0, knockback: 0, lunge: 0, shape: 'burst', width: 1.2 }, 0, 0, 0, all)
    expect(names(hit)).toEqual(['far'])
  })

  it('원거리: 가장 가까운 적 하나, 지정한 대상이 있으면 그 적, 여러 발이면 가까운 순, 튀는 피해는 둘레까지', () => {
    const shot = { duration: 0.4, hitTime: 0.2, damage: 1, range: 7, halfAngle: 0, knockback: 0, lunge: 0, shape: 'shot' as const }
    expect(names(swingTargets(shot, 0, 0, 0, all))).toEqual(['front'])
    expect(names(swingTargets(shot, 0, 0, 0, all, far))).toEqual(['far'])
    expect(names(swingTargets({ ...shot, shots: 2 }, 0, 0, 0, all))).toEqual(['far', 'front'])
    // 뒤에 있는 적에게는 쏘지 않는다
    expect(names(swingTargets(shot, 0, 0, 0, [back]))).toEqual([])
    const near = dummy(0.6, 4.4, 'near')
    expect(names(swingTargets({ ...shot, splash: 1 }, 0, 0, 0, [far, near], far))).toEqual(['far', 'near'])
  })

  it('쓰러진 적은 맞지 않는다', () => {
    const dead = { ...dummy(0, 2), alive: false }
    expect(swingTargets(STYLES.blade.combo[0]!, 0, 0, 0, [dead])).toEqual([])
  })
})

describe('공격 모션: 몸 동작', () => {
  it.each(ATTACK_STYLES)('%s: 휘두르는 동안 자세가 바뀌고 숫자가 올바르다', (style) => {
    for (const index of [0, 1, 2]) {
      const rest = posed(style, index, 0, 0, 0)
      const windUp = posed(style, index, 1, 0, 0)
      const hit = posed(style, index, 1, 1, 0)
      for (const v of [...windUp, ...hit]) expect(Number.isFinite(v)).toBe(true)
      // 젖힌 자세나 휘두른 자세 가운데 하나는 처음과 다르다
      const moved = windUp.some((v, i) => Math.abs(v - rest[i]!) > 0.1) || hit.some((v, i) => Math.abs(v - rest[i]!) > 0.1)
      expect(moved, `${style} ${index}타`).toBe(true)
    }
  })

  it.each(ATTACK_STYLES)('%s: 마지막 타는 앞의 두 타와 다른 동작이다', (style) => {
    const last = posed(style, 2, 1, 0.5, 0)
    const first = posed(style, 0, 1, 0.5, 0)
    expect(last.some((v, i) => Math.abs(v - first[i]!) > 0.1)).toBe(true)
  })

  it('스타일끼리 같은 순간의 자세가 서로 다르다 (마지막 타를 젖힌 순간)', () => {
    const vectors = ATTACK_STYLES.map((s) => posed(s, 2, 1, 0.3, 0).map((v) => v.toFixed(2)).join(','))
    expect(new Set(vectors).size).toBe(ATTACK_STYLES.length)
  })
})

describe('공격 모션: 전투에 붙이기', () => {
  const setup = () => {
    const hero = new HeroController(buildHeroModel(), new NavGrid(20, 0.5, [], 0.4), () => [], 20)
    return { hero, combat: new PlayerCombat(hero) }
  }

  it('활로 바꾸면 멀리서부터 공격을 시작하고, 휘두르던 콤보는 끊긴다', () => {
    const { combat } = setup()
    const target = dummy(0, 6)
    expect(combat.reachTo(target)).toBeLessThan(3)
    combat.setStyle('bow')
    expect(combat.reachTo(target)).toBeGreaterThan(7)
    expect(combat.combo.swinging).toBe(false)
  })

  it('활: 멈춰 서면 멀리 있는 적을 맞히고, 날아가는 연출을 부른다', () => {
    const { combat } = setup()
    combat.setStyle('bow')
    const target = dummy(0, 6)
    const shots: CombatTarget[] = []
    for (let i = 0; i < 90; i++) combat.update(1 / 60, [target], { onSwing: () => {}, onHits: () => {}, onShot: (t) => shots.push(t) })
    expect(target.hits.length).toBeGreaterThan(0)
    expect(shots).toContain(target)
  })

  it('망치: 마지막 타가 뒤에 있는 적까지 둘레로 맞힌다', () => {
    const { combat, hero } = setup()
    combat.setStyle('hammer')
    const front = dummy(0, 1.5)
    const behind = dummy(0, -1.5)
    hero.face(0)
    for (let i = 0; i < 180; i++) combat.update(1 / 60, [front, behind], { onSwing: () => {}, onHits: () => {} })
    expect(front.hits.length).toBeGreaterThanOrEqual(3)
    expect(behind.hits.length).toBeGreaterThan(0)
  })

  it('지금 데이터의 신은 모두 공격 모션이 있고, 처음 세 클래스는 서로 다르다', () => {
    for (const god of Object.values(DATA.gods)) expect(ATTACK_STYLES).toContain(god.attack)
    expect(new Set([DATA.gods.thor!.attack, DATA.gods.loki!.attack, DATA.gods.asura!.attack]).size).toBe(3)
  })
})
