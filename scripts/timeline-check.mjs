// 시각표 견주기 (E306 D19·D20): 봇 판의 사건 시각을 `TIMELINE.md` 4장 90분 시각표와 견준다.
// node scripts/timeline-check.mjs [playtest.json=test-results/playtest.json] [power-curve.json=test-results/power-curve.json ...]
// node scripts/timeline-check.mjs --curve [power-curve.json=test-results/power-curve.json ...]
// - 체크포인트 열(★1~★6, 귀환 1~4)마다 판마다의 봇 분, 세 판 중앙값, 목표(사람 분 가운데 × 0.78), ±15% 판정
// - 구간 길이(앞 체크포인트에서)와 장마다 걸린 분
// - power-curve 기록이 있으면 그 판의 같은 사건 때 공격 지수(사건 앞 눈금 → 뒤 눈금)와 `TIMELINE.md` 4장 「공격 지수 (목표)」 열을 나란히 둔다.
//   앞·뒤 눈금은 줄의 logged(그 저장까지 남은 기록 수)로 가른다 (`scripts/lib/curve.mjs`의 `rowsAround`, 옛 파일은 시각으로)
// - 판 기록에 보스·수호자 싸움(bossFights)이 있으면 그 땅에 들어서 처음 때릴 때까지·처음 때려 쓰러질 때까지의 초
// --curve (E307 0B): 곡선 파일의 판을 판으로 읽는다. 시각과 공격 지수가 같은 판에서 나온다 (`power-curve.mjs 100 --runs=3` 뒤에).
//   파일을 주지 않으면 test-results/power-curve.json과 거기 적힌 나머지 판(siblings)을 읽는다
// 결과는 test-results/timeline-check.json과 화면에. 봇 판(`npm run playtest N 120 --ending`이나 `power-curve.mjs`)을 돌린 뒤에 쓴다 (브라우저를 띄우지 않는다)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { median, rowsAround, timelineOf } from './lib/curve.mjs'

const SAME_RUN = process.argv.includes('--curve')
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const PLAYTEST = SAME_RUN ? null : (files[0] ?? 'test-results/playtest.json')
const curveArgs = SAME_RUN ? files : files.slice(1)
const CURVES = curveArgs.length ? curveArgs : ['test-results/power-curve.json']
/** 봇은 사람의 0.7~0.85배 (`TIMELINE.md` 4장), 체크포인트는 가운데 0.78로 견준다 */
const BOT = 0.78
const BAND = 0.15
/** 엔딩은 봇 65~75분 (ROADMAP E306) */
const ENDING = { lo: 65, hi: 75 }

