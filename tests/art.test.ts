import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { hsv, readsAsDanger, REALM_COLORS, SKY_COLORS, SOURCE_COLORS, VFX } from '../src/art/palette'
import gods from '../src/data/gods.json'
import { ELITES } from '../src/enemies/elite'
import { buildEnemyRig } from '../src/enemies/enemyModel'
import { ENEMIES } from '../src/enemies/Giant'
import themeCss from '../src/ui/theme.css?raw'
import { PROP_KINDS } from '../src/data/regions'
import { buildHeroModel } from '../src/world/heroModel'
import { placeProp } from '../src/world/regionMap'
import { THEMES } from '../src/world/themes'

const hex = (s: string) => parseInt(s.slice(1), 16)
const css = (name: string) => themeCss.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1]?.toLowerCase()

/** gods.json 안의 모든 "color" 값 (신의 색, 궁극기·패시브 연출 색) */
function godColors(): { where: string; color: string }[] {
  const out: { where: string; color: string }[] = []
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`)
    // 동료(분신 원숭이 등)의 몸 색은 모델이라 뺀다
    else if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) && path.endsWith('.color') && !path.includes('companions')) out.push({ where: path, color: v })
  }
  walk(gods, 'gods')
  return out
}

describe('연출 색 규칙 (E9-04)', () => {
  it('위험색은 위험으로 읽힌다', () => {
    expect(readsAsDanger(VFX.danger)).toBe(true)
    expect(readsAsDanger(0xff6a4a)).toBe(true)
  })

  it('내 스킬(신의 색)은 적 공격 예고처럼 보이지 않는다', () => {
    const colors = godColors()
    expect(colors.length).toBeGreaterThan(20)
    for (const { where, color } of colors) expect(readsAsDanger(hex(color)), `${where} ${color}`).toBe(false)
  })

  it('하늘 공격·회복·안내·신화권 빛, 정예의 발밑 고리도 예고처럼 보이지 않는다', () => {
    const elites = Object.fromEntries(Object.entries(ELITES).map(([k, e]) => [`elite.${k}`, e.color]))
    for (const [k, c] of Object.entries({ ...SKY_COLORS, heal: VFX.heal, guide: VFX.guide, ...REALM_COLORS, ...elites })) {
      expect(readsAsDanger(c), k).toBe(false)
    }
  })

  it('신화권 색은 서로 구분된다 (색상이나 채도가 다르다)', () => {
    const entries = Object.entries(REALM_COLORS)
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = hsv(entries[i]![1])
        const b = hsv(entries[j]![1])
        const gap = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h))
        expect(gap >= 20 || Math.abs(a.s - b.s) >= 0.3, `${entries[i]![0]}·${entries[j]![0]}`).toBe(true)
      }
    }
  })

  it('UI 토큰은 팔레트와 같은 값이다', () => {
    expect(css('c-danger')).toBe(`#${VFX.danger.toString(16)}`)
    expect(css('c-heal')).toBe(`#${VFX.heal.toString(16)}`)
    expect(css('c-guide')).toBe(`#${VFX.guide.toString(16)}`)
    for (const [k, c] of Object.entries(REALM_COLORS)) expect(css(`c-realm-${k}`), k).toBe(`#${c.toString(16).padStart(6, '0')}`)
    for (const [k, c] of Object.entries(SOURCE_COLORS)) expect(css(`c-src-${k}`), k).toBe(c[0])
    for (const [k, e] of Object.entries(ELITES)) expect(css(`c-elite-${k}`), k).toBe(`#${e.color.toString(16).padStart(6, '0')}`)
  })
})

function box(object: THREE.Object3D): THREE.Vector3 & { minY: number } {
  object.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(object)
  const size = b.getSize(new THREE.Vector3())
  return Object.assign(size, { minY: b.min.y })
}

describe('지역 환경 팔레트 (E9-02)', () => {
  it('땅은 캐릭터와 예고보다 옅다: 기본색 채도 0.5 아래, 밝기 0.6~0.97, 길은 땅과 밝기가 확실히 다르다', () => {
    for (const [id, t] of Object.entries(THEMES)) {
      const base = hsv(t.ground.base)
      expect(base.s, id).toBeLessThan(0.5)
      expect(base.v, id).toBeGreaterThanOrEqual(0.6)
      expect(base.v, id).toBeLessThanOrEqual(0.97)
      const path = hsv(t.ground.path)
      expect(Math.abs(path.v - base.v) > 0.05 || Math.abs(path.s - base.s) > 0.1, id).toBe(true)
    }
  })

  it('해 세기는 2.7~3.0 (지역끼리 밝기가 크게 다르지 않게)', () => {
    for (const [id, t] of Object.entries(THEMES)) {
      expect(t.light.sunIntensity, id).toBeGreaterThanOrEqual(2.7)
      expect(t.light.sunIntensity, id).toBeLessThanOrEqual(3)
    }
  })
})

