// 자동 플레이 검증: 봇이 이동 명령만으로 처음부터 승급까지 플레이하고, 걸린 시간과 흐름을 기록한다.
// 사용법: npm run build && node scripts/playtest.mjs [반복 횟수=3] [제한 시간(분)=45]
// --gate 를 붙이면 승급하지 못했거나 오류가 난 판이 있을 때 실패로 끝난다. (CI)
// --god=loki 를 붙이면 그 신 유물만 끼고 승급까지 간다.
// --depth=N 을 붙이면 첫 엔딩 무렵의 빌드(묠니르 2단계·토르 3단계·깨달음 스물)로 원정이 무르익을 때마다 성소 화로에서 귀환하며
//   귀환 카드에서 「+1」을 골라 깊이 N에 이를 때까지 깊이마다 시간·쓰러짐·피격을 잰다 (E305-03, 옛 --threat). --depth-at=N 이면 귀환 없이 깊이 N에 고정해 제한 시간 동안 잰다.
// --depth·--endless는 엔딩 뒤 장치라, 시작할 때 엔딩 뒤로 넘긴다 (E21-06).
// --ending 을 붙이면 장 흐름을 따라 엔딩까지 가고, 장마다 들어선 시각을 잰다 (E22-06).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const GATE = process.argv.includes('--gate')
const RUNS = Number(args[0] ?? 3)
const LIMIT_MIN = Number(args[1] ?? 45)
const DEPTH = Number(process.argv.find((a) => a.startsWith('--depth='))?.slice(8) ?? 0)
/** --depth-at=N: 귀환 없이 깊이 N에 고정 (지름길 dev.depth, 깊이마다 세기를 따로 잴 때) */
const DEPTH_AT = Number(process.argv.find((a) => a.startsWith('--depth-at='))?.slice(11) ?? 0)
/** --stack=stone 처럼 붙이면 그 원천 +4짜리 영웅 장비 여섯을 끼고(원천 24, 각성 3단계) 시작한다 (원천 빌드 비교, scripts/source-trial.mjs) */
const STACK = process.argv.find((a) => a.startsWith('--stack='))?.slice(8) ?? null
/**
 * --oaths 를 붙이면 장 흐름을 따라가며 데모 맹세 셋을 차례로 건다 (E305-01): 맹세가 없으면(처음·지킨 뒤) 아직 못 지킨 맹세를 개발 지름길로 걸고,
 * 그 원정의 수호자·장 보스를 이기면 지킨 것. 셋을 다 지키면 끝
 */
