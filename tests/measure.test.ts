import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { Build } from '../src/build/Build'
import { layerProduct } from '../src/build/layers'
import { type BossFoe, BossWatch } from '../src/dev/bossWatch'
import { type DevParts, DevTools } from '../src/dev/DevTools'
import { Giant, type GiantWorld, GRUNT } from '../src/enemies/Giant'
import { RelicPowers } from '../src/game/RelicPowers'
import { ClassProgress } from '../src/myth/ClassProgress'
import { ExpeditionProgress } from '../src/progress/Expedition'
import { TrainingProgress } from '../src/progress/Training'
import { squareArea } from '../src/world/colliders'
import { NavGrid } from '../src/world/navGrid'

const nav = new NavGrid(20, 0.5, [], 0.75)

function makeWorld(hero: { x: number; z: number }): GiantWorld {
  return {
    hero: { ...hero, radius: 0.4, alive: true },
    nav,
    area: squareArea(20),
    staticColliders: [],
    giants: [],
    hitHero: () => {},
    impact: () => {},
    summon: () => {},
    effects: new THREE.Group(),
  }
}

/** 예고를 펼 때까지 돌린다 */
function untilWindup(giant: Giant, world: GiantWorld): void {
  for (let i = 0; i < 600 && giant.state !== 'windup'; i++) giant.update(1 / 60, world)
  expect(giant.state).toBe('windup')
}

describe('재는 자 (E307 0B): 맞는 적이 공격을 끝낸 비율', () => {
  it('끝까지 나간 공격은 시작과 끝을 함께 센다', () => {
    const giant = new Giant(GRUNT, { x: 0, z: 0 })
    const world = makeWorld({ x: 1.8, z: 0 })
    world.giants = [giant]
    untilWindup(giant, world)
    expect([giant.attacksBegun, giant.attacksStruck]).toEqual([1, 0])
    for (let t = 0; t < GRUNT.attacks[0]!.windup + 0.1; t += 1 / 60) giant.update(1 / 60, world)
    expect([giant.attacksBegun, giant.attacksStruck]).toEqual([1, 1])
  })

  it('휘청임 문턱 이상으로 맞아 끊긴 공격은 시작만 센다 (문턱은 땅 세기와 무관한 절대값)', () => {
    const giant = new Giant(GRUNT, { x: 0, z: 0 })
    // 땅 세기로 생명·피해가 열 배여도 문턱은 그대로다
    giant.applyThreat({ hp: 10, damage: 10 })
    const world = makeWorld({ x: 1.8, z: 0 })
    world.giants = [giant]
    untilWindup(giant, world)
    giant.takeHit(GRUNT.poise, 1, 0, 0)
    expect(giant.state).toBe('stagger')
    for (let t = 0; t < 0.3; t += 1 / 60) giant.update(1 / 60, world)
    expect([giant.attacksBegun, giant.attacksStruck]).toEqual([1, 0])
  })

  it('문턱 아래로 맞으면 공격이 끝까지 나간다', () => {
    const giant = new Giant(GRUNT, { x: 0, z: 0 })
    const world = makeWorld({ x: 1.8, z: 0 })
    world.giants = [giant]
    untilWindup(giant, world)
    giant.takeHit(GRUNT.poise - 1, 1, 0, 0)
    for (let t = 0; t < GRUNT.attacks[0]!.windup + 0.1; t += 1 / 60) giant.update(1 / 60, world)
    expect([giant.attacksBegun, giant.attacksStruck]).toEqual([1, 1])
  })
})

