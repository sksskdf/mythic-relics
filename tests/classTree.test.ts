import { describe, expect, it } from 'vitest'

import md from '../CLASSES.md?raw'
import { DATA } from '../src/data'

/** CLASSES.md에서 제목 아래 첫 표를 읽는다. (머리줄과 구분줄은 뺀다) */
function table(md: string, heading: string, header: string): string[][] {
  const start = md.indexOf(heading)
  const at = md.indexOf(header, start)
  if (start < 0 || at < 0) throw new Error(`표를 못 찾음: ${heading}`)
  const rows: string[][] = []
  for (const line of md.slice(at).split('\n').slice(2)) {
    if (!line.startsWith('|')) break
    rows.push(line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
  }
  return rows
}

const tree = DATA.classes

describe('클래스 트리 (src/data/classes.json)와 CLASSES.md', () => {
  it('신화권 10개, 기본 클래스 40개가 문서와 같은 이름·칭호다', () => {
    expect(tree.mythologies).toHaveLength(10)
    tree.mythologies.forEach((myth, i) => {
      const titles = table(md, `### 3.${i + 1} ${myth.name}`, '| 신 | Lv1 | Lv2')
      expect(myth.classes.map((c) => [c.name, ...c.titles])).toEqual(titles)
    })
  })

  it('원형 상위·정점 클래스 20개가 문서와 같다', () => {
    const rows = table(md, '### 5.1 원형 상위 클래스', '| 원형 | 상위 클래스')
    expect(tree.archetypes.map((a) => [a.name, a.upper.name, a.apex.name])).toEqual(rows)
  })

  it('신화권 상위 클래스 10개가 문서와 같다', () => {
    const rows = table(md, '### 5.2 신화권 상위 클래스', '| 신화권 | 조건')
    expect(tree.mythologies.map((m) => [m.name, m.upper.name])).toEqual(rows.map((r) => [r[0], r[2]]))
  })

  it('히든 클래스 10개가 문서와 같은 이름·칭호다', () => {
    const rows = table(md, '**히든 클래스 레벨 칭호**', '| 클래스 | Lv1')
    expect(tree.hidden.map((h) => [h.name, ...h.titles])).toEqual(rows)
  })

  it('원형마다 기본 클래스가 4개씩, 서로 다른 신화권에 있다', () => {
    for (const archetype of tree.archetypes) {
      const owners = tree.mythologies.filter((m) => m.classes.some((c) => c.archetype === archetype.id))
      expect(owners, archetype.name).toHaveLength(4)
    }
  })
})