/**
 * 체크포인트 (`TIMELINE.md` 4장): 사람 분(앞·뒤)과 공격 지수 목표, 판의 시각표에서 그 사건의 초를 고르는 법
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

const min = (s) => (typeof s === 'number' ? Math.round((s / 60) * 10) / 10 : null)
const mmss = (m) => (m === null ? '-' : `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}`)

// 곡선 파일들: 준 파일과 거기 적힌 나머지 판(siblings). 옛 파일(시각표 없이 log만)은 log에서 시각표를 만든다
const curves = []
for (const file of CURVES) {
  if (!existsSync(file)) continue
  const first = JSON.parse(readFileSync(file, 'utf8'))
  for (const [path, curve] of [[file, first], ...(first.siblings ?? []).map((name) => [join(dirname(file), name), null])]) {
    if (!curve && !existsSync(path)) continue
    const c = curve ?? JSON.parse(readFileSync(path, 'utf8'))
    curves.push({ file: path, rows: c.rows, log: c.log ?? [], timeline: c.timeline ?? timelineOf(c.log ?? []), ending: c.ending ?? c.log?.find((e) => e.type === 'ending')?.t, bossFights: c.bossFights ?? [] })
  }
}

let runs
if (SAME_RUN) {
  // 같은 판 (E307 0B): 곡선 파일의 판이 곧 시각표의 판이다
  if (curves.length === 0) {
    console.error(`${CURVES.join(', ')}이 없습니다. 먼저 npm run build && node scripts/power-curve.mjs 100 --runs=3 을 돌립니다.`)
    process.exit(1)
  }
  runs = curves
} else {
  if (!existsSync(PLAYTEST)) {
    console.error(`${PLAYTEST}이 없습니다. 먼저 npm run build && npm run playtest 1 120 --ending 을 돌립니다.`)
    process.exit(1)
  }
  runs = JSON.parse(readFileSync(PLAYTEST, 'utf8')).filter((r) => r.timeline)
  if (runs.length === 0) {
    console.error('시각표가 있는 판이 없습니다 (--ending 판을 돌립니다).')
    process.exit(1)
  }
}

/** 그 곡선 판에서 사건 앞 눈금(사건 전의 마지막 저장)과 뒤 눈금(사건 뒤의 첫 저장)의 공격 지수 */
const attackAround = (curve, t) => {
  const { before, after } = rowsAround(curve.rows, curve.log, t)
  return { before: before?.attack ?? null, after: after?.attack ?? null }
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
  // 공격 지수는 곡선 판마다 제 판의 사건 시각에서 읽는다 (같은 판이 아니면 시각 칸과 다른 판의 값이다)
  const around = curves.map((curve) => attackAround(curve, c.at(curve.timeline, curve)))
  const attacks = around.map((a) => a.before)
  const attacksAfter = around.map((a) => a.after)
  return { id: c.id, human: c.human, target, band: [lo, hi], bots, median: med, ok, soft: !!c.soft, attackTarget: c.attack, attack: median(attacks), attacks, attackAfter: median(attacksAfter), attacksAfter }
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

// 보스·수호자 싸움 (E307 0B): 적마다 첫 싸움의 「그 땅에 들어서 처음 때릴 때까지」·「처음 때려 쓰러질 때까지」 초 (판마다·중앙값)
const bossIds = [...new Set(runs.flatMap((r) => (r.bossFights ?? []).map((f) => f.id)))]
const bosses = bossIds.map((id) => {
  const firsts = runs.map((r) => (r.bossFights ?? []).find((f) => f.id === id) ?? null)
  const col = (key) => firsts.map((f) => f?.[key] ?? null)
  return { id, role: firsts.find((f) => f)?.role, approach: col('approach'), approachMedian: median(col('approach')), killsBefore: col('killsBefore'), fight: col('fight'), fightMedian: median(col('fight')), resets: col('resets') }
})

mkdirSync('test-results', { recursive: true })
writeFileSync('test-results/timeline-check.json', JSON.stringify({ runs: runs.length, sameRun: SAME_RUN, curves: curves.map((c) => c.file), bot: BOT, band: BAND, rows, spans, chapters, bosses, passed }, null, 2))

const cell = (x) => (x === null || x === undefined ? '-' : String(x))
console.log(`시각표 견주기: 봇 ${runs.length}판${SAME_RUN ? '(곡선과 같은 판)' : ''}, 목표 = 사람 분 가운데 × ${BOT} ±${BAND * 100}% (엔딩은 판마다 ${ENDING.lo}~${ENDING.hi}분)`)
if (!SAME_RUN && curves.length) console.log(`공격 지수는 다른 판(${curves.map((c) => c.file).join(', ')})의 값입니다. 같은 판으로 보려면 --curve`)
console.log('\n사건                   사람 분   목표(띠)            판마다                중앙값  판정  공격 앞→뒤 (목표)')
for (const r of rows) {
  const verdict = r.median === null ? '없음' : r.ok ? '맞음' : r.median < r.band[0] ? '이름' : '늦음'
  const attack = r.attacks.length > 1 ? `${r.attacks.map(cell).join('/')} → ${r.attacksAfter.map(cell).join('/')} 중앙 ${cell(r.attack)}→${cell(r.attackAfter)}` : `${cell(r.attack)}→${cell(r.attackAfter)}`
  console.log(
    `${r.id.padEnd(20)} ${`${r.human[0]}~${r.human[1]}`.padStart(6)}   ${mmss(r.target).padStart(5)} (${mmss(r.band[0])}~${mmss(r.band[1])})  ${r.bots.map(mmss).join(' ').padEnd(20)}  ${mmss(r.median).padStart(5)}  ${(r.soft ? `(${verdict})` : verdict).padEnd(4)}  ${attack} (${r.attackTarget})`,
  )
}
console.log('\n구간                                    목표 길이  봇 길이')
for (const s of spans) console.log(`${`${s.from} → ${s.to}`.padEnd(38)} ${String(s.target).padStart(7)}분  ${s.bot === null ? '-' : `${s.bot}분`}`)
console.log('\n장마다 (분): ' + chapters.map((c) => `${c.id} ${c.bots.map((b) => (b === null ? '-' : b)).join('/')} (중앙 ${c.median ?? '-'})`).join(' · '))
if (bosses.length) {
  console.log('\n보스·수호자 (초)        들어서 처음 때릴 때까지 (그동안 처치)      처음 때려 쓰러질 때까지 (되참)')
  for (const b of bosses) {
    const approach = b.approach.map((x, i) => `${cell(x === null ? null : Math.round(x))}(${cell(b.killsBefore[i])})`).join(' ')
    const fight = b.fight.map((x, i) => `${cell(x === null ? null : Math.round(x))}${b.resets[i] ? `(${b.resets[i]})` : ''}`).join(' ')
    console.log(`${b.id.padEnd(22)} ${approach.padEnd(28)} 중앙 ${cell(b.approachMedian === null ? null : Math.round(b.approachMedian)).padStart(4)}   ${fight.padEnd(20)} 중앙 ${cell(b.fightMedian === null ? null : Math.round(b.fightMedian))}`)
  }
}
console.log(passed ? '\n체크포인트가 모두 띠 안입니다.' : `\n띠를 벗어난 체크포인트: ${checkpoints.filter((r) => !r.ok).map((r) => r.id).join(', ')}`)