describe('복셀 규격과 실루엣 (E9-03)', () => {
  const hero = box(buildHeroModel().root)

  it('주인공은 1.4~2m, 발이 땅(y=0)에 닿는다', () => {
    expect(hero.y).toBeGreaterThan(1.4)
    expect(hero.y).toBeLessThan(2.05)
    expect(Math.abs(hero.minY)).toBeLessThan(0.05)
  })

  it('적의 복셀 크기는 0.07~0.22m, 발은 땅에 (날개·혼령은 떠 있어도 된다)', () => {
    for (const e of Object.values(ENEMIES)) {
      expect(e.voxelSize, e.id).toBeGreaterThanOrEqual(0.07)
      expect(e.voxelSize, e.id).toBeLessThanOrEqual(0.22)
      const rig = buildEnemyRig(e, 1)
      const b = box(rig.root)
      if (e.body.kind === 'flyer' || e.body.kind === 'spirit') expect(b.minY, e.id).toBeLessThan(1.2)
      // 발(다리)의 가장 낮은 곳이 땅. 든 무기는 땅에 끌려도 된다. 뱀은 몸 전체
      else expect(Math.abs(e.body.kind === 'serpent' ? b.minY : box(rig.leftLeg).minY), e.id).toBeLessThan(0.15)
    }
  })

  it('크기로 위계가 보인다: 졸개는 주인공의 0.6~1.8배, 보스·수호자는 주인공보다 높고 그 땅 졸개보다 크다', () => {
    const big = (e: (typeof ENEMIES)[string]) => e.role === 'boss' || e.role === 'guardian'
    for (const e of Object.values(ENEMIES)) {
      const b = box(buildEnemyRig(e, 1).root)
      const tallest = Math.max(b.y, b.z * 0.6)
      if (big(e)) {
        // 뱀은 길고 낮다: 높이 대신 몸 길이로 본다
        expect(e.body.kind === 'serpent' ? Math.max(b.y, b.z * 0.6) : b.y, e.id).toBeGreaterThan(hero.y * 1.3)
        for (const m of Object.values(ENEMIES).filter((x) => x.realm === e.realm && !big(x))) {
          const mb = box(buildEnemyRig(m, 1).root)
          expect(b.x * b.y * b.z, `${e.id} > ${m.id}`).toBeGreaterThan(mb.x * mb.y * mb.z)
        }
      } else {
        // 혼령(도깨비불)은 작은 불덩이라 더 작아도 된다
        expect(tallest / hero.y, e.id).toBeGreaterThan(e.body.kind === 'spirit' ? 0.3 : 0.6)
        expect(tallest / hero.y, e.id).toBeLessThan(1.8)
      }
    }
  })

  it('몸 종류마다 실루엣 비율이 다르다: 짐승·뱀은 길고 낮다, 사람·거인은 높다, 날개는 넓다', () => {
    for (const e of Object.values(ENEMIES)) {
      const b = box(buildEnemyRig(e, 1).root)
      switch (e.body.kind) {
        case 'beast':
          expect(b.z, e.id).toBeGreaterThan(b.y)
          break
        case 'serpent':
          expect(b.z, e.id).toBeGreaterThan(b.y * 1.5)
          break
        case 'humanoid':
        case 'giant':
          expect(b.y, e.id).toBeGreaterThan(b.x)
          break
        case 'flyer':
          expect(b.x, e.id).toBeGreaterThan(b.z)
          break
        case 'spirit':
          expect(b.y, e.id).toBeLessThan(hero.y)
          break
      }
    }
  })

  it('소품은 땅에 서 있고(바닥이 y=0 근처) 주인공 키의 0.1~8배', () => {
    for (const kind of PROP_KINDS) {
      for (const theme of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
        const built = placeProp({ kind, x: 0, z: 0, size: 1, rotation: 0 }, 0, theme)
        built.object.position.set(0, 0, 0)
        const b = box(built.object)
        expect(Math.abs(b.minY), `${kind}·${theme}`).toBeLessThan(0.3)
        expect(b.y / hero.y, `${kind}·${theme}`).toBeGreaterThan(0.1)
        expect(b.y / hero.y, `${kind}·${theme}`).toBeLessThan(8)
      }
    }
  })
})
