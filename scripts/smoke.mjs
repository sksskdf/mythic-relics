// 빌드 결과를 실제 브라우저로 열어, 화면이 그려지고 오류가 없는지 확인한다.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const PORT = 4173
const URL = `http://localhost:${PORT}/`
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' })
const stop = () => server.kill('SIGTERM')

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
  await page.waitForFunction(() => (window.__game?.frame ?? 0) > 10, null, { timeout: 15000 })
  const frames = await page.evaluate(() => window.__game.frame)

  // 시작 화면: 처음 실행이면 로딩이 끝난 뒤 저장 슬롯 3개(모두 빈 슬롯). 빈 슬롯 → 캐릭터 만들기 → [시작]
  await page.waitForSelector('.title-slot', { timeout: 15000 })
  const emptySlots = await page.locator('.title-slot.is-empty').count()
  if (emptySlots !== 3) throw new Error(`시작 화면: 빈 슬롯이 ${emptySlots}개입니다.`)
  await page.locator('.title-slot').first().click()
  await page.locator('.title-swatch').nth(2).click()
  await page.click('.title__button--primary')
  await page.waitForFunction(() => window.__game.playing, null, { timeout: 5000 })
  const skin = await page.evaluate(() => window.__game.wardrobe.body.skin)
  if (skin !== 2) throw new Error(`캐릭터 만들기: 고른 피부가 ${skin}입니다.`)
  console.log('시작 화면 확인: 빈 슬롯 → 캐릭터 만들기(피부 고름) → [시작]으로 플레이 시작')

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
  console.log('클릭 확인: 몬스터를 누르면 공격 지시')

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
    g.devTeleport(2, -3)
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

  // 유물 점검: 떨어진 유물 위에 서면 저절로 줍고, 토르 유물 3개가 모이면 발현된다.
  await page.evaluate(() => {
    const g = window.__game
    const p = g.hero.object.position
    g.pickups.drop('megingjord', p.x, p.z)
  })
  await page.waitForFunction(() => window.__game.powers.loadout.has('megingjord'), null, { timeout: 15000 })
  if ((await page.evaluate(() => window.__game.hero.rig.outfit.waist)) !== 'megingjordBelt') throw new Error('외형: 줍자마자 허리띠가 보이지 않습니다.')
  await lookShot('2-one-relic')
  await page.evaluate(() => window.__game.devEquip('jarngreipr'))
  await lookShot('3-two-relics')
  const manifested = await page.evaluate(() => {
    const g = window.__game
    g.devEquip('mjolnir')
    return g.powers.manifested
  })
  if (manifested !== 'thor') throw new Error(`발현 실패: ${manifested}`)
  if ((await page.evaluate(() => window.__game.hero.rig.outfit.head)) !== 'thorHelm') throw new Error('외형: 발현했는데 모습이 그대로입니다.')
  // 발현 번개가 걷히고 나서 찍는다.
  await lookShot('4-manifest', 12)
  // 왼쪽 위 상태: 발현한 클래스 초상과 레벨 보석
  if ((await page.locator('.hud__portrait.is-empty').count()) !== 0) throw new Error('상태: 발현했는데 초상이 비어 있습니다.')
  // 정보 화면(E4): 문장 단추로 열면 게임이 멈추고 상태 탭부터 보인다.
  await page.click('.menu-button')
  if (!(await page.evaluate(() => window.__game.paused))) throw new Error('정보 화면: 열었는데 게임이 멈추지 않습니다.')
  const statRows = await page.locator('.menu-status__stat').count()
  if (statRows !== 8) throw new Error(`상태 탭: 능력치 줄이 ${statRows}개입니다.`)
  await page.screenshot({ path: 'test-results/menu-status.png' })
  // 유물 탭: 유물을 가방에 넣고 다시 끼면 HUD·외형·발현이 바로 바뀐다.
  await page.locator('.menu__tab').nth(2).click()
  const beltSlot = await page.evaluate(() => window.__game.powers.loadout.slots.indexOf('megingjord'))
  await page.locator('.menu-relics__slot').nth(beltSlot).click()
  await page.getByRole('button', { name: '가방에 넣기' }).click()
  const stowed = await page.evaluate(() => {
    const g = window.__game
    return { manifested: g.powers.manifested, waist: g.hero.rig.outfit.waist, bag: [...g.powers.loadout.bag] }
  })
  if (stowed.manifested !== null || stowed.waist !== null || !stowed.bag.includes('megingjord')) throw new Error(`정보 화면: 가방에 넣기 실패 ${JSON.stringify(stowed)}`)
  await page.locator('.menu-relics__item').first().hover()
  if (!(await page.locator('.rc__preview').textContent()).includes('발현')) throw new Error('정보 화면: 끼우면 발현한다는 미리 보기가 없습니다.')
  await page.locator('.menu-relics__item').first().click()
  if ((await page.evaluate(() => window.__game.powers.manifested)) !== 'thor') throw new Error('정보 화면: 다시 끼웠는데 발현하지 않습니다.')
  await page.click('.menu__tab:nth-child(4)')
  if (!(await page.locator('.menu-classes__now').textContent()).includes('천둥의 신')) throw new Error('정보 화면: 클래스 탭에 지금 클래스가 없습니다.')
  await page.keyboard.press('Escape')
  if (await page.evaluate(() => window.__game.paused)) throw new Error('정보 화면: 닫았는데 게임이 멈춰 있습니다.')
  // 순환 탭: 결정이 있으면 단련할 수 있다
  await page.evaluate(() => {
    window.__game.cycle.essence.flame = 100
    window.__game.cycle.opened.add('train')
  })
  await page.click('.menu-button')
  await page.locator('.menu__tab').nth(1).click()
  await page.locator('.menu-cycle__train').first().click()
  if ((await page.evaluate(() => window.__game.cycle.training.flame)) !== 1) throw new Error('순환 탭: 불꽃 단련이 오르지 않았습니다.')
  await page.keyboard.press('Escape')
  console.log('순환 확인: 결정으로 불꽃 단련 Lv1')
  console.log('정보 화면 확인: 상태 탭 능력치 8줄, 열면 멈춤, 가방에 넣기·다시 끼기와 미리 보기, 클래스 탭, Esc로 닫기')

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
  console.log('유물·외형 확인: 메긴교르드 줍기, 토르 유물 3개로 발현, 부위별 외형과 보관함 (test-results/look-*.png)')

  // 승급 전설 점검: 경험치 바를 채우고 성소에 서면 「우트가르드 원정」이 시작된다.
  await page.evaluate(() => {
    const g = window.__game
    g.progress.addXp('thor', 9999)
    g.hero.teleport(g.legend.center.x, g.legend.center.z)
  })
  await page.waitForFunction(() => window.__game.legend.phase === 'wave', null, { timeout: 15000 })
  console.log('승급 전설 확인: 성소에서 시작')

  // 저장 점검: 새로 고침해도 주운 유물을 그대로 끼고 이어 한다.
  await page.evaluate(() => window.__game.saveNow())
  await page.reload()
  await page.waitForFunction(() => (window.__game?.frame ?? 0) > 2, null, { timeout: 15000 })
  // 저장이 있으면 단추 없이 로딩 화면이 걷히고 바로 이어서 플레이한다.
  await page.waitForFunction(() => window.__game?.playing, null, { timeout: 15000 })
  if (await page.locator('.title__button').count()) throw new Error('두 번째 실행인데 시작 단추가 나왔습니다.')
  const restored = await page.evaluate(() => window.__game.powers.loadout.has('megingjord'))
  if (!restored) throw new Error('이어서 플레이 실패: 저장한 유물이 없습니다.')
  if ((await page.evaluate(() => window.__game.hero.rig.outfit.weapon)) !== 'shortSword') throw new Error('이어서 플레이 실패: 고른 외형이 없습니다.')
  console.log('저장 확인: 새로 고침하면 단추 없이 바로 이어서, 유물과 고른 외형 유지')

  // 처음 화면으로: 정보 화면의 단추를 두 번 누르면 저장하고 슬롯 고르기로 돌아가고, 그 슬롯을 누르면 이어 간다.
  await page.click('.menu-button')
  await page.click('.menu__home')
  await page.click('.menu__home')
  await page.waitForSelector('.title-slot:not(.is-empty)', { timeout: 15000 })
  await page.locator('.title-slot:not(.is-empty)').first().click()
  await page.waitForFunction(() => window.__game?.playing, null, { timeout: 15000 })
  if (!(await page.evaluate(() => window.__game.powers.loadout.has('megingjord')))) throw new Error('처음 화면에서 슬롯을 골랐는데 유물이 없습니다.')
  console.log('처음 화면 확인: 정보 화면에서 처음 화면으로, 슬롯을 골라 그대로 이어 감')

  // 개발 패널: ?dev 로 열고 단추로 유물·적·전설을 바로 바꿔 본다.
  await page.goto(`${URL}?dev`)
  await page.waitForSelector('.devpanel button', { timeout: 15000 })
  const devTab = (name) => page.locator('.devpanel__tab', { hasText: name }).click()
  const devButton = (label) => page.locator('.devpanel__page:not([hidden])').getByRole('button', { name: label, exact: true })
  // 접기·펴기: 접으면 단추들이 보이지 않아야 한다.
  await page.click('.devpanel__fold')
  if (await page.locator('.devpanel__body').isVisible()) throw new Error('개발 패널: 접기가 동작하지 않습니다.')
  const folded = await page.locator('.devpanel').boundingBox()
  if (!folded || folded.width > 160 || folded.height > 40) throw new Error(`개발 패널: 접었는데 너무 큽니다 ${JSON.stringify(folded)}`)
  await page.click('.devpanel__fold')
  await devTab('유물')
  await page.selectOption('.devpanel__page:not([hidden]) select', 'thor')
  await devButton('묶음 끼기').click()
  if ((await page.evaluate(() => window.__game.powers.manifested)) !== 'thor') throw new Error('개발 패널: 토르 묶음 실패')
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
  await devTab('클래스')
  await devButton('승급 전설 시작').click()
  await page.waitForFunction(() => window.__game.legend.phase === 'wave', null, { timeout: 15000 })
  await page.screenshot({ path: 'test-results/devpanel.png' }).catch(() => {})
  console.log('개발 패널 확인: 접기·펴기, 유물 장착, 적 소환·제거, 충돌·길찾기 보기, 승급 전설 바로 시작')

  mkdirSync('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/smoke.png' })
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
