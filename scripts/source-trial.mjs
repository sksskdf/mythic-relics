// 원천 빌드 비교 (E14-07): 같은 신화(토르, 묠니르)를 고른 채 원천 하나를 각성 3단계(장비 +18, 숙련 +2)로 몰고 미드가르드에서 떠나지 않고 싸워,
// 1분당 처치 수와 피격을 잰다. 몰지 않은 판(없음)도 함께 잰다.
// 사용법: npm run build && node scripts/source-trial.mjs [판 수=2] [시간(분)=3]
// 결과는 test-results/source-trial.json. 원천 넷의 평균에서 ±25% 밖이면 표시한다 (ROADMAP E14 자동 검증).
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const [runs = '2', minutes = '3'] = process.argv.slice(2)
const NAMES = { none: '몰지 않음', flame: '불꽃', hunt: '사냥', wind: '바람', stone: '바위' }

const rows = []
for (const source of ['none', 'flame', 'hunt', 'wind', 'stone']) {
  const args = ['scripts/playtest.mjs', runs, minutes, '--relics=mjolnir', '--god=thor', '--region=midgard']
  if (source !== 'none') args.push(`--stack=${source}`)
  execFileSync('node', args, { stdio: 'ignore' })
  const results = JSON.parse(readFileSync('test-results/playtest.json', 'utf8'))
  const rates = results.map((r) => r.killRate)
  const mean = Math.round((rates.reduce((s, v) => s + v, 0) / rates.length) * 10) / 10
  const hurt = results.map((r) => r.hurt)
  const deaths = results.map((r) => r.deaths)
  rows.push({ source, rates, mean, hurt, deaths, damageTaken: results.map((r) => r.damageTaken), errors: results.flatMap((r) => r.errors) })
  console.log(`${NAMES[source]}: 1분당 처치 ${rates.join(' / ')} (평균 ${mean}), 피격 ${hurt.join(' / ')}, 받은 피해 ${results.map((r) => r.damageTaken).join(' / ')}, 쓰러짐 ${deaths.join(' / ')}`)
}

const four = rows.filter((r) => r.source !== 'none')
const avg = four.reduce((s, r) => s + r.mean, 0) / four.length
const outside = four.filter((r) => Math.abs(r.mean - avg) > avg * 0.25)
console.log(`원천 넷 평균 ${avg.toFixed(1)}, ±25% ${(avg * 0.75).toFixed(1)}~${(avg * 1.25).toFixed(1)}`)
console.log(outside.length ? `벗어난 원천: ${outside.map((r) => `${NAMES[r.source]} ${r.mean}`).join(', ')}` : '모두 ±25% 안')
mkdirSync('test-results', { recursive: true })
writeFileSync('test-results/source-trial.json', JSON.stringify({ average: avg, rows }, null, 2))
