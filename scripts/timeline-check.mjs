// 시각표 견주기 (E306 D19·D20): 봇 판의 사건 시각을 `CYCLE.md` 6장 90분 시각표와 견준다.
// node scripts/timeline-check.mjs [playtest.json=test-results/playtest.json] [power-curve.json=test-results/power-curve.json]
// - 체크포인트 열(★1~★6, 귀환 1~4)마다 판마다의 봇 분, 세 판 중앙값, 목표(사람 분 가운데 × 0.78), ±15% 판정
// - 구간 길이(앞 체크포인트에서)와 장마다 걸린 분
// - power-curve 기록이 있으면 같은 사건 때의 공격 지수와 6장 「공격 지수 (목표)」 열을 나란히 둔다
// 결과는 test-results/timeline-check.json과 화면에. 봇 판(`npm run playtest N 120 --ending`)을 돌린 뒤에 쓴다 (브라우저를 띄우지 않는다)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const PLAYTEST = process.argv[2] ?? 'test-results/playtest.json'
const CURVE = process.argv[3] ?? 'test-results/power-curve.json'
/** 봇은 사람의 0.7~0.85배 (`CYCLE.md` 6장), 체크포인트는 가운데 0.78로 견준다 */
const BOT = 0.78
const BAND = 0.15
/** 엔딩은 봇 65~75분 (ROADMAP E306) */
const ENDING = { lo: 65, hi: 75 }

/**
 * 체크포인트 (`CYCLE.md` 6장): 사람 분(앞·뒤)과 공격 지수 목표, 판의 시각표에서 그 사건의 초를 고르는 법
 * awakened는 깨어난 차례(첫 신·둘째 신·셋째 신), 장은 그 장이 열린 때(앞 장의 보스를 이긴 때)
 */
const CHECKPOINTS = [
  { id: '★1 첫 신 (요르문간드)', human: [13, 15], attack: 2.6, at: (tl) => Object.values(tl.awakened)[0] },
  { id: '귀환 1', human: [17, 19], attack: 2.9, at: (tl) => tl.returns.find((r) => r.n === 1)?.t },
  { id: '★2 둘째 신 (펜리르)', human: [29, 32], attack: 4.4, at: (tl) => Object.values(tl.awakened)[1] },
  { id: '귀환 2', human: [32, 35], attack: 4.7, at: (tl) => tl.returns.find((r) => r.n === 2)?.t },
  { id: '첫 영웅', human: [37, 42], attack: 5.3, at: (tl) => tl.firstHero, soft: true },
  { id: '★3 거인 왕', human: [42, 46], attack: 6.4, at: (tl) => tl.chapters.find((c) => c.id === 'greek')?.from },
  { id: '탈것', human: [46, 50], attack: 6.5, at: (tl) => tl.mount, soft: true },
  { id: '귀환 3', human: [50, 53], attack: 7.0, at: (tl) => tl.returns.find((r) => r.n === 3)?.t },
  { id: '★4 제우스 (티폰)', human: [60, 64], attack: 9.0, at: (tl) => Object.values(tl.awakened)[2] },
  { id: '맹세 지킴', human: [60, 69], attack: 9.8, at: (tl) => tl.oathKept, soft: true },
  { id: '★5 키마이라', human: [69, 74], attack: 11.5, at: (tl) => tl.chapters.find((c) => c.id === 'finale')?.from },
  { id: '귀환 4', human: [74, 77], attack: 13, at: (tl) => tl.returns.find((r) => r.n === 4)?.t },
  { id: '★6 엔딩', human: [84, 90], attack: 15, at: (tl, run) => run.ending, ending: true },
]

const median = (xs) => {
  const v = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b)
  if (v.length === 0) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}
const min = (s) => (typeof s === 'number' ? Math.round((s / 60) * 10) / 10 : null)
const mmss = (m) => (m === null ? '-' : `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}`)

if (!existsSync(PLAYTEST)) {
  console.error(`${PLAYTEST}이 없습니다. 먼저 npm run build && npm run playtest 1 120 --ending 을 돌립니다.`)
  process.exit(1)
}
const runs = JSON.parse(readFileSync(PLAYTEST, 'utf8')).filter((r) => r.timeline)
if (runs.length === 0) {
  console.error('시각표가 있는 판이 없습니다 (--ending 판을 돌립니다).')
  process.exit(1)
}

