// 플레이 시간대별로 얼마나 강해지는가 (3차 스프린트 타임라인 설계의 기준선).
// 1) 봇이 처음부터 플레이하며 2분마다 저장(snapshot)을 남긴다.
// 2) 저장마다 새 창에서 그 저장을 불러, 같은 표준 적에게 20초 동안 준 피해(공격)와 표준 한 대에 깎이는 생명(방어)을 재고,
//    그때 그 땅의 적 생명·한 대 피해로 "그 자리 적 하나를 잡는 시간"과 "몇 대 맞으면 쓰러지나"를 구한다.
// 사용법: npm run build && node scripts/power-curve.mjs [분=40] [--depth=N] [--shots]   결과: test-results/power-curve.json
// --depth=N: 엔딩 뒤에서 원정이 무르익을 때마다 귀환하며 깊이를 하나씩 내려가 N까지 (E305-03, 옛 --threat)
// --shots: 90분 사람 눈 QA (E306 D24). 봇 창을 1280×720으로 열고 5초씩 감으며 2분 눈금·등급 2 이상 순간의 카드·고르는 카드(귀환·맹세·두 갈래)를 찍고,
//   봇이 끝난 뒤 2분 저장마다 휴대폰(390×844 터치)으로 불러 찍으며 잘린 요소를 센다. 결과는 test-results/timeline/
//   (tick-MMSS-땅.jpg·card-MMSS-종류.jpg·moment-MMSS-n.jpg·phone-MMSS.jpg, 썸네일 sheet-*.png, timeline.json의 눈금·순간·자동 표시).
//   평가가 잦아 봇 시각이 조금 바뀌니 시각 판정에는 쓰지 않는다 (시각은 playtest.mjs --ending 세 판으로)
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { findCuts } from './lib/cuts.mjs'

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const LIMIT_MIN = Number(args[0] ?? 40)
const DEPTH = Number(process.argv.find((a) => a.startsWith('--depth='))?.slice(8) ?? 0)
const SHOTS = process.argv.includes('--shots')
const EVERY = 120
const PORT = 4199
const BASE = `http://localhost:${PORT}/`
const OUT = 'test-results/timeline'
/** --shots: 한 번에 감는 게임 초 (탭 카드는 microtask라 감기가 끝나야 뜬다, Tabs.ts) */
const CHUNK = 5
/** 카드가 나타난 뒤 이만큼(ms) 기다려 찍는다 (날아 들어오는 움직임이 멎을 때) */
const CARD_SETTLE = 600
/** 같은 종류·제목의 작은 카드는 이만큼까지만 찍는다 (큰 카드는 모두) */
const CARD_REPEAT = 3
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true })
const stop = () => {
  try {
    process.kill(-server.pid)
  } catch {}
}
const fmt = (t) => `${Math.floor(Math.round(t) / 60)}:${String(Math.round(t) % 60).padStart(2, '0')}`
const stamp = (t) => fmt(t).replace(':', '').padStart(4, '0')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 몇 프레임 그려질 때까지 기다린다 (찍기 전) */
async function frames(page, n = 2) {
  const f = await page.evaluate(() => window.__game.frame)
  await page.waitForFunction((x) => window.__game.frame >= x, f + n, { timeout: 60000 })
}

