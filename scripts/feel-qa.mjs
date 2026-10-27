// 손맛 점검 (QA): 봇 대신 플레이어처럼 적을 "눌러"(공격 지시) 싸우게 하고, 사람이 보면 어색한 움직임을 잡는다.
// 사용법: npm run build && node scripts/feel-qa.mjs [신 id,...] [적 id,...]
// 기본은 신화 21 × 역할마다 적 하나(졸개·돌격·원거리·방패·소환·보스). 결과는 test-results/feel-qa.json
// 잡는 것 (한 싸움마다):
//   - 끊긴 휘두르기: 휘두르기가 시작된 뒤 0.2초 안에 또 시작 (시작하자마자 끊겼다는 뜻)
//   - 걷기·멈춤 깜박임: 공격 지시 중 1초에 걷기↔멈춤이 4번 넘게 바뀜
//   - 헛휘두르기: 휘두르기 시작에 견줘 맞힌 횟수가 너무 적음
//   - 붙잡힘: 공격 지시가 살아 있는데 6초 넘게 피해를 하나도 못 줌
//   - 못 끝냄: 제한 시간 안에 못 쓰러뜨림
// --strict 를 붙이면 잡힌 것이 있으면 실패로 끝난다.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const STRICT = process.argv.includes('--strict')
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const GODS = JSON.parse(readFileSync(new globalThis.URL('../src/data/gods.json', import.meta.url), 'utf8'))
const ENEMIES = JSON.parse(readFileSync(new globalThis.URL('../src/data/enemies.json', import.meta.url), 'utf8'))
const gods = args[0] ? args[0].split(',') : Object.keys(GODS)
/** 역할마다 적 하나: 졸개·돌격·원거리(가장 빠른 것)·방패·소환·보스 */
const defaultEnemies = ['grunt', 'wolf', 'foxDemon', 'harpy', 'draugr', 'frostWitch', 'king']
const enemies = args[1] ? args[1].split(',') : defaultEnemies
const PORT = 4196
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
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`http://localhost:${PORT}/?fresh&relics=&region=village&noscenes`)
  await page.waitForFunction(() => (window.__game?.frame ?? 0) > 2, null, { timeout: 60000 })
  // 휘두르기 시작·맞힘을 센다 (게임이 부르는 곳을 감싼다)
  await page.evaluate(() => {
    const g = window.__game
    g.exitsLocked = true
    window.__qa = { swings: [], hits: [] }
    const swing = g.attackFx.swing.bind(g.attackFx)
    g.attackFx.swing = (s, strong) => {
      window.__qa.swings.push(g.time)
      swing(s, strong)
    }
    const shot = g.attackFx.shot.bind(g.attackFx)
    g.attackFx.shot = (t, strong) => shot(t, strong)
    const onHits = g.damage.onHeroHits.bind(g.damage)
    g.damage.onHeroHits = (hits) => {
      if (hits.length > 0) window.__qa.hits.push(g.time)
      onHits(hits)
    }
  })
  for (const god of gods) {
    for (const enemy of enemies) {
      const boss = ENEMIES[enemy]?.role === 'boss'
      const r = await page.evaluate(
        ({ god, enemy, limit }) => {
          const g = window.__game
          const qa = window.__qa
          g.dev.choose(god)
          g.encounter.clearAll()
          // 싸움을 오래 보려고 적 생명력을 크게 (피해는 그대로, 주인공은 맞아도 안 줄어든다)
          g.encounter.threat = { hp: 6, damage: 1 }
          if (!g.combat.alive) g.dev.revive()
          g.combat.health.reset()
          g.combat.godMode = true
          g.orders.clear()
          g.hero.teleport(6, 4)
          g.advance(0.5, 1 / 30)
          const p = g.hero.object.position
          const target = g.encounter.spawnById(enemy, { x: p.x + 8, z: p.z }, true)
          if (!target) return { error: 'no enemy' }
          qa.swings.length = 0
          qa.hits.length = 0
          const start = g.time
          let lastMoving = g.hero.isMoving
          let toggles = []
          let lastHp = target.health.hp
          let lastHurt = g.time
          let stuck = 0
          // 적을 눌러 공격 지시
          g.orders.press(null, target)
          while (target.alive && g.time - start < limit) {
            // 사람처럼: 지시가 풀렸으면(대상을 놓쳤으면) 다시 누른다
            if (!g.orders.attackTarget) g.orders.press(null, target)
            g.advance(1 / 30, 1 / 30)
            if (g.hero.isMoving !== lastMoving) {
              toggles.push(g.time)
              lastMoving = g.hero.isMoving
            }
            if (target.health.hp < lastHp) {
              lastHp = target.health.hp
              lastHurt = g.time
            } else if (g.time - lastHurt > 6) {
              stuck += 1
              lastHurt = g.time
            }
          }
          const swings = qa.swings.filter((t) => t >= start)
          const hits = qa.hits.filter((t) => t >= start)
          let cut = 0
          for (let i = 1; i < swings.length; i++) if (swings[i] - swings[i - 1] < 0.2) cut++
          // 1초 창마다 걷기↔멈춤이 바뀐 수의 최댓값
          let flicker = 0
          for (const t of toggles) flicker = Math.max(flicker, toggles.filter((u) => u >= t && u < t + 1).length)
          g.combat.godMode = false
          g.encounter.threat = { hp: 1, damage: 1 }
          return {
            time: Math.round((g.time - start) * 10) / 10,
            killed: !target.alive,
            swings: swings.length,
            hits: hits.length,
            cut,
            flicker,
            stuck,
          }
        },
        { god, enemy, limit: boss ? 120 : 60 },
      )
      const issues = []
      if (r.error) issues.push(r.error)
      if (r.cut > 2) issues.push(`끊긴 휘두르기 ${r.cut}`)
      if (r.flicker > 4) issues.push(`걷기·멈춤 깜박임 ${r.flicker}/초`)
      if (r.swings >= 6 && r.hits < r.swings * 0.3) issues.push(`헛휘두르기 ${r.hits}/${r.swings}`)
      if (r.stuck > 0) issues.push(`붙잡힘 ${r.stuck}번`)
      if (!r.killed) issues.push('못 끝냄')
      results.push({ god, enemy, ...r, issues })
      console.log(`${god.padEnd(10)} ${enemy.padEnd(12)} ${String(r.time).padStart(5)}초 휘두름 ${r.swings} 맞힘 ${r.hits}${issues.length ? '  ← ' + issues.join(', ') : ''}`)
    }
  }
  await browser.close()
  mkdirSync('test-results', { recursive: true })
  writeFileSync('test-results/feel-qa.json', JSON.stringify({ results, errors }, null, 2))
  const bad = results.filter((r) => r.issues.length > 0)
  console.log(`\n잡힌 것: ${bad.length} / ${results.length}${errors.length ? ` · 오류 ${errors.length}: ${errors.slice(0, 3).join(' / ')}` : ''}`)
  if (STRICT && (bad.length > 0 || errors.length > 0)) process.exitCode = 1
} finally {
  stop()
}
