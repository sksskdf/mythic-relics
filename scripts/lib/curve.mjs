// 곡선·시각표 재기의 셈 (E307 0B 「재는 자」): power-curve·playtest·timeline-check가 함께 쓴다.
// 브라우저 없이 시험할 수 있게 셈만 둔다 (tests/curve.test.mjs)

/**
 * 표준 허수아비의 생명. 땅 세기·깊이와 무관하게 고정이고, 20초 안에 죽지 않게 크다.
 * 옛 표준 적은 80 × 60 × 그 땅 세기라 센 빌드로 약한 땅에 서면 20초 안에 죽어 공격 지수가 그 생명으로 찍혔다
 */
export const DUMMY_HP = 1e9
/** 옛 표준 적의 생명 (땅 세기 1일 때). 옛 기준선과 견줄 때 어느 줄이 잘렸을지 가린다 */
export const OLD_DUMMY_HP = 80 * 60
/** 보통 적 대부분의 휘청임 문턱 (`enemies.json`의 poise 20): 한 대가 이것 이상이면 예고가 끊긴다 */
export const STANDARD_POISE = 20
/**
 * 「맞는 적이 공격을 끝낸 비율」을 줄끼리 견줄 때 세우는 고정 적: 서리 거인 (근접, 문턱 20, 방패 없음).
 * 그 땅의 적은 땅마다 문턱(20~45)·방패·거리 두기가 달라 같은 땅·같은 적끼리만 견줄 수 있다
 */
export const STANDARD_FOE = 'grunt'

const round = (x, digits = 2) => Math.round(x * 10 ** digits) / 10 ** digits

/** 가운데 값 (숫자가 아닌 것은 빼고, 없으면 null) */
export function median(xs) {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b)
  if (v.length === 0) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/** 옛 방법(표준 적 생명 = 80 × 60 × 땅 세기)이면 20초 안에 죽어 잘렸을 줄인가 */
export function wasClipped(damage20, landPower) {
  return damage20 >= OLD_DUMMY_HP * landPower
}

/**
 * 맞는 적이 공격을 끝낸 비율: 주인공에게 맞는 동안 적이 시작한 공격(예고) 가운데 끝까지 나간 몫.
 * 시작한 공격이 없으면(시작도 하기 전에 쓰러짐) null
 */
export function finishRate(begun, struck) {
  return begun > 0 ? round(struck / begun) : null
}

/** 표준 허수아비가 맞은 한 대들: 횟수, 가운데 값, 휘청임 문턱(poise) 이상인 몫 */
export function hitStats(hits, poise = STANDARD_POISE) {
  if (hits.length === 0) return { count: 0, median: null, staggerShare: null }
  return { count: hits.length, median: round(median(hits), 1), staggerShare: round(hits.filter((h) => h >= poise).length / hits.length) }
}

/**
 * n번째 판의 결과 파일: 첫 판은 준 이름 그대로, 둘째부터 이름 뒤에 -n (`power-curve.json` → `power-curve-2.json`)
 */
export function runFile(file, n) {
  return n === 1 ? file : file.replace(/(\.json)?$/, `-${n}.json`)
}

/**
 * 줄마다 지수를 붙인다 (첫 줄 = 1). 첫 줄은 0:00의 맨몸이다 (`power-curve.mjs`가 봇이 걷기 전에 남긴다):
 * 첫 2분 저장을 기준으로 삼으면 그때까지 얻은 수련 마디·장비에 따라 판마다 기준이 달라진다
 * - attack: 표준 허수아비에게 20초 동안 준 피해의 비율
 * - defense: 표준 한 대(100)를 버티는 유효 생명의 비율
 * - layerScale: 층 목록의 곱(damageScale)의 비율, outside: 층 밖에서 큰 몫 (attack ÷ layerScale)
 * build가 없는 줄(옛 기록)은 layerScale·outside를 비운다
 */
export function indexRows(rows) {
  const first = rows[0]
  if (!first) return rows
  const ehp = (r) => r.maxHp / (r.per100 / 100)
  for (const r of rows) {
    r.attack = round(r.damage20 / first.damage20)
    r.defense = round(ehp(r) / ehp(first))
    const scale = r.build && first.build ? r.build.damageScale / first.build.damageScale : null
    r.layerScale = scale === null ? null : round(scale)
    r.outside = scale === null ? null : round(r.damage20 / first.damage20 / scale)
  }
  return rows
}

/**
 * 사건 앞 줄(사건 전의 마지막 저장)과 뒤 줄(사건 뒤의 첫 저장).
 * 줄의 logged(그 저장까지 판 기록에 남은 사건 수)와 기록에서 그 사건의 차례로 가른다. 시각으로는 가를 수 없다:
 * 줄 시각(t)은 반올림한 초, 기록은 0.1초 단위이고, 봇이 생각하는 걸음에 난 사건(귀환 고르기)은 시간이 흐르기 전이라 바로 앞 저장과 같은 시각에 찍힌다.
 * 그래서 시각만 보면 사건 직후의 저장이 「앞」으로 들어가 그 사건의 걸음(귀환 앞 → 뒤)이 사라지기도 한다.
 * logged가 없는 옛 파일과 기록에 없는 시각은 시각으로 가른다 (저장이 사건 1초 뒤까지면 앞)
 */