/** 저장을 불러 연 새 창 (휴대폰이면 터치 세로) */
async function openSave(browser, save, viewport, phone = false) {
  const p = await browser.newPage({ viewport, ...(phone ? { hasTouch: true, isMobile: true } : {}) })
  await p.addInitScript((data) => {
    if (sessionStorage.getItem('loaded')) return
    sessionStorage.setItem('loaded', '1')
    localStorage.clear()
    localStorage.setItem('mythic-relics/save/0', data)
    localStorage.setItem('mythic-relics/last-slot', '0')
  }, JSON.stringify(save))
  await p.goto(`${BASE}?noscenes`, { timeout: 90000 })
  await p.waitForFunction(() => (window.__game?.frame ?? 0) > 2 && window.__game.playing, null, { timeout: 90000 })
  return p
}

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
  const page = await browser.newPage({ viewport: SHOTS ? { width: 1280, height: 720 } : { width: 640, height: 360 } })
  await page.goto(`${BASE}?fresh&autoplay`)
  await page.waitForFunction(() => window.__autoplay && window.__game.frame > 2, null, { timeout: 60000 })
  if (DEPTH > 0) await page.evaluate(() => {
    // 깊이는 엔딩 뒤 장치 (E21-06): 귀환 카드에서 「+1」
    window.__game.reachEnding()
    Object.assign(window.__autoplay, { deepen: true })
  })
  // 처음부터 하는 판은 장 흐름의 목표를 따라 엔딩까지 (E22-06)
  else await page.evaluate(() => (window.__autoplay.chapters = true))
  const snaps = []
  const done = (s) => s.t > LIMIT_MIN * 60 || (DEPTH > 0 && s.reached >= DEPTH) || (DEPTH === 0 && s.ending)
  // 판의 지금 상태 (페이지 안에서 window.__state()로 읽는다)
  await page.evaluate(() => {
    window.__state = () => {
      const g = window.__game
      return {
        t: g.time,
        region: g.region.id,
        depth: g.depth.level,
        reached: g.depth.reached,
        chosen: g.powers.manifested,
        opened: g.progress.opened.length,
        level: g.powers.manifested ? g.progress.level(g.powers.manifested) : 0,
        chapter: g.chapters.chapter?.id ?? 'end',
        ending: g.ending.reached,
      }
    }
  })
  const shots = SHOTS ? await shootRun() : null
  if (!SHOTS) {
    let next = 0
    for (;;) {
      const s = await page.evaluate((every) => {
        window.__autoplay.run(every)
        return { ...window.__state(), save: window.__game.snapshot() }
      }, EVERY)
      if (s.t >= next) {
        snaps.push(s)
        next += EVERY
        console.log(`저장 ${fmt(s.t)} ${s.chapter} ${s.region} 깊이 ${s.depth} 신화 ${s.opened}(${s.chosen ?? '-'} ${s.level}단계)`)
      }
      if (done(s)) break
    }
  }
  const log = await page.evaluate(() =>
    window.__game.log.filter((e) => ['open', 'promote', 'forge', 'gear', 'bossKill', 'depth', 'region', 'death', 'chapter', 'ending', 'return', 'merge', 'oath', 'mount'].includes(e.type)),
  )
  await page.close()

  // 2) 저장마다 힘 재기
  const rows = []
  for (const s of snaps) {
    const p = await openSave(browser, s.save, { width: 640, height: 360 })
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
      depth: s.depth,
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
  // 3) --shots: 휴대폰으로 다시 찍기와 썸네일·자동 표시
  if (shots) await finishShots(browser, shots, rows)
  await browser.close()
  mkdirSync('test-results', { recursive: true })
  writeFileSync('test-results/power-curve.json', JSON.stringify({ every: EVERY, rows, log }, null, 2))
  console.log('\n시간   땅            깊이 신화 단계  공격  방어  적 잡는 초  맞고 버티는 대')
  for (const r of rows) console.log(`${fmt(r.t).padStart(5)}  ${r.region.padEnd(13)} ${String(r.depth).padStart(2)}  ${String(r.opened).padStart(3)}  ${String(r.level).padStart(3)}  ${String(r.attack).padStart(5)} ${String(r.defense).padStart(5)}  ${String(r.killSeconds ?? '-').padStart(8)}  ${String(r.hitsToDie ?? '-').padStart(8)}`)

  /**
   * --shots의 봇 판 (E306 D24): 5초씩 감고, 감는 사이에는 세계를 멈춘다(timeScale 0, HUD 카드는 실제 시간으로 흐름).
   * 2분 눈금마다 저장·찍기, 새 카드는 하나씩 나타난 뒤 찍고, 고르는 카드는 봇이 고르기 전 그 걸음에서 멈춰 찍는다
   */
  async function shootRun() {
    rmSync(OUT, { recursive: true, force: true })
    mkdirSync(OUT, { recursive: true })
    // 보인 순간을 한도 없이 모은다 (MomentSystem.shown은 200개에서 오래된 것을 버린다): 때·id·등급·카드 제목·땅
    await page.evaluate(() => {
      const g = window.__game
      const ms = g.moments
      const present = ms.present.bind(ms)
      window.__moments = []
      window.__cardShot = null
      ms.present = (m) => {
        present(m)
        const tier = ms.shown.at(-1)?.tier ?? 0
        window.__moments.push({ t: Math.round(g.time * 10) / 10, id: m.id, tier, title: m.card?.title ?? m.text ?? '', region: g.region.id })
      }
    })
    const ticks = []
    const cards = []
    const picks = []
    const seen = new Map()
    let lastShownAt = null
    let next = 0
    let moments = 0
    const shoot = async (file) => {
      await page.evaluate(() => window.__game.view.jumpTo(window.__game.hero.object.position))
      await frames(page)
      await page.screenshot({ path: `${OUT}/${file}`, type: 'jpeg', quality: 70 })
      return file
    }
    /** HUD 줄에 선 카드를 하나씩, 나타난 뒤 찍는다 (세계는 멈춘 채) */
    const drainCards = async () => {
      const until = Date.now() + 90000
      while (Date.now() < until) {
        const h = await page.evaluate(() => {
          const hud = window.__game.hud
          const el = document.querySelector('.hud__gains')
          const lines = (node) => (node?.innerText ?? '').split('\n').map((x) => x.trim()).filter(Boolean).join(' · ')
          return { queue: hud.gainsQueue.length, at: hud.gainsShownAt, size: hud.gainsShowing, kind: lines(el?.querySelector('.hud__gains-head')), text: lines(el).slice(0, 90) }
        })
        if (h.size && h.at !== lastShownAt) {
          lastShownAt = h.at
          await sleep(CARD_SETTLE)
          const t = await page.evaluate(() => window.__game.time)
          const key = `${h.size}:${h.text}`
          const n = (seen.get(key) ?? 0) + 1
          seen.set(key, n)
          const row = { t: Math.round(t), size: h.size, kind: h.kind, text: h.text, file: null }
          if (h.size === 'big' || n <= CARD_REPEAT) row.file = await shoot(`moment-${stamp(t)}-${cards.length}.jpg`)
          cards.push(row)
          continue
        }
        if (h.queue === 0) return
        await sleep(250)
      }
    }
    for (;;) {
      const s = await page.evaluate(
        ([nextTick, chunk]) => {
          const g = window.__game
          const kind = () => (g.returnCardOpen ? 'return' : g.oathCardOpen ? 'oath' : g.swapOpen ? 'swap' : null)
          g.timeScale = 1
          window.__autoplay.run(Math.max(1 / 30, Math.min(chunk, nextTick - g.time)), () => {
            const k = kind()
            if (!k) window.__cardShot = null
            return k !== null && window.__cardShot !== k
          })
          g.timeScale = 0
          const pick = kind()
          return { ...window.__state(), pick: pick !== window.__cardShot ? pick : null, moments: window.__moments.length }
        },
        [next, CHUNK],
      )
      // 고르는 카드: 봇이 고르기 전에 찍는다
      if (s.pick) {
        const file = await shoot(`card-${stamp(s.t)}-${s.pick}.jpg`)
        picks.push({ t: Math.round(s.t), kind: s.pick, file })
        await page.evaluate((k) => (window.__cardShot = k), s.pick)
        console.log(`고르는 카드 ${fmt(s.t)} ${s.pick}`)
      }
      // 이번에 새로 보인 등급 2 이상 순간이 있으면 카드를 하나씩
      if (s.moments > moments) {
        const fresh = await page.evaluate((from) => window.__moments.slice(from).some((m) => m.tier >= 2), moments)
        moments = s.moments
        if (fresh) await drainCards()
      }
      // 2분 눈금: 저장과 찍기, 목표 한 줄·연 탭·원정
      if (s.t >= next) {
        const extra = await page.evaluate(() => {
          const g = window.__game
          return {
            save: g.snapshot(),
            goal: (document.querySelector('.chapter-goal')?.textContent ?? '').trim().replace(/\s+/g, ' '),
            tabs: g.tabs.toData(),
            expedition: g.expedition.count,
            returns: g.expedition.returns,
          }
        })
        const file = await shoot(`tick-${stamp(s.t)}-${s.region}.jpg`)
        const { save, ...rest } = extra
        snaps.push({ ...s, save })
        ticks.push({ t: Math.round(s.t), region: s.region, chapter: s.chapter, ...rest, file })
        next += EVERY
        console.log(`눈금 ${fmt(s.t)} ${s.chapter} ${s.region} 「${rest.goal}」 탭 ${rest.tabs.length} 원정 ${rest.expedition}`)
      }
      if (done(s)) break
    }
    const momentLog = await page.evaluate(() => window.__moments)
    return { ticks, cards, picks, moments: momentLog }
  }

  /** --shots 마무리: 휴대폰 다시 찍기(잘림 수), 눈금에 곡선 값 붙이기, 자동 표시, 썸네일 */
  async function finishShots(browser, shots, rows) {
    const { ticks, cards, picks, moments } = shots
    for (const [i, s] of snaps.entries()) {
      const p = await openSave(browser, s.save, { width: 390, height: 844 }, true)
      await p.evaluate(() => {
        const g = window.__game
        g.stage.flush()
        g.encounter.flushNeighbors()
        g.view.jumpTo(g.hero.object.position)
      })
      await frames(p, 3)
      const file = `phone-${stamp(s.t)}.jpg`
      await p.screenshot({ path: `${OUT}/${file}`, type: 'jpeg', quality: 70 })
      const cut = await p.evaluate(findCuts)
      const quality = await p.evaluate(() => window.__game.viewport.settings.quality)
      await p.close()
      Object.assign(ticks[i] ?? {}, { phone: file, cuts: cut, phoneQuality: quality })
    }
    // 눈금마다 곡선 값과 그 2분의 순간
    for (const [i, tk] of ticks.entries()) {
      const r = rows[i]
      if (r) Object.assign(tk, { attack: r.attack, defense: r.defense, killSeconds: r.killSeconds, hitsToDie: r.hitsToDie })
      tk.moments = moments.filter((m) => m.t >= tk.t && m.t < tk.t + EVERY).map((m) => `${m.id}(${m.tier})${m.title ? ` ${m.title}` : ''}`)
    }
    const flags = autoFlags(moments)
    writeFileSync(`${OUT}/timeline.json`, JSON.stringify({ every: EVERY, ticks, cards, picks, moments, flags }, null, 2))
    // 썸네일: 눈금(데스크톱)·휴대폰·카드
    const sheet = async (name, items, cols, thumb) => {
      const per = cols * 4
      for (let k = 0; k * per < items.length; k++) {
        const part = items.slice(k * per, (k + 1) * per)
        const cells = part
          .map((it) => {
            const src = `data:image/jpeg;base64,${readFileSync(`${OUT}/${it.file}`).toString('base64')}`
            return `<figure><img src="${src}" style="width:${thumb.w}px;height:${thumb.h}px"><figcaption>${it.caption}</figcaption></figure>`
          })
          .join('')
        const p = await browser.newPage({ viewport: { width: cols * (thumb.w + 8) + 8, height: 400 } })
        await p.setContent(
          `<html><body style="margin:0;padding:4px;background:#111;color:#ddd;font:12px sans-serif;display:grid;grid-template-columns:repeat(${cols},${thumb.w + 8}px)">` +
            `<style>figure{margin:4px}figcaption{height:30px;overflow:hidden;line-height:15px}</style>${cells}</body></html>`,
        )
        await p.screenshot({ path: `${OUT}/sheet-${name}-${k + 1}.png`, fullPage: true })
        await p.close()
      }
    }
    await sheet(
      'tick',
      ticks.map((tk) => ({ file: tk.file, caption: `${fmt(tk.t)} ${tk.region} · 공격 ${tk.attack ?? '-'} · 「${tk.goal}」` })),
      3,
      { w: 420, h: 236 },
    )
    await sheet(
      'phone',
      ticks.filter((tk) => tk.phone).map((tk) => ({ file: tk.phone, caption: `${fmt(tk.t)} ${tk.region} · 잘림 ${tk.cuts.length} · ${tk.phoneQuality}` })),
      6,
      { w: 195, h: 422 },
    )
    await sheet(
      'card',
      [...picks.map((c) => ({ ...c, caption: `${fmt(c.t)} 고르는 카드 ${c.kind}` })), ...cards.filter((c) => c.file).map((c) => ({ ...c, caption: `${fmt(c.t)} ${c.size} ${c.text}` }))].sort((a, b) => a.t - b.t),
      3,
      { w: 420, h: 236 },
    )
    const cutTicks = ticks.filter((tk) => tk.cuts?.length)
    console.log(`\n90분 스크린숏: 눈금 ${ticks.length} · 카드 ${cards.length}(찍음 ${cards.filter((c) => c.file).length}) · 고르는 카드 ${picks.length} · 순간 ${moments.length} → ${OUT}/`)
    console.log(`휴대폰 잘림: ${cutTicks.length ? cutTicks.map((tk) => `${fmt(tk.t)} ${tk.cuts.length}`).join(', ') : '모든 눈금 0'}`)
    console.log(`자동 표시: 새 장치 60초 안 ${flags.mechanisms.close.length} · ★ ${flags.stars.list.length}(간격 밖 ${flags.stars.off.length}) · 정신없다 ${flags.busy.length} · 단계가 없다 ${flags.quiet.length}`)
  }
} finally {
  stop()
}

