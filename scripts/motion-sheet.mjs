// 신화 동작 모음 (E18-05): 신화마다 3연타·유물 행동·궁극기를 연속 스크린숏으로 한 줄에 모은다.
// 같은 신화권끼리 나란히 놓고 동작·던지는 것이 겹치지 않는지 본다 (ART.md 9장).
// 사용법: npm run build && node scripts/motion-sheet.mjs [저장 경로.png] [신 id,신 id...]
// 줄마다: 1타, 2타, 마지막 타 젖힘, 마지막 타, 유물 행동, 궁극기. 게임을 멈춘 채 시간을 정해진 만큼만 흘려 찍는다.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { chromium } from 'playwright-core'

const [out = 'test-results/motion-sheet.png', only = ''] = process.argv.slice(2)
const PORT = 4192
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true })
const stop = () => {
  try {
    process.kill(-server.pid)
  } catch {}
}
const W = 300
const H = 240
const COLUMNS = ['1타', '2타', '마지막 타 젖힘', '마지막 타', '유물 행동', '궁극기']

try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) break
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  const browser = await chromium.launch({
    executablePath: existsSync(BROWSER) ? BROWSER : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`http://localhost:${PORT}/?fresh&relics=&region=midgard&noscenes&view=14`)
  await page.waitForFunction(() => (window.__game?.frame ?? 0) > 3, null, { timeout: 60000 })
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' })
  // 정보 화면을 열어 게임 시간을 멈춘다 (그리기는 계속된다). 시간은 advance로만 흘린다
  await page.evaluate(() => {
    const g = window.__game
    g.menu.toggle(true)
    g.combat.godMode = true
  })
  const rendered = async () => {
    const start = await page.evaluate(() => window.__game.frame)
    await page.waitForFunction((f) => window.__game.frame > f, start + 2, { timeout: 120000 })
  }
  const shoot = async () => {
    await rendered()
    const p = await page.evaluate(() => {
      const h = window.__game.hero.object.position
      return window.__game.screenPoint(h.x, h.y + 1, h.z)
    })
    const buf = await page.screenshot({ clip: { x: Math.max(0, Math.min(960 - W, p.x - W / 2)), y: Math.max(0, Math.min(540 - H, p.y - H * 0.55)), width: W, height: H } })
    return buf.toString('base64')
  }
  const godData = JSON.parse(readFileSync('src/data/gods.json', 'utf8'))
  const realmOrder = ['norse', 'greek', 'china', 'japan', 'korea', 'hidden']
  const gods = Object.keys(godData)
    .filter((id) => !only || only.split(',').includes(id))
    .sort((a, b) => realmOrder.indexOf(godData[a].realm) - realmOrder.indexOf(godData[b].realm))
  const rows = []
  for (const id of gods) {
    const god = godData[id]
    const images = []
    await page.evaluate(
      ({ id, relic }) => {
        const g = window.__game
        g.dev.resetMyths()
        g.dev.unequipAll()
        g.dev.equip(relic)
        g.dev.choose(id)
        g.dev.promote()
        g.encounter.clearAll()
        g.dev.teleport(0, -6)
        g.hero.stop()
        g.hero.face(Math.PI * 0.25)
        g.combat.divine = 0
        // 고르고 올린 빛기둥이 가라앉을 때까지 흘린다
        g.advance(3, 1 / 30)
        g.encounter.clearAll()
        // 앞에 하나 (오른쪽 아래): 3연타는 이 적을 친다
        const p = g.hero.object.position
        g.dev.spawn('grunt', p.x + 1.4, p.z + 1.4)
        g.combat.divine = 0
      },
      { id, relic: god.relic },
    )
    // 3연타: 그 타의 정한 순간까지 흘린다 (1/60초씩)
    for (const [index, phase] of [[0, 'strike'], [1, 'strike'], [2, 'wind'], [2, 'strike']]) {
      await page.evaluate(
        ({ index, phase }) => {
          const g = window.__game
          const want = (swing) => (phase === 'wind' ? swing.hitTime * 0.85 : swing.hitTime + 0.05)
          for (let i = 0; i < 400; i++) {
            const c = g.combat.combo
            if (c.index === index && c.time >= want(c.current)) return
            g.advance(1 / 60, 1 / 60)
            // 쓰러져 줄면 다시 세운다 (때릴 상대가 없으면 연타가 끊긴다)
            const p = g.hero.object.position
            if (g.encounter.alive.length < 1) g.dev.spawn('grunt', p.x + 1.4, p.z + 1.4)
          }
        },
        { index, phase },
      )
      images.push(await shoot())
    }
    // 유물 행동: 연출이 가라앉은 뒤 적 둘을 세우고 터뜨린다
    await page.evaluate(() => {
      const g = window.__game
      g.advance(1.2, 1 / 30)
      g.encounter.clearAll()
      const p = g.hero.object.position
      g.dev.spawn('grunt', p.x + 1.6, p.z + 1.2)
      g.dev.spawn('grunt', p.x + 4.4, p.z + 4)
      g.combat.combo.cancel()
      g.dev.fireRelic()
      g.advance(0.2, 1 / 60)
    })
    images.push(await shoot())
    // 궁극기
    await page.evaluate(() => {
      const g = window.__game
      g.advance(1.5, 1 / 30)
      g.encounter.clearAll()
      const p = g.hero.object.position
      for (const [dx, dz] of [[2.2, 2.2], [3.2, 0.8], [0.8, 3.2], [4, 4]]) g.dev.spawn('grunt', p.x + dx, p.z + dz)
      g.combat.divine = 1
      g.advance(0.9, 1 / 60)
    })
    images.push(await shoot())
    rows.push({ name: god.name, attack: god.attack, images })
    console.log(`${god.name} 찍음`)
  }
  const sheet = await browser.newPage({ viewport: { width: COLUMNS.length * (W + 4) + 140, height: 100 } })
  await sheet.setContent(
    `<body style="margin:0;background:#1a1d24;color:#e8e6dc;font:13px sans-serif">` +
      `<div style="display:flex;gap:4px;padding-left:140px">${COLUMNS.map((c) => `<div style="width:${W}px;text-align:center">${c}</div>`).join('')}</div>` +
      rows
        .map((r) => `<div style="display:flex;align-items:center;gap:4px"><div style="width:136px;padding-left:4px">${r.name}<br><small>${r.attack}</small></div>${r.images.map((b) => `<img src="data:image/png;base64,${b}" width="${W}" height="${H}">`).join('')}</div>`)
        .join('') +
      `</body>`,
  )
  mkdirSync(dirname(out), { recursive: true })
  await sheet.screenshot({ path: out, fullPage: true })
  await browser.close()
  console.log(errors.length ? `오류: ${errors.join(' / ')}` : `저장: ${out}`)
} finally {
  stop()
}
