import { existsSync, readFileSync } from 'node:fs'

import { chromium } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { findCuts } from '../scripts/lib/cuts.mjs'

// 잘린 요소 검사는 실제 배치(자리·겹침·넘침)를 봐야 해서 브라우저에서 돌린다 (게임은 띄우지 않고 작은 HTML 조각만).
// 브라우저가 없는 곳에서는 건너뛴다 (CI는 CHROMIUM_PATH, 이 환경은 /opt/pw-browsers)
const defaultBrowser = () => {
  try {
    return chromium.executablePath()
  } catch {
    return null
  }
}
const BROWSER = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', defaultBrowser()].find((p) => p && existsSync(p))
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
