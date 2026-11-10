import { describe, expect, it } from 'vitest'

import { contrast, luminance } from '../src/art/contrast'
import { REALM_COLORS } from '../src/art/palette'
import gods from '../src/data/gods.json'
import { REGIONS } from '../src/data/regions'
import { CELL, CROSS_MARGIN, regionLinks } from '../src/data/world'
import { MARKS, MINIMAP_INK, MINIMAP_SIZE, minimapPoint, minimapView, stampAt, type Mark } from '../src/ui/Minimap'
import themeCss from '../src/ui/theme.css?raw'
import { THEMES } from '../src/world/themes'

const token = (name: string) => themeCss.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1]?.toLowerCase()
const key = ([u, v]: readonly [number, number]) => `${u},${v}`

describe('명암비 (E307)', () => {
  it('검정과 흰색은 21:1, 같은 색은 1:1이고 차례를 바꿔도 같다', () => {
    expect(contrast(0x000000, 0xffffff)).toBeCloseTo(21, 5)
    expect(contrast('#7fd4ff', 0x7fd4ff)).toBe(1)
    expect(contrast(0xc9d5e1, '#0d1118')).toBeCloseTo(contrast('#0d1118', 0xc9d5e1), 10)
    expect(luminance(0xffffff)).toBeCloseTo(1, 5)
  })
})

