// 적 시험 (E8): 봇이 클래스 셋으로 적마다 따로 싸워 보고, 역할별로 피격 수와 처치 시간을 잰다. 지역 보스 다섯도 여기서 잰다.
// 사용법: npm run build && node scripts/enemy-trial.mjs [유물 묶음 ...]
// 예: node scripts/enemy-trial.mjs mjolnir,megingjord,jarngreipr silverBow,cerynitian,houndLeash
// 묶음을 주지 않으면 토르·아르테미스·아마테라스로 잰다. 결과는 test-results/enemy-trial.json
// --gate 를 붙이면 지역 보스를 못 쓰러뜨린 클래스가 있거나 오류가 나면 실패로 끝난다.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const GATE = process.argv.includes('--gate')
const SETS = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const CLASSES = SETS.length > 0 ? SETS : ['mjolnir,megingjord,jarngreipr', 'silverBow,cerynitian,houndLeash', 'yataMirror,sunSilk,uzumeBells']
const ENEMIES = JSON.parse(readFileSync(new globalThis.URL('../src/data/enemies.json', import.meta.url), 'utf8'))
/** 시험할 적: 지역에 나오는 졸개는 셋씩, 보스는 혼자 (우트가르드의 왕은 승급 전설 보스라 뺀다) */
const TARGETS = Object.entries(ENEMIES)
  .filter(([id, e]) => id !== 'utgardKing' && (e.realm || e.extends))
  .map(([id, e]) => ({ id, role: e.role, count: e.role === 'boss' ? 1 : 3, limit: e.role === 'boss' ? 240 : 90 }))
const PORT = 4191
const URL = (relics) => `http://localhost:${PORT}/?relics=${relics}&region=village&autoplay`
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true })
const stop = () => {
  try {
    process.kill(-server.pid)
  } catch {}
}

const results = []
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
  for (const relics of CLASSES) {
    const page = await browser.newPage({ viewport: { width: 480, height: 270 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(URL(relics))
    await page.waitForFunction(() => window.__autoplay && window.__game.frame > 2, null, { timeout: 30000 })
    const god = await page.evaluate(() => {
      window.__autoplay.stay = true
      window.__game.exitsLocked = true
      return window.__game.powers.manifested
    })
    for (const target of TARGETS) {
      // 마을 가운데(모닥불) 옆 빈터에서, 주인공 둘레 7m에 세운다
      const result = await page.evaluate(async ({ id, count, limit }) => {
        const g = window.__game
        const bot = window.__autoplay
        g.encounter.clearAll()
        if (!g.combat.alive) g.dev.revive()
        g.combat.health.reset()
        g.hero.teleport(6, 4)
        const from = g.log.length
        const start = g.time
        const p = g.hero.object.position
        const giants = []
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2
          giants.push(g.encounter.spawnById(id, { x: p.x + Math.sin(a) * 7, z: p.z + Math.cos(a) * 7 }, true))
        }
        while (giants.some((x) => x.alive) && g.time - start < limit) bot.run(5)
        const log = g.log.slice(from)
        return {
          cleared: giants.every((x) => !x.alive),
          time: Math.round((g.time - start) * 10) / 10,
          hurt: log.filter((e) => e.type === 'hurt').length,
          damage: Math.round(log.filter((e) => e.type === 'hurt').reduce((s, e) => s + Number(e.detail), 0)),
          deaths: log.filter((e) => e.type === 'death').length,
        }
      }, target)
      results.push({ god, relics, ...target, ...result })
      const mark = result.cleared ? '' : ' (못 끝냄)'
      console.log(`${god} · ${target.id}(${target.role}) ×${target.count}: ${result.time}초${mark}, 피격 ${result.hurt}(피해 ${result.damage}), 쓰러짐 ${result.deaths}`)
    }
    if (errors.length) console.log(`${god}: 오류 ${errors.length} — ${errors[0]}`)
    results.push(...errors.map((message) => ({ god, error: message })))
    await page.close()
  }
  await browser.close()
} finally {
  stop()
}

// 역할별 평균 (클래스 모두)
const roles = [...new Set(results.filter((r) => r.role).map((r) => r.role))]
console.log('\n역할별 평균 (클래스 모두, 한 번 싸움에)')
for (const role of roles) {
  const rows = results.filter((r) => r.role === role)
  const avg = (key) => Math.round((rows.reduce((s, r) => s + r[key], 0) / rows.length) * 10) / 10
  console.log(`${role}: ${avg('time')}초, 피격 ${avg('hurt')}, 쓰러짐 ${avg('deaths')}, 못 끝냄 ${rows.filter((r) => !r.cleared).length}/${rows.length}`)
}
mkdirSync('test-results', { recursive: true })
writeFileSync('test-results/enemy-trial.json', JSON.stringify(results, null, 2))

if (GATE) {
  const failed = results.filter((r) => r.error || (r.role === 'boss' && !r.cleared))
  if (failed.length > 0) {
    console.error(`적 시험 실패: ${failed.map((r) => r.error ?? `${r.god}·${r.id}`).join(', ')}`)
    process.exit(1)
  }
  console.log('적 시험 통과')
}
