// 곡선·시각표 재기의 셈 (E307 0B 「재는 자」): power-curve·playtest·timeline-check가 함께 쓴다.
// 브라우저 없이 시험할 수 있게 셈만 둔다 (tests/curve.test.mjs). 둘만 페이지 안에서 돈다: 표준 허수아비 치기 `strikeDummy`, 맹세 봇의 한 구간 `oathBotRun`

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

/** 처치 기록인가 (보스 포함) */
export const isKill = (e) => e.type === 'kill' || e.type === 'bossKill'

/**
 * 처치가 끊긴 구간을 재기 시작하는 때 (초): 첫 신을 손에 쥔 때, 그 기록이 없으면 첫 신이 깨어난 때. 아직이면 undefined.
 * 유물을 끼고(또는 엔딩 뒤 빌드로) 시작하는 판은 부르는 쪽이 0을 준다
 */
export function killWatchStart(log) {
  return log.find((e) => e.type === 'manifest')?.t ?? log.find((e) => e.type === 'open')?.t
}

/**
 * 처치가 끊긴 가장 긴 구간 (E241): from(초) 뒤의 처치와 처치 사이, 마지막 처치에서 end까지.
 * 구간이 시작한 때(at)와 그때 있던 땅(region)을 함께 돌려준다. 그때까지 땅에 들어선 기록이 없으면 fallbackRegion.
 * 재기 시작하는 때가 없으면(from이 undefined: 첫 신 전에 끝난 판) null.
 * 처치를 걸러 낸 기록으로 셈하면 판 전체가 한 구간이 되니, 걸러 내기 전의 기록(`game.log` 전부)을 준다
 */
export function killGap(log, from, end, fallbackRegion = null) {
  if (from === undefined) return null
  const marks = [from, ...log.filter((e) => isKill(e) && e.t >= from).map((e) => e.t), end]
  let best = { seconds: 0, at: from }
  for (let i = 1; i < marks.length; i++) if (marks[i] - marks[i - 1] > best.seconds) best = { seconds: marks[i] - marks[i - 1], at: marks[i - 1] }
  const region = log.filter((e) => e.type === 'region' && e.t <= best.at).at(-1)?.detail ?? fallbackRegion
  return { seconds: Math.round(best.seconds), at: Math.round(best.at), region }
}

/**
 * 맹세 봇이 맹세 하나를 붙드는 상한 (초): 건 뒤 이만큼 지나도 걸려 있으면 못 끝내는 맹세로 치고 푼다 (`oathBotRun`).
 * 타는 모래시계가 스스로 깨지는 10분(`src/data/oaths.ts`의 OATH.timed 600초)보다 길게 둔다: 그 맹세는 게임이 먼저 끝낸다
 */
export const OATH_LIMIT = 660

/**
 * 맹세 봇의 한 구간 (**페이지 안에서 돈다**: `page.evaluate(oathBotRun, { seconds, limit, demo })`. 이 파일의 다른 것을 쓰지 못한다).
 * 봇을 1초씩 seconds초 돌리며 걸음마다 맹세를 본다. 건 맹세는 `window.__oathSworn`에 쌓는다 (id, 건 때 t, 건 직후 도는 숨 칸 수 breath):
 * - 걸린 맹세가 없고 보스가 서 있으면 아직 걸어 보지 않은 다음 맹세를 건다 (출발 카드를 기다리지 않는다).
 *   보스가 다시 서기를 기다렸다 거는 것은 지킨 초에 다시 서는 45초가 섞이지 않게 하려는 것이다 (첫 맹세만 기다림이 없으면 셋을 못 견준다).
 *   맹세는 다시 떠날 때 거는 것이라 원정 시계를 0으로 둔다: 기록(지킨 초)이 건 뒤부터이고, 타는 모래시계의 10분도 건 때부터 센다
 * - 건 뒤 limit초가 지나도 걸려 있으면 못 끝내는 맹세다: 풀고(`swear(null)`) 건 뒤의 초를 gaveUp에 적은 다음, 다음 맹세로 간다.
 *   마른 샘은 저절로 차는 생명까지 막는데, 봇은 생명이 70% 아래면 둘레가 빈 자리에서 찰 때까지 서서 쉰다.
 *   그 맹세를 풀지 않으면 봇이 영영 쉬어 뒤의 맹세를 하나도 못 건다
 * 돌려주는 것: left(걸린 맹세가 있거나 걸 맹세가 남았다), demoLeft(demo 가운데 아직 안 걸었거나 걸려 있는 것이 있다)
 */
export function oathBotRun({ seconds, limit, demo }) {
  const g = window.__game
  const sworn = window.__oathSworn
  const nextOath = () => g.oathSystem.available().find((id) => !sworn.some((s) => s.id === id))
  for (let i = 0; i < seconds; i++) {
    const held = sworn.at(-1)
    if (g.expedition.oath && held?.id === g.expedition.oath && g.time - held.t > limit) {
      held.gaveUp = Math.round(g.time - held.t)
      g.oathSystem.swear(null)
    }
    const id = g.expedition.oath || !g.encounter.boss?.alive ? undefined : nextOath()
    if (id) {
      g.expedition.elapsed = 0
      g.oathSystem.swear(id)
      sworn.push({ id, t: g.time, breath: g.powers.loadout.pantheon.breath.length })
    }
    window.__autoplay.run(1)
  }
  const open = (id) => g.expedition.oath === id || !sworn.some((s) => s.id === id)
  return { left: Boolean(g.expedition.oath) || nextOath() !== undefined, demoLeft: demo.some(open) }
}

