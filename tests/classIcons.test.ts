import { describe, expect, it } from 'vitest'

import classes from '../src/data/classes.json'
import { CLASS_ICONS } from '../src/ui/classIcons'

const names = [...classes.mythologies.flatMap((m) => m.classes.map((c) => c.name)), ...classes.hidden.map((h) => h.name)]

describe('클래스 아이콘', () => {
  it('기본 클래스 40개와 히든 클래스 11개가 모두 아이콘을 가진다', () => {
    expect(names).toHaveLength(51)
    expect(names.filter((n) => !CLASS_ICONS[n])).toEqual([])
    expect(Object.keys(CLASS_ICONS).filter((n) => !names.includes(n))).toEqual([])
  })

  it('아이콘은 16×16이고 쓴 글자마다 색이 있다', () => {
    for (const [name, icon] of Object.entries(CLASS_ICONS)) {
      expect(icon.rows, name).toHaveLength(16)
      for (const row of icon.rows) {
        expect(row.length, name).toBe(16)
        for (const ch of row) if (ch !== '.') expect(icon.colors[ch], `${name} "${ch}"`).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })
})
