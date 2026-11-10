// 손으로 해 보기용 조종 서버 (E307-01 리뷰에서 만듦). 빌드한 게임을 브라우저로 열어 두고 HTTP로 한 걸음씩 조작한다.
// 봇(autoplay)이 못 잡는 것을 사람처럼 눌러 보며 찾을 때 쓴다: 카드 여닫기, 휴대폰의 톡·조이스틱·두 손가락, 잘못 눌리는 것.
// 띄우기:  npm run build && node scripts/drive.mjs [--size=390x844 --touch] [--query='?fresh'] [--out=test-results/hands-on] [--port=4310] [--ctl=4410] &
// 조작:    curl -s localhost:4410 -d '{"click":[640,360]}'
//          curl -s localhost:4410 -d '[{"tap":[195,500]},{"advance":2},{"shot":"a1"},{"state":true}]'   (걸음 여럿을 차례로)
// 끄기:    curl -s localhost:4410 -d '{"quit":true}'
// --query='' 는 저장이 없는 첫 실행(제목 화면부터)이다. 브라우저 문맥이 띄울 때마다 새것이라 저장은 그 실행 동안만 남는다.
// 걸음 종류:
//   {"click":[x,y]}            마우스 클릭 (컴퓨터)
//   {"move":[x,y]}             마우스 옮기기 (커서 아래 카드 보기)
//   {"wheel":dy}               마우스 휠
//   {"tap":[x,y]}              손가락 톡 (--touch일 때, 실제 터치 사건)
//   {"taps":[[x,y],[x,y]],"gap":80}   빠르게 이어 누르기 (gap ms)
//   {"touch":[{"id":1,"type":"down","at":[x,y]}, ...],"gap":30}  손가락 사건을 직접 (type: down·move·up·cancel, 여러 손가락)
//   {"drag":[[x1,y1],[x2,y2]],"hold":600,"advance":2,"id":1}   누른 채 끌고(조이스틱) 그 채로 advance초 감은 뒤 hold ms 뒤에 뗌
//   {"key":"Escape"}           키
//   {"advance":초}             게임 시간을 감는다 (game.advance, 화면은 그 뒤에 그려짐)
//   {"wait":ms}                실제 시간 기다리기 (HUD 카드·CSS 전환은 실제 시간으로 흐른다)
//   {"frames":n}               n 프레임 그려질 때까지
//   {"shot":"이름"}            스크린숏 → <out>/이름.png
//   {"eval":"식"}              게임 안 식의 값 (g = window.__game). 예: "g.view.viewHeight"
//   {"run":"문장들"}           게임 안 코드 실행 (g = window.__game). 개발 지름길은 g.dev.*
//   {"state":true}             한눈 상태 (시간·땅·생명·시야·목표 글·보이는 카드와 창)
//   {"dom":"선택자"}           맞는 요소들의 글·보임·자리·글꼴
//   {"reload":"?주소 뒤 값"}   다시 열기 (저장은 남는다)
// 이 환경은 소프트웨어 렌더링이라 실제 시간으로는 아주 느리게 흐른다. 누른 뒤 advance로 감는다.
// 누른 것은 다음에 그려지는 프레임에서 게임이 읽으므로, 누르는 걸음은 두 프레임을 기다린 뒤에 돌아온다.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const PORT = Number(arg('port', 4310))
const CTL = Number(arg('ctl', PORT + 100))
const [width, height] = arg('size', '1280x720').split('x').map(Number)
const TOUCH = process.argv.includes('--touch')
const QUERY = arg('query', '?fresh')
const OUT = resolve(ROOT, arg('out', 'test-results/hands-on'))
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
mkdirSync(OUT, { recursive: true })

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true, cwd: ROOT })
const stopServer = () => {
  try {
    process.kill(-server.pid)
  } catch {}
}
for (let i = 0; i < 80; i++) {
  try {
    if ((await fetch(`http://localhost:${PORT}/`)).ok) break
  } catch {}
  await new Promise((r) => setTimeout(r, 200))
}
const browser = await chromium.launch({ executablePath: existsSync(BROWSER) ? BROWSER : undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const context = await browser.newContext({ viewport: { width, height }, ...(TOUCH ? { hasTouch: true, isMobile: true } : {}) })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const open = async (query) => {
  await page.goto(`http://localhost:${PORT}/${query}`)
  await page.waitForFunction(() => (window.__game?.frame ?? 0) > 3, null, { timeout: 90000 })
}
await open(QUERY)

const frames = async (n) => {
  const start = await page.evaluate(() => window.__game.frame)
  await page.waitForFunction((f) => window.__game.frame >= f, start + n, { timeout: 120000 })
}

/** 그 자리의 요소에 손가락 사건을 직접 보낸다 (끌기·두 손가락은 page.touchscreen에 없다) */
const pointer = (id, type, [x, y]) =>
  page.evaluate(
    ([id, type, x, y]) => {
      const target = document.elementFromPoint(x, y) ?? document.querySelector('canvas')
      const name = { down: 'pointerdown', move: 'pointermove', up: 'pointerup', cancel: 'pointercancel' }[type]
      target.dispatchEvent(new PointerEvent(name, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, bubbles: true, cancelable: true, buttons: type === 'up' ? 0 : 1 }))
      return target.tagName + (target.className ? '.' + String(target.className).split(' ')[0] : '')
    },
    [id, type, x, y],
  )

const state = () =>
  page.evaluate(() => {
    const g = window.__game
    const vis = (el) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05
    }
    const text = (sel) => [...document.querySelectorAll(sel)].filter(vis).map((el) => el.innerText.trim().replace(/\s+/g, ' ').slice(0, 140))
    const p = g.hero.object.position
    let saveKeys = []
    try {
      saveKeys = Object.keys(localStorage)
    } catch {}
    return {
      t: Math.round(g.time * 10) / 10,
      frame: g.frame,
      region: g.region?.id,
      hero: [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10],
      hp: Math.round((g.combat?.health?.ratio ?? 0) * 100) / 100,
      moving: g.hero.isMoving,
      enemies: g.encounter?.alive?.length,
      viewHeight: g.view?.viewHeight ?? null,
      pageScale: window.visualViewport ? window.visualViewport.scale : null,
      goal: text('.chapter-goal'),
      gains: text('.hud__gains'),
      toast: text('.hud__toast'),
      tooltips: text('.relic-tooltip'),
      pick: text('.pick-card, .swap-card'),
      menu: text('.menu').map((x) => x.slice(0, 80)),
      dialog: text('.dialog'),
      title: text('.title').map((x) => x.slice(0, 80)),
      scene: g.scenes?.current ?? null,
      paused: g.paused ?? null,
      saveKeys,
    }
  })

