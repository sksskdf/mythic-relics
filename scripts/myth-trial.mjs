// 신화별 처치 속도 비교 (E12-07): 신화마다 자기 유물을 끼고(그 신화를 고른 채) 미드가르드에서 시작해, 떠나지 않고 정해진 시간 동안 1분당 처치 수를 잰다.
// 같은 땅에서 재야 한다: 자기 신화권 필드로 걸어가게 하면 이동 시간과 땅마다 다른 적이 섞인다.
// 사용법: npm run build && node scripts/myth-trial.mjs [판 수=2] [시간(분)=3] [신 id,...]
// 결과는 test-results/myth-trial.json. 중앙값에서 ±20% 밖이면 표시한다 (ROADMAP E12 자동 검증).
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const [runs = '2', minutes = '3', only] = process.argv.slice(2)
const gods = JSON.parse(readFileSync('src/data/gods.json', 'utf8'))
const relics = JSON.parse(readFileSync('src/data/relics.json', 'utf8'))
const ids = Object.keys(gods).filter((id) => !only || only.split(',').includes(id))

const rows = []
for (const god of ids) {
  // 그 신의 유물을 앞에서부터 넷까지 (함께 쓰는 칼은 히든 신화 쪽에도 센다). 첫 유물이 그 신 것이어야 그 신화를 고른다
  const own = Object.keys(relics).filter((r) => relics[r].god === god)
  const shared = Object.keys(relics).filter((r) => relics[r].also?.includes(god))
  const set = [...own, ...shared].slice(0, 4)
  execFileSync('node', ['scripts/playtest.mjs', runs, minutes, `--relics=${set.join(',')}`, `--god=${god}`, '--region=midgard'], { stdio: 'ignore' })
  const results = JSON.parse(readFileSync('test-results/playtest.json', 'utf8'))
  const rates = results.map((r) => r.killRate)
  const mean = Math.round((rates.reduce((s, v) => s + v, 0) / rates.length) * 10) / 10
  const chosen = results[0]?.log.find((e) => e.type === 'open')?.detail ?? god
  rows.push({ god, name: gods[god].name, rates, mean, hurt: results.map((r) => r.hurt), errors: results.flatMap((r) => r.errors), chosen })
  console.log(`${gods[god].name}: 1분당 처치 ${rates.join(' / ')} (평균 ${mean})`)
}

const sorted = rows.map((r) => r.mean).sort((a, b) => a - b)
const median = sorted[Math.floor(sorted.length / 2)] ?? 0
const outside = rows.filter((r) => Math.abs(r.mean - median) > median * 0.2)
console.log(`중앙값 ${median}, ±20% ${(median * 0.8).toFixed(1)}~${(median * 1.2).toFixed(1)}`)
console.log(outside.length ? `벗어난 신화: ${outside.map((r) => `${r.name} ${r.mean}`).join(', ')}` : '모두 ±20% 안')
mkdirSync('test-results', { recursive: true })
writeFileSync('test-results/myth-trial.json', JSON.stringify({ median, rows }, null, 2))