// power-curve: 사건 시각에 가장 가까운 눈금(그 앞)의 공격 지수
const curve = existsSync(CURVE) ? JSON.parse(readFileSync(CURVE, 'utf8')) : null
const curveTl = curve?.log ? timelineFromLog(curve.log) : null
function timelineFromLog(log) {
  const chapters = log.filter((e) => e.type === 'chapter')
  return {
    returns: log.filter((e) => e.type === 'return').map((e) => ({ n: Number(String(e.detail).split(':')[0]), t: e.t })),
    firstHero: log.find((e) => e.type === 'merge')?.t,
    awakened: Object.fromEntries(log.filter((e) => e.type === 'open').map((e) => [e.detail, e.t])),
    oathKept: log.find((e) => e.type === 'oath' && String(e.detail).includes(':win:'))?.t,
    mount: log.find((e) => e.type === 'mount')?.t,
    chapters: chapters.map((e) => ({ id: e.detail, from: e.t })),
    ending: log.find((e) => e.type === 'ending')?.t,
  }
}
const attackAt = (t) => {
  if (!curve || typeof t !== 'number') return null
  const before = curve.rows.filter((r) => r.t <= t + 1)
  return before.at(-1)?.attack ?? null
}

const rows = CHECKPOINTS.map((c) => {
  const mid = (c.human[0] + c.human[1]) / 2
  const target = c.ending ? (ENDING.lo + ENDING.hi) / 2 : Math.round(mid * BOT * 10) / 10
  const lo = c.ending ? ENDING.lo : Math.round(target * (1 - BAND) * 10) / 10
  const hi = c.ending ? ENDING.hi : Math.round(target * (1 + BAND) * 10) / 10
  const bots = runs.map((r) => min(c.at(r.timeline, r)))
  const med = median(bots)
  // 엔딩은 판마다 모두 띠 안이어야 한다 (D20), 나머지는 중앙값으로
  const ok = c.ending ? bots.every((b) => b !== null && b >= lo && b <= hi) : med !== null && med >= lo && med <= hi
  const curveT = curveTl ? (c.ending ? curveTl.ending : c.at(curveTl, { ending: curveTl.ending })) : undefined
  return { id: c.id, human: c.human, target, band: [lo, hi], bots, median: med, ok, soft: !!c.soft, attackTarget: c.attack, attack: attackAt(curveT) }
})

// 구간 길이: 체크포인트(soft 빼고) 사이의 봇 분 (중앙값끼리)
const hard = rows.filter((r) => !r.soft)
const spans = hard.slice(1).map((r, i) => {
  const prev = hard[i]
  const want = r.target - prev.target
  const got = r.median !== null && prev.median !== null ? Math.round((r.median - prev.median) * 10) / 10 : null
  return { from: prev.id, to: r.id, target: Math.round(want * 10) / 10, bot: got }
})

// 장마다 걸린 분 (판마다, 그리고 중앙값)
const chapterIds = ['prologue', 'north', 'greek', 'finale']
const chapters = chapterIds.map((id) => {
  const per = runs.map((r) => {
    const c = r.timeline.chapters.find((x) => x.id === id)
    return c && typeof c.to === 'number' ? min(c.to - c.from) : null
  })
  return { id, bots: per, median: median(per) }
})

const checkpoints = rows.filter((r) => !r.soft)
const passed = checkpoints.every((r) => r.ok)
mkdirSync('test-results', { recursive: true })
writeFileSync('test-results/timeline-check.json', JSON.stringify({ runs: runs.length, bot: BOT, band: BAND, rows, spans, chapters, passed }, null, 2))

console.log(`시각표 견주기: 봇 ${runs.length}판, 목표 = 사람 분 가운데 × ${BOT} ±${BAND * 100}% (엔딩은 판마다 ${ENDING.lo}~${ENDING.hi}분)`)
console.log('\n사건                   사람 분   목표(띠)            판마다                중앙값  판정  공격(목표)')
for (const r of rows) {
  const verdict = r.median === null ? '없음' : r.ok ? '맞음' : r.median < r.band[0] ? '이름' : '늦음'
  const attack = r.attack === null ? '-' : String(r.attack)
  console.log(
    `${r.id.padEnd(20)} ${`${r.human[0]}~${r.human[1]}`.padStart(6)}   ${mmss(r.target).padStart(5)} (${mmss(r.band[0])}~${mmss(r.band[1])})  ${r.bots.map(mmss).join(' ').padEnd(20)}  ${mmss(r.median).padStart(5)}  ${(r.soft ? `(${verdict})` : verdict).padEnd(4)}  ${attack} (${r.attackTarget})`,
  )
}
console.log('\n구간                                    목표 길이  봇 길이')
for (const s of spans) console.log(`${`${s.from} → ${s.to}`.padEnd(38)} ${String(s.target).padStart(7)}분  ${s.bot === null ? '-' : `${s.bot}분`}`)
console.log('\n장마다 (분): ' + chapters.map((c) => `${c.id} ${c.bots.map((b) => (b === null ? '-' : b)).join('/')} (중앙 ${c.median ?? '-'})`).join(' · '))
console.log(passed ? '\n체크포인트가 모두 띠 안입니다.' : `\n띠를 벗어난 체크포인트: ${checkpoints.filter((r) => !r.ok).map((r) => r.id).join(', ')}`)
