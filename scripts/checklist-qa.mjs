// 직접 플레이 체크리스트를 Claude가 사람 눈으로 확인하기 위한 장면·수치 모음 (2026-10-27 결정: 체크리스트는 사람 대신 Claude가 본다).
// 항목마다 그 상태를 만들어 스크린숏(test-results/checklist/*.png)과 수치(test-results/checklist.json)를 남긴다. 판정은 사람이 보듯 스크린숏을 보고 한다.
// 사용법: npm run build && node scripts/checklist-qa.mjs [항목 id 앞부분 ...]   예: node scripts/checklist-qa.mjs e12 e13-1
// 피해를 재는 항목의 표준 적은 생명이 고정된 허수아비다 (`lib/curve.mjs`의 DUMMY_HP, power-curve와 같다):
// 옛 표준 적(생명 80 × 60 × 땅 세기)은 센 빌드로 20초 안에 죽어 값이 그 생명에서 잘렸다 (E307)
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { findCuts } from './lib/cuts.mjs'
import { DUMMY_HP } from './lib/curve.mjs'

const want = process.argv.slice(2)
const PORT = 4197
const OUT = 'test-results/checklist'
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL = `http://localhost:${PORT}/`
/** 휴대폰 화면: 아이폰 15 Pro, 그리고 그 사파리에서 주소창·도구 막대가 보일 때의 높이 */
const PHONE = { width: 393, height: 852 }
const PHONE_SHORT = { width: 393, height: 659 }
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true })
const stop = () => {
  try {
    process.kill(-server.pid)
  } catch {}
}

/**
 * 새로 시작한 게임 (저장 지움, 무작위 고정). 반환: page. phone을 주면 그 크기의 터치 기기로 연다.
 * 페이지 안에 돕는 것을 둔다 (`window.__qa`):
 * - seat(god, ...숨의 다른 신): 손·심장·숨 첫 칸에 그 신을 조용히 (카드·장면·충격 없이. 「신이 깨어남」 큰 카드가 찍으려는 것을 가리지 않게)
 * - dummy(dx, dz): 표준 허수아비 (서리 거인, 생명 고정)를 주인공 옆에 세운다
 * - hit20(): 마을 한가운데에서 가만히 선 허수아비를 20초 동안 쳐서 준 피해
 */
async function fresh(browser, query = '?fresh&relics=&region=village&noscenes', seed = 7, phone = null) {
  const page = await browser.newPage(phone ? { viewport: phone, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript((s) => {
    let a = s >>> 0
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }, seed)
  await page.addInitScript((dummyHp) => {
    const game = () => window.__game
    window.__qa = {
      seat(god, ...others) {
        game().dev.pantheon({ hand: god, heart: god, breath: [god, ...others] })
      },
      dummy(dx = 1.8, dz = 0) {
        const g = game()
        const p = g.hero.object.position
        const t = g.encounter.spawnById('grunt', { x: p.x + dx, z: p.z + dz }, true)
        t.health.max = dummyHp
        t.health.hp = dummyHp
        return t
      },
      hit20() {
        const g = game()
        g.encounter.clearAll()
        g.combat.health.reset()
        g.combat.godMode = true
        g.orders.clear()
        g.dev.teleport(0, 4)
        const t = this.dummy()
        t.update = () => {}
        g.orders.press(null, t)
        g.advance(20, 1 / 30)
        const dealt = Math.round(dummyHp - t.health.hp)
        g.encounter.clearAll()
        return dealt
      },
    }
  }, DUMMY_HP)
  // 이어진 세계(E19)는 이웃 땅까지 지어 처음 여는 데 오래 걸린다
  await page.goto(URL + query, { timeout: 90000 })
  await page.waitForFunction(() => (window.__game?.frame ?? 0) > 3, null, { timeout: 90000 })
  return page
}

/** 지금 떠 있는 얻은 것 카드의 「종류 · 이름」 (없으면 null). 다 지나간 카드의 글은 DOM에 남으니 Hud에 떠 있는지를 묻는다 */
const cardNow = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('.hud__gains')
    return c && window.__game.hud.gainsShowing !== null ? `${c.querySelector('.hud__gains-kind')?.textContent ?? ''} · ${c.querySelector('.hud__gains-title')?.textContent ?? ''}` : null
  })

/**
 * 그 종류의 얻은 것 카드가 뜰 때까지 기다린다 (줄에 선 앞 카드가 지나가야 뜬다: 큰 카드 하나가 실제 4.5초).
 * 뜬 카드의 글을 돌려준다 (끝내 안 뜨면 그때 떠 있던 것: 결과에 남겨 엉뚱한 것이 찍혔는지 알 수 있게)
 */
async function waitCard(page, kind) {
  await page
    .waitForFunction((k) => window.__game.hud.gainsShowing !== null && (document.querySelector('.hud__gains .hud__gains-kind')?.textContent ?? '').includes(k), kind, { timeout: 60000 })
    .catch(() => {})
  return cardNow(page)
}

/** 떠 있는 두 갈래 카드를 「지금 그대로」로 닫는다 (떠 있는 동안은 세계와 순간 줄이 멈춘다) */
async function keepSeats(page) {
  for (let i = 0; i < 4 && (await page.evaluate(() => window.__game.swapOpen && (window.__game.answerSwap(false), true))); i++) await page.waitForTimeout(300)
}

/** 순간(카드·장면 뒤 할 일)이 다 지나갈 때까지 기다린다 (다음에 찍을 것을 앞 카드가 가리지 않게) */
const calm = (page) =>
  page
    .waitForFunction(() => !window.__game.moments.holding && !window.__game.hud.gainsBusy && window.__game.hud.gainsShowing === null, null, { timeout: 120000 })
    .catch(() => {})

/** 몇 프레임 그린 뒤 찍는다 */
async function shot(page, name, clip) {
  const f = await page.evaluate(() => window.__game.frame)
  await page.waitForFunction((n) => window.__game.frame > n + 2, f, { timeout: 60000 })
  await page.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : {}) })
  return `${OUT}/${name}.png`
}