export function rowsAround(rows, log, t) {
  if (typeof t !== 'number') return { before: null, after: null }
  const index = log.findIndex((e) => e.t === t)
  const isBefore = (r) => (typeof r.logged === 'number' && index >= 0 ? r.logged <= index : r.t <= t + 1)
  return { before: rows.filter(isBefore).at(-1) ?? null, after: rows.find((r) => !isBefore(r)) ?? null }
}

/** 층 목록을 한 줄 글로 (그대로인 층은 뺀다): 「승천 ×1.35 · 수련 +23%」 */
export function layerText(layers) {
  return layers
    .filter((l) => (l.kind === 'mul' ? Math.abs(l.value - 1) > 1e-9 : Math.abs(l.value) > 1e-9))
    .map((l) => (l.kind === 'mul' ? `${l.name ?? l.id} ×${round(l.value)}` : `${l.name ?? l.id} +${Math.round(l.value * 100)}%`))
    .join(' · ')
}

/**
 * 플레이 기록 → 시각표 (E306 D19): 귀환(번호·갈래), 첫 영웅 합치기, 깨어난 신, 이긴 보스, 장마다 들어선 때·끝낸 때 (초).
 * `timeline-check.mjs`의 체크포인트가 이것을 읽는다
 */
export function timelineOf(log) {
  const chapters = log.filter((e) => e.type === 'chapter')
  const ending = log.find((e) => e.type === 'ending')?.t
  return {
    returns: log.filter((e) => e.type === 'return').map((e) => ({ n: Number(String(e.detail).split(':')[0]), t: e.t, branch: String(e.detail).slice(String(e.detail).indexOf(':') + 1) })),
    firstHero: log.find((e) => e.type === 'merge')?.t,
    awakened: Object.fromEntries(log.filter((e) => e.type === 'open').map((e) => [e.detail, e.t])),
    bosses: Object.fromEntries(log.filter((e) => e.type === 'bossKill').map((e) => [e.detail, e.t])),
    oathKept: log.find((e) => e.type === 'oath' && String(e.detail).includes(':win:'))?.t,
    mount: log.find((e) => e.type === 'mount')?.t,
    chapters: chapters.map((e, i) => ({ id: e.detail, from: e.t, to: chapters[i + 1]?.t ?? ending })),
  }
}

/**
 * 보스·수호자 싸움마다의 초 (E307 0B): 봇이 남긴 싸움(`src/dev/bossWatch.ts`: 처음 때린 때·마지막 시도·쓰러진 때)에
 * 플레이 기록의 「그 땅에 들어선 때」를 붙인다.
 * - approach: 그 땅에 들어서(처음 때리기 전 마지막으로) 보스를 처음 때릴 때까지. 봇의 다가가기 규칙이 여기에 든다
 * - sinceFirstEnter: 그 땅에 처음 들어선 때부터 (다른 땅을 다녀온 시간도 든다)
 * - killsBefore: 그 사이(들어서 처음 때릴 때까지) 잡은 졸개 수. 봇이 둘레를 얼마나 치우고서야 보스에 닿았나
 * - fight: 처음 때린 때 → 쓰러진 때. lastFight: 생명이 가득 되찬 뒤의 마지막 시도만. resets: 되찬 횟수
 * 수호자는 흔적·사냥을 마쳐야 나타나므로 approach에 그 시간이 든다
 */
export function bossFights(log, fights) {
  const enters = log.filter((e) => e.type === 'region')
  const kills = log.filter((e) => e.type === 'kill')
  const sec = (x) => (typeof x === 'number' ? round(x, 1) : null)
  return fights.map((f) => {
    const here = enters.filter((e) => e.detail === f.region && e.t <= f.firstHit)
    const entered = here.at(-1)?.t
    const firstEntered = here[0]?.t
    const killed = typeof f.killed === 'number' ? f.killed : undefined
    return {
      id: f.id,
      role: f.role,
      region: f.region,
      entered: sec(entered),
      firstHit: sec(f.firstHit),
      killed: sec(killed),
      approach: entered === undefined ? null : sec(f.firstHit - entered),
      killsBefore: entered === undefined ? null : kills.filter((e) => e.t >= entered && e.t <= f.firstHit).length,
      sinceFirstEnter: firstEntered === undefined ? null : sec(f.firstHit - firstEntered),
      fight: killed === undefined ? null : sec(killed - f.firstHit),
      lastFight: killed === undefined ? null : sec(killed - f.lastStart),
      resets: f.resets,
    }
  })
}

/** 싸움 목록을 한 줄 글로: 「jormungandr 다가가기 95초(처치 12) · 싸움 21초」 */
export function bossText(fights) {
  const s = (x) => (x === null ? '-' : `${Math.round(x)}초`)
  return fights.map((f) => `${f.id} 다가가기 ${s(f.approach)}(처치 ${f.killsBefore ?? '-'}) · 싸움 ${s(f.fight)}${f.resets ? `(되참 ${f.resets}, 마지막 ${s(f.lastFight)})` : ''}${f.killed === null ? ' 못 잡음' : ''}`).join(', ')
}
