// 클래스 외형 모음 (E6-19): 모든 클래스를 자기 유물로 발현시켜 Lv1·Lv4 모습을 한 장에 모은다.
// 사용법: npm run build && node scripts/class-sheet.mjs [저장 경로.png] [신 id,신 id...]
// 결과: 클래스마다 한 줄(이름, Lv1, Lv4). 주인공 둘레만 잘라 붙인다.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { chromium } from 'playwright-core'

const [out = 'test-results/class-sheet.png', only = ''] = process.argv.slice(2)
const PORT = 4191
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true })
const stop = () => {
  try {
    process.kill(-server.pid)
  } catch {}
}
const CROP = 110
const SCALE = 2

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
  await page.goto(`http://localhost:${PORT}/?fresh&relics=`)
  await page.waitForFunction(() => (window.__game?.frame ?? 0) > 3, null, { timeout: 60000 })
  // 글(카드·HUD)은 가리고 게임 화면만 찍는다
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' })
  const wait = async (frames) => {
    const start = await page.evaluate(() => window.__game.frame)
    await page.waitForFunction((f) => window.__game.frame > f, start + frames, { timeout: 120000 })
  }
  const godData = JSON.parse(readFileSync('src/data/gods.json', 'utf8'))
  const relicData = JSON.parse(readFileSync('src/data/relics.json', 'utf8'))
  const gods = Object.keys(godData)
    .filter((id) => !only || only.split(',').includes(id))
    .map((id) => ({ id, name: godData[id].name, relics: Object.keys(relicData).filter((r) => relicData[r].god === id || relicData[r].also?.includes(id)) }))
  const shots = []
  for (const god of gods) {
    const row = { name: god.name, images: [] }
    for (const level of [1, 4]) {
      await page.evaluate(
        ({ god, level }) => {
          const g = window.__game
          g.devResetClasses()
          g.devUnequipAll()
          for (const id of god.relics.slice(0, 4)) g.devEquip(id)
          for (let l = 1; l < level; l++) g.devPromote()
          // 적이 없는 빈터에서 오른쪽 아래를 보게 한다
          g.encounter.clearAll()
          g.devTeleport(30, 30)
          g.hero.face(Math.PI * 0.25)
        },
        { god, level },
      )
      await wait(24)
      const p = await page.evaluate(() => {
        const h = window.__game.hero.object.position
        return window.__game.screenPoint(h.x, h.y + 1, h.z)
      })
      const buf = await page.screenshot({ clip: { x: Math.max(0, p.x - CROP / 2), y: Math.max(0, p.y - CROP * 0.6), width: CROP, height: CROP } })
      row.images.push(buf.toString('base64'))
    }
    shots.push(row)
    console.log(`${god.name} 찍음`)
  }
  // 모은 것을 한 장으로: 브라우저에서 표로 그려 찍는다
  const sheet = await browser.newPage({ viewport: { width: 2 * CROP * SCALE + 150, height: 100 } })
  await sheet.setContent(
    `<body style="margin:0;background:#1a1d24;color:#e8e6dc;font:14px sans-serif">` +
      shots.map((r) => `<div style="display:flex;align-items:center;gap:4px"><div style="width:130px;padding-left:8px">${r.name}</div>${r.images.map((b) => `<img src="data:image/png;base64,${b}" width="${CROP * SCALE}" style="image-rendering:pixelated">`).join('')}</div>`).join('') +
      `</body>`,
  )
  mkdirSync(dirname(out), { recursive: true })
  await sheet.screenshot({ path: out, fullPage: true })
  await browser.close()
  console.log(errors.length ? `오류: ${errors.join(' / ')}` : `저장: ${out}`)
} finally {
  stop()
}
