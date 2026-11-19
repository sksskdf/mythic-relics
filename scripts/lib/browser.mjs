// 점검 스크립트가 띄우는 브라우저의 자리. 컨테이너가 바뀌면 설치 폴더 이름이 바뀌어서(…-1194 → …-1243)
// 스크립트마다 적어 두면 한꺼번에 깨진다. 여기 한 곳에서 고른다:
// CHROMIUM_PATH → 늘 같은 이름의 고리(/opt/pw-browsers/chromium) → 옛 설치 자리 → 없으면 Playwright가 고르게 둔다.
import { existsSync } from 'node:fs'

const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
]

export const BROWSER = CANDIDATES.find((p) => p && existsSync(p))
