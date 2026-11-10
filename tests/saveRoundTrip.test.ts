import { describe, expect, it } from 'vitest'

import { REGIONS } from '../src/data/regions'
import { HUNT_KILLS } from '../src/data/wake'
import { parseSave, SAVE_VERSION, type SaveData } from '../src/save/SaveData'
import TEXT from './fixtures/save-v17-full.json?raw'
import { throughGame } from './helpers/saveBench'

/**
 * 저장 왕복 시험 (E307 0B 「재는 자」: 저장을 v18로 올리기 전의 안전망).
 * 꽉 찬 견본(`tests/fixtures/save-v17-full.json`: 깨운 신 여럿·자리 셋·유물표·장비와 가방·수련·원정과 귀환 기록·맹세·자동화·웨이포인트·탈것·장 진행·엔딩 뒤 장치)을
 * 두 겹으로 돌린다:
 * - 글 왕복: 읽고(`parseSave`) → 쓰고(JSON) → 다시 읽는다
 * - 게임 왕복: 읽은 것을 게임에 불러오고(`Persistence.restore`) → 저장하고(`snapshot`) → 다시 읽는다 (`helpers/saveBench.ts`)
 * 저장 모양을 바꾸면 견본에 새 칸을 채우고(아래 「꽉 차 있다」가 알려 준다), 왕복에서 값이 달라지는 칸은 「왕복에서 바뀌는 칸」에 적는다
 */
const full = (): SaveData => parseSave(TEXT)!
/** 견본의 한 곳을 바꾼 저장 (원본 모양 그대로, 검사 전) */
const raw = (change: (o: Record<string, any>) => void = () => {}): Record<string, any> => {
  const o = JSON.parse(TEXT) as Record<string, any>
  change(o)
  return o
}
const read = (o: unknown): SaveData => parseSave(JSON.stringify(o))!
/** 게임 왕복: 불러오기 → 저장 → 다시 읽기 */
const game = (data: SaveData): SaveData => read(throughGame(data))