/**
 * 맹세 봇의 판 기록 (`playtest.mjs --oaths`, E307 0C): 건 맹세(sworn: id와 건 때 t)마다 그 뒤 처음 끝난 기록(`oath`: 맹세:결과:초)을 붙인다.
 * seconds는 건 뒤 끝날 때까지의 게임 초 (보스가 다시 서기를 기다린 시간도 든다). 아직 안 끝났으면 ended·seconds·win이 없다.
 * demo는 덩어리 사이에 견주는 데모 셋인가. 건 맹세에 적힌 것은 그대로 싣는다: breath(건 직후 도는 숨 칸 수: 홀로의 맹세가 실제로
 * 숨을 껐는지 판 기록으로 본다), gaveUp(상한을 넘겨 봇이 푼 맹세: 건 뒤의 초)
 */
export function oathRuns(log, sworn, demo = []) {
  const ends = log.filter((e) => e.type === 'oath')
  return sworn.map((s) => {
    const end = ends.find((e) => e.t >= s.t && String(e.detail).startsWith(`${s.id}:`))
    const out = { id: s.id, demo: demo.includes(s.id), sworn: Math.round(s.t), ...(s.breath === undefined ? {} : { breath: s.breath }), ...(s.gaveUp === undefined ? {} : { gaveUp: s.gaveUp }) }
    return end ? { ...out, ended: Math.round(end.t), seconds: Math.round(end.t - s.t), win: String(end.detail).includes(':win:') } : out
  })
}

/** 맹세 기록을 한 줄 글로: 「silence 지킴 95초, timed 깨짐 600초, noHeal 못 끝냄(661초에 풂), slow 못 끝냄」 */
export function oathText(runs) {
  const open = (o) => (o.gaveUp === undefined ? '못 끝냄' : `못 끝냄(${o.gaveUp}초에 풂)`)
  return runs.map((o) => `${o.id} ${o.win === undefined ? open(o) : `${o.win ? '지킴' : '깨짐'} ${o.seconds}초`}`).join(', ') || '-'
}

/**
 * 표준 허수아비 치기 (**페이지 안에서 돈다**: `page.evaluate(strikeDummy, { hp, seconds })`, 또는 페이지에 심어 다른 평가 안에서 부른다).
 * 페이지로 넘어가 도는 함수라 이 파일의 다른 것(상수·돕는 함수)을 쓰지 못한다. 재는 법은 공격 지수와 같다:
 * 둘레의 적을 비우고, 주인공이 쓰러지지 않게 둔 채, 서 있기만 하는 허수아비(서리 거인의 몸, 생명 hp)를 1.8m 앞에 세워 seconds초 친다.
 * - dealt: 준 피해, damage20: 20초 몫으로 고친 피해 (공격 지수의 분자), hits: 맞은 한 대마다의 피해
 * 무리가 다시 서지 않게 하는 것(`encounter.crowd = 0`)은 부르는 쪽이 한다. 주인공이 쓰러지지 않게 한 것(godMode)은 끝나면 되돌린다.
 * 빌드만 바꿔 가며 견줄 때도 이것을 쓴다 (`checklist-qa.mjs`의 손 배율 점검: 손의 신만 바꿔 20초 피해 셋)
 */
export function strikeDummy({ hp, seconds }) {
  const g = window.__game
  const wasGod = g.combat.godMode
  g.encounter.clearAll()
  g.combat.health.reset()
  g.combat.godMode = true
  g.orders.clear()
  const p = g.hero.object.position
  const dummy = g.encounter.spawnById('grunt', { x: p.x + 1.8, z: p.z }, true)
  dummy.health.max = hp
  dummy.health.hp = hp
  dummy.update = () => {}
  // 맞은 한 대마다의 피해 (휘청임 문턱과 견준다)
  const hits = []
  const takeHit = dummy.takeHit.bind(dummy)
  dummy.takeHit = (...hit) => {
    const dealt = takeHit(...hit)
    if (dealt > 0) hits.push(Math.round(dealt * 10) / 10)
    return dealt
  }
  g.orders.press(null, dummy)
  g.advance(seconds, 1 / 30)
  const dealt = hp - dummy.health.hp
  g.encounter.clearAll()
  g.combat.godMode = wasGod
  return { dealt, damage20: Math.round((dealt / seconds) * 20), hits }
}

/** 싸움 목록을 한 줄 글로: 「jormungandr 다가가기 95초(처치 12) · 싸움 21초」 */
export function bossText(fights) {
  const s = (x) => (x === null ? '-' : `${Math.round(x)}초`)
  return fights.map((f) => `${f.id} 다가가기 ${s(f.approach)}(처치 ${f.killsBefore ?? '-'}) · 싸움 ${s(f.fight)}${f.resets ? `(되참 ${f.resets}, 마지막 ${s(f.lastFight)})` : ''}${f.killed === null ? ' 못 잡음' : ''}`).join(', ')
}
