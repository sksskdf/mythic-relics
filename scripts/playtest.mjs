// 자동 플레이 검증: 봇이 이동 명령만으로 처음부터 승급까지 플레이하고, 걸린 시간과 흐름을 기록한다.
// 사용법: npm run build && node scripts/playtest.mjs [반복 횟수=3] [제한 시간(분)=45]
// --gate 를 붙이면 승급하지 못했거나 오류가 난 판이 있을 때 실패로 끝난다. (CI)
// --god=loki 를 붙이면 그 신 유물만 끼고 승급까지 간다.
// --threat=N 을 붙이면 2단계 뒤에도 이어서 보스를 잡고 위협 단계를 올리며, N단계에 오를 때까지 단계마다 시간·쓰러짐·피격을 잰다 (E14-07).
// --source=flame 을 붙이면 원천 갈래를 그 원천에만 붓는다 (없으면 장비에 가장 많은 원천).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const GATE = process.argv.includes('--gate')
const RUNS = Number(args[0] ?? 3)
const LIMIT_MIN = Number(args[1] ?? 45)
const THREAT = Number(process.argv.find((a) => a.startsWith('--threat='))?.slice(9) ?? 0)
const SOURCE = process.argv.find((a) => a.startsWith('--source='))?.slice(9) ?? null
/** --stack=stone 처럼 붙이면 그 원천 +3짜리 영웅 장비 여섯과 원천 숙련 +2를 끼고(원천 20, 각성 3단계) 시작한다 (원천 빌드 비교, scripts/source-trial.mjs) */
const STACK = process.argv.find((a) => a.startsWith('--stack='))?.slice(8) ?? null
/** --god=loki 처럼 붙이면 봇이 그 신 유물만 끼고 승급까지 간다 (E6-08) */
const GOD = process.argv.find((a) => a.startsWith('--god='))?.slice(6) ?? null
/** --relics=kusanagi,totsuka,... 처럼 붙이면 그 유물을 끼고(발현한 채) 시작해 제한 시간 동안 처치 속도를 잰다 (클래스 비교) */
const RELICS = process.argv.find((a) => a.startsWith('--relics='))?.slice(9) ?? null
/** 기록할 유물: 데이터 파일에 있는 유물 전부 */
const RELIC_IDS = Object.keys(JSON.parse(readFileSync(new globalThis.URL('../src/data/relics.json', import.meta.url), 'utf8')))
/** --region=midgard 처럼 붙이면 그 지역에서 시작해 떠나지 않는다 (신화 비교를 같은 땅에서) */
const REGION = process.argv.find((a) => a.startsWith('--region='))?.slice(9) ?? null
const PORT = 4183
const URL = (RELICS ? `http://localhost:${PORT}/?relics=${RELICS}&autoplay` : `http://localhost:${PORT}/?fresh&autoplay`) + (REGION ? `&region=${REGION}` : '')
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true })
const stop = () => {
  try {
    process.kill(-server.pid)
  } catch {}
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(URL)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('미리보기 서버가 뜨지 않았습니다.')
}

// 초를 먼저 반올림해야 7:60 같은 표시가 나오지 않는다.
const fmt = (t) => (t === undefined ? '-' : `${Math.floor(Math.round(t) / 60)}:${String(Math.round(t) % 60).padStart(2, '0')}`)

