// 플레이 시간대별로 얼마나 강해지는가 (3차 스프린트 타임라인 설계의 기준선).
// 1) 봇이 처음부터 플레이하며 2분마다 저장(snapshot)을 남긴다.
// 2) 저장마다 새 창에서 그 저장을 불러, 같은 표준 적에게 20초 동안 준 피해(공격)와 표준 한 대에 깎이는 생명(방어)을 재고,
//    그때 그 땅의 적 생명·한 대 피해로 "그 자리 적 하나를 잡는 시간"과 "몇 대 맞으면 쓰러지나"를 구한다.
// 사용법: npm run build && node scripts/power-curve.mjs [분=40] [--threat=N]   결과: test-results/power-curve.json
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const LIMIT_MIN = Number(args[0] ?? 40)
const THREAT = Number(process.argv.find((a) => a.startsWith('--threat='))?.slice(9) ?? 0)
const EVERY = 120
const PORT = 4199
const BASE = `http://localhost:${PORT}/`
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true })
const stop = () => {
  try {
    process.kill(-server.pid)
  } catch {}
}
const fmt = (t) => `${Math.floor(Math.round(t) / 60)}:${String(Math.round(t) % 60).padStart(2, '0')}`

try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE)).ok) break
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  const browser = await chromium.launch({
    executablePath: existsSync(BROWSER) ? BROWSER : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })

  // 1) 봇 플레이와 2분마다 저장
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } })
  await page.goto(`${BASE}?fresh&autoplay`)
  await page.waitForFunction(() => window.__autoplay && window.__game.frame > 2, null, { timeout: 60000 })
  if (THREAT > 0) await page.evaluate(() => Object.assign(window.__autoplay, { climb: true }))
  const snaps = []
  let next = 0
  for (;;) {
    const s = await page.evaluate((every) => {
      window.__autoplay.run(every)
      const g = window.__game
      return { t: g.time, save: g.snapshot(), region: g.region.id, threat: g.threat.level, reached: g.threat.reached, chosen: g.powers.manifested, opened: g.progress.opened.length, level: g.powers.manifested ? g.progress.level(g.powers.manifested) : 0 }
    }, EVERY)
    if (s.t >= next) {
      snaps.push(s)
      next += EVERY
      console.log(`저장 ${fmt(s.t)} ${s.region} 위협 ${s.threat} 신화 ${s.opened}(${s.chosen ?? '-'} ${s.level}단계)`)
    }
    if (s.t > LIMIT_MIN * 60 || (THREAT > 0 && s.reached >= THREAT)) break
  }
  const log = await page.evaluate(() => window.__game.log.filter((e) => ['open', 'promote', 'forge', 'gear', 'bossKill', 'threat', 'region', 'death'].includes(e.type)))
  await page.close()

  // 2) 저장마다 힘 재기
  const rows = []
  for (const s of snaps) {
    const p = await browser.newPage({ viewport: { width: 640, height: 360 } })
    await p.addInitScript((save) => {
      if (sessionStorage.getItem('loaded')) return
      sessionStorage.setItem('loaded', '1')
      localStorage.clear()
      localStorage.setItem('mythic-relics/save/0', save)
      localStorage.setItem('mythic-relics/last-slot', '0')
    }, JSON.stringify(s.save))
    await p.goto(`${BASE}?noscenes`)
    await p.waitForFunction(() => (window.__game?.frame ?? 0) > 2 && window.__game.playing, null, { timeout: 60000 })
    const m = await p.evaluate(() => {
      const g = window.__game
      // 그 땅의 적: 살아 있는 무리의 생명(위협 배율 포함)과 한 대 피해
      const foes = g.encounter.alive.filter((e) => e.spec.role !== 'boss')
      const foeHp = foes.length ? foes.reduce((n, e) => n + e.health.max, 0) / foes.length : 0
      const foeHit = foes.length ? foes.reduce((n, e) => n + Math.max(...e.spec.attacks.map((a) => a.damage ?? 0)) * e.damageScale, 0) / foes.length : 0
      // 공격: 표준 졸개(생명 크게, 서 있기만)를 20초 친다
      g.encounter.clearAll()
      g.combat.health.reset()
      g.combat.godMode = true
      g.orders.clear()
      const p = g.hero.object.position
      const keep = g.encounter.threat
      g.encounter.threat = { hp: 60, damage: 1 }
      const t = g.encounter.spawnById('grunt', { x: p.x + 1.8, z: p.z }, true)
      t.update = () => {}
      const start = t.health.hp
      g.orders.press(null, t)
      g.advance(20, 1 / 30)
      const damage20 = start - t.health.hp
      g.encounter.clearAll()
      g.encounter.threat = keep
      // 방어: 표준 한 대(피해 100)에 깎이는 생명
      g.combat.godMode = false
      g.combat.health.reset()
      const before = g.combat.health.hp
      g.combat.takeHit(100, p.x + 1, p.z, 0)
      const lost = Math.max(1e-6, before - g.combat.health.hp)
      return { damage20: Math.round(damage20), maxHp: Math.round(g.combat.health.max), per100: Math.round(lost * 10) / 10, foeHp: Math.round(foeHp), foeHit: Math.round(foeHit * 10) / 10, foes: foes.length }
    })
    await p.close()
    const dps = m.damage20 / 20
    rows.push({
      t: Math.round(s.t),
      region: s.region,
      threat: s.threat,
      opened: s.opened,
      chosen: s.chosen,
      level: s.level,
      ...m,
      /** 공격·방어 지수 (첫 저장 = 1) */
      attack: 0,
      defense: 0,
      /** 그 땅 보통 적 하나를 잡는 데 걸리는 초 */
      killSeconds: m.foeHp && dps ? Math.round((m.foeHp / dps) * 10) / 10 : null,
      /** 그 땅 보통 적에게 몇 대 맞으면 쓰러지나 */
      hitsToDie: m.foeHit ? Math.round((m.maxHp / (m.foeHit * (m.per100 / 100))) * 10) / 10 : null,
    })
  }
  const first = rows[0]
  const ehp = (r) => r.maxHp / (r.per100 / 100)
  for (const r of rows) {
    r.attack = Math.round((r.damage20 / first.damage20) * 100) / 100
    r.defense = Math.round((ehp(r) / ehp(first)) * 100) / 100
  }
  await browser.close()
  mkdirSync('test-results', { recursive: true })
  writeFileSync('test-results/power-curve.json', JSON.stringify({ every: EVERY, rows, log }, null, 2))
  console.log('\n시간   땅            위협 신화 단계  공격  방어  적 잡는 초  맞고 버티는 대')
  for (const r of rows) console.log(`${fmt(r.t).padStart(5)}  ${r.region.padEnd(13)} ${String(r.threat).padStart(2)}  ${String(r.opened).padStart(3)}  ${String(r.level).padStart(3)}  ${String(r.attack).padStart(5)} ${String(r.defense).padStart(5)}  ${String(r.killSeconds ?? '-').padStart(8)}  ${String(r.hitsToDie ?? '-').padStart(8)}`)
} finally {
  stop()
}
