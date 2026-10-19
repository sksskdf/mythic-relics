// 성능 측정 (E9): 적 40마리가 주인공을 둘러싼 싸움에서 한 프레임에 드는 것을 잰다.
// 사용법: npm run build && node scripts/bench.mjs [적 수=40] [품질=normal|low|high]
// 이 환경은 소프트웨어 렌더링이라 fps 대신 게임 갱신 시간(CPU)·그리기 호출·삼각형 수를 본다. 결과는 test-results/bench.json
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const COUNT = Number(process.argv[2] ?? 40)
const QUALITY = process.argv[3] ?? 'normal'
const PORT = 4193
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true })
const stop = () => {
  try {
    process.kill(-server.pid)
  } catch {}
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`http://localhost:${PORT}/?relics=mjolnir,megingjord,jarngreipr&region=midgard&quality=${QUALITY}`)
  await page.waitForFunction(() => (window.__game?.frame ?? 0) > 3, null, { timeout: 60000 })
  const result = await page.evaluate(
    ({ count }) => {
      const g = window.__game
      g.encounter.clearAll()
      const p = g.hero.object.position
      // 여러 몸 종류를 섞어 둘레에 세운다 (가만히 두면 다가와 싸운다)
      const ids = ['grunt', 'wolf', 'draugr', 'stoneThrower', 'harpy', 'oni', 'dokkaebiFire', 'imugi']
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2
        const r = 5 + (i % 3) * 2
        g.encounter.spawnById(ids[i % ids.length], { x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r }, true)
      }
      // 게임 갱신만 따로 잰다 (1/60초씩 180번 = 3초)
      const times = []
      for (let i = 0; i < 180; i++) {
        const t0 = performance.now()
        g.advance(1 / 60, 1 / 60)
        times.push(performance.now() - t0)
        // 주인공이 쓰러지지 않게 (싸움이 계속되게)
        g.combat.health.reset()
      }
      times.sort((a, b) => a - b)
      // 한 번 그려서 그리기 호출과 삼각형을 센다
      const info = g.pixel.renderer.info
      info.autoReset = false
      info.reset()
      const r0 = performance.now()
      g.pixel.render(g.scene, g.view.camera, g.view.subpixel)
      const renderMs = performance.now() - r0
      info.autoReset = true
      let meshes = 0
      g.scene.traverse((o) => (meshes += o.isMesh && o.visible ? 1 : 0))
      return {
        enemies: g.encounter.alive.length,
        updateMs: { median: times[90], p95: times[171], max: times[179] },
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        meshes,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        renderMsSoftware: Math.round(renderMs),
        renderSize: `${g.pixel.size.width}×${g.pixel.size.height}`,
        shadows: g.scene.children.some((o) => o.isDirectionalLight && o.castShadow),
      }
    },
    { count: COUNT },
  )
  result.quality = QUALITY
  result.errors = errors
  const ms = (v) => `${v.toFixed(2)}ms`
  console.log(
    `적 ${result.enemies}마리 (${QUALITY}, ${result.renderSize}): 갱신 중앙값 ${ms(result.updateMs.median)}·95% ${ms(result.updateMs.p95)}·최대 ${ms(result.updateMs.max)} | ` +
      `그리기 호출 ${result.drawCalls}, 삼각형 ${result.triangles}, 메시 ${result.meshes}, 그림자 ${result.shadows ? "켬" : "끔"}` +
      (errors.length ? ` | 오류 ${errors.length}` : ''),
  )
  mkdirSync('test-results', { recursive: true })
  writeFileSync('test-results/bench.json', JSON.stringify(result, null, 2))
  await browser.close()
} finally {
  stop()
}
