// 적 모음 (E9-07): 모든 적을 보통·정예(단단함)로 세워 한 장에 모은다. 신화권 순서, 이름 옆에 역할과 몸 종류.
// 사용법: npm run build && node scripts/enemy-sheet.mjs [저장 경로.png] [적 id,적 id...]
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { chromium } from 'playwright-core'

const [out = 'test-results/enemy-sheet.png', only = ''] = process.argv.slice(2)
const PORT = 4195
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true })
const stop = () => {
  try {
    process.kill(-server.pid)
  } catch {}
}
const CROP = 200
/** 보스는 크게 잘라 같은 폭으로 줄인다 */
const BOSS_CROP = 400
const SCALE = 1.2

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
  await page.goto(`http://localhost:${PORT}/?fresh&relics=&view=11`)
  await page.waitForFunction(() => (window.__game?.frame ?? 0) > 3, null, { timeout: 60000 })
  // 글(카드·HUD)은 가리고 게임 화면만 찍는다
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' })
  const wait = async (frames) => {
    const start = await page.evaluate(() => window.__game.frame)
    await page.waitForFunction((f) => window.__game.frame > f, start + frames, { timeout: 120000 })
  }
  const enemyData = JSON.parse(readFileSync('src/data/enemies.json', 'utf8'))
  const REALM_ORDER = ['norse', 'greek', 'china', 'japan', 'korea']
  const ROLE = { brute: '근접', charger: '돌격', ranged: '원거리', guard: '방어', summoner: '소환', boss: '보스' }
  const BODY = { giant: '거인', beast: '짐승', humanoid: '사람', flyer: '날개', spirit: '혼령', serpent: '뱀' }
  const enemies = Object.entries(enemyData)
    .filter(([id, e]) => !e.extends && (!only || only.split(',').includes(id)))
    .sort((a, b) => REALM_ORDER.indexOf(a[1].realm) - REALM_ORDER.indexOf(b[1].realm) || (a[1].role === 'boss') - (b[1].role === 'boss'))
  const shots = []
  for (const [id, e] of enemies) {
    const row = { name: `${e.name}<br><small style="color:#8d98a6">${ROLE[e.role]} · ${BODY[e.body.kind]}</small>`, images: [] }
    for (const elite of [null, 'tough']) {
      await page.evaluate(
        ({ id, elite }) => {
          const g = window.__game
          // 정보 화면을 열어 게임을 멈춘 채로 세운다 (적이 다가오거나 주인공이 치지 않게, 그림만 그린다)
          if (!g.menu.open) {
            g.devTeleport(30, 30)
            g.hero.object.visible = false
            g.menu.toggle(true)
          }
          g.encounter.clearAll()
          const giant = g.encounter.spawnById(id, { x: 30, z: 30 }, false)
          if (elite) giant.makeElite(elite)
          giant.object.rotation.y = Math.PI * 0.6
        },
        { id, elite },
      )
      await wait(4)
      const crop = e.role === 'boss' ? BOSS_CROP : CROP
      const p = await page.evaluate((y) => window.__game.screenPoint(30, y, 30), e.role === 'boss' ? 2.4 : 1.2)
      const buf = await page.screenshot({ clip: { x: Math.max(0, p.x - crop / 2), y: Math.max(0, p.y - crop * 0.6), width: crop, height: crop } })
      row.images.push(buf.toString('base64'))
    }
    shots.push(row)
    console.log(`${e.name} 찍음`)
  }
  const sheet = await browser.newPage({ viewport: { width: 2 * CROP * SCALE + 170, height: 100 } })
  await sheet.setContent(
    `<body style="margin:0;background:#1a1d24;color:#e8e6dc;font:14px sans-serif">` +
      shots.map((r) => `<div style="display:flex;align-items:center;gap:4px"><div style="width:150px;padding-left:8px">${r.name}</div>${r.images.map((b) => `<img src="data:image/png;base64,${b}" width="${CROP * SCALE}" style="image-rendering:pixelated">`).join('')}</div>`).join('') +
      `</body>`,
  )
  mkdirSync(dirname(out), { recursive: true })
  await sheet.screenshot({ path: out, fullPage: true })
  await browser.close()
  console.log(errors.length ? `오류: ${errors.join(' / ')}` : `저장: ${out}`)
} finally {
  stop()
}