describe('저장 왕복: 꽉 찬 v17 견본', () => {
  it('견본은 지금 버전이고, 검사에서 버려지거나 바로잡히는 값 없이 그대로 읽힌다', () => {
    expect(JSON.parse(TEXT).version).toBe(SAVE_VERSION)
    expect(full()).toEqual(JSON.parse(TEXT))
  })

  it('견본은 꽉 차 있다: 모든 칸이 빈 저장과 다르다 (저장에 칸을 더하면 견본에도 값을 채운다)', () => {
    const data = full() as unknown as Record<string, unknown>
    const empty = parseSave(JSON.stringify({ version: SAVE_VERSION })) as unknown as Record<string, unknown>
    // 함께 설 수 없어 견본에서 기본값인 칸: 출발 카드를 고르기 전(oathPending)은 건 맹세가 없을 때만 (아래 변형에서 본다)
    const skip = new Set(['version', 'expedition.oathPending'])
    const same: string[] = []
    for (const key of Object.keys(empty)) {
      if (!skip.has(key) && JSON.stringify(data[key]) === JSON.stringify(empty[key])) same.push(key)
      const value = empty[key]
      if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
      // 묶음 칸은 그 안의 칸마다
      for (const sub of Object.keys(value)) {
        const path = `${key}.${sub}`
        if (!skip.has(path) && JSON.stringify((data[key] as Record<string, unknown>)[sub]) === JSON.stringify((value as Record<string, unknown>)[sub])) same.push(path)
      }
    }
    expect(same).toEqual([])
    expect(Object.keys(data).sort()).toEqual(Object.keys(empty).sort())
  })

  it('글 왕복: 읽고 → 쓰고 → 다시 읽어도 같다 (칸의 차례까지)', () => {
    const once = full()
    const twice = read(once)
    expect(twice).toEqual(once)
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once))
  })

  it('게임 왕복: 게임에 불러와 다시 저장해도 같고, 한 번 더 돌려도 같다', () => {
    const once = full()
    // 저장 데이터 그대로 (다시 읽으며 바로잡히기 전에도 같다)
    expect(throughGame(once)).toEqual(once)
    const twice = game(once)
    expect(twice).toEqual(once)
    expect(game(twice)).toEqual(once)
  })

  describe('견본의 변형도 두 왕복에서 그대로다', () => {
    const variants: [string, (o: Record<string, any>) => void][] = [
      [
        '출발 카드를 고르기 전에 저장한 판 (oathPending)',
        (o) => {
          o.expedition.oath = null
          o.expedition.oathPending = true
        },
      ],
      [
        '조각 2를 모은 깨우는 신을 손에 쥔 판',
        (o) => {
          o.awaken = { waking: 'artemis', fragments: 2, hunt: Math.max(...HUNT_KILLS) }
          o.pantheon.hand = 'artemis'
        },
      ],
      [
        '엔딩 전 판: 엔딩 뒤 장치 없이 (깊이 1·끝없는 원정 0·숨 넷·신 3단계까지)',
        (o) => {
          o.ending = false
          o.depth = { level: 1, reached: 1, limitBroken: false }
          o.endless = { best: 0 }
          o.classes.thor.level = 3
          o.pantheon.breath = o.pantheon.breath.slice(0, 4)
          o.oaths = { kept: ['silence', 'alone'], best: { silence: 412, alone: 505 } }
          o.expedition.oath = 'emptyHand'
          o.expedition.deepWin = false
          o.chapters.entered = o.chapters.entered.filter((id: string) => REGIONS[id]!.realm !== 'china')
          o.waypoints = o.waypoints.filter((id: string) => REGIONS[id]!.realm !== 'china')
        },
      ],
      [
        '맨몸: 장비·가방·땅이 빈 판',
        (o) => {
          o.slots = [null, null, null, null, null, null, null]
          o.bag = []
          o.gear = []
          o.ground = []
          o.uniques = ['pilgrim']
          o.expedition.heirloom = []
        },
      ],
    ]
    for (const [name, change] of variants) {
      it(name, () => {
        const once = read(raw(change))
        // 바꾼 것도 검사에서 바로잡히지 않는다
        expect(once).toEqual(raw(change))
        expect(read(once)).toEqual(once)
        expect(throughGame(once)).toEqual(once)
        expect(game(once)).toEqual(once)
      })
    }
  })

  it('빈 저장(새 판)도 왕복에서 같다: 자리만 마을 시작점으로 적힌다', () => {
    const empty = read({ version: SAVE_VERSION })
    expect(read(empty)).toEqual(empty)
    const village = REGIONS.village!
    const once = game(empty)
    expect(once).toEqual({ ...empty, region: { id: 'village', x: village.spawn.x, z: village.spawn.z } })
    expect(game(once)).toEqual(once)
  })
})

/**
 * 왕복에서 값이 달라지는 칸을 지금 동작 그대로 못박는다 (고칠지는 따로 정한다, E307 0B 보고).
 * 모두 「어긋난 저장을 불러오며 바로잡는」 쪽이고, 한 번 바로잡힌 뒤에는 다시 돌려도 같다
 */
