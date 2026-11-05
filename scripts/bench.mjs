// 성능 측정 (E9, E306 D23): 적 40마리가 주인공을 둘러싼 싸움에서 한 프레임에 드는 것을 잰다.
// 사용법: npm run build && node scripts/bench.mjs [적 수=40] [화질=normal|low|high] [--region=midgard] [--boss=typhon] [--size=1280x720] [--ride] [--runs=3] [--matrix] [--dist=폴더]
// - 이웃 땅 조각·무리를 다 지은 뒤(stage.flush·encounter.flushNeighbors) 30프레임을 데우고 180프레임을 잰다. 이를 runs번 하고 중앙값을 쓴다
// - --boss=적 id: 그 적을 주인공 6m 앞에 더 세운다 (예: 올림포스의 티폰). --ride: 산양에 탄 채로. --size: 세로 화면이면 터치 휴대폰으로 연다
// - --matrix: 브라우저 하나로 견줄 판(데스크톱·휴대폰 × 미드가르드·올림포스 × 화질)을 다 돌린다
// - --dist=폴더: 다른 빌드(같은 세션의 main 등)를 잰다 (vite preview --outDir)
// 이 환경은 소프트웨어 렌더링이라 fps 대신 게임 갱신 시간(CPU)·그리기 호출·삼각형 수를 본다. 결과는 test-results/bench.json
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const argv = process.argv.slice(2)
const flag = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const plain = argv.filter((a) => !a.startsWith('--'))
const COUNT = Number(plain[0] ?? 40)
const QUALITY = plain[1] ?? 'normal'
const RUNS = Number(flag('runs') ?? 3)
const DIST = flag('dist')
const MATRIX = argv.includes('--matrix')
const PORT = 4193
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', ...(DIST ? ['--outDir', DIST] : [])], { stdio: 'ignore', detached: true })
const stop = () => {
  try {
    process.kill(-server.pid)
  } catch {}
}

/** 한 판: 땅·화질·크기·보스·탄 채로 */
const one = { region: flag('region') ?? 'midgard', quality: QUALITY, size: flag('size') ?? '1280x720', boss: flag('boss') ?? null, ride: argv.includes('--ride') }
/** 견줄 판 (E306 D23): ① 미드가르드 세 화질 ② 올림포스 티폰 있음·없음 ③ 휴대폰 세로 ④ 탄 채로·갈라진 하늘 */
const MATRIX_CASES = [
  { region: 'midgard', quality: 'normal', size: '1280x720' },
  { region: 'midgard', quality: 'low', size: '1280x720' },
  { region: 'midgard', quality: 'high', size: '1280x720' },
  { region: 'olympus', quality: 'normal', size: '1280x720' },
  { region: 'olympus', quality: 'normal', size: '1280x720', boss: 'typhon' },
  { region: 'olympus', quality: 'low', size: '1280x720', boss: 'typhon' },
  { region: 'midgard', quality: 'normal', size: '390x844' },
  { region: 'midgard', quality: 'low', size: '390x844' },
  { region: 'olympus', quality: 'normal', size: '390x844', boss: 'typhon' },
  { region: 'olympus', quality: 'low', size: '390x844', boss: 'typhon' },
  { region: 'midgard', quality: 'normal', size: '1280x720', ride: true },
  { region: 'finale', quality: 'normal', size: '1280x720' },
].map((c) => ({ boss: null, ride: false, ...c }))

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const label = (c) => `${c.size} ${c.region}${c.boss ? `+${c.boss}` : ''}${c.ride ? ' 탄 채로' : ''} ${c.quality}`