/** 누른 것을 게임이 읽을 때까지 (다음에 그려지는 프레임) */
const settle = () => frames(2)

async function step(s) {
  if (s.click) return page.mouse.click(s.click[0], s.click[1]).then(settle).then(() => 'clicked')
  if (s.move) return page.mouse.move(s.move[0], s.move[1]).then(settle).then(() => 'moved')
  if (s.wheel !== undefined) return page.mouse.wheel(0, s.wheel).then(settle).then(() => 'wheeled')
  if (s.tap) return page.touchscreen.tap(s.tap[0], s.tap[1]).then(settle).then(() => 'tapped')
  if (s.taps) {
    for (const [x, y] of s.taps) {
      await page.touchscreen.tap(x, y)
      await page.waitForTimeout(s.gap ?? 80)
    }
    await settle()
    return `tapped ${s.taps.length}`
  }
  if (s.touch) {
    const hit = []
    for (const e of s.touch) {
      hit.push(await pointer(e.id ?? 1, e.type, e.at))
      await page.waitForTimeout(s.gap ?? 30)
    }
    await settle()
    return hit
  }
  if (s.drag) {
    const [from, to] = s.drag
    const id = s.id ?? 1
    await pointer(id, 'down', from)
    for (let i = 1; i <= 6; i++) {
      await pointer(id, 'move', [from[0] + ((to[0] - from[0]) * i) / 6, from[1] + ((to[1] - from[1]) * i) / 6])
      await page.waitForTimeout(30)
    }
    await settle()
    if (s.advance) await page.evaluate((sec) => window.__game.advance(sec, 1 / 30), s.advance)
    await page.waitForTimeout(s.hold ?? 300)
    if (s.shot) await page.screenshot({ path: `${OUT}/${s.shot}.png` })
    if (!s.keep) await pointer(id, 'up', to)
    return 'dragged'
  }
  if (s.key) return page.keyboard.press(s.key).then(settle).then(() => 'pressed')
  if (s.advance !== undefined) return page.evaluate((sec) => (window.__game.advance(sec, 1 / 30), Math.round(window.__game.time * 10) / 10), s.advance)
  if (s.wait !== undefined) return page.waitForTimeout(s.wait).then(() => 'waited')
  if (s.frames !== undefined) return frames(s.frames).then(() => 'frames')
  if (s.shot) return frames(2).then(() => page.screenshot({ path: `${OUT}/${s.shot}.png` })).then(() => `${OUT}/${s.shot}.png`)
  if (s.eval) return page.evaluate((c) => new Function('g', `return (${c})`)(window.__game), s.eval)
  if (s.run) return page.evaluate((c) => new Function('g', c)(window.__game), s.run).then((v) => v ?? 'ran')
  if (s.state) return state()
  if (s.dom)
    return page.evaluate((sel) => {
      return [...document.querySelectorAll(sel)].slice(0, 30).map((el) => {
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return { text: el.innerText?.trim().replace(/\s+/g, ' ').slice(0, 160), box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], shown: r.width > 1 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05, font: cs.fontSize, color: cs.color, bg: cs.backgroundColor }
      })
    }, s.dom)
  if (s.reload !== undefined) return open(s.reload).then(() => 'reloaded')
  return `모르는 걸음: ${JSON.stringify(s)}`
}

// 이 컴퓨터 안에서만 받는다 (게임 안 코드를 그대로 실행하는 점검 도구다)
const ctl = createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', async () => {
    let out
    try {
      const parsed = JSON.parse(body || '{}')
      if (parsed.quit) {
        res.end('{"quit":true}\n')
        await browser.close()
        stopServer()
        process.exit(0)
      }
      const steps = Array.isArray(parsed) ? parsed : [parsed]
      const results = []
      for (const s of steps) results.push(await step(s))
      out = { ok: true, results: results.length === 1 ? results[0] : results, errors: errors.splice(0) }
    } catch (e) {
      out = { ok: false, error: String(e?.message ?? e), errors: errors.splice(0) }
    }
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(out) + '\n')
  })
})
ctl.listen(CTL, '127.0.0.1', () => console.log(`조종 서버: http://localhost:${CTL}  (게임 ${PORT}, ${width}x${height}${TOUCH ? ' 터치' : ''}, 그림 ${OUT})`))
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    stopServer()
    process.exit(0)
  })
