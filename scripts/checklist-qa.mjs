// 직접 플레이 체크리스트를 Claude가 사람 눈으로 확인하기 위한 장면·수치 모음 (2026-10-27 결정: 체크리스트는 사람 대신 Claude가 본다).
// 항목마다 그 상태를 만들어 스크린숏(test-results/checklist/*.png)과 수치(test-results/checklist.json)를 남긴다. 판정은 사람이 보듯 스크린숏을 보고 한다.
// 사용법: npm run build && node scripts/checklist-qa.mjs [항목 id 앞부분 ...]   예: node scripts/checklist-qa.mjs e12 e13-1
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const want = process.argv.slice(2)
const PORT = 4197
const OUT = 'test-results/checklist'
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL = `http://localhost:${PORT}/`
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true })
const stop = () => {
  try {
    process.kill(-server.pid)
  } catch {}
}

/** 새로 시작한 게임 (저장 지움, 무작위 고정). 반환: page */
async function fresh(browser, query = '?fresh&relics=&region=village&noscenes', seed = 7) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
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
  // 이어진 세계(E19)는 이웃 땅까지 지어 처음 여는 데 오래 걸린다
  await page.goto(URL + query, { timeout: 90000 })
  await page.waitForFunction(() => (window.__game?.frame ?? 0) > 3, null, { timeout: 90000 })
  return page
}

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
  /** E12-1 신화를 하나 더 열 때마다 강해진 게 느껴진다: 연 신화 수마다 같은 시간에 준 피해, 여는 순간의 화면 */
  async 'e12-1'(browser) {
    const page = await fresh(browser)
    const rows = await page.evaluate(() => {
      const g = window.__game
      const order = ['thor', 'loki', 'odin', 'freyr', 'artemis', 'zeus']
      const out = []
      g.dev.choose('thor')
      for (let n = 1; n <= order.length; n++) {
        if (n > 1) g.progress.open(order[n - 1])
        g.encounter.clearAll()
        g.combat.health.reset()
        g.combat.godMode = true
        g.orders.clear()
        g.dev.teleport(0, 4)
        g.encounter.threat = { hp: 60, damage: 1 }
        const p = g.hero.object.position
        const t = g.encounter.spawnById('grunt', { x: p.x + 1.8, z: p.z }, true)
        t.update = () => {}
        const start = t.health.hp
        g.orders.press(null, t)
        g.advance(20, 1 / 30)
        out.push({ open: n, damage: Math.round(start - t.health.hp), alive: t.alive })
      }
      g.encounter.threat = { hp: 1, damage: 1 }
      return out
    })
    const base = rows[0].damage
    for (const r of rows) r.vsOne = `${Math.round((r.damage / base - 1) * 100)}%`
    await page.close()
    // 새로 여는 순간 (E238): 성소에서 고르지 않고, 신의 조각 셋(흔적 → 사냥 → 수호자)을 모으면 그 신이 깨어난다
    // 여기서 실패해도 앞에서 잰 피해는 남긴다
    const page2 = await fresh(browser, '?fresh&relics=&region=midgard')
    try {
      await page2.evaluate(() => {
        const g = window.__game
        g.storyScenes = true
        for (let i = 0; i < 5 && !g.progress.isOpen('thor'); i++) g.dev.awaken('thor')
      })
      await page2.waitForFunction(() => window.__game.progress.isOpen('thor'), null, { timeout: 30000 })
      await page2.waitForTimeout(500)
      const opened = await page2.evaluate(() => ({ opened: window.__game.progress.opened, scene: window.__game.scenes.current }))
      await shot(page2, 'e12-1-open')
      return { rows, opened }
    } catch (e) {
      return { rows, openError: String(e?.message ?? e) }
    } finally {
      await page2.close()
    }
  },

  /** E12-2 고른 신화를 바꾸면 싸우는 모습이 바로 달라진다: 바꾼 뒤 첫 휘두르기까지 시간과 휘두르는 모습 */
  async 'e12-2'(browser) {
    const page = await fresh(browser)
    const out = []
    for (const god of ['thor', 'artemis', 'amaterasu']) {
      const r = await page.evaluate((god) => {
        const g = window.__game
        g.encounter.clearAll()
        g.combat.godMode = true
        g.orders.clear()
        g.dev.teleport(0, 4)
        g.encounter.threat = { hp: 60, damage: 1 }
        const p = g.hero.object.position
        const t = g.encounter.spawnById('grunt', { x: p.x + 1.8, z: p.z }, true)
        t.update = () => {}
        g.orders.press(null, t)
        g.advance(2, 1 / 30)
        // 싸우는 중에 고른 신화를 바꾼다
        const t0 = g.time
        g.dev.choose(god)
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

  /** E12-3 신화 탭만 보고 다음에 무엇을 해야 하는지 안다: 막 시작했을 때, 신화 하나 연 뒤, 귀환해 승천할 수 있을 때 */
  async 'e12-3'(browser) {
    const page = await fresh(browser)
    const tab = async (name) => {
      await page.evaluate(() => window.__game.menu.show('classes'))
      await page.waitForTimeout(300)
      const text = await page.evaluate(() => document.querySelector('.menu')?.innerText ?? '')
      await shot(page, name)
      await page.evaluate(() => window.__game.menu.toggle(false))
      return text.slice(0, 1200)
    }
    const empty = await tab('e12-3-none')
    await page.evaluate(() => window.__game.dev.choose('thor'))
    const one = await tab('e12-3-thor')
    // 원정이 무르익어 성소 화로에서 승천할 수 있을 때 (E305-03: 신화 경험치 대신 귀환)
    await page.evaluate(() => {
      const g = window.__game
      g.expedition.elapsed = 600
      g.dev.insight(8)
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
      g.dev.choose('thor')
      g.combat.godMode = true
      g.dev.teleport(0, 4)
      g.encounter.threat = { hp: 20, damage: 1 }
      const p = g.hero.object.position
      const ring = []
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        ring.push(g.encounter.spawnById('grunt', { x: p.x + Math.sin(a) * 1.6, z: p.z + Math.cos(a) * 1.6 }, true))
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
      g.dev.choose('thor')
      g.dev.teleport(2, -3)
      g.dev.wear('hands', 'common')
      const p = g.hero.object.position
      g.dev.dropGear('hands', 'hero', p.x + 4, p.z + 1)
      return g.screenPoint(p.x + 4, p.y + 0.4, p.z + 1)
    })
    await page.mouse.move(at.x, at.y)
    await page.waitForTimeout(500)
    const card = await page.evaluate(() => [...document.querySelectorAll('.relic-tooltip, .gear-card, .hover-card')].filter((e) => !e.hidden && e.offsetParent).map((e) => e.innerText).join('\n---\n'))
    await shot(page, 'e13-1-card')
    await page.close()
    return { card }
  },

  /** E13-2 유물을 처음 만들 때와 단계를 올릴 때 신난다: 대장간에서 벼린 직후 화면 둘 */
  async 'e13-2'(browser) {
    const page = await fresh(browser)
    const out = []
    for (const step of [1, 2]) {
      await page.evaluate(() => {
        const g = window.__game
        if (!g.powers.manifested) g.dev.choose('thor')
        g.dev.teleport(2, -3)
        g.dev.fillForge('thor')
      })
      const ok = await page.evaluate(() => window.__game.dev.forge('thor'))
      await page.waitForTimeout(700)
      await shot(page, `e13-2-forge${step}`)
      out.push({ step, ok, stage: await page.evaluate(() => window.__game.powers.loadout.stage('mjolnir')) })
      await page.waitForTimeout(5000)
    }
    await page.close()
    return out
  },

  /** E13-3 그 칸에 유물을 낄지 수치 좋은 장비를 낄지 고민된다: 같은 칸에 묠니르(1·2단계) / 영웅 장비를 낀 채 20초 피해 */
  async 'e13-3'(browser) {
    const page = await fresh(browser)
    const rows = await page.evaluate(() => {
      const g = window.__game
      const measure = () => {
        g.encounter.clearAll()
        g.combat.health.reset()
        g.combat.godMode = true
        g.orders.clear()
        g.dev.teleport(0, 4)
        g.encounter.threat = { hp: 60, damage: 1 }
        const p = g.hero.object.position
        const t = g.encounter.spawnById('grunt', { x: p.x + 1.8, z: p.z }, true)
        t.update = () => {}
        const start = t.health.hp
        g.orders.press(null, t)
        g.advance(20, 1 / 30)
        g.encounter.threat = { hp: 1, damage: 1 }
        return Math.round(start - t.health.hp)
      }
      g.dev.choose('thor')
      const part = g.powers.loadout.partOf('mjolnir')
      const out = []
      g.dev.unequipAll()
      out.push({ what: '빈 칸', damage: measure(), hp: g.combat.health.max })
      for (const grade of ['common', 'rare', 'hero']) {
        g.dev.unequipAll()
        g.dev.wear(part, grade)
        out.push({ what: `${grade} 장비`, damage: measure(), hp: g.combat.health.max })
      }
      g.dev.unequipAll()
      g.dev.equip('mjolnir')
      out.push({ what: '묠니르 1단계', damage: measure(), hp: g.combat.health.max })
      return { part, out }
    })
    await page.close()
    return rows
  },

  /** E14-2 깊이를 올리면 확실히 어려워지고, 보상이 좋아진 게 보인다 (E305-03): 귀환 카드의 「그대로 / +1」, 처음 가는 깊이의 큰 카드, 깊이별 적 배율 */
  async 'e14-2'(browser) {
    const page = await fresh(browser, '?fresh&relics=&region=midgard&noscenes')
    const scale = await page.evaluate(() => {
      const g = window.__game
      g.dev.choose('thor')
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
    await page.locator('.return-card__depth .ui-pill', { hasText: '+1' }).click()
    await shot(page, 'e14-2-return-card')
    await page.locator('.return-card .pick-card__card').first().click()
    await page.waitForTimeout(700)
    await shot(page, 'e14-2-advance')
    const after = await page.evaluate(() => ({ level: window.__game.depth.level, reached: window.__game.depth.reached }))
    await page.close()
    return { scale, after }
  },

  /** E14-3 반복하던 손일(줍기·분해)이 자동이 될 때 반갑다: 자동 줍기가 열리는 순간 */
  async 'e14-3'(browser) {
    const page = await fresh(browser)
    const r = await page.evaluate(() => {
      const g = window.__game
      g.dev.teleport(2, -3)
      // 자동 줍기는 처음부터, 나머지 편의는 엔딩 뒤 (E21-06): 자동 분해가 열리는 순간
      g.reachEnding()
      const before = [...g.conveniences.open]
      g.depthSystem.count('salvaged', 400)
      return { before, after: [...g.conveniences.open] }
    })
    await page.waitForTimeout(600)
    await shot(page, 'e14-3-open')
    await page.close()
    return r
  },

  /** E15-3 지도만 보고 어디로 가야 할지 안다: 미드가르드에서 연 세계 지도 */
  async 'e15-3'(browser) {
    const page = await fresh(browser, '?fresh&relics=&region=midgard&noscenes')
    await page.evaluate(() => window.__game.menu.show('map'))
    await page.waitForTimeout(400)
    await shot(page, 'e15-3-map')
    await page.close()
    return {}
  },

  /** E305 맹세: 귀환 2에 뜨는 출발 카드와 맹세 탭 (제약·보상이 이어지는지) */
  async 'e305-oath'(browser) {
    const page = await fresh(browser, '?fresh&relics=&region=midgard&noscenes')
    await page.evaluate(() => {
      const g = window.__game
      g.dev.choose('thor')
      Object.assign(g.expedition, { count: 2, elapsed: 300 })
      g.training.xp = 5000
      g.oaths.keep('glass', 400)
      g.expeditionSystem.returnNow('flame:flame')
    })
    await page.waitForTimeout(400)
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
      g.dev.choose('thor')
      g.dev.teleport(2, -3)
      g.reachEnding()
      g.dev.depth(10)
      g.depthSystem.breakLimit()
    })
    await page.waitForTimeout(500)
    await shot(page, 'e17-1-break')
    await page.close()
    return {}
  },

  /** E21-1 신화 단계를 올리면 확실히 강해진 게 느껴진다: 단계마다 20초 피해·최대 생명, 올리는 순간의 카드 */
  async 'e21-1'(browser) {
    const page = await fresh(browser)
    const rows = await page.evaluate(() => {
      const g = window.__game
      const measure = () => {
        g.encounter.clearAll()
        g.combat.health.reset()
        g.combat.godMode = true
        g.orders.clear()
        g.dev.teleport(0, 4)
        g.encounter.threat = { hp: 60, damage: 1 }
        const p = g.hero.object.position
        const t = g.encounter.spawnById('grunt', { x: p.x + 1.8, z: p.z }, true)
        t.update = () => {}
        const start = t.health.hp
        g.orders.press(null, t)
        g.advance(20, 1 / 30)
        g.encounter.threat = { hp: 1, damage: 1 }
        return Math.round(start - t.health.hp)
      }
      g.dev.choose('thor')
      const out = [{ level: 1, damage: measure(), hp: g.combat.health.max }]
      for (const level of [2, 3]) {
        g.dev.promote()
        out.push({ level, damage: measure(), hp: g.combat.health.max })
      }
      return out
    })
    // 2단계로 올리는 순간의 카드
    await page.evaluate(() => {
      const g = window.__game
      g.encounter.clearAll()
      g.progress.records.clear()
      g.dev.choose('thor')
      g.advance(3, 1 / 30)
      g.dev.promote()
    })
    await page.waitForTimeout(900)
    await shot(page, 'e21-1-promote')
    await page.close()
    return rows
  },

  /** E21-2 같은 칸에서 유물과 영웅 장비 사이에 고민이 된다: 무기 칸에 영웅 장비 / 묠니르를 끼고 토르·로키로 20초 피해 */
  async 'e21-2'(browser) {
    const page = await fresh(browser)
    const rows = await page.evaluate(() => {
      const g = window.__game
      const measure = () => {
        g.encounter.clearAll()
        g.combat.health.reset()
        g.combat.godMode = true
        g.orders.clear()
        g.dev.teleport(0, 4)
        g.encounter.threat = { hp: 60, damage: 1 }
        const p = g.hero.object.position
        const t = g.encounter.spawnById('grunt', { x: p.x + 1.8, z: p.z }, true)
        t.update = () => {}
        const start = t.health.hp
        g.orders.press(null, t)
        g.advance(20, 1 / 30)
        g.encounter.threat = { hp: 1, damage: 1 }
        return Math.round(start - t.health.hp)
      }
      const out = []
      for (const god of ['thor', 'loki']) {
        g.dev.choose(god)
        g.dev.unequipAll()
        out.push({ god, what: '빈 칸', damage: measure() })
        g.dev.wear('weapon', 'hero')
        out.push({ god, what: '영웅 무기 (1단계)', damage: measure() })
        g.dev.unequipAll()
        g.dev.equip('mjolnir')
        out.push({ god, what: '묠니르 1단계', damage: measure() })
      }
      return out
    })
    await page.evaluate(() => {
      const g = window.__game
      g.dev.choose('thor')
      g.menu.show('relics')
    })
    await page.waitForTimeout(600)
    await shot(page, 'e21-2-relic-card')
    await page.close()
    return rows
  },

  /** E21-3 정보 화면에 잡다한 장치가 보이지 않는다: 엔딩 전 탭 줄과 원천·신화 탭 */
  async 'e21-3'(browser) {
    const page = await fresh(browser)
    await page.evaluate(() => {
      const g = window.__game
      g.dev.equip('mjolnir')
      g.dev.choose('thor')
      g.menu.show('sources')
    })
    await page.waitForTimeout(600)
    await shot(page, 'e21-3-sources')
    await page.evaluate(() => window.__game.menu.show('classes'))
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
    for (let i = 0; i < 20; i++) {
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
    // 할 일을 마쳐 결계가 풀리는 순간 (E236: 미드가르드 흔적을 찾으면 요툰헤임 쪽)
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
   * E23-1 큰 걸음마다 「강해졌다」가 크게 보인다: 첫 신 깨우기(장면) → 주신 큰 카드, 신화 단계·유물 벼리기(큰 카드),
   * 장 보스 처치(느린 동작 → 장면) → 장 넘어가기 장면 → 신화 개방 카드, 엔딩 장면 → 큰 카드
   */
  async 'e23-1'(browser) {
    const page = await fresh(browser, '?fresh&noscenes')
    const moments = []
    const record = async (name) => {
      moments.push({ name, ...(await page.evaluate(() => ({ shown: window.__game.moments.shown.slice(-3).map((m) => `${m.id}:${m.tier}`), card: window.__game.hud.gainsShowing, scene: window.__game.scenes.current, speed: window.__game.gameSpeed, music: window.__game.audio.theme }))) })
      return shot(page, name)
    }
    const state = () => page.evaluate(() => ({ active: window.__game.scenes.active, current: window.__game.scenes.current, busy: window.__game.moments.busy }))
    /** 떠 있는 장면을 모두 넘기고 기다리는 순간이 없을 때까지 (한 번 누르면 완성, 다시 누르면 다음 줄) */
    const settle = async () => {
      for (let i = 0; i < 120; i++) {
        const s = await state()
        if (!s.active && !s.busy) break
        if (s.active) await page.mouse.click(640, 600)
        await page.waitForTimeout(200)
      }
      await page.waitForTimeout(700)
    }
    /** 다음 장면이 열릴 때까지 기다린다 */
    const nextScene = async (except = null) => {
      for (let i = 0; i < 40; i++) {
        const s = await state()
        if (s.active && s.current !== except) return s.current
        await page.waitForTimeout(250)
      }
      return null
    }
    /** 지금 장면 하나만 넘긴다 */
    const skipOne = async () => {
      const id = (await state()).current
      for (let i = 0; i < 30 && (await state()).current === id; i++) {
        await page.mouse.click(640, 600)
        await page.waitForTimeout(200)
      }
    }
    // 미드가르드에 들어서면 제1장: 장 넘어가기 장면 → 장 제목 띠
    await page.evaluate(() => {
      const g = window.__game
      g.storyScenes = true
      g.world.travelTo('midgard')
    })
    await nextScene()
    await record('e23-1-chapter-north')
    await settle()
    // 첫 신 깨우기 (E238): 흔적 → 사냥 → 수호자, 셋째 조각에 토르가 깨어나며 장면 → 주신 큰 카드
    await page.evaluate(() => {
      const g = window.__game
      for (let i = 0; i < 5 && !g.progress.isOpen('thor'); i++) g.dev.awaken('thor')
    })
    await page.waitForTimeout(500)
    await record('e23-1-awaken-scene')
    await settle()
    await record('e23-1-awaken-card')
    // 신화 단계 (큰 카드): 번쩍·하늘 기둥·북소리
    await page.waitForTimeout(4500)
    await page.evaluate(() => window.__game.dev.promote())
    await page.waitForTimeout(500)
    await record('e23-1-level')
    await settle()
    // 유물 벼리기 (큰 카드)
    await page.waitForTimeout(4500)
    await page.evaluate(() => {
      const g = window.__game
      g.enterRegion(g.regions.village)
      g.advance(0.5, 1 / 30)
      g.dev.fillForge('thor')
      g.dev.forge('thor')
    })
    await page.waitForTimeout(500)
    await record('e23-1-forge')
    await settle()
    // 장 보스 처치: 느린 동작 → 쓰러지며 한마디 → 장 넘어가기 장면 → 장 제목 띠·신화 개방 카드
    await page.waitForTimeout(4500)
    await page.evaluate(() => {
      const g = window.__game
      g.enterRegion(g.regions.utgard)
      g.advance(1, 1 / 30)
      const b = g.encounter.boss
      g.dev.teleport(b.x, b.z + 4)
      b.takeHit(b.health.hp + 1, 0, 1, 0)
    })
    await page.waitForTimeout(250)
    await record('e23-1-boss-slow')
    await nextScene()
    await record('e23-1-boss-scene')
    await skipOne()
    await nextScene('downKing')
    await record('e23-1-chapter-scene')
    await settle()
    await record('e23-1-chapter-after')
    // 엔딩: 마지막 보스 → 느린 동작 → 엔딩 장면(엔딩 곡) → 큰 카드
    await page.waitForTimeout(4500)
    await page.evaluate(() => {
      const g = window.__game
      for (let i = 0; i < 12 && g.chapters.goal && !(g.chapters.goal.kind === 'enter' && g.chapters.goal.region === 'sky'); i++) g.skipGoal()
    })
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
    await page.waitForTimeout(250)
    await record('e23-1-ending-slow')
    await nextScene()
    await page.waitForTimeout(1500)
    await record('e23-1-ending-scene')
    await settle()
    await record('e23-1-ending-card')
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
      g.dev.choose('thor')
      g.world.travelTo('midgard')
    })
    // 이 환경은 초당 몇 프레임이라 순간의 기다림(실제 초)이 길다: 기다리는 순간이 없을 때까지
    await page.waitForFunction(() => !window.__game.moments.holding && window.__game.hud.gainsShowing === null, null, { timeout: 120000 })
    await page.evaluate(() => {
      const g = window.__game
      g.combat.godMode = true
      const p = g.hero.object.position
      for (let i = 0; i < 6; i++) g.encounter.spawnById('grunt', { x: p.x + Math.sin(i) * 3, z: p.z + Math.cos(i) * 3 }, true)
      g.advance(1, 1 / 30)
      g.bus.emit('moment', { id: 'materialPicked', text: '서리 결정 · 재료' })
      g.bus.emit('moment', { id: 'gearWorn', card: { kind: '장비', title: '서리 늑대 가죽 장화', color: '#5aa8ff', lines: ['이동 속도 +6%', '최대 생명 +12'] } })
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
