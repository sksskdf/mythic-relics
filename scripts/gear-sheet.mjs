// 장비 모음 (E24-06): 일반 장비 바탕마다 그림과, 등급 넷으로 낀 모습을 한 장에 모은다. 맨 위 줄은 기본 모습(머리카락 색 다섯).
// 사용법: npm run build && node scripts/gear-sheet.mjs [저장 경로.png] [주소 뒤 값]
// 장비 모델·그림을 바꾸면 찍어 본다. 주인공 둘레만 잘라 붙이고, 그림은 칸에 보이는 크기의 4배로 키운다.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { chromium } from 'playwright-core'

const [out = 'test-results/gear-sheet.png', extra = ''] = process.argv.slice(2)
const PORT = 4194
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true })
const stop = () => {
  try {
    process.kill(-server.pid)
  } catch {}
}
const CROP = 96
const SCALE = 2
const GRADES = ['common', 'good', 'rare', 'hero']

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
  await page.goto(`http://localhost:${PORT}/?fresh&relics=&region=midgard&view=12${extra}`)
  await page.waitForFunction(() => (window.__game?.frame ?? 0) > 3, null, { timeout: 60000 })
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' })
  const wait = async (frames) => {
    const start = await page.evaluate(() => window.__game.frame)
    await page.waitForFunction((f) => window.__game.frame > f, start + frames, { timeout: 120000 })
  }
  const shoot = async () => {
    // 찍는 동안 다가온 적은 치운다 (싸우는 모습이 섞이지 않게)
    await page.evaluate(() => {
      const g = window.__game
      g.encounter.clearAll()
      g.hero.face(Math.PI * 0.25)
    })
    await wait(6)
    const p = await page.evaluate(() => {
      const h = window.__game.hero.object.position
      return window.__game.screenPoint(h.x, h.y + 0.9, h.z)
    })
    const buf = await page.screenshot({ clip: { x: Math.max(0, p.x - CROP / 2), y: Math.max(0, p.y - CROP * 0.55), width: CROP, height: CROP } })
    return buf.toString('base64')
  }
  const gear = JSON.parse(readFileSync('src/data/gear.json', 'utf8'))
  await page.evaluate(() => {
    const g = window.__game
    g.dev.unequipAll()
    g.encounter.clearAll()
    g.hero.face(Math.PI * 0.25)
  })
  const rows = []
  // 기본 모습: 머리카락 색 다섯
  const base = { name: '기본 모습 (머리카락 색)', icons: [], images: [] }
  for (let hair = 0; hair < 5; hair++) {
    await page.evaluate((hair) => window.__game.appearance.setBody({ skin: 0, hair, cloth: 0 }), hair)
    base.images.push(await shoot())
  }
  await page.evaluate(() => window.__game.appearance.setBody({ skin: 0, hair: 0, cloth: 0 }))
  rows.push(base)
  for (const part of ['weapon', 'head', 'body', 'hands', 'feet', 'trinket']) {
    for (const name of gear.slots[part].bases) {
      const row = { name: `${gear.slots[part].name} · ${name}`, icons: [], images: [] }
      for (const grade of GRADES) {
        row.icons.push(await page.evaluate(({ part, name, grade }) => window.__game.dev.gearIcon(part, name, grade), { part, name, grade }))
        if (part === 'trinket') continue
        await page.evaluate(
          ({ part, name, grade }) => {
            const g = window.__game
            // 같은 칸에 끼던 것은 빼야 새것이 칸에 들어간다 (아니면 가방으로)
            g.dev.unequipAll()
            g.dev.wear(part, grade, 1, name)
            g.hero.face(Math.PI * 0.25)
          },
          { part, name, grade },
        )
        row.images.push(await shoot())
      }
      await page.evaluate(() => window.__game.dev.unequipAll())
      rows.push(row)
      console.log(`${row.name} 찍음`)
    }
  }
  const sheet = await browser.newPage({ viewport: { width: 4 * 52 + 5 * CROP * SCALE + 200, height: 100 } })
  await sheet.setContent(
    `<body style="margin:0;background:#1a1d24;color:#e8e6dc;font:13px sans-serif">` +
      rows
        .map(
          (r) =>
            `<div style="display:flex;align-items:center;gap:4px;padding:2px 0"><div style="width:170px;padding-left:8px">${r.name}</div>` +
            `<div style="display:flex;gap:4px;width:${4 * 52}px">${r.icons.map((src) => `<img src="${src}" width="48" height="48" style="image-rendering:pixelated;background:#2a2e38">`).join('')}</div>` +
            r.images.map((b) => `<img src="data:image/png;base64,${b}" width="${CROP * SCALE}" style="image-rendering:pixelated">`).join('') +
            `</div>`,
        )
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
