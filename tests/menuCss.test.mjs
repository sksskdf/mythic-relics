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

describe('누르는 자리 44px (E307, portrait.css)', () => {
  const text = css('portrait.css')
  /** 묶음의 처음과 끝을 알리는 주석 */
  const START = '누르는 자리 44px'
  const END = '/* 누르는 자리 끝 */'
  /** 그 두 주석 사이 (@media 묶음 둘). 끝 표시 뒤에 덧붙는 다른 세로 화면 규칙(`:root .x` 꼴)은 이 테스트가 보지 않는다 */
  const block = text.slice(text.indexOf(START), text.indexOf(END))
  /** 묶음 안의 규칙들: 선택자 목록과 몸 */
  const rules = [...block.matchAll(/\n {2}((?::root[^{]*?))\{([^}]*)\}/g)].map((m) => ({ selectors: m[1].split(',').map((s) => s.trim()), body: m[2] }))
  /** 그 선택자(:root.is-touch 뒤)에 걸린 선언을 모두 이어 붙인 것 */
  const decls = (selector) => rules.filter((r) => r.selectors.includes(`:root.is-touch ${selector}`)).map((r) => r.body).join('\n')
  /** 선언의 px 값 (없으면 NaN) */
  const px = (selector, prop) => Number(decls(selector).match(new RegExp(`(?:^|\\s)${prop}: (-?\\d+)px`))?.[1] ?? NaN)
  /** theme.css의 간격 토큰 (px) */
  const space = (name) => Number(css('theme.css').match(new RegExp(`--${name}: (\\d+)px`))[1])
  /** 다른 파일의 선택자 하나짜리 규칙의 몸 */
  const base = (file, selector) => css(file).match(new RegExp(`\\n${selector.replace(/[.+>]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? ''

  it('터치 기기의 세로 화면에만 건다: 묶음의 선택자는 모두 :root.is-touch 로 시작한다 (마우스로 하는 화면의 모양은 그대로)', () => {
    // 처음·끝 표시는 하나씩이고 차례대로다 (끝 표시가 없으면 묶음이 비어 아래가 모두 헛돈다)
    for (const mark of [START, END]) expect(text.split(mark).length, mark).toBe(2)
    expect(text.indexOf(END)).toBeGreaterThan(text.indexOf(START))
    expect(block).toMatch(/@media \(max-aspect-ratio: 4\/5\) \{/)
    expect(rules.length).toBeGreaterThan(15)
    for (const r of rules) for (const s of r.selectors) expect(s, s).toMatch(/^:root\.is-touch /)
    // 묶음 밖(@media 밖)에 놓인 규칙이 없다
    expect(block.match(/\n:root/g)).toBeNull()
  })

  it('줄에 여유가 있는 단추는 보이는 높이를 44px로 키운다 (정보 화면·일시 정지·고르는 카드·처음 화면)', () => {
    for (const s of ['.menu-relics__salvage', '.menu-merge__go', '.menu-forge__make', '.menu-train__reset', '.menu-myth__choose', '.menu-src__level', '.pause__button', '.return-card__later', '.title__button']) {
      expect(px(s, 'min-height'), s).toBe(44)
    }
    // 「뒤로」·「시작」의 폭(120px)은 건드리지 않는다: 폭까지 44px로 누르면 두 단추가 글자 폭으로 줄어든다
    expect(decls('.title__button')).not.toContain('min-width')
    expect(px('.menu-relics__action', 'width')).toBe(44)
    expect(px('.menu-relics__action', 'height')).toBe(44)
    expect(px('.pause__row', 'min-height')).toBe(44)
    expect(px('.pause__range', 'height')).toBe(44)
    // 머리줄의 「처음 화면」 (윗줄 높이를 정한다: 설정·닫기도 같은 높이)
    expect(text).toMatch(/:root \.menu__home \{[^}]*min-height: 44px/)
  })

  it('모양을 둔 채 ::before로 넓히는 것: 보이는 크기에서 테두리를 빼고 넓힌 만큼을 더하면 44px이다', () => {
    /** 보이는 크기, 테두리 두께, 넓힌 만큼(inset의 첫 값) → 누르는 자리 */
    const hit = (size, border, selector) => {
      const inset = Number(decls(`${selector}::before`).match(/inset: (-?\d+)px/)[1])
      return size - 2 * border - 2 * inset
    }
    // 알약: 높이 36px, 테두리 1px (theme.css의 .ui-pill)
    expect(css('theme.css')).toMatch(/\.ui-btn,\n\.ui-pill \{[^}]*border: 1px solid/)
    expect(hit(px('button.ui-pill', 'min-height'), 1, 'button.ui-pill')).toBe(44)
    expect(px('button.ui-pill', 'min-width')).toBe(44)
    // 신들의 지도 칸: 38px, 테두리 1px
    expect(base('menu.css', '.menu-tree__node')).toContain('border: 1px solid')
    expect(hit(px('.menu-tree__node', 'height'), 1, '.menu-tree__node')).toBe(44)
    expect(px('.menu-tree__node', 'min-width')).toBe(38)
    // 왕관 칸은 테두리가 3px
    expect(base('menu.css', '.menu-tree__node.is-crown')).toContain('border-width: 3px')
    expect(hit(px('.menu-tree__node', 'height'), 3, '.menu-tree__node.is-crown')).toBe(44)
    // 색 칸: 36px, 테두리 없음
    expect(base('title.css', '.title-swatch')).toContain('border: 0')
    expect(hit(px('.title-swatch', 'height'), 0, '.title-swatch')).toBe(44)
    // 원천 탭의 「?」: 16px
    expect(base('menu.css', '.menu-src__help')).toContain('height: 16px')
    expect(hit(16, 0, '.menu-src__help')).toBe(44)
    // 수련 마디와 HUD 메뉴 단추는 제 크기(--size, --unit × 6)에서 모자란 만큼만
    expect(decls('.menu-train__node::before')).toContain('inset: calc((var(--size) - 44px) / 2 - var(--bw))')
    expect(decls('.menu-button::before')).toContain('inset: min(0px, calc((var(--unit) * 6 - 44px) / 2))')
    // ::before를 품는 것은 자리를 잡은 요소여야 한다 (이미 fixed·absolute인 메뉴 단추·「건너뛰기」는 그대로 둔다)
    for (const s of ['button.ui-pill', '.menu-train__node', '.menu-train__branch', '.menu-tree__node', '.menu-src__help', '.title-swatch']) expect(decls(s), s).toContain('position: relative')
    for (const s of ['.menu-button', '.dialog__skip']) expect(decls(s), s).not.toContain('position')
    expect(base('menu.css', '.menu-button')).toContain('position: fixed')
    expect(base('hud.css', '.dialog__skip')).toContain('position: absolute')
  })

  it('넓힌 자리가 이웃과 겹치지 않는다: 보이는 크기 + 사이 간격 = 44px', () => {
    // 외형 칩 (여러 줄)과 색 칸: 36 + 8
    expect(decls('.wardrobe__chips')).toContain('gap: var(--sp-4)')
    expect(decls('.title-creator__swatches')).toContain('gap: var(--sp-4)')
    expect(px('button.ui-pill', 'min-height') + space('sp-4')).toBe(44)
    expect(px('.title-swatch', 'width') + space('sp-4')).toBe(44)
    // 신들의 지도 칸: 38 + 6 (menu.css의 칸 사이 간격)
    for (const s of ['.menu-tree__gods', '.menu-tree__land']) expect(base('menu.css', s), s).toContain('gap: var(--sp-3)')
    expect(px('.menu-tree__node', 'height') + space('sp-3')).toBe(44)
    // 설정의 알약은 44px 줄 안에 한 줄로 놓인다
    expect(px('.pause__row', 'min-height')).toBe(44)
    // 신 탭 「자리 · 외형」 줄 바로 아래에는 외형의 부위 칸이 붙는다: 알약이 아래로 더 받는 만큼 띄운다
    const below = (44 - px('button.ui-pill', 'min-height')) / 2
    expect(below).toBe(4)
    expect(base('menu.css', '.menu-gods__views')).not.toMatch(/margin|padding/)
    expect(decls('.menu-gods__views')).toContain('margin-bottom: var(--sp-2)')
    expect(space('sp-2')).toBeGreaterThanOrEqual(below)
  })

  it('저장 슬롯의 「×」는 모양을 둔 채 카드 모서리 44px을 받고, 급히 두 번 누른 것은 지우지 않는다', () => {
    const hit = decls('.title-slot__delete::before')
    expect(hit).toContain('width: 44px')
    expect(hit).toContain('height: 44px')
    // 「×」가 카드 모서리에서 들어간 만큼 되돌아가 모서리에 붙는다 (카드 밖으로 나가 이웃 슬롯을 덮지 않는다). 카드는 테두리가 없다
    const del = base('title.css', '.title-slot__delete')
    expect(del).toContain('position: absolute')
    expect(del).toContain('top: var(--sp-2)')
    expect(del).toContain('right: var(--sp-3)')
    expect(hit).toContain('top: calc(-1 * var(--sp-2))')
    expect(hit).toContain('right: calc(-1 * var(--sp-3))')
    expect(base('title.css', '.title-slot')).toContain('border: 0')
    expect(Number(base('title.css', '.title-slot').match(/min-height: (\d+)px/)[1])).toBeGreaterThanOrEqual(44)
    // 보이는 「×」의 크기·자리는 건드리지 않는다
    expect(decls('.title-slot__delete')).toBe('')
    // 넓힌 만큼 잘못 닿기 쉬우니 지킴과 함께 간다 (규칙은 tests/myself.test.ts)
    const source = readFileSync(new URL('../src/ui/TitleScreen.ts', import.meta.url), 'utf8')
    expect(source).toMatch(/if \(confirmsDelete\(armedAt, performance\.now\(\)\)\) handlers\.onDelete\(i\)/)
  })
})
