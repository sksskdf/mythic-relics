import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

const css = (file) => readFileSync(new URL(`../src/ui/${file}`, import.meta.url), 'utf8')

// 빌드가 쓰는 CSS 줄이기(lightningcss)를 Vite 쪽에서 찾는다 (이 저장소의 직접 의존이 아니다)
const require = createRequire(import.meta.url)
const { transform } = createRequire(require.resolve('vite/package.json'))('lightningcss')
/** 빌드 타깃처럼 dvh를 모두 아는 브라우저 (Vite 기본 타깃 둘레): 줄이기가 「필요 없는」 물러날 줄을 가장 많이 지우는 경우 */
const TARGETS = { chrome: 111 << 16, edge: 111 << 16, firefox: 114 << 16, safari: (16 << 16) | (4 << 8), ios_saf: (16 << 16) | (4 << 8) }
const minified = (file) => transform({ filename: file, code: Buffer.from(css(file)), minify: true, targets: TARGETS }).code.toString()

describe('화면 높이: 아이폰 사파리의 주소창 (E307)', () => {
  // 100vh는 사파리에서 주소창·도구 막대 뒤까지 잰 높이라, 그것으로 잰 창은 아래가 가린다: 보이는 높이(100dvh)로 잰다.
  // dvh를 모르는 브라우저는 100vh로 물러나야 하는데, 한 규칙에 두 줄로 쓰면 빌드의 줄이기가 앞줄(vh)을 지운다.
  // 그래서 소스가 아니라 줄인 결과를 본다 (@supports로 덮은 것은 남는다)
  /** 그 단위로 잰 선언들 (@supports의 조건 글은 뺀다) */
  const decls = (text, unit) => text.replace(/@supports \([^{]*\)\{/g, '{').match(new RegExp(`[a-z-]+:[^;{}]*100${unit}[^;{}]*`, 'g')) ?? []

  it.each(['menu.css', 'portrait.css', 'pause.css'])('%s: 줄인 뒤에도 100dvh로 잰 높이마다 100vh로 물러날 줄이 남는다', (file) => {
    const out = minified(file)
    const dynamic = decls(out, 'dvh')
    expect(dynamic.length).toBeGreaterThan(0)
    for (const d of dynamic) expect(out, `${file}: ${d}`).toContain(d.replace('100dvh', '100vh'))
    // 100vh로만 잰 곳도 없다
    for (const d of decls(out, 'vh')) expect(out, `${file}: ${d}`).toContain(d.replace('100vh', '100dvh'))
  })

  it.each(['menu.css', 'portrait.css', 'pause.css'])('%s: 100dvh는 그것을 아는 브라우저에만 건다 (@supports)', (file) => {
    // 줄인 결과에서 100dvh 선언은 모두 @supports (height:100dvh) 안에 있다
    const out = minified(file)
    const inside = [...out.matchAll(/@supports \(height:\s*100dvh\)\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((m) => m[1]).join('')
    expect(decls(inside, 'dvh')).toEqual(decls(out, 'dvh'))
  })
})

describe('세로 화면의 머리줄 (E307, portrait.css)', () => {
  /** 선택자 하나짜리 규칙의 몸 */
  const rule = (selector) => css('portrait.css').match(new RegExp(`\\n\\s*${selector.replace(/[.+]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? ''

  it('탭 줄은 머리줄의 한 줄을 통째로 쓰고 옆으로 밀리지 않는다 (탭이 오른쪽 단추에 가리지 않는다)', () => {
    expect(rule(':root .menu__head')).toContain('flex-wrap: wrap')
    const tabs = rule(':root .menu__tabs')
    expect(tabs).toContain('flex: 0 0 100%')
    expect(tabs).toContain('overflow: visible')
  })

  it('탭은 폭을 고르게 나눠 갖고(여덟이어도 한 줄) 누르는 자리가 44px이다', () => {
    const tab = rule(':root .menu__tab')
    expect(tab).toContain('flex: 1 1 0')
    expect(tab).toContain('min-width: 0')
    expect(tab).toContain('min-height: 44px')
  })

  it('「처음 화면」은 윗줄 오른쪽(설정·닫기 곁)에 붙는다: 왼쪽 위는 HUD 초상 자리라, 초상을 두 번 톡해도 눌리지 않게 비운다', () => {
    const home = rule(':root .menu__home')
    expect(home).toContain('margin-left: auto')
    // 왼쪽으로 당기는 여백(margin 줄임 꼴·margin-right)을 다시 걸지 않는다
    expect(home).not.toMatch(/margin(-right)?:/)
  })
})

describe('좁은 화면의 장비 탭 (E307, menu.css)', () => {
  it('「끼기」·「녹이기」 줄은 설명 카드 위(가방 바로 아래)에 온다: 카드가 길어도 접힌 선 아래로 밀리지 않는다', () => {
    // 한 칸으로 쌓는 좁은 화면(600px 아래) 묶음 안에서만 차례를 바꾼다
    const narrow = css('menu.css').match(/@media \(max-width: 600px\) \{\n {2}\.menu-relics \{[\s\S]*?\n\}\n/)?.[0] ?? ''
    expect(narrow).toMatch(/\.menu-relics__detail \{[^}]*display: grid/)
    expect(narrow).toMatch(/\.menu-relics__dos \{[^}]*order: -1/)
  })
})