/**
 * 체크리스트 셋을 거드는 자동 표시 (E306 D24, 봇 분 기준):
 * - 새 장치(탭마다 처음 열림·탈것·첫 맹세·첫 합치기·첫 귀환)끼리 60초 안에 붙었나
 * - ★ 여섯(첫 신·깨어남·장 보스·엔딩)이 다 있고 간격이 봇 10~14분(사람 13~18분 × 0.78)인가
 * - 「정신없다」: 2분 창 하나에 등급 2 이상이 넷을 넘거나, 큰 카드(등급 3 이상) 둘이 10초 안
 * - 「단계가 없다」: 등급 1 이상 순간 없이 2.3분(사람 3분 × 0.78)을 넘김
 */
function autoFlags(moments) {
  const firsts = []
  const firstOf = (pred, name) => {
    const m = moments.find(pred)
    if (m) firsts.push({ t: m.t, name })
  }
  for (const title of new Set(moments.filter((m) => m.id === 'tabOpened').map((m) => m.title))) firstOf((m) => m.id === 'tabOpened' && m.title === title, `탭 ${title}`)
  firstOf((m) => m.id === 'mountGained', '탈것')
  firstOf((m) => m.id === 'oathSworn', '첫 맹세')
  firstOf((m) => m.id === 'merged' || m.id === 'mergedHigh', '첫 합치기')
  firstOf((m) => m.id === 'returned', '첫 귀환')
  firsts.sort((a, b) => a.t - b.t)
  const close = firsts.slice(1).flatMap((m, i) => (m.t - firsts[i].t < 60 ? [{ a: firsts[i], b: m, gap: Math.round(m.t - firsts[i].t) }] : []))
  // ★: 첫 신(장면)·깨어남(큰 카드)·장 보스(장면)·엔딩. 마지막 장 보스 바로 뒤의 엔딩은 하나로 친다
  const starIds = new Set(['mythChosen', 'godAwakened', 'chapterBoss', 'ending'])
  const stars = []
  for (const m of moments.filter((x) => starIds.has(x.id))) {
    const last = stars.at(-1)
    if (last && m.id === 'ending' && last.id === 'chapterBoss' && m.t - last.t < 60) stars[stars.length - 1] = m
    else stars.push(m)
  }
  const gaps = stars.slice(1).map((m, i) => ({ from: stars[i].id, to: m.id, at: m.t, minutes: Math.round(((m.t - stars[i].t) / 60) * 10) / 10 }))
  const off = gaps.filter((g) => g.minutes < 10 || g.minutes > 14)
  // 정신없다: 2분 창(1분씩 밀며)·큰 카드 둘이 10초 안
  const busy = []
  const tier2 = moments.filter((m) => m.tier >= 2)
  for (let from = 0; from <= (moments.at(-1)?.t ?? 0); from += 60) {
    const inWin = tier2.filter((m) => m.t >= from && m.t < from + 120)
    if (inWin.length > 4) busy.push({ kind: '2분에 카드 넷 넘게', from, count: inWin.length, ids: inWin.map((m) => m.id) })
  }
  const big = moments.filter((m) => m.tier >= 3)
  for (let i = 1; i < big.length; i++) if (big[i].t - big[i - 1].t < 10) busy.push({ kind: '큰 카드 둘이 10초 안', from: big[i - 1].t, ids: [big[i - 1].id, big[i].id] })
  // 단계가 없다: 순간 사이 2.3분
  const quiet = []
  const any = moments.filter((m) => m.tier >= 1)
  for (let i = 1; i < any.length; i++) if (any[i].t - any[i - 1].t > 138) quiet.push({ from: any[i - 1].t, to: any[i].t, seconds: Math.round(any[i].t - any[i - 1].t), region: any[i - 1].region })
  return { mechanisms: { list: firsts, close }, stars: { list: stars.map((m) => ({ t: m.t, id: m.id, title: m.title })), gaps, off }, busy, quiet }
}