describe('저장 왕복에서 바뀌는 칸 (지금 동작)', () => {
  /** 게임 왕복 한 번과, 그 결과가 다시 돌려도 같은지 */
  const settle = (change: (o: Record<string, any>) => void): { before: SaveData; after: SaveData } => {
    const before = read(raw(change))
    const after = game(before)
    expect(game(after)).toEqual(after)
    return { before, after }
  }
  /** 바뀐 맨 위 칸들 */
  const changed = (a: SaveData, b: SaveData): string[] => Object.keys(a).filter((k) => JSON.stringify((a as never)[k]) !== JSON.stringify((b as never)[k]))

  it('둘째 장신구 칸에만 낀 장신구는 첫째 장신구 칸으로 옮겨 간다 (불러올 때 그 부위의 첫 빈 칸에 다시 낀다)', () => {
    const { before, after } = settle((o) => {
      o.slots[5] = null
      o.gear = o.gear.filter((g: { uid: string }) => g.uid !== 'g:t1')
      o.expedition.heirloom = ['g:w1']
    })
    expect(before.slots.slice(5)).toEqual([null, 'g:t2'])
    expect(after.slots.slice(5)).toEqual(['g:t2', null])
    expect(changed(before, after)).toEqual(['slots'])
  })

  it('유물표의 고유 효과는 차례만 바뀐다: 낀 장비·가방의 것이 앞으로 온다', () => {
    const { before, after } = settle((o) => {
      o.uniques = ['pilgrim', 'moonShield', 'frost', 'ember', 'thunderCall']
    })
    expect(after.uniques).toEqual(['thunderCall', 'ember', 'frost', 'moonShield', 'pilgrim'])
    expect([...after.uniques].sort()).toEqual([...before.uniques].sort())
    expect(changed(before, after)).toEqual(['uniques'])
  })

  it('깨달음보다 많이 익힌 마디는 뒤에서부터 버린다 (글 왕복에서는 남고, 게임에 불러올 때 빠진다)', () => {
    // 경험치 200 = 깨달음 둘
    const { before, after } = settle((o) => {
      o.training.xp = 200
    })
    expect(before.training.taken).toHaveLength(19)
    expect(after.training).toEqual({ xp: 200, taken: ['awaken', 'edge'] })
    expect(changed(before, after)).toEqual(['training'])
  })

  it('숨 칸 수를 넘친 숨의 신은 뒤에서부터 빠진다 (홀로의 맹세를 지킨 적이 없으면 엔딩 뒤에도 넷)', () => {
    const { before, after } = settle((o) => {
      o.oaths.kept = ['silence', 'emptyHand', 'glass']
    })
    expect(before.pantheon.breath).toHaveLength(5)
    expect(after.pantheon.breath).toEqual(['thor', 'odin', 'zeus', 'loki'])
    expect(changed(before, after)).toEqual(['pantheon'])
  })

  it('닫힌 신은 자리에서 빠진다 (글 왕복에서 이미)', () => {
    const data = read(raw((o) => (o.classes.zeus.level = 0)))
    expect(data.pantheon).toEqual({ hand: 'thor', heart: null, breath: ['thor', 'odin', 'loki', 'poseidon'] })
    expect(game(data)).toEqual(data)
  })

  it('이번 원정의 흐른 시간은 초 단위로 반올림해 쓴다', () => {
    const { before, after } = settle((o) => {
      o.expedition.elapsed = 321.6
    })
    expect(before.expedition.elapsed).toBe(321.6)
    expect(after.expedition.elapsed).toBe(322)
    expect(changed(before, after)).toEqual(['expedition'])
  })

  it('읽을 때 자르는 끝 (게임 안의 값이 이보다 크면 저장한 판과 불러온 판이 달라진다): 불씨 50·이긴 보스 99·재료 9999·끝난 원정 기록 스물', () => {
    const data = read(
      raw((o) => {
        o.expedition.flames = { flame: 51, stone: 50 }
        o.expedition.bosses = 120
        o.materials.prototype = 12345
        o.expedition.best = Array.from({ length: 25 }, (_, i) => 600 + i)
      }),
    )
    expect(data.expedition.flames).toEqual({ flame: 50, stone: 50 })
    expect(data.expedition.bosses).toBe(99)
    expect(data.materials.prototype).toBe(9999)
    expect(data.expedition.best).toEqual(Array.from({ length: 20 }, (_, i) => 605 + i))
    expect(game(data)).toEqual(data)
  })
})