const errors = []
const results = {}
const sections = {
  /**
   * E12-1 신을 하나 더 깨울 때마다 강해진 게 느껴진다 (옛 「신화를 하나 더 열 때마다」, E302): 토르를 손·심장·숨에 둔 채
   * 데모에서 깨우는 차례(오딘 → 제우스, 엔딩 뒤 로키)로 신을 숨 칸에 더하고 그 유물을 유물표에 켜며 20초 동안 준 피해, 둘째 신이 깨어나는 순간의 화면.
   * 열기만 하고 자리에 넣지 않은 신은 힘이 붙지 않는다 (E302: 옛 판은 `progress.open`만 해서 늘 같은 값이 나왔다)
   */
  async 'e12-1'(browser) {
    const page = await fresh(browser)
    const rows = await page.evaluate(() => {
      const g = window.__game
      const order = [
        ['thor', 'mjolnir'],
        ['odin', 'gungnir'],
        ['zeus', 'keraunos'],
        ['loki', 'lokiMask'],
      ]
      const out = []
      for (let n = 1; n <= order.length; n++) {
        const gods = order.slice(0, n).map(([god]) => god)
        window.__qa.seat(...gods)
        g.dev.equip(order[n - 1][1])
        out.push({ gods: gods.join('+'), damage: window.__qa.hit20(), hp: g.combat.health.max })
      }
      return out
    })
    const base = rows[0].damage
    for (const r of rows) r.vsOne = `${Math.round((r.damage / base - 1) * 100)}%`
    await page.close()
    // 둘째 신을 깨우는 길 (E238·E302), 조각을 하나씩: 손·심장 부품이 오는 조각에는 자리가 차 있어 두 갈래 카드가 뜨고
    // (떠 있는 동안 세계와 순간 줄이 멈춘다), 조각 3에 깨어나 숨 칸에 들어가며 큰 카드 「신이 깨어남」.
    // (첫 신의 장면은 e23-1이 찍는다) 여기서 실패해도 앞에서 잰 피해는 남긴다
    const page2 = await fresh(browser, '?fresh&relics=&region=midgard&noscenes')
    try {
      await page2.evaluate(() => {
        const g = window.__game
        window.__qa.seat('thor')
        g.dev.equip('mjolnir')
        // 둘째 신의 흔적은 첫 귀환 뒤에 응답한다 (`traceStateOf`): 귀환 1을 마친 원정으로
        g.expedition.count = 2
        g.encounter.clearAll()
      })
      const swaps = []
      /** 조각 하나를 얻고, 두 갈래 카드가 뜨면 찍은 뒤 「지금 그대로」로 닫는다 (어느 조각에 무슨 카드가 떴는지 남긴다) */
      const piece = async (n) => {
        await page2.evaluate(() => window.__game.dev.awaken('odin'))
        if (!(await page2.waitForFunction(() => window.__game.swapOpen, null, { timeout: 4000 }).then(() => true, () => false))) return
        await page2.waitForFunction(() => !document.querySelector('.swap-card')?.classList.contains('is-arming'), null, { timeout: 5000 }).catch(() => {})
        swaps.push({ piece: n, title: await page2.evaluate(() => document.querySelector('.swap-card__title')?.textContent ?? '') })
        await shot(page2, `e12-1-swap${n}`)
        await keepSeats(page2)
      }
      await piece(1)
      await calm(page2)
      await piece(2)
      await calm(page2)
      await piece(3)
      const card = await waitCard(page2, '신이 깨어남')
      const opened = await page2.evaluate(() => ({ opened: window.__game.progress.opened, pantheon: window.__game.progress.pantheon }))
      await shot(page2, 'e12-1-open')
      return { rows, swaps, card, opened }
    } catch (e) {
      return { rows, openError: String(e?.message ?? e) }
    } finally {
      await page2.close()
    }
  },

  /**
   * E12-2 손에 쥔 신을 바꾸면 싸우는 모습이 바로 달라진다 (옛 「고른 신화를 바꾸면」, E302): 바꾼 뒤 첫 휘두르기까지 시간과 휘두르는 모습.
   * 데모에서 깨우는 셋을 신 탭에서 손에 쥐듯 바꾼다 (`placeMyth('hand')`: 토르 → 오딘 → 제우스 → 토르, 심장·숨은 그대로)
   */
  async 'e12-2'(browser) {
    const page = await fresh(browser)
    await page.evaluate(() => window.__qa.seat('thor', 'odin', 'zeus'))
    const out = []
    for (const god of ['odin', 'zeus', 'thor']) {
      const r = await page.evaluate((god) => {
        const g = window.__game
        g.encounter.clearAll()
        g.combat.godMode = true
        g.orders.clear()
        g.dev.teleport(0, 4)
        const t = window.__qa.dummy()
        t.update = () => {}
        g.orders.press(null, t)
        g.advance(2, 1 / 30)
        // 싸우는 중에 손의 신을 바꾼다
        const t0 = g.time
        g.placeMyth('hand', god)
        let first = null
        let was = g.combat.combo.swinging
        let style = g.combat.style
        for (let i = 0; i < 90 && first === null; i++) {
          g.advance(1 / 30, 1 / 30)
          style = g.combat.style
          // 바꾼 뒤 새로 시작한 첫 휘두르기
          if (g.combat.combo.swinging && !was) first = g.time - t0
          was = g.combat.combo.swinging
        }
        // 휘두르는 중간쯤에서 멈춰 찍는다
        g.advance(0.12, 1 / 30)
        g.timeScale = 0
        return { god, style, firstSwing: first === null ? null : Math.round(first * 100) / 100 }
      }, god)
      const clip = { x: 640 - 200, y: 360 - 170, width: 400, height: 300 }
      r.shot = await shot(page, `e12-2-${god}`, clip)
      await page.evaluate(() => (window.__game.timeScale = 1))
      out.push(r)
    }
    await page.close()
    return out
  },

  /** E12-3 신 탭만 보고 다음에 무엇을 해야 하는지 안다: 막 시작했을 때, 신 하나를 깨운 뒤, 원정이 무르익어 승천할 수 있을 때 */
  async 'e12-3'(browser) {
    const page = await fresh(browser)
    const tab = async (name) => {
      await page.evaluate(() => window.__game.menu.show('gods'))
      await page.waitForTimeout(300)
      const text = await page.evaluate(() => document.querySelector('.menu')?.innerText ?? '')
      await shot(page, name)
      await page.evaluate(() => window.__game.menu.toggle(false))
      return text.slice(0, 1200)
    }
    const empty = await tab('e12-3-none')
    await page.evaluate(() => window.__qa.seat('thor'))
    const one = await tab('e12-3-thor')
    // 원정이 무르익어 성소 화로에서 승천할 수 있을 때 (E305-03: 신화 경험치 대신 귀환. 첫 귀환의 문턱은 기세 9, `RETURN_MIN_LEVEL`)
    await page.evaluate(() => {
      const g = window.__game
      g.expedition.elapsed = 600
      g.dev.insight(12)
    })
    const ready = await tab('e12-3-ready')
    await page.close()
    return { empty, one, ready }
  },

  /** E12-4 싸우다가 땅을 한 번 누르면 바로 빠져나간다: 졸개 여섯에 둘러싸여 싸우다 8m 밖을 화면에서 누른다 */
  async 'e12-4'(browser) {
    const page = await fresh(browser)
    const at = await page.evaluate(() => {
      const g = window.__game
      window.__qa.seat('thor')
      g.combat.godMode = true
      g.dev.teleport(0, 4)
      const p = g.hero.object.position
      // 쓰러지지 않는 졸개 여섯 (표준 허수아비와 같은 고정 생명, 움직이고 때린다)
      const ring = []
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        ring.push(window.__qa.dummy(Math.sin(a) * 1.6, Math.cos(a) * 1.6))
      }
      g.orders.press(null, ring[0])
      g.advance(2, 1 / 30)
      window.__ring = ring
      const goal = { x: p.x + 8, z: p.z + 1 }
      window.__goal = goal
      return g.screenPoint(goal.x, g.hero.object.position.y, goal.z)
    })
    await shot(page, 'e12-4-before')
    const t0 = await page.evaluate(() => window.__game.time)
    await page.mouse.click(at.x, at.y)
    // 누른 것은 다음 화면 갱신에서 지시가 된다
    await page.waitForFunction(() => window.__game.orders.order?.kind === 'move', null, { timeout: 10000 }).catch(() => {})
    const r = await page.evaluate(async (t0) => {
      const g = window.__game
      const goal = g.hero.goal ? { x: g.hero.goal.x, z: g.hero.goal.z } : window.__goal
      let left = null
      let swingsAfter = 0
      let wasSwinging = g.combat.combo.swinging
      const startAt = { ...g.hero.object.position }
      for (let i = 0; i < 150 && left === null; i++) {
        g.advance(1 / 30, 1 / 30)
        if (g.combat.combo.swinging && !wasSwinging) swingsAfter++
        wasSwinging = g.combat.combo.swinging
        const p = g.hero.object.position
        if (Math.hypot(p.x - goal.x, p.z - goal.z) < 0.6) left = g.time - t0
      }
      const near = g.encounter.giants.filter((e) => e.alive && Math.hypot(e.x - g.hero.object.position.x, e.z - g.hero.object.position.z) < 2.5).length
      return { order: g.orders.order?.kind ?? null, distance: Math.round(Math.hypot(goal.x - startAt.x, goal.z - startAt.z) * 10) / 10, arrive: left === null ? null : Math.round(left * 100) / 100, swingsAfterClick: swingsAfter, enemiesWithin2_5m: near }
    }, t0)
    await shot(page, 'e12-4-after')
    await page.close()
    return r
  },

  /** E12-5 몬스터 이름과 등급을 바로 안다: 보통·정예·보스에 커서를 올린 모습 */
  async 'e12-5'(browser) {
    const page = await fresh(browser, '?fresh&relics=&region=utgard&noscenes')
    const out = []
    for (const name of ['normal', 'elite', 'boss']) {
      const at = await page.evaluate((name) => {
        const g = window.__game
        g.orders.clear()
        let target
        if (name === 'boss') {
          target = g.encounter.boss
          g.dev.teleport(target.x - 7, target.z + 2)
        } else {
          g.encounter.clearAll()
          g.dev.teleport(0, 0)
          const p = g.hero.object.position
          target = g.encounter.spawnById(name === 'normal' ? 'grunt' : 'wolf', { x: p.x + 4, z: p.z }, false)
          if (name === 'elite') target.makeElite('swift')
        }
        target.update = () => {}
        return g.screenPoint(target.x, g.hero.object.position.y + 1.0, target.z)
      }, name)
      await page.mouse.move(at.x, at.y)
      await page.waitForTimeout(400)
      const plates = await page.evaluate(() => window.__game.nameplates.visible)
      await shot(page, `e12-5-${name}`, { x: Math.max(0, at.x - 220), y: Math.max(0, at.y - 200), width: 440, height: 300 })
      out.push({ name, plates })
    }
    await page.close()
    return out
  },

  /** E12-6 첫 장면이 짧고 자연스럽다: 줄 수·글자 수·사람이 읽는 시간, 첫 줄과 마지막 줄 화면 */
  async 'e12-6'(browser) {
    const scenes = JSON.parse(readFileSync('src/data/scenes.json', 'utf8'))
    const opening = scenes.opening ?? Object.values(scenes)[0]
    const lines = (opening.lines ?? opening.steps ?? []).map((l) => (typeof l === 'string' ? l : `${l.who ?? l.speaker ?? ''}: ${l.text ?? l.line ?? ''}`))
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    await page.goto(URL)
    await page.waitForSelector('.title-slot', { timeout: 60000 })
    await page.locator('.title-slot').first().click()
    await page.click('.title__button--primary')
    await page.waitForFunction(() => window.__game.scenes.current === 'opening' && !document.querySelector('.dialog')?.hidden, null, { timeout: 10000 })
    await page.waitForTimeout(1500)
    await shot(page, 'e12-6-first')
    let clicks = 0
    for (; clicks < 40 && (await page.evaluate(() => !document.querySelector('.dialog').hidden)); clicks++) {
      if (clicks === 6) await shot(page, 'e12-6-mid')
      await page.mouse.click(640, 300)
      await page.waitForTimeout(150)
    }
    await page.waitForTimeout(800)
    await shot(page, 'e12-6-after')
    await page.close()
    const chars = lines.reduce((n, l) => n + l.length, 0)
    return { lines, count: lines.length, chars, readSeconds: Math.round(chars / 8), clicksToFinish: clicks }
  },

  /** E13-1 장비를 주울 때 "이게 더 좋은가"가 바로 보인다: 손 칸에 보통 장비를 낀 채, 땅의 영웅 장갑에 커서를 올린 카드 */
  async 'e13-1'(browser) {
    const page = await fresh(browser)
    const at = await page.evaluate(() => {
      const g = window.__game
      window.__qa.seat('thor')
      g.dev.teleport(2, -3)
      g.dev.wear('hands', 'common')
      const p = g.hero.object.position
      g.dev.dropGear('hands', 'hero', p.x + 4, p.z + 1)
      return g.screenPoint(p.x + 4, p.y + 0.4, p.z + 1)
    })
    await page.mouse.move(at.x, at.y)
    await page.waitForTimeout(500)
    // 카드는 화면에 붙어 떠서(position: fixed) offsetParent가 없다: 보이는지는 checkVisibility로 본다
    const card = await page.evaluate(() => [...document.querySelectorAll('.relic-tooltip')].filter((e) => e.checkVisibility()).map((e) => e.innerText).join('\n---\n'))
    await shot(page, 'e13-1-card')
    await page.close()
    return { card }
  },

  /** E13-2 유물을 처음 만들 때와 단계를 올릴 때 신난다: 대장간에서 벼린 직후의 큰 카드 둘 (데모에서 벼리는 것은 종장의 2단계, 1단계는 조각 2로 받는다) */
  async 'e13-2'(browser) {
    const page = await fresh(browser)
    const out = []
    for (const step of [1, 2]) {
      const ok = await page.evaluate(() => {
        const g = window.__game
        if (!g.progress.pantheon.hand) window.__qa.seat('thor')
        g.dev.teleport(2, -3)
        g.dev.fillForge('thor')
        return g.dev.forge('thor')
      })
      const card = await waitCard(page, '대장간')
      await shot(page, `e13-2-forge${step}`)
      out.push({ step, ok, card, stage: await page.evaluate(() => window.__game.powers.loadout.stage('mjolnir')) })
      await calm(page)
    }
    await page.close()
    return out
  },

  /** E14-2 깊이를 올리면 확실히 어려워지고, 보상이 좋아진 게 보인다 (E305-03): 귀환 카드의 「그대로 / +1」, 처음 가는 깊이의 큰 카드, 깊이별 적 배율 */
  async 'e14-2'(browser) {
    const page = await fresh(browser, '?fresh&relics=&region=midgard&noscenes')
    const scale = await page.evaluate(() => {
      const g = window.__game
      window.__qa.seat('thor')
      const scale = []
      for (let lv = 1; lv <= 10; lv++) {
        g.depth.level = lv
        g.depthSystem.apply()
        scale.push({ level: lv, ...g.encounter.threat, elite: Math.round(g.encounter.eliteChance * 100) / 100 })
      }
      // 깊이는 엔딩 뒤 장치 (E21-06): 원정이 무르익어 성소 화로에 서면 귀환 카드에 깊이 알약
      Object.assign(g.depth, { level: 1, reached: 1 })
      g.depthSystem.apply()
      g.reachEnding()
      g.expedition.elapsed = 300
      g.training.xp = 5000
      g.dev.teleport(g.sanctuary.center.x, g.sanctuary.center.z)
      return scale
    })
    await page.waitForFunction(() => window.__game.returnCardOpen, null, { timeout: 15000 })
    // 고르는 카드는 뜬 직후 잠깐 누름을 받지 않는다 (E307 `pickGate`): 단추가 켜진 뒤에 누른다
    await page.waitForFunction(() => !document.querySelector('.return-card:not(.oath-card)')?.classList.contains('is-arming'), null, { timeout: 15000 })
    await page.locator('.return-card__depth .ui-pill', { hasText: '+1' }).click()
    await shot(page, 'e14-2-return-card')
    await page.locator('.return-card:not(.oath-card) .pick-card__card').first().click()
    // 엔딩 뒤라 다시 떠날 때 맹세 출발 카드가 뜬다: 맹세 없이 닫는다 (떠 있는 동안 얻은 것 카드는 줄에서 기다린다)
    await page.waitForFunction(() => window.__game.oathCardOpen, null, { timeout: 5000 }).catch(() => {})
    await page.evaluate(() => {
      const g = window.__game
      if (!g.oathCardOpen) return
      g.hideCards()
      g.oathSystem.swear(null)
    })
    // 처음 가는 깊이의 카드는 승천·출발 큰 카드 뒤에 줄을 선다
    const card = await waitCard(page, '깊이')
    await shot(page, 'e14-2-advance')
    const after = await page.evaluate(() => ({ level: window.__game.depth.level, reached: window.__game.depth.reached }))
    await page.close()
    return { scale, card, after }
  },

  /** E14-3 반복하던 손일이 자동이 될 때 반갑다 (E305-03 자동화): 귀환 2가 연 자동 합치기 카드, 보통 장비 셋을 주우면 저절로 합쳐지는 순간 */
  async 'e14-3'(browser) {
    const page = await fresh(browser, '?fresh&relics=&region=midgard&noscenes')
    const before = await page.evaluate(() => {
      const g = window.__game
      window.__qa.seat('thor')
      // 귀환 1을 마친 원정: 귀환하면 귀환 2 (보통·좋음 자동 합치기, 기세 출발점 1/3)
      Object.assign(g.expedition, { count: 2, elapsed: 300 })
      g.training.xp = 5000
      g.expeditionSystem.returnNow('flame:flame')
      // 귀환 2가 띄운 맹세 출발 카드는 닫는다 (떠 있는 동안 얻은 것 카드는 줄에서 기다린다)
      g.hideCards()
      g.oathSystem.swear(null)
      return { returns: g.expedition.returns, merge: g.automation.now.autoMerge }
    })
    // 「원정 3 출발」 큰 카드 뒤에 자동화 카드가 뜬다
    before.card = await waitCard(page, '자동화')
    await shot(page, 'e14-3-unlock')
    await calm(page)
    const merged = await page.evaluate(() => {
      const g = window.__game
      const p = g.hero.object.position
      // 같은 부위 보통 장비 넷을 발밑에 떨군다: 하나는 빈 발 칸에, 가방에 셋이 모이면 저절로 합친다
      for (let i = 0; i < 4; i++) g.dev.dropGear('feet', 'common', p.x, p.z)
      g.advance(1.5, 1 / 30)
      return { grades: [...g.powers.loadout.gear.values()].map((x) => x.grade) }
    })
    await page.waitForTimeout(600)
    await shot(page, 'e14-3-merged')
    await page.close()
    return { before, merged }
  },

  /**
   * E15-3 지도만 보고 어디로 가야 할지 안다: 미드가르드에서 연 세계 지도 (컴퓨터와 휴대폰), 보이는 이름과 잘린 요소,
   * 속이 찬 표시(마을·켠 성소)를 눌러 바로 가기 (E307: 이름 글자가 아니라 표시 둘레 44px를 누른다)
   */
  async 'e15-3'(browser) {
    const out = {}
    for (const [name, phone] of [
      ['', null],
      ['-phone', PHONE],
    ]) {
      const page = await fresh(browser, '?fresh&relics=&region=midgard&noscenes', 7, phone)
      await page.evaluate(() => window.__game.menu.show('map'))
      // 판이 뜬 직후의 누름은 설명만 띄운다 (`mapTab`의 SETTLE_MS): 그 뒤에 누른다
      await page.waitForTimeout(800)
      await shot(page, `e15-3-map${name}`)
      const seen = await page.evaluate(() => ({
        from: window.__game.region.id,
        names: [...document.querySelectorAll('.menu-map__label')].filter((e) => e.checkVisibility()).map((e) => e.textContent.trim()),
        spots: document.querySelectorAll('.menu-map__spot').length,
        canWarp: [...document.querySelectorAll('.menu-map__spot.can-warp')].map((e) => e.getAttribute('aria-label')),
      }))
      const cuts = await page.evaluate(findCuts)
      // 갈 수 있는 표시(원)를 누른다: 창이 닫히고 그 땅으로 간다
      const spot = page.locator('.menu-map__spot.can-warp').first()
      let to = null
      if ((await spot.count()) > 0) {
        await (phone ? spot.tap() : spot.click())
        await page.waitForFunction((from) => !window.__game.menu.open && window.__game.region.id !== from, seen.from, { timeout: 20000 }).catch(() => {})
        to = await page.evaluate(() => ({ region: window.__game.region.id, menuOpen: window.__game.menu.open }))
        await shot(page, `e15-3-warped${name}`)
      }
      out[phone ? 'phone' : 'desktop'] = { ...seen, cuts, to }
      await page.close()
    }
    return out
  },

  /** E305 맹세: 귀환 2에 뜨는 출발 카드와 맹세 탭 (제약·보상이 이어지는지) */
  async 'e305-oath'(browser) {
    const page = await fresh(browser, '?fresh&relics=&region=midgard&noscenes')
    await page.evaluate(() => {
      const g = window.__game
      window.__qa.seat('thor')
      Object.assign(g.expedition, { count: 2, elapsed: 300 })
      g.training.xp = 5000
      g.oaths.keep('glass', 400)
      g.expeditionSystem.returnNow('flame:flame')
    })
    await page.waitForFunction(() => window.__game.oathCardOpen && !document.querySelector('.oath-card')?.classList.contains('is-arming'), null, { timeout: 15000 }).catch(() => {})
    await shot(page, 'e305-oath-card')
    const text = await page.evaluate(() => {
      const g = window.__game
      g.hideCards()
      g.oathSystem.swear('alone')
      g.menu.show('oaths')
      return document.querySelector('.menu')?.innerText ?? ''
    })
    await page.waitForTimeout(400)
    await shot(page, 'e305-oaths-tab')
    await page.close()
    return { text: text.slice(0, 2000) }
  },

  /** E17-1 한계를 깨는 순간 */
  async 'e17-1'(browser) {
    const page = await fresh(browser)
    await page.evaluate(() => {
      const g = window.__game
      window.__qa.seat('thor')
      g.dev.teleport(2, -3)
      g.reachEnding()
      g.dev.depth(10)
    })
    // 엔딩 뒤로 넘기며 뜬 카드(새 탭 등)가 지나간 뒤에 깬다
    await calm(page)
    await page.evaluate(() => window.__game.depthSystem.breakLimit())
    const card = await waitCard(page, '한계를 깸')
    await shot(page, 'e17-1-break')
    await page.close()
    return { card }
  },

  /** E305-6 탭 일곱이 쓸 일이 생길 때 하나씩 열린다: 새 판에서 장비 → 수련 → 신 → 지도 → 원천(첫 귀환) → 맹세(귀환 2), 카드와 신 탭의 「자리 · 외형」 */
  async 'e305-6'(browser) {
    const page = await fresh(browser, '?fresh&region=midgard&noscenes')
    const order = []
    // 걸음마다 그 탭의 「새 탭」 카드가 뜰 때 찍는다 (같은 일이 띄운 더 큰 카드 뒤에 줄을 선다)
    const step = async (name, run) => {
      await page.evaluate(run)
      const card = await waitCard(page, '새 탭')
      await shot(page, `e305-6-${name}`)
      order.push({ step: name, card, opened: await page.evaluate(() => [...window.__game.tabs.opened]) })
      await calm(page)
    }
    await step('gear', () => {
      const g = window.__game
      const p = g.hero.object.position
      g.dev.dropGear('feet', 'rare', p.x, p.z)
      g.advance(1, 1 / 30)
    })
    // 수련 탭은 깨달음 둘부터 (E306 D11, `TRAINING_TAB_INSIGHTS`)
    await step('training', () => {
      window.__game.dev.insight(2)
      window.__game.advance(0.5, 1 / 30)
    })
    // 신 탭은 첫 신의 흔적(조각 1)에
    await step('gods', () => {
      window.__game.dev.awaken('thor')
      window.__game.advance(0.5, 1 / 30)
    })
    await step('map', () => {
      const g = window.__game
      g.dev.teleport(g.sanctuary.center.x, g.sanctuary.center.z)
      g.advance(1, 1 / 30)
      g.hideCards()
    })
    await step('sources', () => {
      const g = window.__game
      Object.assign(g.expedition, { elapsed: 300 })
      g.training.xp = 5000
      g.expeditionSystem.returnNow('flame:flame')
      g.hideCards()
      g.advance(0.5, 1 / 30)
    })
    await step('oaths', () => {
      const g = window.__game
      Object.assign(g.expedition, { elapsed: 300 })
      g.training.xp = 5000
      g.expeditionSystem.returnNow('flame:flame')
      // 귀환 2가 띄운 맹세 출발 카드는 닫는다 (떠 있는 동안 얻은 것 카드는 줄에서 기다린다)
      g.hideCards()
      g.oathSystem.swear(null)
      g.advance(0.5, 1 / 30)
    })
    await page.evaluate(() => window.__game.menu.show('gods'))
    await page.waitForTimeout(400)
    await shot(page, 'e305-6-gods-slots')
    await page.locator('.menu-gods__views .ui-pill', { hasText: '외형' }).click()
    await page.waitForTimeout(400)
    await shot(page, 'e305-6-gods-looks')
    const tabs = await page.evaluate(() => [...document.querySelectorAll('.menu__tab')].filter((b) => !b.hidden).map((b) => b.textContent.trim()))
    await page.close()
    return { order, tabs }
  },

  /** E305 끝없는 원정: 한계를 깬 뒤 마을의 끝없는 원정 탭과 1층 입구 (층 이름·나가는 문) */
  async 'e305-endless'(browser) {
    const page = await fresh(browser)
    await page.evaluate(() => {
      const g = window.__game
      window.__qa.seat('thor')
      g.reachEnding()
      g.dev.depth(10)
      g.depthSystem.breakLimit()
      g.endless.reach(7)
    })
    // 한계를 깬 큰 카드가 지나간 뒤에 나선다 (큰 카드와 층 이름 카드가 같은 위 가운데 자리라 겹친다)
    await calm(page)
    await page.evaluate(() => window.__game.menu.show('endless'))
    await page.waitForTimeout(400)
    await shot(page, 'e305-endless-tab')
    await page.getByRole('button', { name: '끝없는 원정에 나서기' }).click()
    await page.waitForTimeout(800)
    await shot(page, 'e305-endless-floor')
    const floor = await page.evaluate(() => ({ region: window.__game.region.id, name: window.__game.region.name, depth: window.__game.endlessSystem.run?.depth ?? null }))
    await page.close()
    return { floor }
  },

  /**
   * E302~E304 휴대폰에서 고르는 카드와 합치기가 한 화면에 들어간다 (E307 0A 손 QA의 눈): 아이폰 15 Pro(393×852)와
   * 그 사파리에서 주소창이 보일 때(393×659)의 귀환 카드·맹세 출발 카드·두 갈래 카드·장비 탭의 합치기.
   * 화면마다 잘린 요소(`lib/cuts.mjs`: 화면 밖·덮인 단추·창 밖의 것에 덮인 글)를 함께 남긴다. 한 걸음이 실패해도 다음 걸음은 찍는다.
   * 합치기는 가방의 빛나는 칸을 톡해 합치기 상자를 연 화면이다: 「합치기」 단추가 밀지 않고 보이는지(`go.inView`, 아니면 밀어야 하는 px)를 재고,
   * 밀어야 하면 밀어 내린 화면도 찍는다
   */
  async 'e30x-phone'(browser) {
    const out = {}
    for (const size of [PHONE, PHONE_SHORT]) {
      const tag = `${size.width}x${size.height}`
      const page = await fresh(browser, '?fresh&relics=&region=midgard&noscenes', 7, size)
      const snap = async (name, ready) => {
        const ok = await page.waitForFunction(ready, null, { timeout: 20000 }).then(() => true, () => false)
        // 고르는 카드는 뜬 직후 잠깐 흐리다 (`pickGate`): 단추가 켜진 뒤에 찍는다
        await page.waitForFunction(() => !document.querySelector('.is-arming'), null, { timeout: 5000 }).catch(() => {})
        return { shown: ok, shot: await shot(page, `e30x-${name}-${tag}`), cuts: await page.evaluate(findCuts) }
      }
      const r = {}
      // 귀환 카드 (E304): 원정이 무르익어 성소 화로에 선다
      await page.evaluate(() => {
        const g = window.__game
        window.__qa.seat('thor')
        g.dev.equip('mjolnir')
        g.encounter.clearAll()
        g.expedition.elapsed = 300
        g.dev.insight(12)
        g.dev.teleport(g.sanctuary.center.x, g.sanctuary.center.z)
      })
      r.return = await snap('return', () => window.__game.returnCardOpen)
      // 맹세 출발 카드 (E305-01): 귀환 2 뒤 다시 떠날 때
      await page.evaluate(() => {
        const g = window.__game
        g.hideCards()
        Object.assign(g.expedition, { count: 2, elapsed: 300 })
        g.training.xp = 5000
        g.expeditionSystem.returnNow('flame:flame')
      })
      r.oath = await snap('oath', () => window.__game.oathCardOpen)
      // 두 갈래 카드 (E302): 둘째 신의 손·심장 부품이 왔는데 자리가 차 있다
      await page.evaluate(() => {
        const g = window.__game
        g.hideCards()
        g.oathSystem.swear(null)
        g.encounter.clearAll()
      })
      // 조각을 하나씩 (앞 조각의 큰 카드가 지나간 뒤에): 조각 2에 손·심장 부품이 오며 두 갈래 카드
      for (let i = 0; i < 2; i++) {
        await calm(page)
        await page.evaluate(() => window.__game.dev.awaken('odin'))
      }
      r.swap = await snap('swap', () => window.__game.swapOpen)
      await keepSeats(page)
      // 합치기 (E303): 같은 부위 희귀 넷을 주워 하나는 끼고 셋은 가방에 (희귀는 귀환 3부터 저절로 합쳐지니 아직 손으로 합친다)
      await page.evaluate(() => {
        const g = window.__game
        const p = g.hero.object.position
        for (let i = 0; i < 4; i++) g.dev.dropGear('feet', 'rare', p.x, p.z)
        g.advance(1.5, 1 / 30)
        g.menu.show('relics')
      })
      // 합치기 상자는 가방의 빛나는 칸(합칠 수 있는 셋)을 톡해야 설명 카드 끝에 붙는다 (`relicsTab`의 mergeBox).
      // 손가락의 첫 톡은 설명 카드만 띄우고 끼지 않는다 (E235)
      await page.waitForFunction(() => window.__game.menu.open, null, { timeout: 20000 }).catch(() => {})
      const glowing = page.locator('.menu-relics__item.is-mergeable').first()
      if ((await glowing.count()) > 0) await glowing.tap({ timeout: 10000 }).catch(() => {})
      r.merge = await snap('merge', () => document.querySelector('.menu-merge__go') !== null)
      r.merge.go = await page.evaluate(() => {
        const b = document.querySelector('.menu-merge__go')
        if (!b) return null
        const box = b.getBoundingClientRect()
        // 보이는 자리: 화면과, 단추를 잘라 내거나 미는 조상 상자들이 겹치는 곳 (정보 화면의 본문은 세로로 민다)
        let top = 0
        let bottom = innerHeight
        for (let p = b.parentElement; p && p !== document.body; p = p.parentElement) {
          if (getComputedStyle(p).overflowY === 'visible') continue
          const c = p.getBoundingClientRect()
          top = Math.max(top, c.top)
          bottom = Math.min(bottom, c.bottom)
        }
        const scroll = Math.max(0, Math.round(box.bottom - bottom))
        return { y: [Math.round(box.top), Math.round(box.bottom)], visible: [Math.round(top), Math.round(bottom)], inView: box.top >= top - 1 && scroll === 0, scroll }
      })
      // 단추가 본문 아래로 넘어가 있으면 밀어 내린 화면도 남긴다 (밀면 닿는지, 그 화면은 잘리지 않는지)
      if (r.merge.go && !r.merge.go.inView) {
        await page.evaluate(() => document.querySelector('.menu-merge').scrollIntoView({ block: 'end' }))
        r.merge.scrolled = {
          shot: await shot(page, `e30x-merge-scrolled-${tag}`),
          cuts: await page.evaluate(findCuts),
          goInView: await page.evaluate(() => {
            const box = document.querySelector('.menu-merge__go').getBoundingClientRect()
            const body = document.querySelector('.menu-merge__go').closest('.menu__body')?.getBoundingClientRect()
            return box.top >= (body?.top ?? 0) - 1 && box.bottom <= Math.min(innerHeight, body?.bottom ?? innerHeight) + 1
          }),
        }
      }
      r.bag = await page.evaluate(() => window.__game.powers.loadout.bag.length)
      out[tag] = r
      await page.close()
    }
    return out
  },

  /** E21-1 신 단계를 올리면 확실히 강해진 게 느껴진다 (승천, 옛 신화 단계): 단계마다 20초 피해·최대 생명, 올리는 순간의 큰 카드 */
  async 'e21-1'(browser) {
    const page = await fresh(browser)
    const rows = await page.evaluate(() => {
      const g = window.__game
      window.__qa.seat('thor')
      const out = [{ level: 1, damage: window.__qa.hit20(), hp: g.combat.health.max }]
      for (const level of [2, 3]) {
        g.dev.promote()
        out.push({ level, damage: window.__qa.hit20(), hp: g.combat.health.max })
      }
      return out
    })
    await page.close()
    // 2단계로 올리는 순간의 카드 (새 판에서: 앞에서 올리며 줄에 선 카드와 섞이지 않게)
    const page2 = await fresh(browser)
    await page2.evaluate(() => {
      window.__qa.seat('thor')
      window.__game.dev.promote()
    })
    const card = await waitCard(page2, '승천')
    await shot(page2, 'e21-1-promote')
    await page2.close()
    return { rows, card }
  },

  /** E21-3 정보 화면에 잡다한 장치가 보이지 않는다: 엔딩 전 탭 줄과 원천·신 탭 */
  async 'e21-3'(browser) {
    const page = await fresh(browser)
    await page.evaluate(() => {
      const g = window.__game
      g.dev.equip('mjolnir')
      window.__qa.seat('thor')
      g.menu.show('sources')
    })
    await page.waitForTimeout(600)
    await shot(page, 'e21-3-sources')
    await page.evaluate(() => window.__game.menu.show('gods'))
    await page.waitForTimeout(600)
    await shot(page, 'e21-3-myth')
    const tabs = await page.evaluate(() => [...document.querySelectorAll('.menu__tab')].filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.textContent.trim()))
    await page.close()
    return { tabs }
  },

  /** E22-1 언제든 다음에 무엇을 할지 화면만 보고 안다: 장마다 목표 한 줄·작은 지도 표시·세계 지도를 찍는다 */
  async 'e22-1'(browser) {
    const page = await fresh(browser, '?fresh&noscenes')
    const steps = []
    for (let i = 0; i < 30; i++) {
      // 목표 한 줄은 화면을 그릴 때 바뀌므로 몇 프레임 기다린 뒤 읽는다
      const f = await page.evaluate(() => window.__game.frame)
      await page.waitForFunction((n) => window.__game.frame > n + 1, f, { timeout: 60000 })
      const s = await page.evaluate(() => {
        const g = window.__game
        const goal = g.chapters.goal
        return goal ? { chapter: g.chapters.chapter.id, kind: goal.kind, line: document.querySelector('.chapter-goal span')?.textContent ?? '', shown: !document.querySelector('.chapter-goal').hidden, region: g.region.id, spot: g.goalSpot() } : null
      })
      if (!s) break
      steps.push(s)
      // 장의 처음 목표와 보스 목표만 찍는다
      if (steps.length === 1 || steps.at(-2)?.chapter !== s.chapter || s.kind === 'boss') await shot(page, `e22-1-${steps.length}-${s.chapter}-${s.kind}`)
      if (s.chapter === 'north' && s.kind === 'awaken' && steps.at(-2)?.kind !== 'awaken') {
        // 제1장 첫 흔적 찾기에서 세계 지도를 찍는다 (E238: 성소에서 고르지 않고 흔적을 찾아간다)
        // 처음부터 하는 판이라 지도 탭은 성소를 찾아야 열린다 (E236-05): 작은 지도를 누른 것처럼 연다
        await page.evaluate(() => {
          window.__game.tabSystem.open('map', true)
          window.__game.menu.show('map')
        })
        await page.waitForTimeout(500)
        await shot(page, 'e22-1-map')
        await page.evaluate(() => window.__game.menu.toggle(false))
      }
      await page.evaluate(() => {
        const g = window.__game
        g.skipGoal()
        g.advance(2, 1 / 30)
      })
    }
    await page.waitForTimeout(800)
    await shot(page, 'e22-1-ending')
    const end = await page.evaluate(() => ({ ending: window.__game.ending.reached, goalShown: !document.querySelector('.chapter-goal').hidden }))
    await page.close()
    return { steps: steps.map((s) => `${s.chapter}:${s.line}${s.shown ? '' : '(숨김)'}${s.spot ? '' : '(지도 표시 없음)'}`), end }
  },

  /** E22-2 새 땅에 들어서면 다시 조금 버겁고, 떠날 때는 시원하다: power-curve.json에서 땅마다 들어설 때·떠날 때 적 잡는 초 */
  async 'e22-2'() {
    const path = 'test-results/power-curve.json'
    if (!existsSync(path)) return { error: '먼저 node scripts/power-curve.mjs 100 을 돌린다' }
    const { rows } = JSON.parse(readFileSync(path, 'utf8'))
    const lands = []
    for (const r of rows.filter((x) => x.killSeconds !== null)) {
      const last = lands.at(-1)
      if (last?.region === r.region) Object.assign(last, { leave: r.killSeconds, to: r.t, leaveHits: r.hitsToDie })
      else lands.push({ region: r.region, from: r.t, enter: r.killSeconds, enterHits: r.hitsToDie, leave: r.killSeconds, to: r.t, leaveHits: r.hitsToDie })
    }
    return lands.map((l) => `${l.region} ${Math.round(l.from / 60)}~${Math.round(l.to / 60)}분: 적 잡는 초 ${l.enter} → ${l.leave}, 버티는 대 ${l.enterHits} → ${l.leaveHits}`)
  },

  /** E22-3 걸어서 이어진 땅을 탐험하는 느낌이 든다: 통로를 걸어 넘어가는 장면, 결계 너머, 마지막 무대 */
  async 'e22-3'(browser) {
    const page = await fresh(browser, '?fresh&noscenes')
    // 마을에서 미드가르드 쪽 통로를 걷는 중간 (암전 없이 이웃 땅이 보인다)
    const walk = await page.evaluate(() => {
      const g = window.__game
      const exit = g.region.exits.find((e) => e.to === 'midgard')
      g.dev.teleport(exit.x, exit.z + 2)
      g.orders.press({ x: exit.x, z: exit.z - 40 }, null)
      g.advance(2.5, 1 / 30)
      return { region: g.region.id }
    })
    await shot(page, 'e22-3-passage')
    // 결계 너머 (E239: 마을 밖 길은 미드가르드 하나라, 미드가르드에서 아직 막힌 길 아무거나)
    const barrier = await page.evaluate(() => {
      const g = window.__game
      g.world.travelTo('midgard')
      g.advance(1.5, 1 / 30)
      const spots = g.barrierSpots
      const b = spots.find((x) => x.to === 'jotunheim') ?? spots[0]
      // 결계에서 땅 가운데 쪽으로 몇 걸음 물러선 자리
      if (b) g.dev.teleport(b.x * 0.88, b.z * 0.88)
      return { region: g.region.id, to: b?.to ?? null, barriers: spots.map((x) => x.to) }
    })
    await shot(page, 'e22-3-barrier')
    // 할 일을 마쳐 결계가 풀리는 순간 (E306: 귀환 둘을 마치면 요툰헤임 쪽)
    const opened = await page.evaluate(() => {
      const g = window.__game
      for (let i = 0; i < 6 && g.barrierSpots.some((x) => x.to === 'jotunheim'); i++) g.skipGoal()
      g.advance(1.5, 1 / 30)
      const exit = g.region.exits.find((e) => e.to === 'jotunheim')
      g.dev.teleport(exit.x + 3, exit.z + 5)
      return { region: g.region.id, chapter: g.chapters.chapter?.id, barriers: g.barrierSpots.map((b) => b.to) }
    })
    await page.waitForTimeout(400)
    await shot(page, 'e22-3-jotunheim-way')
    // 마지막 무대
    await page.evaluate(() => {
      const g = window.__game
      g.reachEnding()
      g.enterRegion(g.regions.sky)
      g.dev.teleport(0, 6)
    })
    await shot(page, 'e22-3-sky')
    await page.close()
    return { walk, barrier, opened }
  },

  /**
   * E241 탈것 타고 내리기: 고개지기 곁 산양 → 만나면 카드 → 멀리 누르면 올라탐(달리는 모습) → 적을 누르면 내려서 침.
   * 휴대폰은 같은 조이스틱으로 멀리 끌면 올라타고(원이 바뀜) 떼면 내린다. 버튼이 늘지 않았는지 화면으로 본다
   */
  async 'e241-mount'(browser) {
    const page = await fresh(browser, '?fresh&relics=mjolnir&region=pass&noscenes')
    const keeper = await page.evaluate(() => {
      const g = window.__game
      g.encounter.clearAll()
      const k = g.mountSystem.keeper
      g.dev.teleport(k.x - 5, k.z + 1)
      return { x: k.x, z: k.z }
    })
    const before = await shot(page, 'e241-keeper')
    // 고개지기에게 걸어가 만난다 (따로 누르지 않음)
    await page.evaluate((k) => {
      const g = window.__game
      g.orders.press({ x: k.x - 1, z: k.z }, null)
      for (let i = 0; i < 120 && !g.mount.owned; i++) g.advance(1 / 30, 1 / 30)
    }, keeper)
    const card = await shot(page, 'e241-mount-card')
    const rode = await page.evaluate(() => {
      const g = window.__game
      g.hideCards()
      g.encounter.clearAll()
      g.advance(3.2, 1 / 30)
      const p = g.hero.object.position
      const from = { x: p.x, z: p.z }
      const rode = g.dev.ride(20)
      g.advance(0.5, 1 / 30)
      const q = g.hero.object.position
      return { rode, riding: g.hero.riding, goat: g.mountSystem.showing, ran: Math.round(Math.hypot(q.x - from.x, q.z - from.z) * 10) / 10 }
    })
    const riding = await shot(page, 'e241-ride')
    // 탄 채 앞의 졸개를 누르면 내려서 치러 간다
    const off = await page.evaluate(() => {
      const g = window.__game
      const p = g.hero.object.position
      const a = g.hero.facing
      const foe = g.encounter.spawnGrunt(p.x + Math.sin(a) * 4, p.z + Math.cos(a) * 4)
      foe.update = () => {}
      g.orders.press(null, foe)
      const at = { riding: g.hero.riding, attack: g.orders.attackTarget === foe }
      g.advance(0.6, 1 / 30)
      return { ...at, goat: g.mountSystem.showing, swinging: g.combat.combo.swinging || g.combat.target === foe }
    })
    const dismount = await shot(page, 'e241-dismount')
    await page.close()

    // 휴대폰: 짧게 끌면 걷고, 멀리 끌면 올라타며 원이 바뀌고, 떼면 내린다
    const phone = await browser.newPage({ viewport: PHONE, hasTouch: true, isMobile: true })
    phone.on('pageerror', (e) => errors.push(e.message))
    await phone.goto(`${URL}?relics=mjolnir&region=midgard&noscenes`, { timeout: 90000 })
    await phone.waitForFunction(() => (window.__game?.frame ?? 0) > 3 && window.__game.playing, null, { timeout: 90000 })
    const frames = async (n) => {
      const f = await phone.evaluate(() => window.__game.frame)
      await phone.waitForFunction((t) => window.__game.frame >= t, f + n, { timeout: 60000 })
    }
    const finger = (type, x, y) =>
      phone.evaluate(([type, x, y]) => {
        const target = type === 'pointerdown' ? window.__game.pixel.renderer.domElement : window
        target.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true }))
      }, [type, x, y])
    const state = () => phone.evaluate(() => ({ riding: window.__game.hero.riding, moving: window.__game.hero.isMoving, far: document.querySelector('.stick').classList.contains('is-far'), stick: !document.querySelector('.stick').hidden }))
    await phone.evaluate(() => {
      window.__game.encounter.clearAll()
      window.__game.dev.mount()
    })
    await finger('pointerdown', 195, 650)
    for (const y of [640, 625, 610]) {
      await finger('pointermove', 195, y)
      await frames(1)
    }
    await frames(4)
    const short = await state()
    const walkPhone = await shot(phone, 'e241-walk-phone')
    for (const y of [590, 565, 540]) {
      await finger('pointermove', 195, y)
      await frames(1)
    }
    await frames(6)
    const far = await state()
    const ridePhone = await shot(phone, 'e241-ride-phone')
    await finger('pointerup', 195, 540)
    await frames(3)
    const released = await state()
    const releasePhone = await shot(phone, 'e241-release-phone')
    await phone.close()
    return { shots: [before, card, riding, dismount, walkPhone, ridePhone, releasePhone], rode, off, phone: { short, far, released } }
  },

  /** E241 티폰 실루엣: 올림포스 깊은 곳 수호자 자리에 세우고 주인공과 함께 찍는다 (쉬는 모습, 외침 예고) */
  async 'e241-typhon'(browser) {
    const page = await fresh(browser, '?fresh&relics=mjolnir&region=olympus&noscenes')
    await page.evaluate(() => {
      const g = window.__game
      g.encounter.clearAll()
      g.combat.godMode = true
      g.dev.teleport(6, -15)
      const typhon = g.encounter.spawnById('typhon', { x: 6, z: -24 }, false)
      typhon.update = (dt) => typhon.rest(dt)
      window.__typhon = typhon
    })
    const idle = await shot(page, 'e241-typhon')
    const attack = await page.evaluate(() => {
      const g = window.__game
      const typhon = window.__typhon
      delete typhon.update
      typhon.alert()
      for (let i = 0; i < 300 && typhon.state !== 'windup'; i++) g.advance(1 / 30, 1 / 30)
      return { state: typhon.state, attack: typhon.currentAttack?.name ?? null }
    })
    const windup = await shot(page, 'e241-typhon-windup')
    await page.close()
    return { shots: [idle, windup], attack }
  },

  /**
   * E23-1 큰 걸음마다 「강해졌다」가 크게 보인다: 장 넘어가기 장면, 첫 신의 조각 셋(흔적 장면 → 큰 카드, 유물 큰 카드, 깨어남 장면 → 「신이 깨어남」 큰 카드),
   * 승천·유물 벼리기(큰 카드), 장 보스 처치(느린 동작 → 장면) → 장 넘어가기 장면, 엔딩(느린 동작 → 장면 → 큰 카드).
   * 걸음마다 그 장면·카드가 실제로 뜰 때까지 기다렸다가 찍고, 다 지나간 뒤에 다음으로 간다 (시간만 재서 찍으면 앞 순간이 밀려 한 칸씩 어긋난다).
   * 결과의 moments에 찍을 때 떠 있던 장면·카드 글을 남긴다
   */
  async 'e23-1'(browser) {
    const page = await fresh(browser, '?fresh&noscenes')
    const moments = []
    const record = async (name) => {
      moments.push({ name, card: await cardNow(page), ...(await page.evaluate(() => ({ shown: window.__game.moments.shown.slice(-3).map((m) => `${m.id}:${m.tier}`), scene: window.__game.scenes.active ? window.__game.scenes.current : null, speed: window.__game.gameSpeed, music: window.__game.audio.theme }))) })
      return shot(page, name)
    }
    const state = () => page.evaluate(() => ({ active: window.__game.scenes.active, current: window.__game.scenes.current, holding: window.__game.moments.holding || window.__game.hud.gainsBusy || window.__game.hud.gainsShowing !== null }))
    /** 장면이 열릴 때까지 (except를 주면 그 장면이 아닌 것). 열린 장면의 id */
    const waitScene = async (except = null) => {
      await page.waitForFunction((x) => window.__game.scenes.active && window.__game.scenes.current !== x, except, { timeout: 60000 }).catch(() => {})
      return (await state()).current
    }
    /** 느린 동작이 걸릴 때까지 (쓰러뜨린 다음 프레임에 걸려 실제 1.2초 동안 흐른다) */
    const slowed = () => page.waitForFunction(() => window.__game.gameSpeed < 1, null, { timeout: 5000 }).catch(() => {})
    /** 지금 장면 하나만 넘긴다 (한 번 누르면 완성, 다시 누르면 다음 줄) */
    const skipOne = async () => {
      const id = (await state()).current
      for (let i = 0; i < 40; i++) {
        const s = await state()
        if (!s.active || s.current !== id) break
        await page.mouse.click(640, 600)
        await page.waitForTimeout(200)
      }
    }
    /** 떠 있는 장면을 모두 넘기고, 카드·장면 뒤 할 일까지 다 지나갈 때까지 (길어도 2분) */
    const settle = async () => {
      const until = Date.now() + 120000
      while (Date.now() < until) {
        const s = await state()
        if (!s.active && !s.holding) break
        if (s.active) await page.mouse.click(640, 600)
        await page.waitForTimeout(200)
      }
    }
    // 미드가르드에 들어서면 제1장: 장 넘어가기 장면 → 장 제목 띠
    await page.evaluate(() => {
      const g = window.__game
      g.storyScenes = true
      g.world.travelTo('midgard')
    })
    await waitScene()
    await record('e23-1-chapter-north')
    await settle()
    // 첫 신 깨우기 (E238): 조각 하나씩. 흔적(조각 1)은 느린 동작 → 장면 → 큰 카드 「신의 조각 1/3」
    const awaken = () => page.evaluate(() => window.__game.dev.awaken('thor'))
    await awaken()
    await waitScene()
    await record('e23-1-trace-scene')
    await skipOne()
    await waitCard(page, '신의 조각 1')
    await record('e23-1-trace-card')
    await settle()
    // 사냥(조각 2): 유물이 유물표에 켜지며 큰 카드 「신의 조각 2/3」
    await awaken()
    await waitCard(page, '신의 조각 2')
    await record('e23-1-relic-card')
    await settle()
    // 수호자(조각 3): 토르가 깨어나며 장면 → 큰 카드 「신이 깨어남」
    await awaken()
    await waitScene()
    await record('e23-1-awaken-scene')
    await skipOne()
    await waitCard(page, '신이 깨어남')
    await record('e23-1-awaken-card')
    await settle()
    // 승천 (큰 카드): 번쩍·하늘 기둥·북소리
    await page.evaluate(() => window.__game.dev.promote())
    await waitCard(page, '승천')
    await record('e23-1-level')
    await settle()
    // 유물 벼리기 (큰 카드)
    await page.evaluate(() => {
      const g = window.__game
      g.enterRegion(g.regions.village)
      g.advance(0.5, 1 / 30)
      g.dev.fillForge('thor')
      g.dev.forge('thor')
    })
    await waitCard(page, '대장간')
    await record('e23-1-forge')
    await settle()
    // 장 보스 처치: 느린 동작 → 쓰러지며 한마디 → 장 넘어가기 장면 → 장 제목 띠
    await page.evaluate(() => {
      const g = window.__game
      g.enterRegion(g.regions.utgard)
      g.advance(1, 1 / 30)
      const b = g.encounter.boss
      g.dev.teleport(b.x, b.z + 4)
      b.takeHit(b.health.hp + 1, 0, 1, 0)
    })
    await slowed()
    await record('e23-1-boss-slow')
    const bossScene = await waitScene()
    await record('e23-1-boss-scene')
    await skipOne()
    await waitScene(bossScene)
    await record('e23-1-chapter-scene')
    await settle()
    await record('e23-1-chapter-after')
    // 엔딩: 마지막 보스 → 느린 동작 → 엔딩 장면(엔딩 곡) → 큰 카드
    const skipped = await page.evaluate(() => {
      const g = window.__game
      // 할 일이 늘어(E306: 귀환 넷·영웅 합치기·맹세) 넉넉히 건너뛴다. 하나가 건너뛰어지지 않으면 거기서 멈춘다
      for (let i = 0; i < 40 && g.chapters.goal && !(g.chapters.goal.kind === 'enter' && g.chapters.goal.region === 'sky'); i++) {
        const before = g.chapters.goal
        g.skipGoal()
        g.advance(0.2, 1 / 30)
        if (g.chapters.goal === before) break
        // 건너뛴 귀환·깨어남이 띄운 고르는 카드(맹세 출발·두 갈래)는 봇처럼 닫는다 (떠 있으면 세계가 멈춘다)
        if (g.oathCardOpen) {
          g.hideCards()
          g.oathSystem.swear(null)
        }
        if (g.swapOpen) g.answerSwap(false)
      }
      return g.chapters.goal
    })
    if (!(skipped?.kind === 'enter' && skipped.region === 'sky')) throw new Error(`갈라진 하늘 앞까지 건너뛰지 못함: ${JSON.stringify(skipped)}`)
    // 건너뛰며 쌓인 장면(키마이라)과 카드가 다 지나간 뒤에 마지막 무대로
    await settle()
    await page.evaluate(() => {
      const g = window.__game
      g.enterRegion(g.regions.sky)
      g.chapters.enter('sky')
      g.advance(1, 1 / 30)
    })
    await settle()
    await page.evaluate(() => {
      const g = window.__game
      // 땅을 건너뛰어 들어오면 보스가 아직 서지 않았을 수 있다
      if (!g.encounter.boss) g.encounter.resetAll()
      const b = g.encounter.boss
      g.dev.teleport(b.x, b.z + 5)
      b.takeHit(b.health.hp + 1, 0, 1, 0)
    })
    await slowed()
    await record('e23-1-ending-slow')
    // 엔딩 장면이 열릴 때까지 (그 앞에 다른 장면이 끼면 넘긴다)
    for (const until = Date.now() + 90000; Date.now() < until; ) {
      const s = await state()
      if (s.active && s.current === 'ending') break
      if (s.active) await page.mouse.click(640, 600)
      await page.waitForTimeout(200)
    }
    await page.waitForTimeout(1500)
    await record('e23-1-ending-scene')
    await skipOne()
    await waitCard(page, '첫 엔딩')
    await record('e23-1-ending-card')
    await settle()
    const end = await page.evaluate(() => ({ ending: window.__game.ending.reached }))
    await page.close()
    return { moments, end }
  },

  /** E23-2 작은 일은 싸움을 가리지 않는다: 둘러싸여 싸우는 중에 작은 알림·카드가 뜬 화면, 카드·알림이 화면 가운데(싸움)를 덮는지 */
  async 'e23-2'(browser) {
    const page = await fresh(browser, '?fresh&noscenes')
    // 신화를 고르고 미드가르드에 들어선 큰 순간(큰 카드·장 제목 띠)이 지나간 뒤에 싸운다
    await page.evaluate(() => {
      const g = window.__game
      window.__qa.seat('thor')
      g.world.travelTo('midgard')
    })
    // 이 환경은 초당 몇 프레임이라 순간의 기다림(실제 초)이 길다: 기다리는 순간이 없을 때까지
    await calm(page)
    await page.evaluate(() => {
      const g = window.__game
      g.combat.godMode = true
      const p = g.hero.object.position
      for (let i = 0; i < 6; i++) g.encounter.spawnById('grunt', { x: p.x + Math.sin(i) * 3, z: p.z + Math.cos(i) * 3 }, true)
      g.advance(1, 1 / 30)
      g.bus.emit('moment', { id: 'materialPicked', text: '서리 결정 · 재료' })
      g.bus.emit('moment', { id: 'gearWornRare', card: { kind: '장비', title: '희귀 서리 늑대 가죽 장화', color: '#5aa8ff', lines: ['이동 속도 +6%', '최대 생명 +12'] } })
    })
    await page.waitForFunction(() => window.__game.hud.gainsShowing === 'card', null, { timeout: 30000 })
    const path = await shot(page, 'e23-2-fight')
    const layout = await page.evaluate(() => {
      const r = (sel) => {
        const b = document.querySelector(sel)?.getBoundingClientRect()
        return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null
      }
      const g = window.__game
      const p = g.hero.object.position
      const hero = g.screenPoint(p.x, p.y + 1, p.z)
      const card = r('.hud__gains')
      // 싸움 자리: 주인공을 가운데 둔 화면 가운데 절반
      const fight = { x: innerWidth / 4, y: innerHeight / 4, w: innerWidth / 2, h: innerHeight / 2 }
      const overlap = card && !(card.x > fight.x + fight.w || card.x + card.w < fight.x || card.y > fight.y + fight.h || card.y + card.h < fight.y)
      return { hero: { x: Math.round(hero.x), y: Math.round(hero.y) }, card, toast: r('.hud__toast'), cardSize: g.hud.gainsShowing, cardCoversFight: overlap }
    })
    await page.close()
    return { shot: path, ...layout }
  },
}

try {
  // 미리보기 서버가 설정을 읽는 데 10초 넘게 걸릴 때가 있다 (60초까지 기다림)
  for (let i = 0; i < 300; i++) {
    try {
      if ((await fetch(URL)).ok) break
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({
    executablePath: existsSync(BROWSER) ? BROWSER : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const path = 'test-results/checklist.json'
  const old = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
  for (const [id, run] of Object.entries(sections)) {
    if (want.length > 0 && !want.some((w) => id.startsWith(w))) continue
    const t0 = Date.now()
    try {
      results[id] = await run(browser)
    } catch (e) {
      results[id] = { error: String(e?.message ?? e).split('\n')[0] }
      // 실패한 항목이 열어 둔 페이지가 다음 항목을 느리게 하지 않게 닫는다
      for (const ctx of browser.contexts()) await ctx.close()
    }
    console.log(`${id} (${Math.round((Date.now() - t0) / 1000)}초)`, JSON.stringify(results[id]).slice(0, 600))
  }
  await browser.close()
  writeFileSync(path, JSON.stringify({ ...old, ...results, errors }, null, 2))
  if (errors.length) console.log('페이지 오류:', errors.slice(0, 5).join(' / '))
} finally {
  stop()
}