describe('작은 지도의 표시 (E307): 어느 땅에서든 묻히지 않는다', () => {
  it('표시 색은 디자인 토큰과 같다', () => {
    expect(MINIMAP_INK.rim).toBe(token('c-bg-1'))
    expect(MINIMAP_INK.me).toBe(token('c-ink-1'))
    expect(MINIMAP_INK.relic).toBe(token('c-gold-soft'))
    expect(MINIMAP_INK.sanctuary).toBe(token('c-ink-2'))
    expect(MINIMAP_INK.ready).toBe(token('c-gold'))
  })

  it('테두리 없이는 눈 땅에서 「나」가 묻힌다 (고치기 전: 1.28:1)', () => {
    expect(contrast(MINIMAP_INK.me, THEMES.snow.ground.shade)).toBeLessThan(1.5)
  })

  // 표시는 밝은 속 + 어두운 테두리다: 밝은 땅에서는 테두리가, 어두운 땅에서는 속이 땅과 갈린다
  const inks = { 나: MINIMAP_INK.me, '목표(밝은 금빛)': MINIMAP_INK.relic, '목표(금빛)': MINIMAP_INK.ready, 성소: MINIMAP_INK.sanctuary }
  it.each(Object.entries(THEMES))('%s: 땅·길·물 위에서 나·목표·성소 표시가 3:1을 넘는다', (_id, theme) => {
    for (const [where, ground] of Object.entries({ 그늘: theme.ground.shade, 길: theme.ground.path, 물: theme.water.surface })) {
      for (const [name, ink] of Object.entries(inks)) {
        expect(Math.max(contrast(ink, ground), contrast(MINIMAP_INK.rim, ground)), `${name} / ${where}`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('속과 테두리는 서로 3:1을 넘는다: 나·목표·성소·떨어진 것, 출구(신화권 색), 신의 흔적(신의 색)', () => {
    for (const [name, ink] of Object.entries(MINIMAP_INK)) if (name !== 'rim') expect(contrast(ink, MINIMAP_INK.rim), name).toBeGreaterThanOrEqual(3)
    for (const [realm, color] of Object.entries(REALM_COLORS)) expect(contrast(color, MINIMAP_INK.rim), realm).toBeGreaterThanOrEqual(3)
    for (const [id, god] of Object.entries(gods as Record<string, { color: string }>)) expect(contrast(god.color, MINIMAP_INK.rim), id).toBeGreaterThanOrEqual(3)
  })

  it('표시마다 속의 사방을 테두리가 두른다', () => {
    for (const [name, mark] of Object.entries(MARKS) as [string, Mark][]) {
      const ink = new Set(mark.ink.map(key))
      const rim = new Set(mark.rim.map(key))
      expect(mark.ink.length, name).toBeGreaterThan(0)
      for (const [u, v] of mark.ink) {
        for (const at of [[u + 1, v], [u - 1, v], [u, v + 1], [u, v - 1]] as const) expect(ink.has(key(at)) || rim.has(key(at)), `${name} ${key(at)}`).toBe(true)
      }
      // 테두리와 속은 겹치지 않는다
      for (const at of mark.rim) expect(ink.has(key(at)), `${name} ${key(at)}`).toBe(false)
    }
  })

  it('「나」는 속이 찬 표시 가운데 가장 크고, 표시끼리 모양이 다르다 (글·범례 없이 모양과 색으로 구분)', () => {
    for (const name of ['relic', 'trace', 'sanctuary', 'exit', 'exitLocked'] as const) expect(MARKS.me.ink.length, name).toBeGreaterThan(MARKS[name].ink.length * 2)
    const shapes = Object.values(MARKS).map((m) => [...m.ink].map(key).sort().join(' '))
    expect(new Set(shapes).size).toBe(shapes.length)
  })

  it('목표는 속이 빈 마름모다: 그 자리의 출구·성소 표시를 가리지 않는다', () => {
    const taken = new Set([...MARKS.goal.ink, ...MARKS.goal.rim].map(key))
    for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) expect(taken.has(key([u, v])), key([u, v])).toBe(false)
    // 「나」보다 넓게 둘러, 그 자리에 서 있어도 목표가 보인다
    const far = (m: Mark) => Math.max(...m.rim.map(([u, v]) => Math.max(Math.abs(u), Math.abs(v))))
    expect(far(MARKS.goal)).toBeGreaterThan(far(MARKS.me))
  })
})

describe('작은 지도가 보여 주는 넓이 (E307)', () => {
  /** 지금 땅(마름모)이 그림에서 차지하는 몫: 반 폭 view가 그림 한 변에 맞는다 */
  const share = (halfExtent: number, view: number) => (halfExtent / view) ** 2 / 2

  it('이어진 세계의 가로 화면은 이웃 땅까지 (반 폭 70m), 이어지지 않은 땅(끝없는 원정의 층)은 그 땅만', () => {
    expect(minimapView(40, true, false)).toBe(CELL * 0.7)
    expect(minimapView(40, false, false)).toBe(40)
    expect(minimapView(40, false, true)).toBe(40)
  })

  it('세로 화면은 지금 땅에 당겨 그린다: 땅이 그림의 두 배 넘게 커지고, 통로 어귀는 남는다', () => {
    for (const region of Object.values(REGIONS)) {
      const near = minimapView(region.halfExtent, true, true)
      const far = minimapView(region.halfExtent, true, false)
      expect(near, region.id).toBeGreaterThan(region.halfExtent)
      expect(near, region.id).toBeLessThan(far)
      expect(share(region.halfExtent, near) / share(region.halfExtent, far), region.id).toBeGreaterThan(2)
    }
    // 반 폭 40m 땅: 그림의 16% → 38%
    expect(share(40, minimapView(40, true, false))).toBeLessThan(0.17)
    expect(share(40, minimapView(40, true, true))).toBeGreaterThan(0.35)
  })
})

describe('작은 지도의 「나」 (E307): 통로 끝에서도 잘리지 않는다', () => {
  /** 그 땅에서 통로를 걸어 이웃 땅으로 넘어가기 직전의 자리들: 통로 가운데를 CROSS_MARGIN 넘긴 곳의 양옆 끝 (지금 땅 좌표) */
  const crossings = (id: string) =>
    regionLinks(REGIONS, id).flatMap((link) => {
      const along = link.mid + link.dir * (CROSS_MARGIN + 0.5)
      const sides = link.axis === 'x' ? [link.rect.minZ, link.rect.maxZ] : [link.rect.minX, link.rect.maxX]
      return sides.map((side) => (link.axis === 'x' ? { x: along, z: side } : { x: side, z: along }))
    })
  /** 표시가 테두리까지 그림 안에 있나 */
  const whole = (at: { u: number; v: number }, mark: Mark) => [...mark.ink, ...mark.rim].every(([du, dv]) => at.u + du >= 0 && at.u + du < MINIMAP_SIZE && at.v + dv >= 0 && at.v + dv < MINIMAP_SIZE)

  it('세로 화면의 마을에서 미드가르드로 넘어가기 직전은 그림 밖이다: 그대로 찍으면 「나」가 잘린다 (고치기 전)', () => {
    const view = minimapView(REGIONS.village!.halfExtent, true, true)
    const clipped = crossings('village').filter((p) => !whole(stampAt(minimapPoint(p.x, p.z, view), MARKS.me, false), MARKS.me))
    expect(clipped.length).toBeGreaterThan(0)
    // 가로 화면(이웃 땅까지 보임)에서는 그대로 찍어도 그림 안이다
    const wide = minimapView(REGIONS.village!.halfExtent, true, false)
    for (const p of crossings('village')) expect(whole(stampAt(minimapPoint(p.x, p.z, wide), MARKS.me, false), MARKS.me)).toBe(true)
  })

  it('가장자리로 당겨 찍으면 어느 땅의 어느 통로 끝에서든 「나」가 테두리까지 그림 안에 있고, 참 자리에서 8px 넘게 벗어나지 않는다', () => {
    let links = 0
    for (const region of Object.values(REGIONS)) {
      const view = minimapView(region.halfExtent, true, true)
      for (const p of crossings(region.id)) {
        links += 1
        const real = minimapPoint(p.x, p.z, view)
        const at = stampAt(real, MARKS.me, true)
        expect(whole(at, MARKS.me), `${region.id} (${p.x}, ${p.z})`).toBe(true)
        expect(Math.max(Math.abs(at.u - real.u), Math.abs(at.v - real.v)), `${region.id} (${p.x}, ${p.z})`).toBeLessThanOrEqual(8)
      }
    }
    expect(links).toBeGreaterThan(30)
  })

  it('그림 안에 있는 것은 당기지 않고 제자리에 찍는다 (땅 한가운데·땅의 모서리)', () => {
    const view = minimapView(40, true, true)
    expect(stampAt(minimapPoint(0, 0, view), MARKS.me, true)).toEqual({ u: MINIMAP_SIZE / 2, v: MINIMAP_SIZE / 2 })
    for (const [x, z] of [[40, 40], [-40, 40], [40, -40], [-40, -40]] as const) {
      const real = minimapPoint(x, z, view)
      expect(stampAt(real, MARKS.me, true)).toEqual({ u: Math.round(real.u), v: Math.round(real.v) })
    }
    // 이어지지 않은 땅(끝없는 원정의 층)은 땅의 모서리가 그림 끝이다: 거기서도 잘리지 않는다
    const floor = minimapView(40, false, true)
    expect(whole(stampAt(minimapPoint(40, 40, floor), MARKS.me, true), MARKS.me)).toBe(true)
    expect(whole(stampAt(minimapPoint(40, 40, floor), MARKS.me, false), MARKS.me)).toBe(false)
  })
})