const OATHS = process.argv.includes('--oaths')
/** --endless 를 붙이면 깊이 10에서 한계를 깬 셈으로 마을에서 시작해 끝없는 원정을 10층까지 내려간다 (E17-07 균열 → E305-03). --relics=mjolnir 와 함께 쓴다 */
const ENDLESS = process.argv.includes('--endless')
/** --ending 을 붙이면 장 흐름을 따라 첫 엔딩까지 간다 (E22-06) */
const ENDING = process.argv.includes('--ending')
/** --god=loki 처럼 붙이면 봇이 그 신 유물만 끼고 승급까지 간다 (E6-08) */
const GOD = process.argv.find((a) => a.startsWith('--god='))?.slice(6) ?? null
/** --pantheon=hand:thor;heart:odin;breath:loki+freyr 처럼 붙이면 그 자리 셋으로 시작한다 (E302: 손마다·숨마다 처치 속도). --god과 함께 쓰지 않는다 */
const PANTHEON = process.argv.find((a) => a.startsWith('--pantheon='))?.slice(11) ?? null
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
    try {
      await page.goto(URL)
      await page.waitForFunction(() => window.__autoplay && window.__game.frame > 2, null, { timeout: 30000 })
      if (DEPTH > 0 || DEPTH_AT > 0 || ENDLESS) await page.evaluate(() => window.__game.reachEnding())
      // 깊이는 첫 엔딩 뒤의 장치라 첫 엔딩 무렵의 빌드로 시작한다 (E236: 땅이 수련만큼 세져 벼린 유물 없이는 우트가르드의 거인 왕을 못 넘는다)
      // 묠니르 2단계(처음 벼리면 토르가 열림)·토르 3단계·깨달음 스물(봇이 찍는다)
      if (DEPTH > 0 || DEPTH_AT > 0)
        await page.evaluate((at) => {
          const g = window.__game
          for (let i = 0; i < 2; i++) {
            g.dev.fillForge('thor')
            g.dev.forge('thor')
          }
          g.dev.promote()
          g.dev.promote()
          g.dev.insight(20)
          if (at > 0) g.dev.depth(at)
          else Object.assign(window.__autoplay, { deepen: true })
        }, DEPTH_AT)
      if (GOD) await page.evaluate((god) => (window.__autoplay.god = god), GOD)
      if (PANTHEON) {
        const spec = Object.fromEntries(PANTHEON.split(';').map((kv) => kv.split(':')))
        await page.evaluate((s) => window.__game.dev.pantheon({ hand: s.hand || null, heart: s.heart || null, breath: s.breath ? s.breath.split('+') : [] }), spec)
      }
      if (OATHS) await page.evaluate(() => Object.assign(window.__autoplay, { oaths: true }))
      if (ENDLESS)
        await page.evaluate(() => {
          const g = window.__game
          // 깊이 10에서 한계를 깼다
          g.dev.depth(10)
          g.depthSystem.breakLimit()
          g.dev.endgame()
          // 한계를 깬 무렵이면 맹세 여덟을 지켰다
          for (const id of ['silence', 'emptyHand', 'alone', 'noHeal', 'crowd', 'timed', 'glass', 'slow']) g.oaths.keep(id, 600)
          g.bus.emit('progressChanged', {})
          window.__autoplay.endless = true
        })
      if (STACK)
        await page.evaluate((source) => {
          const g = window.__game
          const parts = ['head', 'body', 'hands', 'feet', 'trinket', 'trinket']
          parts.forEach((part, i) => {
            const item = { uid: `g:stack00${i}`, part, base: '시험', grade: 'hero', tier: 1, stats: [], source: { id: source, value: 4 } }
            g.powers.loadout.addGear(item)
            g.powers.loadout.equip(item.uid)
          })
        }, STACK)
      if (REGION) await page.evaluate(() => (window.__autoplay.stay = true))
      // 처음부터 하는 판은 장 흐름의 목표를 따라간다 (E22-06)
      if (!REGION && !RELICS && !DEPTH && !DEPTH_AT && !ENDLESS) await page.evaluate(() => (window.__autoplay.chapters = true))
      let done = false
      while (!done) {
        const state = await page.evaluate(() => {
          const bot = window.__autoplay
          const g = window.__game
          // 맹세 봇: 걸린 맹세가 없으면 아직 못 지킨 것을 건다 (출발 카드를 기다리지 않고)
          if (bot.oaths && !g.expedition.oath && bot.oathsLeft()) g.oathSystem.swear(g.oathSystem.available().find((id) => !g.oaths.has(id)))
          bot.run(30)
          return { t: g.time, promoted: g.progress.promotions >= 1, reached: g.depth.reached, oathsLeft: bot.oathsLeft(), depth: window.__game.endless.best, ending: g.ending.reached }
        })
        done = (ENDING ? state.ending : ENDLESS ? state.depth >= 10 : OATHS ? !state.oathsLeft : RELICS || DEPTH_AT > 0 ? false : DEPTH > 0 ? state.reached >= DEPTH : state.promoted) || state.t > LIMIT_MIN * 60
      }
      const depths = await page.evaluate(() => [...window.__autoplay.depths])
      // 끝났을 때 봇이 어디서 무엇을 하고 있었나 (멈춤을 찾을 때)
      const last = await page.evaluate(() => {
        const g = window.__game
        const p = g.hero.object.position
        const a = window.__autoplay
        return { step: a.step, want: a.wantRegion(), gods: a.forgeGods(), locked: g.hero.locked, armed: g.world.exitArmed, traveling: g.world.traveling, mats: Object.fromEntries(g.powers.loadout.materials), bag: g.powers.loadout.bag, slots: g.powers.loadout.slots, picks: g.pickups.list.map((i) => i.id), t: Math.round(g.time), region: g.region.id, x: Math.round(p.x), z: Math.round(p.z), hp: Math.round(g.combat.health.ratio * 100) / 100, moving: g.hero.isMoving, enemies: g.encounter.alive.length, chosen: g.powers.manifested, ripe: g.expeditionSystem.ripe,
          // 멈춘 판을 풀 실마리: 살아 있는 적의 자리·상태, 길찾기에서 막힌 칸인지, 갈 수 있는 곳 안인지 (E19)
          foes: g.encounter.alive.map((e) => ({ id: e.spec.id, x: Math.round(e.x * 10) / 10, z: Math.round(e.z * 10) / 10, state: e.state, home: [Math.round(e.home.x), Math.round(e.home.z)], blocked: g.nav.isBlocked({ x: e.x, z: e.z }), inArea: g.nav.area.rects.some((r) => e.x >= r.minX && e.x <= r.maxX && e.z >= r.minZ && e.z <= r.maxZ), dangers: e.dangers.length })),
          // 피하려는 예고 (E239: 봇이 끝나지 않는 예고를 피하느라 구석에 멈춘 판)
          dangers: g.encounter.alive.flatMap((e) => e.dangers.map((d) => ({ id: e.spec.id, ...d }))),
          // 신 깨우기 (E238): 수호자 자리와 깨어난 수호자
          lair: g.awakening.lairSpot, guardian: g.awakening.fighting?.spec.name ?? null, roused: g.awakening.roused }
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
        // 신의 조각 (E238): 신:조각(1 흔적·2 사냥·3 수호자)을 얻은 때
        fragments: log.filter((e) => e.type === 'fragment').map((e) => ({ t: e.t, what: e.detail })),
        // 장비와 대장간 (E13-08): 주운 장비 수, 대장간 제작
        gear: count('gear'),
        forged: log.filter((e) => e.type === 'forge').map((e) => ({ t: e.t, what: e.detail })),
        bossKill: first('bossKill', 'giantKing'),
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
        end: log.at(-1)?.t,
        depths,
        // 시련 (E16-05): 시련:난이도:결과:초
        oaths: log.filter((e) => e.type === 'oath').map((e) => e.detail),
        // 끝없는 원정 (E17-07): 층마다 들어간 때, 끝난 까닭
        endless: log.filter((e) => e.type === 'endless').map((e) => `${e.detail}@${Math.round(e.t)}`),
        endlessFloors: await page.evaluate(() => [...window.__autoplay.endlessFloors]),
        // 장 흐름 (E22-06): 장마다 열린 때와 엔딩
        chapters: log.filter((e) => e.type === 'chapter').map((e) => ({ id: e.detail, t: e.t })),
        ending: first('ending'),
        levels: log.filter((e) => e.type === 'promote').map((e) => ({ t: e.t, title: e.detail })),
        // 지역 이동 (E15-07): 처음 들어간 때, 보스의 땅에 처음 닿은 때
        regions: log.filter((e, i) => e.type === 'region' && log.findIndex((x) => x.type === 'region' && x.detail === e.detail) === i).map((e) => ({ id: e.detail, t: e.t })),
        bossLand: log.find((e) => e.type === 'region' && ['utgard', 'lycia', 'huoyanshan', 'hiikawa', 'songdo'].includes(e.detail))?.t,
        // 깊이마다 (그 깊이로 떠난 뒤 다음 깊이로 떠나기까지): 걸린 시간, 처치, 쓰러짐, 피격
        depth: [0, ...depths].map((from, i) => {
          const to = depths[i] ?? log.at(-1)?.t ?? from
          const inside = (e) => e.t >= from && e.t < to
          return { level: (DEPTH_AT || 1) + i, time: Math.round(to - from), kills: log.filter((e) => e.type === 'kill' && inside(e)).length, deaths: log.filter((e) => e.type === 'death' && inside(e)).length, hurt: log.filter((e) => e.type === 'hurt' && inside(e)).length }
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
          `처치 ${result.kills}(첫 신화 뒤 분당 ${result.killRate}), 쓰러짐 ${result.deaths}, 피격 ${result.hurt}` +
          (ENDING ? ` | 조각 ${result.fragments.map((f) => `${f.what} ${fmt(f.t)}`).join(', ')}` : '') +
          (ENDING ? ` | 장 ${result.chapters.map((c) => `${c.id} ${fmt(c.t)}`).join(' → ')} | 엔딩 ${fmt(result.ending)} | 단계 ${result.levels.map((l) => fmt(l.t)).join(', ')} | 제작 ${result.forged.map((f) => `${f.what} ${fmt(f.t)}`).join(', ')}` : '') +
          (ENDLESS ? ` | 끝없는 원정 ${result.endlessFloors.map((f) => `${f.depth}층 ${fmt(f.t)}`).join(', ')} | ${result.endless.filter((x) => !x.startsWith('floor')).join(', ')}` : '') +
          (OATHS ? ` | 맹세 ${result.oaths.join(', ')}` : '') +
          (DEPTH > 0 || DEPTH_AT > 0 ? ` | 깊이 ${result.depth.map((x) => `${x.level} ${fmt(x.time)}·처치 ${x.kills}·쓰러짐 ${x.deaths}·피격 ${x.hurt}`).join(' → ')} | 원천 ${result.sources.map((x) => `${x.id} ${x.total}(${x.level})`).join(' ')}` : '') +
          (errors.length ? ` | 오류 ${errors.length}` : ''),
      )
    } catch (e) {
      // 한 판이 게임 예외나 페이지 크래시로 끊겨도 앞 판과 멈춘 자리는 남기고 다음 판으로 간다
      const last = await page
        .evaluate(() => {
          const g = window.__game
          const p = g.hero.object.position
          return { step: window.__autoplay.step, t: Math.round(g.time), region: g.region.id, x: Math.round(p.x), z: Math.round(p.z) }
        })
        .catch(() => null)
      results.push({ run, crashed: true, last, errors: [...errors, String(e?.message ?? e)] })
      console.error(`#${run} 끊김: ${e?.message ?? e}`)
    }
    await page.close().catch(() => {})
  }
  await browser.close()
} finally {
  stop()
  // 판 반복 밖에서 실패해도 그때까지 끝난 판은 남긴다
  mkdirSync('test-results', { recursive: true })
  writeFileSync('test-results/playtest.json', JSON.stringify(results, null, 2))
}

if (GATE) {
  const failed = results.filter((r) => (ENDING ? r.ending === undefined : r.promote === undefined) || r.errors.length > 0)
  if (failed.length > 0) {
    console.error(`봇 검증 실패: ${failed.length}판이 ${LIMIT_MIN}분 안에 승급하지 못했거나 오류가 났습니다.`)
    // CI 기록만으로도 원인을 볼 수 있게 끝난 자리와 살아 있는 적을 남긴다
    for (const r of failed) console.error(`#${r.run} 끝: ${JSON.stringify({ step: r.last?.step, region: r.last?.region, at: [r.last?.x, r.last?.z], moving: r.last?.moving, foes: r.last?.foes })}`)
    process.exit(1)
  }
  console.log('봇 검증 통과')
}