const results = []
try {
  await waitForServer()
  const browser = await chromium.launch({
    executablePath: existsSync(BROWSER) ? BROWSER : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  for (let run = 1; run <= RUNS; run++) {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(URL)
    await page.waitForFunction(() => window.__autoplay && window.__game.frame > 2, null, { timeout: 30000 })
    if (THREAT > 0) await page.evaluate((source) => Object.assign(window.__autoplay, { climb: true, source }), SOURCE)
    if (GOD) await page.evaluate((god) => (window.__autoplay.god = god), GOD)
    if (STACK)
      await page.evaluate((source) => {
        const g = window.__game
        const parts = ['head', 'body', 'hands', 'feet', 'trinket', 'trinket']
        parts.forEach((part, i) => {
          const item = { uid: `g:stack00${i}`, part, base: '시험', grade: 'hero', stats: [], source: { id: source, value: 3 } }
          g.powers.loadout.addGear(item)
          g.powers.loadout.equip(item.uid)
        })
        g.threat.mastery[source] = 2
      }, STACK)
    if (REGION) await page.evaluate(() => (window.__autoplay.stay = true))
    let done = false
    while (!done) {
      const state = await page.evaluate(() => {
        window.__autoplay.run(30)
        const g = window.__game
        return { t: g.time, promoted: g.progress.promotions >= 1, reached: g.threat.reached }
      })
      done = (RELICS ? false : THREAT > 0 ? state.reached >= THREAT : state.promoted) || state.t > LIMIT_MIN * 60
    }
    const climbs = await page.evaluate(() => [...window.__autoplay.climbs])
    // 끝났을 때 봇이 어디서 무엇을 하고 있었나 (멈춤을 찾을 때)
    const last = await page.evaluate(() => {
      const g = window.__game
      const p = g.hero.object.position
      const a = window.__autoplay
      return { step: a.step, want: a.wantRegion(), gods: a.forgeGods(), locked: g.hero.locked, armed: g.world.exitArmed, traveling: g.world.traveling, mats: Object.fromEntries(g.powers.loadout.materials), bag: g.powers.loadout.bag, slots: g.powers.loadout.slots, picks: g.pickups.list.map((i) => i.id), t: Math.round(g.time), region: g.region.id, x: Math.round(p.x), z: Math.round(p.z), hp: Math.round(g.combat.health.ratio * 100) / 100, moving: g.hero.isMoving, enemies: g.encounter.alive.length, chosen: g.powers.manifested, ready: g.progress.readyToPromote(g.powers.manifested ?? 'thor') }
    })
    const log = await page.evaluate(() => window.__game.log)
    const first = (type, detail) => log.find((e) => e.type === type && (detail === undefined || e.detail === detail))?.t
    const count = (type) => log.filter((e) => e.type === type).length
    const result = {
      run,
      relics: Object.fromEntries(RELIC_IDS.map((id) => [id, first('relic', id)])),
      manifest: first('manifest'),
      // 신화 개방 (E12-07): 첫째·둘째 신화가 열린 때와 연 신화 수
      opened: log.filter((e) => e.type === 'open').map((e) => ({ t: e.t, god: e.detail })),
      // 장비와 대장간 (E13-08): 주운 장비 수, 대장간 제작
      gear: count('gear'),
      forged: log.filter((e) => e.type === 'forge').map((e) => ({ t: e.t, what: e.detail })),
      bossKill: first('bossKill', 'giantKing'),
      legendStart: first('legendStart'),
      promote: first('promote'),
      kills: count('kill'),
      // 발현한 뒤(또는 처음부터 낀 뒤) 1분에 쓰러뜨린 수: 클래스끼리 비교한다
      killRate: (() => {
        const from = RELICS ? 0 : (first('manifest') ?? Infinity)
        const to = log.at(-1)?.t ?? 0
        const kills = log.filter((e) => e.type === 'kill' && e.t >= from).length
        return to > from ? Math.round((kills / ((to - from) / 60)) * 10) / 10 : 0
      })(),
      deaths: count('death'),
      hurt: count('hurt'),
      damageTaken: log.filter((e) => e.type === 'hurt').reduce((s, e) => s + Number(e.detail), 0),
      legendFails: count('legendFail'),
      end: log.at(-1)?.t,
      climbs,
      // 위협 단계마다 (그 단계에 오른 뒤 다음 단계에 오르기까지): 걸린 시간, 처치, 쓰러짐, 피격
      threat: [0, ...climbs].map((from, i) => {
        const to = climbs[i] ?? log.at(-1)?.t ?? from
        const inside = (e) => e.t >= from && e.t < to
        return { level: i + 1, time: Math.round(to - from), kills: log.filter((e) => e.type === 'kill' && inside(e)).length, deaths: log.filter((e) => e.type === 'death' && inside(e)).length, hurt: log.filter((e) => e.type === 'hurt' && inside(e)).length }
      }),
      sources: await page.evaluate(() => window.__game.sourceRows()),
      last,
      errors,
      log,
    }
    results.push(result)
    console.log(
      `#${run} 2단계 ${fmt(result.promote)} | 첫 신화 ${fmt(result.manifest)} | 신화 둘 ${fmt(result.opened[1]?.t)} (연 신화 ${result.opened.length}: ${result.opened.map((o) => o.god).join(', ')}) | 거인 왕 ${fmt(result.bossKill)} | 장비 ${result.gear}, 첫 제작 ${fmt(result.forged[0]?.t)}${result.forged[0] ? ` (${result.forged[0].what})` : ''} | ` +
        `유물 ${Object.entries(result.relics).map(([k, v]) => `${k} ${fmt(v)}`).join(', ')} | ` +
        `처치 ${result.kills}(첫 신화 뒤 분당 ${result.killRate}), 쓰러짐 ${result.deaths}, 피격 ${result.hurt}, 전설 실패 ${result.legendFails}` +
        (THREAT > 0 ? ` | 위협 ${result.threat.map((x) => `${x.level}단계 ${fmt(x.time)}·쓰러짐 ${x.deaths}·피격 ${x.hurt}`).join(' → ')} | 원천 ${result.sources.map((x) => `${x.id} ${x.total}(${x.level})`).join(' ')}` : '') +
        (errors.length ? ` | 오류 ${errors.length}` : ''),
    )
    await page.close()
  }
  await browser.close()
} finally {
  stop()
}
mkdirSync('test-results', { recursive: true })
writeFileSync('test-results/playtest.json', JSON.stringify(results, null, 2))

if (GATE) {
  const failed = results.filter((r) => r.promote === undefined || r.errors.length > 0)
  if (failed.length > 0) {
    console.error(`봇 검증 실패: ${failed.length}판이 ${LIMIT_MIN}분 안에 승급하지 못했거나 오류가 났습니다.`)
    process.exit(1)
  }
  console.log('봇 검증 통과')
}