/** 페이지 안에서 돈다: 적을 세우고 갱신·그리기를 잰다 (한 번) */
function measure({ count, boss, ride }) {
  const g = window.__game
  // 이웃 땅 조각과 무리를 다 짓는다 (짓는 프레임이 재는 데 섞이지 않게)
  g.stage.flush()
  g.encounter.flushNeighbors()
  g.encounter.clearAll()
  g.combat.health.reset()
  g.orders.clear()
  const p = g.hero.object.position
  if (ride) g.dev.ride(20)
  // 여러 몸 종류를 섞어 둘레에 세운다 (가만히 두면 다가와 싸운다)
  const ids = ['grunt', 'wolf', 'draugr', 'stoneThrower', 'harpy', 'oni', 'dokkaebiFire', 'imugi']
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    const r = 5 + (i % 3) * 2
    g.encounter.spawnById(ids[i % ids.length], { x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r }, true)
  }
  if (boss) g.encounter.spawnById(boss, { x: p.x, z: p.z - 6 }, true)
  // 30프레임 데우고 1/60초씩 180번(3초)을 잰다. 주인공이 쓰러지지 않게 (싸움이 계속되게)
  const times = []
  for (let i = 0; i < 210; i++) {
    const t0 = performance.now()
    g.advance(1 / 60, 1 / 60)
    if (i >= 30) times.push(performance.now() - t0)
    g.combat.health.reset()
  }
  times.sort((a, b) => a - b)
  g.view.jumpTo(g.hero.object.position)
  // 세 번 그리고 마지막 값을 센다 (첫 그리기는 셰이더를 지을 수 있다)
  const info = g.pixel.renderer.info
  const draw = () => {
    info.autoReset = false
    info.reset()
    const r0 = performance.now()
    g.pixel.render(g.scene, g.view.camera, g.view.subpixel)
    const ms = performance.now() - r0
    info.autoReset = true
    return { calls: info.render.calls, triangles: info.render.triangles, ms }
  }
  let last = draw()
  for (let i = 0; i < 2; i++) last = draw()
  // 그림자 패스 몫: 켜진 판이면 잠깐 끄고 세 번 그려 견준다
  const sun = g.stage.sun
  let noShadow = null
  if (sun.castShadow) {
    sun.castShadow = false
    for (let i = 0; i < 3; i++) noShadow = draw()
    sun.castShadow = true
    draw()
  }
  let meshes = 0
  g.scene.traverse((o) => (meshes += o.isMesh && o.visible ? 1 : 0))
  const box = sun.shadow.camera
  return {
    enemies: g.encounter.alive.length,
    updateMs: { median: times[90], p95: times[171], max: times[179] },
    drawCalls: last.calls,
    triangles: last.triangles,
    renderMsSoftware: Math.round(last.ms),
    shadowPass: noShadow ? { calls: last.calls - noShadow.calls, triangles: last.triangles - noShadow.triangles, ms: Math.round(last.ms - noShadow.ms) } : null,
    meshes,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    renderSize: `${g.pixel.size.width}×${g.pixel.size.height}`,
    scale: Math.round(g.pixel.size.scale * 1000) / 1000,
    shadows: sun.castShadow,
    shadowBox: Math.round((box.right - box.left) * 10) / 10,
    riding: g.hero.riding,
    touch: g.touch,
  }
}

/** 한 판을 runs번 재고 중앙값을 낸다 */
async function bench(browser, c) {
  const [width, height] = c.size.split('x').map(Number)
  const phone = height > width
  const page = await browser.newPage({ viewport: { width, height }, ...(phone ? { hasTouch: true, isMobile: true } : {}) })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`http://localhost:${PORT}/?relics=mjolnir,megingjord,jarngreipr&region=${c.region}&quality=${c.quality}`, { timeout: 90000 })
  await page.waitForFunction(() => (window.__game?.frame ?? 0) > 3, null, { timeout: 90000 })
  const runs = []
  for (let i = 0; i < RUNS; i++) runs.push(await page.evaluate(measure, { count: COUNT, boss: c.boss, ride: c.ride }))
  await page.close()
  const last = runs[runs.length - 1]
  const result = {
    ...c,
    ...last,
    updateMs: {
      median: median(runs.map((r) => r.updateMs.median)),
      p95: median(runs.map((r) => r.updateMs.p95)),
      max: median(runs.map((r) => r.updateMs.max)),
    },
    drawCalls: median(runs.map((r) => r.drawCalls)),
    triangles: median(runs.map((r) => r.triangles)),
    renderMsSoftware: median(runs.map((r) => r.renderMsSoftware)),
    runs: runs.length,
    errors,
  }
  const ms = (v) => `${v.toFixed(2)}ms`
  const sp = result.shadowPass
  console.log(
    `${label(c)}: 적 ${result.enemies}마리, 렌더 ${result.renderSize}(×${result.scale}) | 갱신 중앙값 ${ms(result.updateMs.median)}·95% ${ms(result.updateMs.p95)}·최대 ${ms(result.updateMs.max)} | ` +
      `그리기 호출 ${result.drawCalls}, 삼각형 ${result.triangles}, 메시 ${result.meshes}, 그림자 ${result.shadows ? `켬(상자 ${result.shadowBox}m, 몫 ${sp?.calls ?? 0}호출·${sp?.triangles ?? 0}삼각형)` : '끔'}` +
      (c.ride ? `, 탐 ${result.riding}` : '') +
      (errors.length ? ` | 오류 ${errors.length}` : ''),
  )
  return result
}

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
  const cases = MATRIX ? MATRIX_CASES : [one]
  const results = []
  for (const c of cases) results.push(await bench(browser, c))
  await browser.close()
  mkdirSync('test-results', { recursive: true })
  // 한 판이면 예전 모양 그대로(그 판의 값), --matrix면 판마다
  writeFileSync('test-results/bench.json', JSON.stringify(MATRIX ? { dist: DIST ?? 'dist', count: COUNT, runs: RUNS, cases: results } : { dist: DIST ?? 'dist', ...results[0] }, null, 2))
  if (results.some((r) => r.errors.length)) process.exitCode = 1
} finally {
  stop()
}
