import { existsSync, readFileSync } from 'node:fs'

import { chromium } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { findCuts } from '../scripts/lib/cuts.mjs'
import { POWERS } from '../src/data/powers'
import { powerCardMarkup } from '../src/ui/powerCardView'

// 잘린 요소 검사는 실제 배치(자리·겹침·넘침)를 봐야 해서 브라우저에서 돌린다 (게임은 띄우지 않고 작은 HTML 조각만).
// 브라우저가 없는 곳에서는 건너뛴다 (CI는 CHROMIUM_PATH, 이 환경은 /opt/pw-browsers)
const defaultBrowser = () => {
  try {
    return chromium.executablePath()
  } catch {
    return null
  }
}
const BROWSER = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', defaultBrowser()].find((p) => p && existsSync(p))
const css = (file) => readFileSync(new URL(`../src/ui/${file}`, import.meta.url), 'utf8')
/** 1×1 투명 그림 (탭 그림 자리) */
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

describe.skipIf(!BROWSER)('잘린 요소 검사 (scripts/lib/cuts.mjs, E307)', () => {
  let browser
  beforeAll(async () => {
    browser = await chromium.launch({ executablePath: BROWSER })
  }, 60000)
  afterAll(async () => {
    await browser?.close()
  })

  /** 게임 페이지와 같은 뼈대 (`index.html`): 화면에 묶인 #app, 넘친 것이 페이지를 넓히지 않는다 */
  const SHELL = '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"><style>html, body { margin: 0; height: 100%; overflow: hidden; } #app { position: fixed; inset: 0; }</style>'

  /** 그 크기의 화면에 HTML 조각을 놓고 검사를 돌린다 (세로 크기는 ui-sheet처럼 터치 기기로) */
  const cuts = async (html, [width, height] = [393, 852]) => {
    const page = await browser.newPage({ viewport: { width, height }, ...(width < height ? { hasTouch: true, isMobile: true } : {}) })
    try {
      await page.setContent(`${SHELL}<div id="app">${html}</div>`)
      return await page.evaluate(findCuts)
    } finally {
      await page.close()
    }
  }
  const kinds = (list, kind) => list.filter((c) => c.startsWith(`${kind} `))

  describe('정보 화면의 탭 줄 (실제 CSS)', () => {
    const TABS = ['상태', '장비', '수련', '신', '원천', '지도', '맹세', '끝없는 원정']
    /** 정보 화면의 머리줄 (`GameMenu`가 짓는 모양): 탭 count개, on번째가 켜진 탭 */
    const menu = (count, on, styles) => {
      const tabs = TABS.slice(0, count).map((t, i) => `<button class="menu__tab${i === on ? ' is-on' : ''}" type="button"><img src="${PIXEL}"><span>${t}</span></button>`)
      const head = `<nav class="menu__tabs">${tabs.join('')}</nav><button class="menu__home" type="button"><img src="${PIXEL}"><span>처음 화면</span></button><button class="menu__gear" type="button"><img src="${PIXEL}"></button><button class="menu__close" type="button">×</button>`
      return `<style>${styles.map(css).join('\n')}</style><div class="hud"><div class="menu"><section class="menu__frame ui-panel"><header class="menu__head">${head}</header><div class="menu__body"></div></section></div></div>`
    }

    it('옛 한 줄 배치(세로 화면 규칙 없이)는 탭이 여섯이 되면 「밀림」으로 잡힌다: 마지막 탭이 오른쪽 단추에 가린다', async () => {
      // E307 전의 세로 화면: 탭 줄이 단추 셋 앞 폭 안에서 옆으로 밀렸고(막대는 숨김) 그 표시가 없었다. 옛 검사는 미는 상자 안을 세지 않아 0이었다
      for (const count of [6, 8]) {
        const found = await cuts(menu(count, 0, ['theme.css', 'menu.css']))
        const pushed = kinds(found, '밀림')
        expect(pushed, `탭 ${count}`).toHaveLength(1)
        expect(pushed[0]).toMatch(/^밀림 menu__tabs: 가로 \+\d+px, 단서 없음, 가려진 단추 \d+/)
        // 그 밖의 종류로는 잡히지 않는다 (같은 것을 두 번 세지 않는다)
        expect(found).toEqual(pushed)
      }
    }, 30000)

    it.each([
      [393, 852],
      [393, 659],
      [390, 844],
    ])('지금 배치는 %i×%i에서 탭 여덟이 다 보이고 눌린다 (잘림 0)', async (width, height) => {
      for (const on of [0, 5, 7]) expect(await cuts(menu(8, on, ['theme.css', 'menu.css', 'portrait.css']), [width, height]), `켜진 탭 ${TABS[on]}`).toEqual([])
    }, 30000)

    it('가로 화면(1280×720·960×540)의 한 줄 머리줄도 탭 여덟이 넘치지 않는다', async () => {
      for (const size of [[1280, 720], [960, 540]]) expect(await cuts(menu(8, 7, ['theme.css', 'menu.css', 'portrait.css']), size), size.join('×')).toEqual([])
    }, 30000)
  })

  describe('덮임: 누르는 요소의 가운데를 다른 요소가 덮는다', () => {
    const box = 'position:absolute;left:20px;top:20px;width:60px;height:44px'

    it('단추 위에 다른 단추가 놓이면 잡는다', async () => {
      const found = await cuts(`<div class="hud"><button style="${box}">아래</button><button class="cover" style="${box};left:40px">위</button></div>`)
      expect(found).toEqual(['덮임 BUTTON: 아래 ← cover'])
    })

    it('누르는 요소는 단추가 아니어도 된다 (cursor: pointer), 그 안의 글·그림은 따로 세지 않는다', async () => {
      const found = await cuts(`<div class="hud"><div class="tab" style="${box};cursor:pointer"><span>탭</span></div><div class="cover" style="${box};background:#000"></div></div>`)
      expect(found).toEqual(['덮임 tab: 탭 ← cover'])
    })

    it('제 안의 것(그림·글·표시)이 가운데에 있는 것은 덮인 것이 아니다', async () => {
      expect(await cuts(`<div class="hud"><button style="${box}"><span style="display:block;width:60px;height:44px">이름</span></button></div>`)).toEqual([])
    })

    it('누름을 받지 않는 장식(pointer-events: none)이 겹친 것은 세지 않는다', async () => {
      expect(await cuts(`<div class="hud"><button style="${box}">단추</button><div style="${box};pointer-events:none;background:rgba(255,255,255,.3)"></div></div>`)).toEqual([])
    })

    it('꺼진 단추와 누름을 받지 않는 단추는 덮여도 세지 않는다', async () => {
      const cover = `<div style="${box};background:#000"></div>`
      expect(await cuts(`<div class="hud"><button disabled style="${box}">꺼짐</button>${cover}</div>`)).toEqual([])
      expect(await cuts(`<div class="hud"><button aria-disabled="true" style="${box}">꺼짐</button>${cover}</div>`)).toEqual([])
      expect(await cuts(`<div class="hud"><button style="${box};pointer-events:none">빈 칸</button>${cover}</div>`)).toEqual([])
    })

    it('다른 창이 위에 열려 가린 것은 세지 않고(정보 화면이 HUD를, 일시 정지가 정보 화면을), 같은 창 안에서 덮이면 잡는다', async () => {
      const win = 'position:fixed;inset:0;background:rgba(0,0,0,.5)'
      // HUD 단추 위에 정보 화면
      expect(await cuts(`<div class="hud"><button style="${box}">초상</button><div class="menu" style="${win}"></div></div>`)).toEqual([])
      // 정보 화면 단추 위에 일시 정지
      expect(await cuts(`<div class="hud"><div class="menu" style="${win}"><button style="${box}">탭</button></div><div class="pause" style="${win}"></div></div>`)).toEqual([])
      // 정보 화면 안에서 탭이 옆 단추에 덮임
      expect(await cuts(`<div class="hud"><div class="menu" style="${win}"><button style="${box}">탭</button><button class="menu__home" style="${box};left:30px">처음</button></div></div>`)).toEqual(['덮임 BUTTON: 탭 ← menu__home'])
      // 창 밖의 HUD 요소(누름을 받는)가 창 안의 단추를 덮음
      expect(kinds(await cuts(`<div class="hud"><div class="menu" style="${win}"><button style="${box}">탭</button></div><div class="minimap" style="position:fixed;left:0;top:0;width:128px;height:128px;z-index:1;cursor:pointer"></div></div>`), '덮임')).toEqual(['덮임 BUTTON: 탭 ← minimap'])
    })

    it('세로로 굴려 넘긴 단추와 접어 둔 상자 안의 단추는 덮인 것으로 세지 않는다', async () => {
      // 본문(세로로 미는 상자) 아래로 넘어간 단추: 그 자리에 다른 것이 있어도 굴리면 보인다
      const body = `<div class="menu__body" style="position:absolute;left:0;top:0;width:200px;height:100px;overflow-y:auto"><div style="height:300px"></div><button style="width:60px;height:44px">아래</button></div><div style="position:absolute;left:0;top:100px;width:200px;height:400px;background:#000"></div>`
      expect(await cuts(`<div class="hud">${body}</div>`)).toEqual([])
      // 접힌 상자(높이 0, 잘라 냄): 옛 규칙대로 「세로」로만 잡히고 「덮임」으로 또 세지 않는다
      const folded = await cuts(`<div class="hud"><div style="height:0;overflow:hidden"><button style="width:60px;height:44px">접힘</button></div><div style="position:absolute;left:0;top:0;width:200px;height:200px;background:#000"></div></div>`)
      expect(kinds(folded, '덮임')).toEqual([])
      expect(folded).toEqual(['세로 BUTTON: 접힘'])
    })
  })

  describe('덮임: 뜬 창 안의 글을 창 밖의 요소가 덮는다', () => {
    /** 393×659의 작은 지도 자리 (오른쪽 위, 고르는 카드 위에 그려진다) */
    const minimap = '<div class="minimap" style="position:fixed;left:253px;top:59px;width:128px;height:128px;z-index:40;background:#000"></div>'
    /** 고르는 카드: 제목의 글 끝이 x 263에 닿는다 (글꼴에 따라 글 폭이 달라도 끝은 같게 오른쪽 맞춤) */
    const card = (top, title = '<div class="pick-card__title" style="width:255px;text-align:right;font-size:15px;line-height:20px">맹세를 걸고 떠난다</div>') =>
      `<div class="pick-card" style="position:fixed;left:8px;top:${top}px;width:377px;height:260px;z-index:35;background:#222">${title}</div>`

    it('제목의 끝 글자만 작은 지도에 덮여도 잡는다 (누르는 요소가 아니어도)', async () => {
      // 393×659의 맹세 출발 카드: 위 끝이 작은 지도의 아래 끝(187)보다 높아 제목 끝 글자가 가렸다
      expect(await cuts(`<div class="hud">${card(171)}${minimap}</div>`, [393, 659])).toEqual(['덮임 pick-card__title: 맹세를 걸고 떠난다 ← minimap'])
      // 카드가 작은 지도 아래에서 시작하면 0
      expect(await cuts(`<div class="hud">${card(195)}${minimap}</div>`, [393, 659])).toEqual([])
    })

    it('창의 모서리만 걸리고 글은 가리지 않으면 세지 않는다', async () => {
      // 제목이 짧아 작은 지도 왼쪽에서 끝난다 (393×659의 귀환 카드)
      const short = '<div class="pick-card__title" style="width:230px;text-align:right;font-size:15px;line-height:20px">원정 1을 마친다</div>'
      expect(await cuts(`<div class="hud">${card(171, short)}${minimap}</div>`, [393, 659])).toEqual([])
    })

    it('창 밖 HUD의 글끼리 겹친 것은 세지 않는다 (얻은 것 카드가 작은 지도 자리를 빌린다)', async () => {
      expect(await cuts(`<div class="hud"><div class="hud__goal" style="position:fixed;left:200px;top:100px;width:150px;height:20px">목표 한 줄</div>${minimap}</div>`, [393, 659])).toEqual([])
    })

    it('같은 창 안의 것과 위에 열린 다른 창이 덮은 글은 세지 않는다', async () => {
      const win = 'position:fixed;inset:0;background:rgba(0,0,0,.5)'
      const text = '<p style="position:absolute;left:20px;top:20px;margin:0">본문</p>'
      // 정보 화면의 붙박인 머리줄이 굴려 올린 본문 위에
      expect(await cuts(`<div class="hud"><div class="menu" style="${win}">${text}<header style="position:absolute;left:0;top:0;width:200px;height:60px;background:#000"></header></div></div>`)).toEqual([])
      // 정보 화면 위에 일시 정지
      expect(await cuts(`<div class="hud"><div class="menu" style="${win}">${text}</div><div class="pause" style="${win}"></div></div>`)).toEqual([])
    })

    it('덮인 단추와 그 안의 글을 따로 세지 않는다', async () => {
      const button = '<button style="position:absolute;left:260px;top:70px;width:100px;height:44px"><span>침묵의 맹세</span></button>'
      expect(await cuts(`<div class="hud"><div class="pick-card" style="position:fixed;left:8px;top:60px;width:377px;height:260px;z-index:35">${button}</div>${minimap}</div>`, [393, 659])).toEqual(['덮임 BUTTON: 침묵의 맹세 ← minimap'])
    })
  })

  describe('고르는 카드의 자리 (실제 CSS, E307): 세로 화면에서 위쪽 묶음과 아래 묶음 사이에 다 들어온다', () => {
    const STYLES = ['theme.css', 'parts.css', 'hud.css', 'chapter.css', 'pickCard.css', 'return.css', 'portrait.css']
    const branch = (name, text) => `<button class="pick-card__card" type="button"><b>${name}</b><small>${text}</small></button>`
    /** 귀환 카드 (`ReturnCard`가 짓는 모양): 갈래 다섯, depth면 엔딩 뒤의 깊이 알약 둘과 「지난번 그대로」 꼬리표까지 */
    const returnCard = ({ depth = false, hidden = false } = {}) =>
      `<div class="pick-card return-card"${hidden ? ' hidden' : ''}><div class="pick-card__title">원정 4를 마친다</div>` +
      '<div class="return-card__mult"><b>×1.32 → ×1.45</b><small>명성 +10</small></div>' +
      '<div class="return-card__line">이번 원정 5:00 · 지난 원정 5:00</div>' +
      '<div class="return-card__line is-keep">남는 것: 깨운 신·신 단계·유물표·원형·장 진행·웨이포인트·가장 좋은 장비 2</div>' +
      '<div class="return-card__line is-clear">지워지는 것: 수련(깨달음과 마디), 일반 장비</div>' +
      (depth ? '<div class="return-card__depth"><button class="ui-pill is-on" type="button">그대로 · 깊이 1</button><button class="ui-pill" type="button">+1 · 깊이 2</button></div>' : '') +
      '<div class="return-card__ask">하나를 골라 돌아간다</div><div class="pick-card__row">' +
      `<button class="pick-card__card" type="button">${depth ? '<small class="return-card__again">지난번 그대로</small>' : ''}<b>불꽃 불씨</b><small>원천 +2, 모든 피해 ×1.1</small></button>` +
      branch('토르 승천', '2단계: 모든 피해 ×1.35, 생명 +25%') +
      branch('사냥 불씨', '원천 +2, 받는 명성 ×1.25') +
      branch('바람 불씨', '원천 +2, 공격·이동 ×1.06') +
      branch('바위 불씨', '원천 +2, 최대 생명 ×1.15·받는 피해 ×0.95') +
      '</div><button class="ui-btn return-card__later" type="button">아직</button></div>'
    /** 맹세 출발 카드 (`OathCard`): 맹세 count장 */
    const oathCard = (count) =>
      '<div class="pick-card return-card oath-card"><div class="pick-card__title">맹세를 걸고 떠난다</div><div class="return-card__ask">그 원정에서 장 보스나 수호자를 이기면 지킨다</div><div class="pick-card__row">' +
      Array.from({ length: count }, (_, i) => `<button class="pick-card__card" type="button"><b>맹세 ${i + 1}의 이름</b><small>떠난 지 10분 안에 지켜야 한다</small><small class="oath-card__reward">모든 무기 동작 빠르기 +10%</small></button>`).join('') +
      '</div><button class="ui-btn return-card__later" type="button">맹세 없이</button></div>'
    /** 게임의 HUD 뼈대: 초상 줄·원천 칩·아래 묶음(생명 막대와 유물 칸)·작은 지도·목표 한 줄, 그리고 카드 */
    const hud = (card) =>
      `<style>${STYLES.map(css).join('\n')}</style><script>document.documentElement.classList.add('is-touch')</script><div class="hud">` +
      '<div class="hud__status"><div style="width:113px;height:52px"></div></div><div class="hud__essence"><span class="hud__essence-cell">2</span></div>' +
      `<div class="hud__dock"><div class="hud__life ui-bar"></div><div class="hud__slots">${'<div class="hud__slot"></div>'.repeat(4)}</div></div>` +
      `<canvas class="minimap" width="64" height="64"></canvas><div class="chapter-goal"><span>성소 화로에서 첫 원정을 마친다</span></div>${card}</div>`
    /** 그 화면에서 잘린 요소와 자리들 */
    const layout = async (html, [width, height]) => {
      const page = await browser.newPage({ viewport: { width, height }, ...(width < height ? { hasTouch: true, isMobile: true } : {}) })
      try {
        await page.setContent(`${SHELL}<div id="app">${html}</div>`)
        const found = await page.evaluate(findCuts)
        const boxes = await page.evaluate(() => {
          const box = (sel) => {
            const el = document.querySelector(sel)
            const r = el.getBoundingClientRect()
            return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, shown: getComputedStyle(el).visibility !== 'hidden', scroll: el.scrollHeight - el.clientHeight }
          }
          return { card: box('.pick-card'), status: box('.hud__status'), dock: box('.hud__dock'), minimap: box('.minimap'), goal: box('.chapter-goal'), chips: box('.hud__essence'), later: box('.return-card__later') }
        })
        return { found, ...boxes }
      } finally {
        await page.close()
      }
    }
    const PHONES = [[393, 659], [393, 852], [390, 844]]
    const CARDS = [
      ['귀환 카드', returnCard()],
      ['엔딩 뒤 귀환 카드 (깊이 알약·지난번 그대로)', returnCard({ depth: true })],
      ['맹세 셋', oathCard(3)],
      ['맹세 여덟', oathCard(8)],
    ]

    it.each(PHONES)('%i×%i: 카드가 초상 줄 아래에서 시작해 아래 묶음 위에서 끝나고, 밀지 않아도 다 보인다 (잘림·덮임 0)', async (width, height) => {
      for (const [name, card] of CARDS) {
        const at = await layout(hud(card), [width, height])
        expect(at.found, name).toEqual([])
        expect(at.card.top, name).toBeGreaterThanOrEqual(at.status.bottom)
        expect(at.card.bottom, name).toBeLessThanOrEqual(at.dock.top)
        expect(at.card.scroll, name).toBeLessThanOrEqual(0)
        expect(at.card.left, name).toBeGreaterThanOrEqual(0)
        expect(at.card.right, name).toBeLessThanOrEqual(width)
      }
    }, 60000)

    it('카드가 떠 있는 동안 작은 지도·원천 칩·목표 한 줄은 숨고(카드가 그 자리까지 쓴다), 닫히면 돌아온다', async () => {
      const open = await layout(hud(returnCard()), [393, 659])
      expect([open.minimap.shown, open.chips.shown, open.goal.shown]).toEqual([false, false, false])
      // 393×659에서는 카드가 작은 지도의 아래 끝보다 위에서 시작한다: 숨기지 않으면 카드 위에 그려진다 (작은 지도 40, 카드 35)
      expect(open.card.top).toBeLessThan(open.minimap.bottom)
      const closed = await layout(hud(returnCard({ hidden: true })), [393, 659])
      expect([closed.minimap.shown, closed.chips.shown, closed.goal.shown]).toEqual([true, true, true])
    }, 30000)

    it('띠보다 긴 카드(맹세 스무 장)는 카드 안에서 민다: 아래 묶음을 덮지 않고 초상 줄도 넘지 않는다', async () => {
      const at = await layout(hud(oathCard(20)), [393, 659])
      expect(at.card.scroll).toBeGreaterThan(0)
      expect(at.card.top).toBeGreaterThanOrEqual(at.status.bottom)
      expect(at.card.bottom).toBeLessThanOrEqual(at.dock.top)
    }, 30000)

    it('가로 화면(1280×720)은 그대로다: 카드는 위쪽 18%에 뜨고 작은 지도는 숨지 않는다', async () => {
      const at = await layout(hud(returnCard()), [1280, 720])
      expect(at.found).toEqual([])
      expect(at.minimap.shown).toBe(true)
      expect(Math.round(at.card.top)).toBe(Math.round(720 * 0.18))
      expect(at.card.right).toBeLessThan(at.minimap.left)
    }, 30000)
  })

  describe('힘 카드 (실제 CSS, 재미 재설계 P5): 가장 긴 이름·풀이 셋이 한 화면에 든다', () => {
    const STYLES = ['theme.css', 'parts.css', 'hud.css', 'chapter.css', 'pickCard.css', 'powerCard.css', 'portrait.css']
    /** 이름·풀이가 가장 긴 힘 셋에, 조합 표시와 「가진 힘으로 남는다」를 모두 붙인 견본 */
    const longest = [...POWERS].sort((a, b) => b.name.length + b.line.length - (a.name.length + a.line.length)).slice(0, 3)
    const KINDS = { weapon: '무기', ultimate: '궁극기', aura: '힘' }
    const card = powerCardMarkup({
      title: '프레이',
      say: '내 수호자를 넘었구나. 하나를 더 가져가라',
      color: '#ffd27a',
      rows: longest.map((p, i) => ({ id: p.id, kind: KINDS[p.kind], name: p.name, line: p.line, color: '#9fe3ff', combo: '종말의 전령', ...(i > 0 ? { spare: true } : {}) })),
    })
    const page = (size) =>
      `<style>${STYLES.map(css).join('\n')}</style>${size[0] < size[1] ? "<script>document.documentElement.classList.add('is-touch')</script>" : ''}<div class="hud">` +
      '<div class="hud__status"><div style="width:113px;height:52px"></div></div>' +
      `<div class="hud__dock"><div class="hud__life ui-bar"></div><div class="hud__slots">${'<div class="hud__slot"></div>'.repeat(4)}</div></div>` +
      `<canvas class="minimap" width="64" height="64"></canvas><div class="pick-card power-card">${card}</div></div>`

    it.each([
      [393, 659],
      [393, 852],
      [390, 844],
      [960, 540],
      [1280, 720],
    ])('%i×%i: 셋이 밀지 않아도 다 보이고 잘림·덮임이 0, 세로 화면은 아래 묶음 위에서 끝난다', async (width, height) => {
      const p = await browser.newPage({ viewport: { width, height }, ...(width < height ? { hasTouch: true, isMobile: true } : {}) })
      try {
        await p.setContent(`${SHELL}<div id="app">${page([width, height])}</div>`)
        expect(await p.evaluate(findCuts)).toEqual([])
        const at = await p.evaluate(() => {
          const box = (sel) => document.querySelector(sel).getBoundingClientRect()
          const el = document.querySelector('.power-card')
          return { card: box('.power-card'), dock: box('.hud__dock'), rows: [...document.querySelectorAll('.power-card__row')].map((r) => r.getBoundingClientRect().bottom), scroll: el.scrollHeight - el.clientHeight }
        })
        expect(at.scroll).toBeLessThanOrEqual(0)
        expect(at.rows).toHaveLength(3)
        for (const bottom of at.rows) expect(bottom).toBeLessThanOrEqual(height)
        expect(at.card.left).toBeGreaterThanOrEqual(0)
        expect(at.card.right).toBeLessThanOrEqual(width)
        if (width < height) expect(at.card.bottom).toBeLessThanOrEqual(at.dock.top)
      } finally {
        await p.close()
      }
    }, 30000)
  })

  describe('위쪽 묶음과 땅 위의 글 (실제 CSS, E307 손 QA)', () => {
    const STYLES = ['theme.css', 'parts.css', 'hud.css', 'chapter.css', 'portrait.css']
    const page = async ([width, height], body) => {
      const p = await browser.newPage({ viewport: { width, height }, ...(width < height ? { hasTouch: true, isMobile: true } : {}) })
      await p.setContent(`${SHELL}<div id="app"><style>${STYLES.map(css).join('\n')}</style><div class="hud">${body}</div></div>`)
      return p
    }
    /** 목표 한 줄 (`ChapterHud`가 짓는 모양): 마름모·글·막대 */
    const goal = (text, { bar = false, hidden = false } = {}) =>
      `<canvas class="minimap" width="64" height="64"></canvas><div class="chapter-goal${bar ? ' has-bar' : ''}"${hidden ? ' hidden' : ''}><i class="chapter-goal__mark"></i><span>${text}</span><div class="chapter-goal__bar"><div style="width:40%"></div></div></div>`
    const boxes = (p) =>
      p.evaluate(() => {
        const box = (sel) => {
          const r = document.querySelector(sel).getBoundingClientRect()
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }
        }
        const span = document.querySelector('.chapter-goal > span')
        return { goal: box('.chapter-goal'), mark: box('.chapter-goal__mark'), text: box('.chapter-goal > span'), bar: box('.chapter-goal__bar'), minimap: box('.minimap'), line: parseFloat(getComputedStyle(span).lineHeight), shown: getComputedStyle(document.querySelector('.chapter-goal')).display }
      })
    const LONG = '성소 화로에서 첫 원정을 마친다 그리고 더 긴 목표의 글이 이어지고 또 이어진다'

    it.each([[393, 852], [393, 659], [390, 844]])('%i×%i: 목표가 길어 줄을 바꿔도 금빛 마름모는 글의 첫 줄 옆에 선다 (혼자 윗줄에 남지 않는다)', async (width, height) => {
      const p = await page([width, height], goal(LONG))
      try {
        const at = await boxes(p)
        // 글은 두 줄 넘게 접혔고, 마름모는 그 첫 줄의 높이 안, 글의 왼쪽에 있다
        expect(at.text.height).toBeGreaterThan(at.line * 1.5)
        expect(at.mark.right).toBeLessThanOrEqual(at.text.left)
        expect(at.mark.top).toBeGreaterThanOrEqual(at.text.top)
        expect(at.mark.bottom).toBeLessThanOrEqual(at.text.top + at.line)
        // 상자의 높이는 글의 줄만큼이다: 마름모만의 줄이 따로 없다
        expect(at.goal.height - at.text.height).toBeLessThan(at.line)
        // 글은 작은 지도 왼쪽에서 끝나고, 상자(테 1px)도 작은 지도의 테두리(2px)에 닿지 않는다.
        // 전에는 폭에 안쪽 여백을 세지 않아 상자의 오른쪽 끝이 테두리 위에 놓였다 (393×659에서 6px)
        expect(at.text.right).toBeLessThanOrEqual(at.minimap.left)
        expect(at.goal.right + 1).toBeLessThanOrEqual(at.minimap.left - 2 - 6)
      } finally {
        await p.close()
      }
    }, 30000)

    it('짧은 목표는 한 줄이고, 채우는 목표의 막대는 글 아래에서 상자 폭을 다 쓴다', async () => {
      const p = await page([393, 852], goal('유물을 벼린다 0/3', { bar: true }))
      try {
        const at = await boxes(p)
        expect(at.text.height).toBeLessThan(at.line * 1.5)
        expect(at.mark.right).toBeLessThanOrEqual(at.text.left)
        expect(at.bar.top).toBeGreaterThanOrEqual(at.text.bottom)
        // 양옆 안쪽 여백(12px)만 빼고 다 쓴다
        expect(at.bar.left).toBeLessThan(at.text.left)
        expect(at.bar.width).toBeCloseTo(at.goal.width - 24, 0)
      } finally {
        await p.close()
      }
    }, 30000)

    it('짧은 세로 화면(393×659)은 작은 지도가 96px이고 목표 한 줄이 그만큼 넓어진다. 393×852와 가로 화면은 128px 그대로 (E307 손 QA)', async () => {
      const sizes = {}
      for (const [width, height] of [[393, 659], [393, 852], [390, 844], [1280, 720], [960, 540]]) {
        const p = await page([width, height], goal(LONG))
        try {
          sizes[`${width}x${height}`] = await boxes(p)
        } finally {
          await p.close()
        }
      }
      const short = sizes['393x659']
      const tall = sizes['393x852']
      expect([short.minimap.width, short.minimap.height]).toEqual([96, 96])
      for (const key of ['393x852', '390x844', '1280x720', '960x540']) expect([sizes[key].minimap.width, sizes[key].minimap.height], key).toEqual([128, 128])
      // 128px일 때는 화면 폭의 3분의 1이었다: 줄인 지도는 4분의 1을 넘지 않고, 그 왼쪽 길(화면 폭의 70%)이 눌린다
      expect(short.minimap.width / 393).toBeLessThan(0.25)
      expect(short.minimap.left).toBeGreaterThan(393 * 0.7)
      // 손가락이 누르는 자리(44px)보다는 넉넉히 크다 (누르면 지도 탭)
      expect(short.minimap.width).toBeGreaterThanOrEqual(88)
      // 목표 한 줄은 줄어든 지도 옆 폭을 쓴다: 지도의 테두리에는 닿지 않는다
      expect(short.goal.width).toBeGreaterThan(tall.goal.width + 24)
      expect(short.goal.right + 1).toBeLessThanOrEqual(short.minimap.left - 2 - 6)
    }, 60000)

    it.each([[393, 659], [393, 852]])('%i×%i: 보스 막대는 목표 한 줄 아래에 서고(지도가 줄어도 따라 올라가지 않는다) 작은 지도와 겹치지 않는다', async (width, height) => {
      const boss = '<div class="hud__boss is-visible has-name"><div class="ui-bar ui-bar--capped hud__boss-track"></div><div class="hud__boss-head"><span class="hud__boss-grade">보스</span><span class="hud__boss-name">요르문간드</span></div></div>'
      const p = await page([width, height], goal('유물을 벼린다 0/3', { bar: true }) + boss)
      try {
        const at = await boxes(p)
        const bar = await p.evaluate(() => {
          const r = document.querySelector('.hud__boss').getBoundingClientRect()
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
        })
        // 목표 한 줄(막대까지)의 아래
        expect(bar.top).toBeGreaterThanOrEqual(at.goal.bottom)
        // 작은 지도의 왼쪽이거나 아래 (겹치지 않는다)
        expect(bar.right <= at.minimap.left || bar.top >= at.minimap.bottom).toBe(true)
        expect(bar.left).toBeGreaterThanOrEqual(0)
        expect(bar.right).toBeLessThanOrEqual(width)
      } finally {
        await p.close()
      }
    }, 30000)

    it('숨긴 목표는 세로 화면에서도 숨는다, 가로 화면은 한 줄 그대로다', async () => {
      const hidden = await page([393, 852], goal(LONG, { hidden: true }))
      try {
        expect((await boxes(hidden)).shown).toBe('none')
      } finally {
        await hidden.close()
      }
      const wide = await page([1280, 720], goal(LONG))
      try {
        const at = await boxes(wide)
        expect(at.shown).toBe('flex')
        expect(at.text.height).toBeLessThan(at.line * 1.5)
        expect(Math.abs((at.mark.top + at.mark.bottom) / 2 - (at.text.top + at.text.bottom) / 2)).toBeLessThan(1)
      } finally {
        await wide.close()
      }
    }, 30000)

    const TEXTS =
      '<div class="hud__dock"><div class="hud__life ui-bar"></div><div class="hud__slots"><div class="hud__slot"></div></div></div>' +
      '<div class="hud__toast is-showing" style="animation: none; opacity: 1">더 좋은 장비 · 좋음 누빈 웃옷</div><div class="damage-numbers"><div class="damage-number damage-number--label">+ 좋음 누빈 웃옷</div></div>' +
      '<div class="chapter-goal"><i class="chapter-goal__mark"></i><span>목표</span></div>'

    it.each([[393, 852, 12], [393, 659, 12], [1920, 1200, 24]])('%i×%i: 작은 알림과 주운 것의 이름은 어두운 반투명 바탕 위에 뜬다 (떨어진 그림자 없이)', async (width, height, size) => {
      const p = await page([width, height], TEXTS)
      try {
        const at = await p.evaluate(() => {
          const read = (sel) => {
            const el = document.querySelector(sel)
            const style = getComputedStyle(el)
            const r = el.getBoundingClientRect()
            return { bg: style.backgroundColor, shadow: style.textShadow, font: parseFloat(style.fontSize), pad: parseFloat(style.paddingLeft), top: r.top, bottom: r.bottom, height: r.height }
          }
          return { toast: read('.hud__toast'), label: read('.damage-number--label'), goal: read('.chapter-goal'), dock: read('.hud__dock') }
        })
        for (const [name, text] of [['알림', at.toast], ['이름', at.label]]) {
          expect(text.font, name).toBe(size)
          // 목표 한 줄과 같은 바탕 (--c-veil): 눈 땅 위에서도 글 둘레가 어둡다. 전에는 두세 칸 떨어진 그림자 넷뿐이라 획 옆이 비었다
          expect(text.bg, name).toBe(at.goal.bg)
          expect(text.bg, name).toMatch(/^rgba\(\d+, \d+, \d+, 0\.[6-9]\d*\)$/)
          expect(text.shadow, name).toBe('none')
          // 글이 바탕의 가장자리에 붙지 않는다
          expect(text.pad, name).toBeGreaterThanOrEqual(6)
        }
        // 알림은 아래 묶음 위에 뜬다 (바탕이 생명 막대를 덮지 않는다)
        expect(at.toast.bottom).toBeLessThanOrEqual(at.dock.top)
        // 쌓이는 이름의 줄 높이는 글자 크기의 1.5배다 (`DamageNumbers.ts`): 바탕이 그보다 낮아 위아래 이름끼리 덮지 않는다
        expect(at.label.height).toBeLessThanOrEqual(size * 1.5)
      } finally {
        await p.close()
      }
    }, 30000)

    it('새 탭 카드는 메뉴 단추로 날아간 뒤 다 사라진다 (전: 흐린 채 31×9px로 남았다)', async () => {
      const p = await page([393, 659], '<div class="hud__gains is-fly is-showing" style="--life: 150ms"><div class="hud__gains-head"><div class="hud__gains-kind">새 탭</div><div class="hud__gains-title">장비</div></div></div>')
      try {
        await p.evaluate(() => Promise.all(document.querySelector('.hud__gains').getAnimations().map((a) => a.finished)))
        expect(await p.evaluate(() => getComputedStyle(document.querySelector('.hud__gains')).opacity)).toBe('0')
      } finally {
        await p.close()
      }
    }, 30000)
  })

  describe('밀림: 단서 없이 가로로 넘친 미는 상자', () => {
    const row = (style) => `<div class="hud"><div class="row" style="display:flex;width:200px;overflow-x:auto;${style}">${[1, 2, 3, 4, 5, 6].map((i) => `<button style="flex:none;width:60px;height:44px">${i}</button>`).join('')}</div></div>`

    it('스크롤 막대를 숨긴 가로 넘침을 잡고, 가려진 단추 수를 적는다', async () => {
      expect(await cuts(row('scrollbar-width:none'))).toEqual(['밀림 row: 가로 +160px, 단서 없음, 가려진 단추 3 (4)'])
    })

    it('가장자리를 흐려(mask-image) 밀 수 있음을 알리면 세지 않는다', async () => {
      expect(await cuts(row('scrollbar-width:none;mask-image:linear-gradient(90deg,#000 80%,transparent);-webkit-mask-image:linear-gradient(90deg,#000 80%,transparent)'))).toEqual([])
    })

    it('넘치지 않는 미는 상자와 세로로만 넘치는 본문은 세지 않는다', async () => {
      expect(await cuts(`<div class="hud"><div style="display:flex;width:300px;overflow-x:auto"><button style="flex:none;width:60px;height:44px">1</button></div></div>`)).toEqual([])
      expect(await cuts(`<div class="hud"><div style="width:200px;height:100px;overflow-y:auto"><div style="height:400px">긴 글</div></div></div>`)).toEqual([])
    })
  })

  it('옛 규칙 그대로: 화면 밖이나 잘라 내는 상자 밖으로 나간 요소는 「가로」·「세로」', async () => {
    expect(await cuts(`<div class="hud"><div class="wide" style="position:absolute;left:300px;top:0;width:200px;height:20px">넘침</div></div>`)).toEqual(['가로 wide: 넘침'])
    expect(await cuts(`<div class="hud"><div style="position:absolute;left:0;top:0;width:100px;height:40px;overflow:hidden"><div class="tall" style="height:80px">긴 것</div></div></div>`)).toEqual(['세로 tall: 긴 것'])
  })
})
