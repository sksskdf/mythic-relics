// pnpm dev: Vite 개발 서버를 띄우고 Electron 창으로 연다. 창을 닫으면 서버도 함께 끈다.
// pnpm dev --dev (또는 pnpm dev:tools): 개발 패널을 켜고 연다.
// 코드를 고치면 Vite가 창 안의 게임을 바로 다시 불러온다.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'vite'

const require = createRequire(import.meta.url)
const server = await createServer()
await server.listen()
const base = server.resolvedUrls?.local[0]
if (!base) throw new Error('개발 서버 주소를 알 수 없습니다.')
// pnpm dev --dev 처럼 --dev 를 붙이면 개발 패널을 켠다.
const url = process.argv.includes('--dev') ? `${base}?dev` : base
console.log(`개발 서버: ${url}`)

// require('electron')은 Electron 실행 파일 경로를 돌려준다.
const electronPath = require('electron')
// 리눅스에서 root로 돌릴 때(컨테이너 등)는 Chromium 샌드박스를 쓸 수 없다.
const args = process.platform === 'linux' && process.getuid?.() === 0 ? ['.', '--no-sandbox'] : ['.']
// 그래픽 카드가 없는 곳에서 확인할 때는 ELECTRON_ARGS="--use-angle=swiftshader --enable-unsafe-swiftshader" 처럼 넘긴다.
args.push(...(process.env.ELECTRON_ARGS ?? '').split(' ').filter(Boolean))
const child = spawn(electronPath, args, {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
})
const shutdown = async (code = 0) => {
  await server.close()
  process.exit(code)
}
child.on('exit', (code) => shutdown(code ?? 0))
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
