import { describe, expect, it } from 'vitest'

import { DATA } from '../src/data'
import classes from '../src/data/classes.json'
import enemies from '../src/data/enemies.json'
import gods from '../src/data/gods.json'
import relics from '../src/data/relics.json'
import { DataError, parseGameData } from '../src/data/schema'
import { RELIC_MODELS } from '../src/voxel/models/relics'

const MODELS = Object.keys(RELIC_MODELS)
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** 원래 데이터를 복사해 한 곳만 고친 뒤 검사한다. */
function broken(edit: (d: { gods: any; relics: any; enemies: any; classes: any }) => void): () => unknown {
  const d = { gods: clone(gods), relics: clone(relics), enemies: clone(enemies), classes: clone(classes) }
  edit(d)
  return () => parseGameData(d, MODELS)
}

describe('게임 데이터', () => {
  it('지금 데이터 파일은 검사를 통과한다', () => {
    expect(Object.keys(DATA.relics)).toEqual(['mjolnir', 'megingjord', 'jarngreipr', 'lokiMask', 'laevateinn', 'mistletoe', 'kusanagi', 'totsuka', 'futsu', 'ohabari'])
    expect(Object.keys(DATA.gods)).toEqual(['thor', 'loki', 'asura'])
    expect(DATA.enemies.king!.poise).toBe(Infinity)
    expect(DATA.enemies.king!.fixedDrop).toBe('mjolnir')
  })

  it('이어받은 적은 바뀐 값만 덮어쓰고, 확정 드랍은 이어받지 않는다', () => {
    const utgard = DATA.enemies.utgardKing!
    expect(utgard.hp).toBe(2500)
    expect(utgard.attacks).toEqual(DATA.enemies.king!.attacks)
    expect(utgard.tint).toBe(0xd8c2ff)
    expect(utgard.fixedDrop).toBeUndefined()
  })

  it('부채꼴 각도는 도(°)로 적고 라디안으로 바뀐다', () => {
    const area = DATA.enemies.grunt!.attacks[0]!.area
    expect(area.kind === 'sector' && area.halfAngle).toBeCloseTo(Math.PI / 4)
  })

  describe('틀린 데이터는 어디가 왜 틀렸는지 알리며 실패한다', () => {
    const cases: [string, (d: any) => void, RegExp][] = [
      ['없는 신을 가리키는 유물', (d) => (d.relics.lokiMask.god = 'lokki'), /relics\.json\.lokiMask\.god: gods\.json에 없는 신/],
      ['항목 이름 오타', (d) => (d.relics.mjolnir.passive.modifer = {}), /mjolnir\.passive\.modifer: 모르는 항목/],
      ['숫자 대신 글자', (d) => (d.relics.megingjord.trigger.action.damage = '26'), /action\.damage: 숫자여야/],
      ['빠진 값', (d) => delete d.relics.jarngreipr.trigger.action.speed, /action\.speed: 숫자여야/],
      ['없는 행동 종류', (d) => (d.relics.mjolnir.trigger.action.kind = 'meteor'), /action\.kind: .* 중 하나/],
      ['맞을 때 터지는데 시간 충전이 아님', (d) => (d.relics.jarngreipr.trigger.charge = { by: 'kill', count: 3 }), /시간으로 충전/],
      ['그림에 색이 없는 글자', (d) => (d.relics.lokiMask.icon[0] = 'Z...........'), /"Z" 글자의 색/],
      ['없는 모델', (d) => (d.relics.mjolnir.model = 'axe'), /없는 모델/],
      ['없는 외형', (d) => (d.relics.mjolnir.look = 'axe'), /mjolnir\.look: 없는 외형/],
      ['발현 외형이 다른 칸의 것', (d) => (d.gods.thor.looks.head = 'thorCape'), /thor\.looks\.head: head 칸의 외형이 아닙니다/],
      ['칭호가 넷이 아님', (d) => d.gods.thor.titles.pop(), /thor\.titles: Lv1~Lv4/],
      ['색 형식', (d) => (d.gods.loki.color = 'green'), /loki\.color: #rrggbb/],
      ['서로 이어받는 적', (d) => (d.enemies.king.extends = 'utgardKing'), /서로를 이어받고/],
      ['없는 유물 확정 드랍', (d) => (d.enemies.king.fixedDrop = 'gungnir'), /fixedDrop: relics\.json에 없는 유물/],
      ['게임이 쓰는 적이 빠짐', (d) => delete d.enemies.grunt, /enemies\.json\.grunt: 게임이 직접 쓰는 적/],
      ['유물 설명이 빠짐', (d) => (d.relics.megingjord.description = ''), /megingjord\.description: 비어 있지 않은 글자/],
      ['스킬 설명이 빠짐', (d) => delete d.relics.mjolnir.trigger.description, /trigger\.description: 비어 있지 않은 글자/],
      ['클래스 트리 칭호가 신 데이터와 다름', (d) => (d.classes.mythologies[0].classes[0].titles[1] = '천둥왕'), /titles: gods\.json의 칭호와 다릅니다/],
      ['같은 신의 유물이 같은 부위', (d) => (d.relics.megingjord.look = 'ironGauntlets'), /jarngreipr\.look: 같은 신의 유물 "megingjord"와 부위\(arms\)가 겹칩니다/],
      ['발현 외형이 유물 부위를 덮음', (d) => (d.gods.thor.looks.weapon = 'shortSword'), /thor\.looks\.weapon: .*유물 "mjolnir"가 차지한 부위/],
      ['표식이 없는 신', (d) => delete d.gods.loki.mark, /loki\.mark: 없는 외형/],
      ['유물이 모자란 히든 클래스', (d) => delete d.relics.ohabari, /asura\.manifestCount: 히든 클래스인데 유물이 3개뿐/],
      ['힌트가 빠진 클래스', (d) => delete d.classes.hidden[0].hint, /hidden\[0\]\.hint: 비어 있지 않은 글자/],
      ['범위를 벗어난 값', (d) => (d.enemies.grunt.attacks[0].area.halfAngleDeg = 400), /halfAngleDeg: 180 이하/],
    ]
    for (const [name, edit, message] of cases) {
      it(name, () => {
        const run = broken(edit)
        expect(run).toThrow(DataError)
        expect(run).toThrow(message)
      })
    }
  })
})