describe('모르는 키가 섞인 저장 (지금 동작: 버린다)', () => {
  it('맨 위의 모르는 키는 버리고, 아는 칸은 그대로 읽는다', () => {
    const data = read(raw((o) => Object.assign(o, { futureThing: { a: 1 }, patrons: ['thor'], savedAt: 1731200000 })))
    expect(data).toEqual(full())
    for (const key of ['futureThing', 'patrons', 'savedAt']) expect(key in data, key).toBe(false)
  })

  it('묶음 안의 모르는 키도 버린다 (장비·원정·자리·외형·땅의 물건·신 기록·자리)', () => {
    const data = read(
      raw((o) => {
        o.gear[0].sockets = 2
        o.gear[0].stats[0].rolled = 0.9
        o.gear[0].source.bonus = 1
        o.expedition.route = ['midgard']
        o.pantheon.feet = 'loki'
        o.looks.dyes = { cape: 3 }
        o.body.height = 2
        o.ground[0].placed = true
        o.classes.thor.xp = 900
        o.depth.best = 30
        o.automation.counters.salvaged = 12
        o.oaths.streak = 4
        o.endless.floor = 9
        o.chapters.seen = ['village']
        o.training.spent = 19
        o.awaken.since = 12
        o.region.facing = 1.5
      }),
    )
    expect(data).toEqual(full())
    // 한 번 저장하면 모르는 키는 저장에서도 사라진다 (더 새 판이 쓴 칸을 옛 판이 지운다)
    expect(JSON.stringify(read(throughGame(data)))).not.toMatch(/sockets|route|dyes|streak|facing/)
  })

  it('모르는 값(없는 신·유물·땅·맹세·탭·마디·장면이 아닌 것)은 버리고 나머지는 그대로', () => {
    const data = read(
      raw((o) => {
        o.lit.push('excalibur')
        o.uniques.push('nothing')
        o.classes.arthur = { level: 3 }
        o.pantheon.breath.push('arthur')
        o.waypoints.push(7)
        o.oaths.kept.push('vow')
        o.chapters.entered.push('avalon')
        o.training.taken.push('nowhere')
        o.tabs.push('quests')
        o.scenes.push(3)
        o.stages.excalibur = 3
        o.bag.push('g:ghost')
        o.ground.push({ id: 'g:ghost', x: 1, z: 1 })
      }),
    )
    expect(data).toEqual(full())
  })
})

describe('어긋난 값이 섞인 저장', () => {
  /** 한 칸에 넣어 보는 어긋난 값들 */
  const JUNK: unknown[] = [null, -1, 1.5, 1e12, 'x', true, [], {}, [null, 1, 'a', {}], { a: 1 }, ['thor', 'thor', 'nobody'], { thor: 9, zeus: -3 }]

  it('칸마다(두 겹까지) 어긋난 값으로 바꿔도 터지지 않고 읽히며, 글 왕복은 그대로이고 게임 왕복은 한 번 바로잡힌 뒤 그대로다', () => {
    const paths: string[][] = []
    const top = JSON.parse(TEXT) as Record<string, unknown>
    for (const key of Object.keys(top)) {
      if (key === 'version') continue
      paths.push([key])
      const value = top[key]
      if (typeof value === 'object' && value !== null) for (const sub of Object.keys(value)) paths.push([key, sub])
    }
    const problems: string[] = []
    for (const path of paths) {
      for (const junk of JUNK) {
        const where = `${path.join('.')} = ${JSON.stringify(junk)}`
        try {
          const data = parseSave(JSON.stringify(raw((o) => (path.length === 1 ? (o[path[0]!] = junk) : (o[path[0]!][path[1]!] = junk)))))
          if (!data) {
            problems.push(`${where}: 읽지 못함`)
            continue
          }
          if (JSON.stringify(read(data)) !== JSON.stringify(data)) problems.push(`${where}: 글 왕복이 다르다`)
          const once = game(data)
          if (JSON.stringify(game(once)) !== JSON.stringify(once)) problems.push(`${where}: 게임 왕복이 자리 잡지 않는다`)
        } catch (e) {
          problems.push(`${where}: ${String(e)}`)
        }
      }
    }
    expect(problems).toEqual([])
  }, 30000)
})