describe('재는 자 (E307 0B): 보스·수호자 싸움 재기', () => {
  const foe = (id: string, role: string, max: number): BossFoe => ({ spec: { id, role }, health: { hp: max, max, dead: false } })
  const hit = (f: BossFoe, damage: number) => {
    f.health.hp = Math.max(0, f.health.hp - damage)
    f.health.dead = f.health.hp <= 0
  }

  it('처음 때린 때와 쓰러진 때를 남기고, 졸개는 보지 않는다', () => {
    const watch = new BossWatch()
    const boss = foe('king', 'boss', 1000)
    const grunt = foe('grunt', 'brute', 80)
    watch.note(10, 'utgard', [boss, grunt])
    expect(watch.fights).toEqual([])
    hit(grunt, 50)
    hit(boss, 100)
    watch.note(12, 'utgard', [boss, grunt])
    hit(boss, 900)
    watch.note(40, 'utgard', [boss, grunt])
    expect(watch.fights).toEqual([{ id: 'king', role: 'boss', region: 'utgard', firstHit: 12, lastStart: 12, resets: 0, killed: 40 }])
  })

  it('생명이 가득 되차면 되찬 횟수를 세고 마지막 시도의 시작을 다시 적는다', () => {
    const watch = new BossWatch()
    const boss = foe('chimera', 'boss', 1000)
    hit(boss, 300)
    watch.note(100, 'lycia', [boss])
    // 집으로 돌아가 다 되채웠다
    boss.health.hp = 1000
    watch.note(130, 'lycia', [boss])
    watch.note(150, 'lycia', [boss])
    hit(boss, 200)
    watch.note(160, 'lycia', [boss])
    hit(boss, 800)
    watch.note(190, 'lycia', [boss])
    expect(watch.fights).toEqual([{ id: 'chimera', role: 'boss', region: 'lycia', firstHit: 100, lastStart: 160, resets: 1, killed: 190 }])
  })

  it('물러났다 다시 나타난 수호자는 같은 싸움을 잇고, 다 아물지 않았으면 되찬 것으로 치지 않는다', () => {
    const watch = new BossWatch()
    const first = foe('fenrir', 'guardian', 1500)
    hit(first, 600)
    watch.note(50, 'ironwood', [first])
    // 물러남: 목록에서 사라진다 (쓰러진 것이 아니다)
    watch.note(60, 'ironwood', [])
    const again = foe('fenrir', 'guardian', 1500)
    again.health.hp = 1100
    watch.note(90, 'ironwood', [again])
    hit(again, 1100)
    watch.note(110, 'ironwood', [again])
    expect(watch.fights).toEqual([{ id: 'fenrir', role: 'guardian', region: 'ironwood', firstHit: 50, lastStart: 50, resets: 0, killed: 110 }])
  })

  it('다시 선 보스를 또 잡으면 싸움이 하나 더 남는다', () => {
    const watch = new BossWatch()
    const one = foe('chimera', 'boss', 1000)
    hit(one, 1000)
    watch.note(10, 'lycia', [one])
    const two = foe('chimera', 'boss', 1000)
    // 무너지는 중인 앞 보스와 새 보스가 함께 보여도 섞지 않는다
    watch.note(11, 'lycia', [one, two])
    hit(two, 400)
    watch.note(70, 'lycia', [two])
    expect(watch.fights.map((f) => [f.firstHit, f.killed])).toEqual([
      [10, 10],
      [70, undefined],
    ])
  })
})

describe('재는 자 (E307 0B): 빌드 장부', () => {
  it('층 목록의 곱이 피해 배율과 같고, 층마다 이름이 붙으며, 수치는 0이 아닌 것만 남는다', () => {
    const powers = new RelicPowers(new THREE.Group())
    powers.setPantheon({ hand: 'thor', heart: 'thor', breath: ['thor'] })
    const progress = new ClassProgress()
    progress.record('thor')
    progress.ascend('thor')
    const training = new TrainingProgress()
    const expedition = new ExpeditionProgress()
    expedition.renown = 25
    const build = new Build({ powers, progress, training, expedition })
    const dev = new DevTools({ build, powers, progress, training, expedition, chapters: { conquered: 1 } } as unknown as DevParts)
    const sheet = dev.buildSheet()
    expect(sheet.damageScale).toBeCloseTo(build.state.damageScale, 10)
    expect(layerProduct(sheet.layers)).toBeCloseTo(sheet.damageScale, 10)
    expect(sheet.layers.find((l) => l.id === 'promotion')).toMatchObject({ name: '승천', kind: 'mul' })
    expect(sheet.layers.find((l) => l.id === 'renown')!.value).toBeGreaterThan(1)
    expect(Object.values(sheet.stats).every((v) => v !== 0)).toBe(true)
    expect(sheet.pantheon).toEqual({ hand: 'thor', heart: 'thor', breath: ['thor'], levels: { thor: progress.level('thor') } })
    expect(sheet.promotions).toBe(progress.promotions)
    expect(sheet.renown).toBe(25)
    expect(sheet.conquered).toBe(1)
    expect(sheet.awakeningScale).toBe(1)
    // 읽기만 한다: 장부를 떠도 빌드의 판 번호가 그대로다
    const version = build.version
    dev.buildSheet()
    expect(build.version).toBe(version)
  })
})
