// 빌드 결과를 실제 브라우저로 열어, 화면이 그려지고 오류가 없는지 확인한다.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const PORT = 4173
const URL = `http://localhost:${PORT}/`
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

// 따로 묶어 띄우고 묶음째 끈다: npx만 끄면 그 아래 vite가 남아 다음 검사의 포트를 막는다 (윈도우는 taskkill /T)
const windows = process.platform === 'win32'
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: !windows, shell: windows, windowsHide: true })
const stop = () => {
  try {
    if (windows) spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(-server.pid, 'SIGTERM')
  } catch {}
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(URL)
      if (res.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('미리보기 서버가 뜨지 않았습니다.')
}

let failed = false
try {
  await waitForServer()
  const browser = await chromium.launch({
    executablePath: existsSync(BROWSER) ? BROWSER : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  await page.goto(URL)
  // CI 러너의 소프트웨어 렌더링은 판마다 두세 배 느리기도 하다 (이웃 조각까지 그리는 E19부터 첫 프레임들이 무거움, troubleshooting.md)
  await page.waitForFunction(() => (window.__game?.frame ?? 0) > 10, null, { timeout: 30000 })
  const frames = await page.evaluate(() => window.__game.frame)

  // 시작 화면: 처음 실행이면 로딩이 끝난 뒤 저장 슬롯 3개(모두 빈 슬롯). 빈 슬롯 → 캐릭터 만들기 → [시작]
  await page.waitForSelector('.title-slot', { timeout: 15000 })
  const emptySlots = await page.locator('.title-slot.is-empty').count()
  if (emptySlots !== 3) throw new Error(`시작 화면: 빈 슬롯이 ${emptySlots}개입니다.`)
  await page.locator('.title-slot').first().click()
  await page.locator('.title-swatch').nth(2).click()
  await page.click('.title__button--primary')
  await page.waitForFunction(() => window.__game.playing, null, { timeout: 15000 })
  const skin = await page.evaluate(() => window.__game.wardrobe.body.skin)
  if (skin !== 2) throw new Error(`캐릭터 만들기: 고른 피부가 ${skin}입니다.`)
  console.log('시작 화면 확인: 빈 슬롯 → 캐릭터 만들기(피부 고름) → [시작]으로 플레이 시작')

  // 첫 장면 (E12-10): 새로 시작하면 촌장과 대화. HUD가 숨고, 한 번 누르면 글이 완성되고 한 번 더 누르면 다음 줄
  await page.waitForFunction(() => window.__game.scenes.current === 'opening' && !document.querySelector('.dialog')?.hidden, null, { timeout: 15000 }).catch(() => {
    throw new Error('첫 장면: 새로 시작했는데 대화 장면이 열리지 않습니다.')
  })
  if (!(await page.evaluate(() => window.__game.hud.root.classList.contains('is-hidden')))) throw new Error('첫 장면: 대화 중에 HUD가 보입니다.')
  if ((await page.locator('.dialog__name').textContent()) !== '촌장') throw new Error('첫 장면: 말하는 사람이 촌장이 아닙니다.')
  await page.mouse.click(640, 300)
  const firstLine = await page.evaluate(() => window.__game.dialog.visibleText)
  if (firstLine !== '깨어났구먼. 모닥불 곁에 쓰러져 있었다네.') throw new Error(`첫 장면: 한 번 눌렀는데 글이 완성되지 않습니다 ("${firstLine}")`)
  for (let i = 0; i < 20 && (await page.evaluate(() => !document.querySelector('.dialog').hidden)); i++) await page.mouse.click(640, 300)
  await page.waitForFunction(() => !window.__game.scenes.active, null, { timeout: 10000 }).catch(() => {
    throw new Error('첫 장면: 끝까지 넘겼는데 대화가 끝나지 않습니다.')
  })
  if (await page.evaluate(() => window.__game.hud.root.classList.contains('is-hidden'))) throw new Error('첫 장면: 대화가 끝났는데 HUD가 돌아오지 않습니다.')
  if (!(await page.evaluate(() => window.__game.snapshot().scenes.includes('opening')))) throw new Error('첫 장면: 본 장면이 저장되지 않습니다.')
  console.log('첫 장면 확인: 대화 중 HUD 숨김, 한 번 누르면 완성·다시 누르면 넘김, 끝나면 HUD와 저장')

  // 대화 네 곳 (E15-06): 처음 보는 일(신화 개방)은 한 번만, 마을 사람은 걸어가면 말을 건다. 대화 중에는 세계가 멈춘다
  const closeDialog = async () => {
    for (let i = 0; i < 30 && (await page.evaluate(() => !document.querySelector('.dialog').hidden)); i++) await page.mouse.click(640, 300)
    await page.waitForFunction(() => !window.__game.scenes.active, null, { timeout: 10000 })
  }
  if (!(await page.evaluate(() => window.__game.story('mythThor')))) throw new Error('대화: 토르 신화 개방 장면이 열리지 않습니다.')
  if ((await page.locator('.dialog__name').textContent()) !== '토르') throw new Error('대화: 신화 개방 장면에서 토르가 말하지 않습니다.')
  const frozen = await page.evaluate(async () => {
    const t = window.__game.time
    await new Promise((r) => setTimeout(r, 300))
    return window.__game.time === t
  })
  if (!frozen) throw new Error('대화: 대화 중에 게임 시간이 흐릅니다.')
  await closeDialog()
  if (await page.evaluate(() => window.__game.story('mythThor'))) throw new Error('대화: 본 신화 개방 장면이 다시 열립니다.')
  await page.evaluate(() => {
    const g = window.__game
    // 대장장이 곁에서 (마을을 다시 지어도 따라가게 자리는 데이터에서)
    const smith = g.region.npcs.find((n) => n.name === '대장장이')
    g.hero.teleport(smith.x - 1.3, smith.z + 1.4)
    g.playerInput.onTalk('대장장이')
    // 걸어가 말을 거는 동안 실제 프레임을 기다리지 않고 게임 시간을 직접 흘린다 (느린 CI 러너에서도 같게)
    for (let i = 0; i < 150 && g.scenes.current !== 'talkSmith'; i++) g.advance(1 / 30, 1 / 30)
  })
  await page.waitForFunction(() => window.__game.scenes.current === 'talkSmith', null, { timeout: 15000 }).catch(() => {
    throw new Error('대화: 대장장이 곁에서 말을 걸었는데 장면이 열리지 않습니다.')
  })
  await closeDialog()
  // 정보 화면에서 처음 벼리기 등으로 장면이 오면, 창(HUD 안)이 숨은 채 멈추지 않게 창을 닫을 때까지 미룬다
  const deferred = await page.evaluate(() => {
    const g = window.__game
    g.menu.toggle(true)
    g.story('forgeFirst')
    return { during: g.scenes.active, menuOpen: g.menu.open }
  })
  if (deferred.during || !deferred.menuOpen) throw new Error('대화: 정보 화면이 열린 채 장면이 시작됩니다 (창이 숨은 채 멈춤).')
  await page.evaluate(() => window.__game.menu.toggle(false))
  await page.waitForFunction(() => window.__game.scenes.current === 'forgeFirst', null, { timeout: 15000 }).catch(() => {
    throw new Error('대화: 정보 화면을 닫았는데 미룬 장면이 열리지 않습니다.')
  })
  await closeDialog()
  console.log('대화 확인: 신화 개방 장면(한 번만, 세계 멈춤), 마을 사람에게 말 걸기, 창이 열린 동안 온 장면은 닫은 뒤')

  // 순간 네 등급 (E23-01): 작은 알림은 화면 아래 한 줄, 카드는 오른쪽 위에 작게, 큰 카드는 가운데,
  // 장면은 느린 동작 뒤에 열리고 넘기면 그 뒤에 얻은 것 카드
  const card = (title) => ({ kind: '점검', title, color: '#9fe3ff', lines: ['한 줄'] })
  await page.evaluate(() => window.__game.bus.emit('moment', { id: 'gearPicked', text: '낡은 장화 · 가방' }))
  if ((await page.locator('.hud__toast.is-showing').textContent()) !== '낡은 장화 · 가방') throw new Error('순간: 작은 알림이 화면 아래에 뜨지 않습니다.')
  await page.evaluate((c) => window.__game.bus.emit('moment', { id: 'gearWorn', card: c }), card('작은 카드'))
  await page.waitForFunction(() => window.__game.hud.gainsShowing === 'card', null, { timeout: 10000 }).catch(() => {
    throw new Error('순간: 카드가 오른쪽 위에 작게 뜨지 않습니다.')
  })
  await page.evaluate((c) => window.__game.bus.emit('moment', { id: 'forged', card: c }), card('큰 카드'))
  await page.waitForFunction(() => window.__game.hud.gainsShowing === 'big' && document.querySelector('.hud__gains-title').textContent === '큰 카드', null, { timeout: 15000 }).catch(() => {
    throw new Error('순간: 큰 카드가 가운데에 뜨지 않습니다.')
  })
  // 앞의 큰 카드가 자리를 지키는 동안 장면은 기다린다(차례는 tests/moments.test.ts). 이 환경은 프레임 시간이 0.1초에서
  // 잘려 그 기다림이 실제보다 몇 배 길어, CI가 느린 날 시간을 넘겼다: 카드가 물러난 뒤에 장면을 보낸다
  await page.waitForFunction(() => !window.__game.moments.holding, null, { timeout: 60000 }).catch(() => {
    throw new Error('순간: 큰 카드가 물러나지 않습니다.')
  })
  await page.evaluate((c) => {
    const g = window.__game
    g.storyScenes = true
    g.forgetScene('downKing')
    g.bus.emit('moment', { id: 'chapterBoss', scene: 'downKing', slow: true, card: c })
  }, card('장면 뒤 카드'))
  await page.waitForFunction(() => window.__game.gameSpeed < 1, null, { timeout: 10000 }).catch(() => {
    throw new Error('순간: 장면 앞에 느린 동작이 없습니다.')
  })
  await page.waitForFunction(() => window.__game.scenes.current === 'downKing', null, { timeout: 20000 }).catch(() => {
    throw new Error('순간: 느린 동작 뒤에 장면이 열리지 않습니다.')
  })
  if (!(await page.locator('.letterbox.is-on').count())) throw new Error('순간: 장면에 위아래 검은 띠가 없습니다.')
  await closeDialog()
  await page.waitForFunction(() => document.querySelector('.hud__gains-title')?.textContent === '장면 뒤 카드', null, { timeout: 15000 }).catch(() => {
    throw new Error('순간: 장면을 넘긴 뒤 얻은 것 카드가 뜨지 않습니다.')
  })
  console.log('순간 확인: 작은 알림(아래)·카드(오른쪽 위)·큰 카드(가운데), 장면은 느린 동작·검은 띠 뒤에 열리고 넘기면 카드')
  // 이 뒤의 점검(대장간 제작 등)이 처음 보는 일 장면에 막히지 않게 끈다
  await page.evaluate(() => (window.__game.storyScenes = false))

  // 조작 점검: 우클릭한 곳으로 걸어가는지 확인한다.
  const heroPos = () => page.evaluate(() => {
    const p = window.__game.hero.object.position
    return { x: p.x, z: p.z }
  })
  const before = await heroPos()
  await page.mouse.move(640 + 220, 360 + 60)
  await page.mouse.down({ button: 'right' })
  await page.mouse.up({ button: 'right' })
  await page.waitForFunction(
    ([x, z]) => {
      const p = window.__game.hero.object.position
      return Math.hypot(p.x - x, p.z - z) > 1
    },
    [before.x, before.z],
    { timeout: 20000 },
  )
  const moved = await heroPos()
  console.log(`이동 확인: (${before.x.toFixed(1)}, ${before.z.toFixed(1)}) → (${moved.x.toFixed(1)}, ${moved.z.toFixed(1)})`)

  // 장 흐름 (E22): 처음에는 목표 한 줄이 미드가르드를 가리키고, 아직 안 열린 올림포스로 가는 통로는 결계가 막는다
  const sealed = await page.evaluate(() => {
    const g = window.__game
    const exit = g.region.exits.find((e) => e.to === 'olympus')
    const start = { x: g.hero.object.position.x, z: g.hero.object.position.z }
    g.dev.teleport(exit.x, exit.z + 3)
    g.orders.press({ x: exit.x, z: exit.z - 60 }, null)
    g.advance(6, 1 / 30)
    const out = { region: g.region.id, z: g.hero.object.position.z, half: g.region.halfExtent, barriers: g.barrierSpots.map((b) => b.to).sort(), goal: document.querySelector('.chapter-goal span')?.textContent ?? '' }
    g.dev.teleport(start.x, start.z)
    return out
  })
  if (sealed.goal !== '미드가르드 설원으로') throw new Error(`장 흐름: 처음 목표 한 줄이 다릅니다 ${JSON.stringify(sealed)}`)
  if (sealed.region !== 'village' || sealed.z < -sealed.half - 0.6) throw new Error(`장 흐름: 결계가 올림포스로 가는 길을 막지 않습니다 ${JSON.stringify(sealed)}`)
  if (sealed.barriers.join() !== 'hwagwasan,olympus,sinsi,takamagahara') throw new Error(`장 흐름: 마을의 결계가 다릅니다 ${JSON.stringify(sealed)}`)
  console.log(`장 흐름 확인: 목표 「${sealed.goal}」, 마을의 결계 넷(${sealed.barriers.join('·')}), 올림포스 쪽 통로에서 걸음이 막힘`)

  // 자동 공격 점검: 멈춰 있는 주인공 바로 앞에 졸개를 세우면, 버튼 없이도 때려서 생명력이 줄어야 한다.
  await page.waitForFunction(() => !window.__game.hero.isMoving, null, { timeout: 20000 })
  await page.evaluate(() => {
    const g = window.__game
    const p = g.hero.object.position
    window.__dummy = g.encounter.spawnGrunt(p.x + 1.6, p.z)
  })
  await page.waitForFunction(() => window.__dummy.health.hp < window.__dummy.health.max, null, { timeout: 15000 })
  console.log('자동 공격 확인: 졸개 생명력', await page.evaluate(() => window.__dummy.health.hp))

  // 클릭 점검: 몬스터를 누르면 그 몬스터를 공격하라는 지시가 된다.
  const screen = await page.evaluate(() => {
    const g = window.__game
    const p = g.hero.object.position
    window.__clickTarget = g.encounter.spawnGrunt(p.x - 4, p.z + 3)
    // 화면 좌표를 구한 뒤 클릭하기 전에 움직이지 않게 붙잡아 둔다.
    window.__clickTarget.update = () => {}
    const point = window.__clickTarget.object.position.clone()
    point.y += 1.2
    point.project(g.view.camera)
    const size = g.renderSize
    const height = document.getElementById('app').clientHeight
    return { x: ((point.x + 1) / 2) * size.width * size.scale, y: height - ((point.y + 1) / 2) * size.height * size.scale }
  })
  await page.mouse.click(screen.x, screen.y)
  await page.waitForFunction(() => window.__game.orders.attackTarget === window.__clickTarget, null, { timeout: 10000 })
  // 이름표 (E12-09): 공격 중인 몬스터 머리 위에 등급과 이름
  await page.waitForFunction(() => window.__game.nameplates.visible.some((t) => t.includes('서리 거인')), null, { timeout: 10000 }).catch(() => {
    throw new Error('이름표: 공격 중인 몬스터 머리 위에 이름표가 뜨지 않습니다.')
  })
  console.log('클릭 확인: 몬스터를 누르면 공격 지시, 머리 위 이름표', await page.evaluate(() => window.__game.nameplates.visible.join(', ')))

  // 외형 점검(E3): 기본 / 유물 1개 / 유물 2개 / 발현, 네 장면을 찍어 남긴다. (주인공 둘레만)
  const lookShot = async (name, frames = 2) => {
    const f = await page.evaluate(() => window.__game.frame)
    await page.waitForFunction(([f, n]) => window.__game.frame > f + n, [f, frames], { timeout: 30000 })
    const center = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }))
    await page.screenshot({ path: `test-results/look-${name}.png`, clip: { x: center.w / 2 - 160, y: center.h / 2 - 150, width: 320, height: 260 } })
  }
  await page.evaluate(() => {
    const g = window.__game
    g.encounter.clearAll()
    // 나무에 가리지 않는 트인 곳에서 찍는다.
    g.dev.teleport(2, -3)
    g.hero.face(0.6)
  })
  if ((await page.evaluate(() => window.__game.hero.rig.outfit.head)) !== 'adventurerHood') throw new Error('외형: 기본 모습이 모험가가 아닙니다.')
  await lookShot('1-base')

  // 땅 유물 설명 카드: 떠 있는 모델 위, 빛기둥 중간, 발밑 어디에 커서를 올려도 뜨고, 멀리 떨어지면 사라진다.
  const spots = await page.evaluate(() => {
    const g = window.__game
    // 앞 단계의 공격 지시로 주인공이 유물 쪽으로 걸어가 줍지 않게 멈춰 세운다
    g.orders.clear()
    const p = g.hero.object.position
    const x = p.x + 4
    const z = p.z + 1
    g.pickups.drop('lokiMask', x, z, false)
    const y = g.hero.object.position.y
    return { top: g.screenPoint(x, y + 1.5, z), mid: g.screenPoint(x, y + 0.6, z), base: g.screenPoint(x, y, z) }
  })
  for (const [name, at] of Object.entries(spots)) {
    await page.mouse.move(at.x, at.y + 8)
    await page.waitForFunction(() => window.__game.frame > 0 && !document.querySelector('.relic-tooltip')?.hidden, null, { timeout: 5000 }).catch(() => {
      throw new Error(`땅 유물 설명: ${name}에 커서를 올렸는데 카드가 뜨지 않습니다.`)
    })
  }
  // 아무 유물·HUD도 없는 화면 왼쪽 가장자리로 커서를 치운다
  await page.mouse.move(4, 360)
  await page.waitForFunction(() => document.querySelector('.relic-tooltip')?.hidden !== false, null, { timeout: 5000 })
  if (await page.evaluate(() => window.__game.powers.loadout.has('lokiMask'))) throw new Error('땅 유물 설명: 커서만 올렸는데 유물을 주웠습니다.')
  await page.evaluate(() => window.__game.pickups.remove('lokiMask'))
  console.log('땅 유물 설명 확인: 모델 위·빛기둥·발밑에서 카드가 뜨고, 벗어나면 사라짐')

  // 정보 화면 탭은 쓸 일이 생길 때 하나씩 열린다 (E236-05): 새 판에서는 상태 탭만
  const firstTabs = await page.evaluate(() => {
    const g = window.__game
    g.menu.toggle(true)
    const shown = [...document.querySelectorAll('.menu__tab')].filter((b) => !b.hidden).length
    g.menu.toggle(false)
    return { shown, opened: [...g.tabs.opened] }
  })
  if (firstTabs.shown !== 1 || firstTabs.opened.length !== 0) throw new Error(`탭 차례: 새 판인데 상태 탭 말고도 열려 있습니다 ${JSON.stringify(firstTabs)}`)
  // 장비 점검 (E13-02): 떨어진 일반 장비 위에 서면 저절로 줍고 그 부위 칸(발)에 낀다.
  const bootsUid = await page.evaluate(() => {
    const g = window.__game
    const p = g.hero.object.position
    return g.dev.dropGear('feet', 'rare', p.x, p.z)
  })
  await page.waitForFunction((uid) => window.__game.powers.loadout.slots[4] === uid, bootsUid, { timeout: 15000 }).catch(() => {
    throw new Error('장비: 발밑의 장화를 주워 발 칸에 끼지 못했습니다.')
  })
  // 장비를 처음 주우면 장비 탭이 열리고 무엇을 하는 곳인지 카드가 뜬다
  await page.waitForFunction(() => window.__game.moments.shown.some((m) => m.id === 'tabOpened'), null, { timeout: 15000 }).catch(() => {
    throw new Error('탭 차례: 장비를 주웠는데 장비 탭이 열렸다는 카드가 뜨지 않습니다.')
  })
  const gearTabs = await page.evaluate(() => [...window.__game.tabs.opened])
  if (gearTabs.join() !== 'relics') throw new Error(`탭 차례: 장비를 주운 뒤 열린 탭이 장비 하나가 아닙니다 (${gearTabs.join()})`)
  console.log('탭 차례 확인: 새 판에는 상태 탭만, 장비를 주우면 장비 탭과 카드')
  await lookShot('2-gear')
  // 유물 점검: 신화의 유물(묠니르) 위에 서면 줍고, 그 신화가 열려 바로 고른 신화가 된다 (E12-04, E13-03).
  await page.evaluate(() => {
    const g = window.__game
    const p = g.hero.object.position
    g.pickups.drop('mjolnir', p.x, p.z)
  })
  await page.waitForFunction(() => window.__game.powers.loadout.slots[0] === 'mjolnir', null, { timeout: 15000 }).catch(() => {
    throw new Error('유물: 묠니르를 주워 무기 칸에 끼지 못했습니다.')
  })
  if ((await page.evaluate(() => window.__game.hero.rig.outfit.weapon)) !== 'mjolnirHammer') throw new Error('외형: 묠니르를 줍자마자 망치가 보이지 않습니다.')
  const manifested = await page.evaluate(() => window.__game.powers.manifested)
  if (manifested !== 'thor') throw new Error(`신화 고르기 실패: 토르 유물을 주웠는데 고른 신화가 ${manifested}입니다.`)
  if (!(await page.evaluate(() => window.__game.progress.isOpen('thor')))) throw new Error('신화 개방: 토르 유물을 주웠는데 토르 신화가 열리지 않았습니다.')
  if ((await page.evaluate(() => window.__game.hero.rig.outfit.head)) !== 'thorHelm') throw new Error('외형: 신화를 골랐는데 모습이 그대로입니다.')
  // 재료가 된 유물(메긴교르드)은 칸이 아니라 재료로 (E13-03)
  await page.evaluate(() => {
    const g = window.__game
    const p = g.hero.object.position
    g.pickups.drop('megingjord', p.x, p.z)
  })
  await page.waitForFunction(() => window.__game.powers.loadout.materials.get('megingjord') === 1, null, { timeout: 15000 }).catch(() => {
    throw new Error('재료: 메긴교르드를 주웠는데 재료로 들어가지 않았습니다.')
  })
  // 발현 번개가 걷히고 나서 찍는다.
  await lookShot('4-manifest', 12)
  // 왼쪽 위 상태: 발현한 클래스 초상과 레벨 보석
  if ((await page.locator('.hud__portrait.is-empty').count()) !== 0) throw new Error('상태: 발현했는데 초상이 비어 있습니다.')
  // 신화의 유물(묠니르)을 주워 신화가 열리면 신화·외형 탭도 열린다. 아래 점검은 탭을 모두 연 채로 한다
  const mythTabs = await page.evaluate(() => [...window.__game.tabs.opened])
  if (!['relics', 'classes', 'looks'].every((t) => mythTabs.includes(t))) throw new Error(`탭 차례: 묠니르로 신화를 열었는데 신화·외형 탭이 닫혀 있습니다 (${mythTabs.join()})`)
  await page.evaluate(() => window.__game.tabs.openAll())
  // 정보 화면(E4): 문장 단추로 열면 게임이 멈춘다. 새로 열린 탭이 있으면 그 탭부터 보이니(E236-05) 상태 탭을 누른다
  await page.click('.menu-button')
  if (!(await page.evaluate(() => window.__game.paused))) throw new Error('정보 화면: 열었는데 게임이 멈추지 않습니다.')
  const firstShown = await page.evaluate(() => window.__game.menu.currentTab)
  if (firstShown === 'status') throw new Error('정보 화면: 새로 열린 탭이 있는데 상태 탭부터 보입니다.')
  await page.locator('.menu__tab').first().click()
  const statRows = await page.locator('.menu-status__stat').count()
  if (statRows !== 8) throw new Error(`상태 탭: 능력치 줄이 ${statRows}개입니다.`)
  await page.screenshot({ path: 'test-results/menu-status.png' })
  // 장비 탭 (E13): 칸 7. 장화를 가방에 넣고, 가방에서 누르면 비교 카드가 뜨고 다시 발 칸에 낀다. 고른 신화는 그대로다 (E12-04).
  await page.locator('.menu__tab').nth(2).click()
  if ((await page.locator('.menu-relics__slot').count()) !== 7) throw new Error('장비 탭: 칸이 7개가 아닙니다.')
  await page.locator('.menu-relics__slot').nth(4).click()
  await page.getByRole('button', { name: '가방에 넣기' }).click()
  const stowed = await page.evaluate(() => {
    const g = window.__game
    return { manifested: g.powers.manifested, feet: g.powers.loadout.slots[4], bag: [...g.powers.loadout.bag] }
  })
  if (stowed.manifested !== 'thor' || stowed.feet !== null || !stowed.bag.includes(bootsUid)) throw new Error(`정보 화면: 가방에 넣기 실패 ${JSON.stringify(stowed)}`)
  await page.locator('.menu-relics__item').first().hover()
  if (!(await page.locator('.gc').isVisible())) throw new Error('정보 화면: 가방의 장비에 설명 카드가 없습니다.')
  await page.locator('.menu-relics__item').first().click()
  if ((await page.evaluate((uid) => window.__game.powers.loadout.slots[4] === uid, bootsUid)) !== true) throw new Error('정보 화면: 가방의 장비를 발 칸에 다시 끼지 못했습니다.')
  // 대장간 (E13-05): 마을에서 재료가 차면 「벼리기」로 묠니르를 2단계로 올린다
  await page.evaluate(() => window.__game.dev.fillForge('thor'))
  await page.locator('.menu__tab').nth(1).click()
  await page.locator('.menu__tab').nth(2).click()
  const forgeRow = page.locator('.menu-forge__row', { hasText: '각성한 묠니르' })
  if (!(await forgeRow.count())) throw new Error('대장간: 묠니르를 올리는 제작법이 보이지 않습니다.')
  await forgeRow.getByRole('button', { name: '벼리기' }).click()
  if ((await page.evaluate(() => window.__game.powers.loadout.stage('mjolnir'))) !== 2) throw new Error('대장간: 벼렸는데 묠니르가 2단계가 아닙니다.')
  await page.click('.menu__tab:nth-child(4)')
  if (!(await page.locator('.menu-classes__now').textContent()).includes('천둥의 신')) throw new Error('정보 화면: 신화 탭에 지금 신화가 없습니다.')
  // 신화 카드 (E12-06, E21-02, E237): 수집 보너스·주신일 때·빌린 힘일 때와 주신 표시
  const myth = await page.locator('.menu-myth').textContent()
  if (!myth.includes('수집 보너스') || !myth.includes('주신일 때') || !myth.includes('빌린 힘일 때') || !myth.includes('주신')) throw new Error(`정보 화면: 신화 카드가 모자랍니다 (${myth.slice(0, 60)})`)
  // 신위 칸 (E237): 둘째 신이 깨어나면 빌린 칸이 생기고, 그 신의 카드에서 「빌린 칸에 넣기」를 누르면 빌린 힘이 돈다
  await page.evaluate(() => {
    const g = window.__game
    g.progress.open('loki')
    g.menu.myths.selected = 'loki'
    g.menu.refresh()
  })
  await page.locator('.menu-myth__choose', { hasText: '빌린 칸에 넣기' }).click()
  const lent = await page.evaluate(() => ({ borrowed: [...window.__game.ctx.build.borrowed], slots: [...document.querySelectorAll('.menu-slots__slot')].map((e) => e.textContent), awake: window.__game.powers.awake('lokiMask') }))
  if (lent.borrowed.join() !== 'loki' || !lent.slots[1]?.includes('로키')) throw new Error(`신위 칸: 로키를 빌린 칸에 넣지 못했습니다 ${JSON.stringify(lent)}`)
  console.log(`신위 칸 확인: 칸 ${lent.slots.length}개(${lent.slots.join(' / ')}), 빌린 힘 로키`)
  await page.evaluate(() => window.__game.lendMyth('loki', false))
  // 수련 탭 (E236): 깨달음을 얻으면 메뉴 단추에 표시, 뿌리 마디를 누르면 찍히고 피해가 오른다
  const trainBefore = await page.evaluate(() => {
    const g = window.__game
    g.dev.insight(1)
    return { damage: g.ctx.build.state.damageScale, marked: g.menu.button.classList.contains('has-new'), unspent: g.training.unspent }
  })
  await page.click('.menu__tab:nth-child(5)')
  await page.click('.menu-train__node[data-node="awaken"]')
  const trained = await page.evaluate(() => ({ taken: [...window.__game.training.taken], unspent: window.__game.training.unspent, damage: window.__game.ctx.build.state.damageScale, on: document.querySelector('.menu-train__node[data-node="awaken"]')?.classList.contains('is-taken') }))
  if (!trainBefore.marked || trained.taken.join() !== 'awaken' || trained.unspent !== trainBefore.unspent - 1 || !trained.on || !(trained.damage > trainBefore.damage)) throw new Error(`수련: 깨달음으로 뿌리 마디를 찍지 못했습니다 ${JSON.stringify({ trainBefore, trained })}`)
  console.log(`수련 확인: 깨달음을 얻으면 메뉴 단추 표시, 뿌리 마디를 찍으면 피해 ×${(trained.damage / trainBefore.damage).toFixed(2)}`)
  await page.keyboard.press('Escape')
  if (await page.evaluate(() => window.__game.paused)) throw new Error('정보 화면: 닫았는데 게임이 멈춰 있습니다.')
  // 원천 탭 (E14, E21-06): 엔딩 전에는 각성 카드 넷만, 시련·균열 탭은 숨김. 엔딩 뒤에는 위협 단계를 골라 오른다
  await page.evaluate(() => (window.__game.threat.unlocked = 2))
  await page.click('.menu-button')
  await page.locator('.menu__tab').nth(1).click()
  if ((await page.locator('.menu-src__source').count()) !== 4) throw new Error('원천 탭: 각성 카드가 넷이 아닙니다.')
  const demo = await page.evaluate(() => ({ levels: document.querySelectorAll('.menu-src__level').length, tabs: [...document.querySelectorAll('.menu__tab')].filter((b) => !b.hidden).length }))
  if (demo.levels !== 0 || demo.tabs !== 7) throw new Error(`엔딩 전: 위협 단계나 시련·균열 탭이 보입니다 (${JSON.stringify(demo)})`)
  await page.evaluate(() => {
    window.__game.reachEnding()
    window.__game.menu.refresh()
  })
  await page.locator('.menu-src__level', { hasText: '2' }).first().click()
  const climbed = await page.evaluate(() => ({ level: window.__game.threat.level, reached: window.__game.threat.reached, tabs: [...document.querySelectorAll('.menu__tab')].filter((b) => !b.hidden).length }))
  if (climbed.level !== 2 || climbed.reached !== 2 || climbed.tabs !== 9) throw new Error(`엔딩 뒤: 위협 2단계로 오르지 못했거나 탭이 아홉이 아닙니다 (${JSON.stringify(climbed)})`)
  await page.keyboard.press('Escape')
  console.log('원천 확인: 엔딩 전에는 각성 카드 넷과 탭 일곱, 엔딩 뒤에는 탭 아홉과 위협 2단계 고르기')
  console.log('정보 화면 확인: 상태 탭 능력치 8줄, 열면 멈춤, 가방에 넣기·다시 끼기와 미리 보기, 신화 탭, Esc로 닫기')

  // 일시 정지(E5): 창이 없을 때 Esc를 누르면 멈추고, 멈춘 동안 게임 시간이 흐르지 않는다.
  await page.keyboard.press('Escape')
  if (!(await page.locator('.pause').isVisible())) throw new Error('일시 정지: Esc를 눌렀는데 메뉴가 뜨지 않습니다.')
  const pausedAt = await page.evaluate(() => window.__game.time)
  await page.waitForTimeout(600)
  if ((await page.evaluate(() => window.__game.time)) !== pausedAt) throw new Error('일시 정지: 멈췄는데 게임 시간이 흐릅니다.')
  // 설정: 화면 흔들림을 끄면 흔들림 배율이 0이 되고 저장된다.
  await page.getByRole('button', { name: '설정' }).click()
  await page.locator('[data-setting="화면 흔들림"]', { hasText: '끔' }).click()
  const shake = await page.evaluate(() => ({ scale: window.__game.view.shakeScale, saved: JSON.parse(localStorage.getItem('mythic-relics/settings-v2')).shake }))
  if (shake.scale !== 0 || shake.saved !== false) throw new Error(`설정: 화면 흔들림이 꺼지지 않았습니다 ${JSON.stringify(shake)}`)
  await page.screenshot({ path: 'test-results/pause-settings.png' })
  await page.locator('[data-setting="화면 흔들림"]', { hasText: '켬' }).click()
  await page.getByRole('button', { name: '계속하기' }).click()
  if (await page.evaluate(() => window.__game.paused)) throw new Error('일시 정지: 계속하기를 눌렀는데 멈춰 있습니다.')
  if (!(await page.evaluate(() => window.__game.audio.unlocked))) console.log('  (이 브라우저에서는 오디오를 켤 수 없어 소리 확인을 건너뜀)')
  console.log('일시 정지 확인: Esc로 멈춤, 멈춘 동안 시간 정지, 설정의 화면 흔들림 끄기와 저장, 계속하기')

  // 보관함에서 무기를 짧은 검으로 고르면 묠니르를 껴도 검을 든다. (새로 고침 뒤에도 유지되는지 아래에서 확인)
  await page.evaluate(() => window.__game.appearance.choose('weapon', 'shortSword'))
  if ((await page.evaluate(() => window.__game.hero.rig.outfit.weapon)) !== 'shortSword') throw new Error('외형: 보관함 선택이 적용되지 않습니다.')
  console.log('장비·유물 확인: 장화 줍기와 발 칸, 묠니르 줍기로 토르 신화 열기·고르기, 메긴교르드는 재료, 장비 탭 칸 7, 대장간에서 각성한 묠니르 (test-results/look-*.png)')

  // 지역 (E7): 새로 시작하면 마을. 마을 사람 곁에 가면 말풍선, 출구를 밟으면 암전 뒤 그 땅으로 넘어간다.
  if ((await page.evaluate(() => window.__game.region.id)) !== 'village') throw new Error('지역: 새로 시작했는데 마을이 아닙니다.')
  if (await page.evaluate(() => window.__game.encounter.boss !== null)) throw new Error('지역: 마을에 보스가 있습니다.')
  await page.evaluate(() => {
    const g = window.__game
    g.encounter.clearAll()
    const elder = g.region.npcs[0]
    g.dev.teleport(elder.x + 1.5, elder.z + 1.5)
  })
  await page.waitForFunction(() => window.__game.villagers.talking.length > 0, null, { timeout: 15000 })
  const bubble = await page.locator('.npc-bubble:not([hidden])').first().textContent()
  if (!bubble) throw new Error('지역: 마을 사람 말풍선이 비었습니다.')
  if (!(await page.locator('.minimap').isVisible())) throw new Error('지역: 작은 지도가 보이지 않습니다.')
  // 하나로 이어진 세계 (E19-02): 마을의 미드가르드 쪽 문을 지나 통로를 걸으면, 가운데를 넘을 때 암전 없이 미드가르드가 된다
  const walked = await page.evaluate(() => {
    const g = window.__game
    const exit = g.region.exits.find((e) => e.to === 'midgard')
    g.dev.teleport(exit.x, exit.z + 3)
    // 이웃 땅의 무리는 미리 세워 둔다 (E19-04): 넘어간 뒤의 미드가르드 적은 이 거인들이어야 한다
    g.encounter.flushNeighbors()
    const waiting = g.encounter.parkedGiants
    // 통로 너머(미드가르드 안쪽)를 누른다. 마을에서는 통로 끝까지만 갈 수 있다
    g.orders.press({ x: exit.x, z: exit.z - 60 }, null)
    let fade = 0
    for (let i = 0; i < 360 && g.region.id === 'village'; i++) {
      g.advance(1 / 30, 1 / 30)
      fade = Math.max(fade, Number(getComputedStyle(document.querySelector('.region-fade')).opacity) || 0)
    }
    g.advance(1, 1 / 30)
    const p = g.hero.object.position
    const woke = g.encounter.giants.filter((x) => waiting.includes(x)).length
    const fresh = g.encounter.giants.filter((x) => !waiting.includes(x)).length
    return { region: g.region.id, fade, moving: g.hero.isMoving, x: p.x, z: p.z, half: g.region.halfExtent, woke, fresh }
  })
  if (walked.region !== 'midgard') throw new Error(`이어진 세계: 통로를 걸었는데 미드가르드로 넘어가지 않습니다 ${JSON.stringify(walked)}`)
  if (walked.fade > 0.01) throw new Error(`이어진 세계: 걸어서 넘어가는데 화면이 어두워집니다 ${JSON.stringify(walked)}`)
  if (!walked.moving) throw new Error(`이어진 세계: 넘어간 뒤 누른 곳까지 이어 걷지 않습니다 ${JSON.stringify(walked)}`)
  if (walked.woke === 0 || walked.fresh > 0) throw new Error(`이어진 세계: 넘어간 땅의 적이 미리 세워 둔 무리가 아니라 새로 생깁니다 ${JSON.stringify(walked)}`)
  // 지역을 여러 번 오가도 GPU 자원(형상·텍스처)이 늘지 않는다 (E7 자동 검증: 지역 전환 반복)
  const memoryAfter = async (times) =>
    page.evaluate(async (n) => {
      const g = window.__game
      const ids = Object.keys(g.regions)
      let build = 0
      for (let i = 0; i < n; i++) {
        const t0 = performance.now()
        g.enterRegion(g.regions[ids[i % ids.length]])
        build += performance.now() - t0
        await new Promise((r) => requestAnimationFrame(r))
      }
      g.enterRegion(g.regions.midgard)
      // 이웃 조각과 이웃 무리는 프레임마다 나눠 지으므로, 모두 지은 뒤에 잰다
      g.stage.flush()
      g.encounter.flushNeighbors()
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const m = g.pixel.renderer.info.memory
      return { geometries: m.geometries, textures: m.textures, ms: Math.round(build / n) }
    }, times)
  // 땅 얼굴(테마)마다 다시 칠한 소품 모델을 한 번씩 만들어 두므로, 모든 지역을 한 바퀴 돈 뒤부터 잰다 (E15: 지역 16곳)
  const regionCount = await page.evaluate(() => Object.keys(window.__game.regions).length)
  const memA = await memoryAfter(regionCount)
  const memB = await memoryAfter(regionCount * 2)
  if (memB.geometries > memA.geometries + 8 || memB.textures > memA.textures + 2) throw new Error(`지역: 오갈수록 GPU 자원이 늘어납니다 ${JSON.stringify({ memA, memB })}`)
  if (memB.ms > 3000) throw new Error(`지역: 지역을 짓는 데 3초가 넘게 걸립니다 (${memB.ms}ms)`)
  console.log(`지역 전환 반복 확인: ${regionCount}곳을 한 바퀴 돈 뒤 형상 ${memA.geometries}·텍스처 ${memA.textures}, 두 바퀴 더 돈 뒤 ${memB.geometries}·${memB.textures}, 한 번 짓는 데 평균 ${memB.ms}ms (소프트웨어 렌더링)`)
  console.log(`지역 확인: 마을에서 시작, 말풍선 「${bubble}」, 작은 지도, 통로를 걸어 암전 없이 미드가르드로(미리 세워 둔 적 ${walked.woke}마리를 깨움)`)

  // 세계 지도와 성소 워프 (E15-04): 지도 탭에 모든 땅 (E22: 마지막 무대까지 열일곱 곳), 찾은 성소를 누르면 그 땅으로
  await page.evaluate(() => {
    const g = window.__game
    g.conveniences.open.add('warp')
    g.conveniences.visited.add('jotunheim')
  })
  await page.click('.minimap')
  const mapLabels = await page.locator('.menu-map__label').count()
  if (mapLabels !== regionCount) throw new Error(`지도: 지역이 ${mapLabels}곳입니다 (${regionCount}곳이어야 함).`)
  await page.locator('.menu-map__label', { hasText: '요툰헤임 빙하' }).click()
  await page.waitForFunction(() => window.__game.region.id === 'jotunheim', null, { timeout: 15000 }).catch(() => {
    throw new Error('지도: 찾은 성소를 눌렀는데 워프하지 않습니다.')
  })
  console.log(`지도 확인: 작은 지도를 누르면 세계 지도(${mapLabels}곳), 찾은 성소를 눌러 요툰헤임 빙하로 워프`)
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.region-fade')).opacity === '0', null, { timeout: 15000 })
  await page.evaluate(() => window.__game.enterRegion(window.__game.regions.midgard))

  // 승급 전설 점검: 경험치 바를 채우고 성소에 서면 「우트가르드 원정」이 시작된다.
  await page.evaluate(() => {
    const g = window.__game
    g.progress.addXp('thor', 9999)
    g.hero.teleport(g.legend.center.x, g.legend.center.z)
  })
  await page.waitForFunction(() => window.__game.legend.phase === 'wave', null, { timeout: 15000 })
  console.log('전설 확인: 성소에서 시작')

  // 저장 점검: 새로 고침해도 주운 유물을 그대로 끼고 이어 한다.
  const savedAt = await page.evaluate(() => {
    window.__game.saveNow()
    const p = window.__game.hero.object.position
    return { x: p.x, z: p.z }
  })
  await page.reload()
  await page.waitForFunction(() => (window.__game?.frame ?? 0) > 2, null, { timeout: 15000 })
  // 저장이 있으면 단추 없이 로딩 화면이 걷히고 바로 이어서 플레이한다.
  await page.waitForFunction(() => window.__game?.playing, null, { timeout: 15000 })
  if (await page.locator('.title__button').count()) throw new Error('두 번째 실행인데 시작 단추가 나왔습니다.')
  // 유물·일반 장비·재료가 모두 그대로 (E13-06)
  const restored = await page.evaluate((uid) => {
    const l = window.__game.powers.loadout
    return { relic: l.slots[0] === 'mjolnir', gear: l.slots[4] === uid && l.gear.get(uid)?.grade === 'rare', material: l.materials.get('megingjord') === 1 }
  }, bootsUid)
  if (!restored.relic || !restored.gear || !restored.material) throw new Error(`이어서 플레이 실패: 저장한 장비가 없습니다 ${JSON.stringify(restored)}`)
  if ((await page.evaluate(() => window.__game.hero.rig.outfit.weapon)) !== 'shortSword') throw new Error('이어서 플레이 실패: 고른 외형이 없습니다.')
  if ((await page.evaluate(() => window.__game.region.id)) !== 'midgard') throw new Error('이어서 플레이 실패: 있던 지역(미드가르드)이 아닙니다.')
  // 세계 자리 (E19-05): 지역 id + 지역 안 좌표가 곧 이어진 세계의 자리다
  const back = await page.evaluate(() => ({ x: window.__game.hero.object.position.x, z: window.__game.hero.object.position.z }))
  if (Math.hypot(back.x - savedAt.x, back.z - savedAt.z) > 1) throw new Error(`이어서 플레이 실패: 저장한 자리가 아닙니다 ${JSON.stringify({ savedAt, back })}`)
  console.log('저장 확인: 새로 고침하면 단추 없이 바로 이어서, 유물·일반 장비·재료와 고른 외형, 있던 지역과 자리 유지')

  // 처음 화면으로: 정보 화면의 단추를 두 번 누르면 저장하고 슬롯 고르기로 돌아가고, 그 슬롯을 누르면 이어 간다.
  await page.click('.menu-button')
  await page.click('.menu__home')
  await page.click('.menu__home')
  await page.waitForSelector('.title-slot:not(.is-empty)', { timeout: 15000 })
  await page.locator('.title-slot:not(.is-empty)').first().click()
  await page.waitForFunction(() => window.__game?.playing, null, { timeout: 15000 })
  if (!(await page.evaluate(() => window.__game.powers.loadout.has('mjolnir')))) throw new Error('처음 화면에서 슬롯을 골랐는데 유물이 없습니다.')
  console.log('처음 화면 확인: 정보 화면에서 처음 화면으로, 슬롯을 골라 그대로 이어 감')

  // 시련 (E16): 위협 3단계가 되면 필드 성소 결계 안에서 시련 탭의 난이도를 눌러 바로 연다. 제약은 시련 중에만 걸린다
  await page.evaluate(() => {
    const g = window.__game
    g.reachEnding()
    Object.assign(g.threat, { unlocked: 3, reached: 3 })
    // 진행 중인 전설이 있으면 그만두고(지역을 다시 지을 수 있게), 둘레 적이 밀어내거나 쓰러뜨리지 않게 치우고 성소 가운데 곁에 선다
    if (g.legend.active) g.legend.abort(g.encounter, g.growth.legendHost())
    g.enterRegion(g.regions.midgard)
    g.encounter.clearAll()
    if (!g.combat.alive) g.dev.revive()
    g.orders.clear()
    g.hero.teleport(g.legend.center.x + 4, g.legend.center.z)
    g.hero.stop()
  })
  const trialBlocked = await page.evaluate(() => {
    const g = window.__game
    const p = g.hero.object.position
    return g.trialSystem.blocked() && { why: g.trialSystem.blocked(), phase: g.legend.phase, d: Math.hypot(p.x - g.legend.center.x, p.z - g.legend.center.z), trial: g.trialSystem.active, region: g.region.id }
  })
  if (trialBlocked) throw new Error(`시련: 성소 곁인데 열 수 없습니다 ${JSON.stringify(trialBlocked)}`)
  await page.click('.menu-button')
  await page.locator('.menu__tab', { hasText: '시련' }).click()
  if ((await page.locator('.menu-trials .menu-src__source').count()) !== 8) throw new Error('시련: 시련 카드가 여덟이 아닙니다.')
  await page.locator('.menu-trials .menu-src__source').filter({ hasText: '유리 몸' }).getByRole('button', { name: '1', exact: true }).click()
  const trial = await page.evaluate(() => ({ id: window.__game.trialSystem.active?.id, legend: window.__game.legend.active, maxHp: window.__game.combat.health.max }))
  if (trial.id !== 'glass' || !trial.legend) throw new Error(`시련: 유리 몸 1단계가 열리지 않습니다 ${JSON.stringify(trial)}`)
  console.log(`시련 확인: 성소에서 시련 탭으로 유리 몸 1단계를 열고 전설이 시작됨 (최대 생명 ${trial.maxHp})`)

  // 균열 (E17): 한계를 깨면 마을의 균열 탭에서 들어가고, 층을 깨면 축복을 골라 다음 층 문으로 내려가며, 나가는 문으로 나오면 끝
  await page.evaluate(() => {
    const g = window.__game
    if (g.legend.active) g.legend.abort(g.encounter, g.growth.legendHost())
    g.reachEnding()
    for (const realm of ['norse', 'greek', 'china', 'japan', 'korea']) g.threat.cleared[realm] = 10
    Object.assign(g.threat, { unlocked: 10, reached: 10 })
    // 새로 고친 뒤라 대화 장면이 다시 켜져 있다 (한계를 깸 장면이 메뉴를 가리지 않게)
    g.storyScenes = false
    g.threatSystem.breakLimit()
    g.enterRegion(g.regions.village)
    if (!g.combat.alive) g.dev.revive()
  })
  if ((await page.evaluate(() => window.__game.threat.unlocked)) !== 11) throw new Error('균열: 한계를 깼는데 위협 11단계가 열리지 않습니다.')
  if (!(await page.locator('.menu').isVisible())) await page.click('.menu-button')
  await page.locator('.menu__tab', { hasText: '균열' }).click()
  await page.getByRole('button', { name: '균열에 들어가기' }).click()
  const floor1 = await page.evaluate(() => ({ region: window.__game.region.id, depth: window.__game.riftSystem.run?.depth }))
  if (floor1.region !== 'rift' || floor1.depth !== 1) throw new Error(`균열: 1층에 들어가지 않습니다 ${JSON.stringify(floor1)}`)
  await page.evaluate(() => {
    window.__game.encounter.clearAll()
    window.__game.riftSystem.update(0.1)
  })
  await page.waitForSelector('.blessing button', { timeout: 5000 })
  await page.locator('.blessing button').first().click()
  const floor2 = await page.evaluate(() => {
    const g = window.__game
    const p = g.riftSystem.run.floor.portal
    g.hero.teleport(p.x, p.z)
    g.riftSystem.update(0.1)
    g.stage.flush()
    g.encounter.flushNeighbors()
    // 균열은 세계 밖 따로 된 공간 (E19-06): 이웃 땅 조각·무리·통로가 없다
    return { depth: g.riftSystem.run?.depth, blessings: g.riftSystem.run?.blessings.length, region: g.region.id, chunks: g.stage.others.size, parked: g.encounter.parkedGiants.length, links: g.world.links.length }
  })
  if (floor2.depth !== 2 || floor2.blessings !== 1) throw new Error(`균열: 축복을 고르고 문에 닿았는데 2층이 아닙니다 ${JSON.stringify(floor2)}`)
  if (floor2.chunks || floor2.parked || floor2.links) throw new Error(`균열: 세계 밖인데 이웃 땅이 붙어 있습니다 ${JSON.stringify(floor2)}`)
  // 나가는 문: 밀려서(걸어가던 곳이 아닌데) 밟으면 그대로, 문으로 걸어가면 나간다
  const pushed = await page.evaluate(() => {
    const g = window.__game
    g.encounter.clearAll()
    const exit = g.region.exits[0]
    g.hero.teleport(exit.x + 4, exit.z)
    g.advance(0.2, 1 / 30)
    g.hero.teleport(exit.x, exit.z)
    g.advance(0.5, 1 / 30)
    return { region: g.region.id, traveling: g.world.traveling, run: g.riftSystem.run !== null }
  })
  if (pushed.region !== 'rift' || pushed.traveling || !pushed.run) throw new Error(`균열: 걸어가지 않았는데 나가는 문이 열립니다 ${JSON.stringify(pushed)}`)
  // 땅을 누른 이동이 아니면(문 곁의 적을 쫓을 때 등) 문 위를 지나가도 나가지 않는다
  const chased = await page.evaluate(() => {
    const g = window.__game
    const exit = g.region.exits[0]
    g.hero.teleport(exit.x + 4, exit.z)
    g.advance(0.2, 1 / 30)
    g.orders.clear()
    g.hero.moveTo(exit)
    g.advance(3, 1 / 30)
    return { region: g.region.id, traveling: g.world.traveling, run: g.riftSystem.run !== null }
  })
  if (chased.region !== 'rift' || chased.traveling || !chased.run) throw new Error(`균열: 땅을 누르지 않았는데 나가는 문이 열립니다 ${JSON.stringify(chased)}`)
  const left = await page.evaluate(() => {
    const g = window.__game
    const exit = g.region.exits[0]
    g.hero.teleport(exit.x + 4, exit.z)
    g.advance(0.2, 1 / 30)
    g.orders.press({ x: exit.x, z: exit.z }, null)
    g.advance(3, 1 / 30)
    return { run: g.riftSystem.run, best: g.rift.best, region: g.region.id }
  })
  if (left.run || left.best < 1 || left.region !== 'village') throw new Error(`균열: 나가는 문으로 걸어갔는데 끝나지 않았습니다 ${JSON.stringify(left)}`)
  console.log('균열 확인: 한계를 깨고 마을에서 들어가, 1층을 깨 축복을 고르고 2층으로, 밀려 밟거나 적을 쫓다 밟은 나가는 문은 닫혀 있고 땅을 눌러 걸어가면 나와 끝')

  // 개발 패널: ?dev 는 평소 플레이에 오른쪽 아래 패널만 더한다 (저장 없이 보려고 점검용 실행 ?relics= 와 함께). 단추로 유물·적·전설을 바로 바꿔 본다.
  await page.goto(`${URL}?dev&relics=&region=midgard`)
  await page.waitForSelector('.devpanel button', { timeout: 15000 })
  const devTab = (name) => page.locator('.devpanel__tab', { hasText: name }).click()
  const devButton = (label) => page.locator('.devpanel__page:not([hidden])').getByRole('button', { name: label, exact: true })
  // 처음에는 접혀 오른쪽 아래 작은 꼬리표만: 화면 오른쪽 아래 구석에 있고, 펴면 단추가 보인다
  if (await page.locator('.devpanel__body').isVisible()) throw new Error('개발 패널: 처음부터 펴져 있습니다.')
  const folded = await page.locator('.devpanel').boundingBox()
  const viewport = page.viewportSize()
  if (!folded || folded.width > 160 || folded.height > 40 || folded.y + folded.height < viewport.height - 60 || folded.x + folded.width < viewport.width - 60) throw new Error(`개발 패널: 접힌 꼬리표가 오른쪽 아래 구석이 아닙니다 ${JSON.stringify(folded)}`)
  await page.click('.devpanel__fold')
  if (!(await page.locator('.devpanel__body').isVisible())) throw new Error('개발 패널: 펴기가 동작하지 않습니다.')
  await devTab('유물')
  // 유물은 신화권 → 클래스로 묶여 있고, 클래스 이름을 누르면 그 묶음을 낀다 (닫힌 신화권은 열어서)
  await devButton('토르').click()
  if ((await page.evaluate(() => window.__game.powers.manifested)) !== 'thor') throw new Error('개발 패널: 토르 묶음 실패')
  await page.locator('.devpanel__realmName', { hasText: '히든' }).click()
  await devButton('아수라왕').click()
  if ((await page.evaluate(() => window.__game.powers.manifested)) !== 'asura') throw new Error('개발 패널: 아수라왕 묶음(함께 쓰는 칼 포함) 실패')
  const realms = await page.locator('.devpanel__page:not([hidden]) .devpanel__realmName').allTextContents()
  if (realms.length !== 6) throw new Error(`개발 패널: 신화권 묶음이 ${realms.length}개 (${realms.join(', ')})`)
  await devTab('세계')
  const enemiesBefore = await page.evaluate(() => window.__game.encounter.alive.length)
  await devButton('×6').click()
  await page.selectOption('.devpanel__page:not([hidden]) .devpanel__select >> nth=1 >> select', 'grunt')
  await devButton('적 부르기').click()
  if ((await page.evaluate(() => window.__game.encounter.alive.length)) !== enemiesBefore + 6) throw new Error('개발 패널: 졸개 소환 실패')
  await devTab('보기')
  await devButton('충돌').click()
  await devButton('길찾기').click()
  await page.waitForTimeout(300)
  await devTab('세계')
  await devButton('적 모두 제거').click()
  if ((await page.evaluate(() => window.__game.encounter.alive.length)) !== 0) throw new Error('개발 패널: 모두 제거 실패')
  // 지도 편집기 (E7-01): 편집을 켜고 땅을 누르면 이동 대신 고른 소품이 놓이고, 되돌리기로 돌아간다
  await devTab('지도')
  await devButton('편집').click()
  await page.selectOption('.devpanel__page:not([hidden]) select[aria-label="도구"]', 'runestone')
  const beforeEdit = await page.evaluate(() => ({ props: window.__game.region.props.length, x: window.__game.hero.object.position.x }))
  await page.mouse.click(220, 300)
  await page.waitForFunction((n) => window.__game.region.props.length === n + 1, beforeEdit.props, { timeout: 15000 })
  if ((await page.evaluate(() => window.__game.region.props.at(-1).kind)) !== 'runestone') throw new Error('지도 편집기: 고른 소품이 아닙니다')
  if (await page.evaluate(() => window.__game.hero.isMoving)) throw new Error('지도 편집기: 편집 중 클릭이 이동 지시로 샜습니다')
  await devButton('되돌리기').click()
  await page.waitForFunction((n) => window.__game.region.props.length === n, beforeEdit.props, { timeout: 15000 })
  await devButton('편집').click()
  console.log('지도 편집기 확인: 편집 켜고 소품 놓기(이동 지시 없음), 되돌리기')
  await devTab('신화')
  await devButton('전설 시작').click()
  await page.waitForFunction(() => window.__game.legend.phase === 'wave', null, { timeout: 15000 })
  await page.screenshot({ path: 'test-results/devpanel.png' }).catch(() => {})
  console.log('개발 패널 확인: 오른쪽 아래에 접힌 채 시작·펴기, 신화권·신화별 유물 묶음, 적 소환·제거, 충돌·길찾기 보기, 전설 바로 시작')

  mkdirSync('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/smoke.png' })

  // 장 흐름을 끝까지 (E22-05): 새 판에서 목표를 차례로 건너뛰면 마지막 보스 뒤 엔딩, 결계가 모두 풀리고 목표 한 줄이 사라진다
  // 앞 페이지는 닫는다: 소프트웨어 렌더링이라 두 게임이 함께 돌면 새 페이지가 CI에서 90초 안에 뜨지 않는다 (troubleshooting.md)
  await page.close()
  const end = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  end.on('pageerror', (e) => errors.push(e.message))
  // 이어진 세계(E19)는 이웃 땅까지 지어 처음 여는 데 오래 걸린다. 모든 자원(load)이 아니라 게임이 도는 것을 기다린다
  await end.goto(`${URL}?fresh&noscenes`, { timeout: 90000, waitUntil: 'domcontentloaded' })
  await end.waitForFunction(() => (window.__game?.frame ?? 0) > 2 && window.__game.playing, null, { timeout: 120000 })
  const ending = await end.evaluate(() => {
    const g = window.__game
    const chapters = []
    // 땅 차례 (E236-01): 제1장에서 신화를 고르기 전에는 요툰헤임·우트가르드가 막혀 있다
    let early = null
    for (let i = 0; i < 30 && g.chapters.goal; i++) {
      if (!early && g.chapters.chapter?.id === 'north' && g.chapters.goal?.kind === 'choose') early = { jotunheim: g.chapters.isOpen('jotunheim'), utgard: g.chapters.isOpen('utgard') }
      const id = g.chapters.chapter?.id
      if (chapters.at(-1) !== id) chapters.push(id)
      g.skipGoal()
      g.advance(2, 1 / 30)
    }
    g.advance(1, 1 / 30)
    return { chapters, early, ending: g.ending.reached, region: g.region.id, barriers: g.barrierSpots.length, log: g.log.filter((e) => e.type === 'ending').length, frame: g.frame }
  })
  // 목표 한 줄은 화면을 그릴 때 바뀐다
  await end.waitForFunction((f) => window.__game.frame > f + 2, ending.frame, { timeout: 60000 })
  ending.goal = await end.evaluate(() => !document.querySelector('.chapter-goal').hidden)
  await end.close()
  if (!ending.ending || ending.log !== 1 || ending.barriers > 0 || ending.goal) throw new Error(`장 흐름: 끝까지 가도 엔딩이 아닙니다 ${JSON.stringify(ending)}`)
  if (!ending.early || ending.early.jotunheim || ending.early.utgard) throw new Error(`땅 차례: 신화를 고르기 전에 요툰헤임·우트가르드가 열려 있습니다 ${JSON.stringify(ending.early)}`)
  console.log(`엔딩 확인: ${ending.chapters.join(' → ')} → 갈라진 하늘의 왕을 이기면 엔딩, 결계가 모두 풀리고 목표 한 줄이 사라짐 (신화를 고르기 전에는 요툰헤임·우트가르드가 막힘)`)

  // 휴대폰 (E235): 세로로 든 터치 기기에서 끌기 = 떠다니는 조이스틱으로 걷기, 떼면 멈춤, 톡 = 그곳까지, 두 손가락 = 확대,
  // 가로로 들면 돌려 달라는 안내와 멈춤. 손가락은 캔버스에 포인터 사건을 보내 흉내 낸다
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  phone.on('pageerror', (e) => errors.push(e.message))
  await phone.goto(`${URL}?relics=mjolnir&region=midgard`, { timeout: 90000, waitUntil: 'domcontentloaded' })
  await phone.waitForFunction(() => (window.__game?.frame ?? 0) > 2 && window.__game.playing, null, { timeout: 120000 })
  const phoneFrames = async (n) => {
    const f = await phone.evaluate(() => window.__game.frame)
    await phone.waitForFunction((t) => window.__game.frame >= t, f + n, { timeout: 60000 })
  }
  const finger = (type, id, x, y) =>
    phone.evaluate(([type, id, x, y]) => {
      const target = type === 'pointerdown' ? window.__game.pixel.renderer.domElement : window
      target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: id === 1 }))
    }, [type, id, x, y])
  const phoneState = () =>
    phone.evaluate(() => {
      const g = window.__game
      const p = g.hero.object.position
      const cam = g.view.camera
      return { touch: g.touch && document.documentElement.classList.contains('is-touch'), x: p.x, z: p.z, moving: g.hero.isMoving, view: g.view.viewHeight, across: cam.right - cam.left, stick: !document.querySelector('.stick').hidden, order: g.ctx.orders.order?.kind ?? null, paused: g.paused, rotate: !document.querySelector('.rotate-hint').hidden }
    })
  const p0 = await phoneState()
  if (!p0.touch) throw new Error('휴대폰: 터치 기기로 알아보지 못합니다.')
  if (Math.abs(p0.across - p0.view * 0.8) > 0.5) throw new Error(`휴대폰: 세로 화면 가로에 시야 높이의 0.8배가 보이지 않습니다 (${p0.across.toFixed(1)}m)`)
  await finger('pointerdown', 1, 195, 650)
  for (const y of [640, 625, 610, 600]) {
    await finger('pointermove', 1, 195, y)
    await phoneFrames(1)
  }
  await phoneFrames(10)
  const p1 = await phoneState()
  if (!p1.stick || !p1.moving || Math.hypot(p1.x - p0.x, p1.z - p0.z) < 0.5) throw new Error(`휴대폰: 끌어도 조이스틱 쪽으로 걷지 않습니다 ${JSON.stringify(p1)}`)
  await finger('pointerup', 1, 195, 600)
  await phoneFrames(2)
  const p2 = await phoneState()
  if (p2.stick || p2.moving) throw new Error(`휴대폰: 손을 떼도 멈추지 않습니다 ${JSON.stringify(p2)}`)
  // 땅 톡: 조이스틱으로 걸은 거리가 프레임 빠르기마다 달라 정한 화면 자리는 나무·막힌 땅일 수 있다.
  // 주인공에게서 4m 떨어진 걸을 수 있고 곧장 보이는 땅을 골라 그 화면 자리를 누른다 (근처 적을 누른 것이 되지 않게 적은 치운다)
  await phone.evaluate(() => window.__game.encounter.clearAll())
  await phoneFrames(10)
  const ground = await phone.evaluate(() => {
    const g = window.__game
    const p = g.hero.object.position
    const nav = g.hero.nav
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      const to = { x: p.x + Math.sin(a) * 4, z: p.z + Math.cos(a) * 4 }
      if (nav.isBlocked(to) || !nav.hasLineOfSight({ x: p.x, z: p.z }, to)) continue
      const point = p.clone().set(to.x, p.y, to.z).project(g.view.camera)
      const size = g.renderSize
      const height = document.getElementById('app').clientHeight
      return { x: ((point.x + 1) / 2) * size.width * size.scale, y: height - ((point.y + 1) / 2) * size.height * size.scale }
    }
    return null
  })
  if (!ground) throw new Error('휴대폰: 주인공 둘레에 걸어갈 땅이 없습니다')
  await finger('pointerdown', 1, ground.x, ground.y)
  await finger('pointerup', 1, ground.x, ground.y)
  await phoneFrames(2)
  const p3 = await phoneState()
  if (p3.order !== 'move' || !p3.moving) throw new Error(`휴대폰: 땅을 톡 눌러도 걷지 않습니다 ${JSON.stringify(p3)}`)
  // 적을 톡하면 그 적을 공격하라는 지시 (멈춰 세우고 카메라가 따라온 뒤, 몸통을 조금 비켜 누른다)
  await phone.evaluate(() => {
    const g = window.__game
    g.ctx.orders.clear()
    g.hero.stop()
  })
  await phoneFrames(20)
  const foe = await phone.evaluate(() => {
    const g = window.__game
    const p = g.hero.object.position
    window.__tapTarget = g.encounter.spawnGrunt(p.x + 3, p.z - 3)
    window.__tapTarget.update = () => {}
    const point = window.__tapTarget.object.position.clone()
    point.y += 1.2
    point.project(g.view.camera)
    const size = g.renderSize
    const height = document.getElementById('app').clientHeight
    return { x: ((point.x + 1) / 2) * size.width * size.scale + 10, y: height - ((point.y + 1) / 2) * size.height * size.scale }
  })
  await finger('pointerdown', 1, foe.x, foe.y)
  await finger('pointerup', 1, foe.x, foe.y)
  await phoneFrames(2)
  if (!(await phone.evaluate(() => window.__game.ctx.orders.attackTarget === window.__tapTarget))) throw new Error(`휴대폰: 적을 톡 눌러도 공격 지시가 되지 않습니다 ${JSON.stringify(await phoneState())}`)
  await phone.evaluate(() => {
    const g = window.__game
    g.ctx.orders.clear()
    g.encounter.clearAll()
  })
  await finger('pointerdown', 1, 150, 420)
  await finger('pointerdown', 2, 240, 420)
  for (const d of [10, 25, 40]) {
    await finger('pointermove', 1, 150 - d, 420)
    await finger('pointermove', 2, 240 + d, 420)
    await phoneFrames(1)
  }
  await finger('pointerup', 2, 280, 420)
  await finger('pointerup', 1, 110, 420)
  await phoneFrames(2)
  const p4 = await phoneState()
  if (p4.view >= p3.view - 1) throw new Error(`휴대폰: 두 손가락을 벌려도 확대되지 않습니다 (${p3.view} → ${p4.view})`)
  await phone.setViewportSize({ width: 844, height: 390 })
  await phone.waitForFunction(() => !document.querySelector('.rotate-hint').hidden && window.__game.paused, null, { timeout: 30000 }).catch(() => {
    throw new Error('휴대폰: 가로로 들어도 돌려 달라는 안내가 뜨지 않거나 멈추지 않습니다.')
  })
  await phone.setViewportSize({ width: 390, height: 844 })
  await phone.waitForFunction(() => document.querySelector('.rotate-hint').hidden && !window.__game.paused, null, { timeout: 30000 }).catch(() => {
    throw new Error('휴대폰: 다시 세로로 들어도 안내가 남아 있습니다.')
  })
  await phone.close()
  console.log(`휴대폰 확인: 세로 화면 가로 ${p0.across.toFixed(1)}m, 끌기 → 조이스틱으로 걷기, 떼면 멈춤, 톡 → 그곳까지·적이면 공격, 두 손가락 ${p3.view.toFixed(0)}m → ${p4.view.toFixed(0)}m, 가로로 들면 안내와 멈춤`)
  await browser.close()

  if (errors.length) {
    failed = true
    console.error('브라우저 오류:', errors)
  } else {
    console.log(`스모크 통과: ${frames}프레임 렌더링, 오류 없음`)
  }
} catch (e) {
  failed = true
  console.error(e)
} finally {
  stop()
}
process.exit(failed ? 1 : 0)
