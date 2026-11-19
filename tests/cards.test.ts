import { describe, expect, it } from 'vitest'

import { CARD_HOLD, TOAST_BUNDLES } from '../src/data/moments'
import type { GearItem } from '../src/gear/roll'
import { LABEL_LIFE, popScale, stackLift } from '../src/ui/DamageNumbers'
import { countWord, type GainsCard, GAINS_LIFE, GAINS_RUSH_MS, GainsLine, gainsMark, gainsView, markLine } from '../src/ui/gainsLine'
import { betterLines } from '../src/ui/gearCard'
import hudCss from '../src/ui/hud.css?raw'
import hudSource from '../src/ui/Hud.ts?raw'
import { byCode, PickGate } from '../src/ui/pickGate'
import pickGateSource from '../src/ui/pickGate.ts?raw'
import { TOAST_HOLD, TOAST_LIFE, toastLift, ToastLine } from '../src/ui/toastLine'

const gear = (title: string, kind = '장비'): GainsCard => ({ kind, title, color: '#5aa8ff', icon: '', lines: ['이동 속도 +6%'], size: 'card', bundles: true })
const big = (title: string): GainsCard => ({ kind: '대장간', title, color: '#ffd75e', icon: '', lines: ['2단계'], size: 'big' })
/** 줄마다 설명이 달린 작은 카드 (자동화·탈것·맹세를 걺 등) */
const auto = (title: string): GainsCard => ({ kind: '자동화', title, color: '#9fe3ff', icon: '', lines: ['수련 마디를 지난 원정 차례대로 저절로 다시 찍는다', '가보 칸 1'], size: 'card' })
const tab = (title: string): GainsCard => ({ kind: '새 탭', title, color: '#ffd75e', icon: '', lines: ['깨달음으로 마디를 익힌다'], size: 'tab' })

/** 줄에서 꺼낼 수 있는 대로 꺼내며 시간을 흘린다: 뜬 때(ms)와 화면에 보이는 이름 */
function drain(line: GainsLine, from = 0): { at: number; title: string }[] {
  const shown: { at: number; title: string }[] = []
  let now = from
  for (let wait = line.wait(now); wait !== null; wait = line.wait(now)) {
    now += Math.max(0, wait)
    shown.push({ at: now, title: gainsView(line.take(now)).title })
  }
  return shown
}

describe('얻은 것 카드의 줄 (E307 카드 예산)', () => {
  it('카드 한 장은 바로 뜨고 제 시간만큼 자리를 지킨다 (작은 카드 2.2초, 3.2초 뒤에는 사라져 있다)', () => {
    const line = new GainsLine()
    line.push(gear('희귀 서리 장화'))
    expect(line.wait(0)).toBeLessThanOrEqual(0)
    expect(line.take(0).title).toBe('희귀 서리 장화')
    expect(line.busy(CARD_HOLD.card * 1000 - 1)).toBe(true)
    expect(line.busy(CARD_HOLD.card * 1000)).toBe(false)
    expect(line.showing(GAINS_LIFE.card)).toBe('card')
    expect(line.showing(GAINS_LIFE.card + 1)).toBeNull()
    expect(line.wait(5000)).toBeNull()
  })

  it('같은 종류의 작은 카드가 줄에 서 있으면 한 장으로 묶는다: 넷을 이어 주워도 카드는 두 장', () => {
    const line = new GainsLine()
    line.push(gear('희귀 서리 장화'))
    line.take(0)
    for (const title of ['희귀 뼈 목걸이', '희귀 사슬 갑옷', '영웅 깃털 관']) line.push(gear(title))
    expect(line.waiting).toHaveLength(1)
    const view = gainsView(line.waiting[0]!)
    expect(view.title).toBe('장비 셋')
    expect(view.lines).toEqual(['희귀 뼈 목걸이', '희귀 사슬 갑옷', '영웅 깃털 관'])
    // 뒤에 기다리는 카드가 있으니 첫 카드는 빨리 넘기고, 묶인 카드가 마지막이다 (전: 한 장에 3초씩 네 장, 11.5초 넘게)
    const shown = drain(line)
    expect(shown).toEqual([{ at: GAINS_RUSH_MS, title: '장비 셋' }])
    expect(shown.at(-1)!.at + GAINS_LIFE.card).toBeLessThan(5000)
  })

  it('줄마다 설명이 있는 카드(자동화 등)는 같은 종류여도 묶지 않는다: 묶이면 설명이 사라진다', () => {
    const line = new GainsLine()
    line.push(auto('자동 줍기'))
    line.push(auto('귀환 3 · 새 자동화'))
    expect(line.waiting).toHaveLength(2)
    expect(drain(line).map((s) => s.title)).toEqual(['자동 줍기', '귀환 3 · 새 자동화'])
  })

  it('설명이 달린 작은 카드는 뒤에 무엇이 서도 서두르지 않는다: 귀환 큰 카드 앞의 자동화 카드가 2.2초를 채운다', () => {
    const line = new GainsLine()
    // 귀환하는 순간: 자동화 카드 → 「원정 2 출발」 큰 카드 → 장비 카드
    line.push(auto('귀환 1 · 새 자동화'))
    line.push(big('원정 2 출발'))
    line.push(gear('희귀 서리 장화'))
    expect(drain(line)).toEqual([
      { at: 0, title: '귀환 1 · 새 자동화' },
      { at: CARD_HOLD.card * 1000, title: '원정 2 출발' },
      { at: (CARD_HOLD.card + CARD_HOLD.big) * 1000, title: '희귀 서리 장화' },
    ])
  })

  it('떠 있는 카드 뒤에 새 카드가 오면: 장비 카드는 1.2초만 채웠으면 바로 내주고, 설명이 달린 카드는 2.2초까지 지킨다', () => {
    const shown = new GainsLine()
    shown.push(gear('희귀 서리 장화'))
    shown.take(0)
    shown.push(big('묠니르 2단계'))
    expect(shown.wait(GAINS_RUSH_MS - 200)).toBe(200)
    expect(shown.wait(1500)).toBeLessThanOrEqual(0)
    const told = new GainsLine()
    told.push(auto('귀환 1 · 새 자동화'))
    told.take(0)
    told.push(big('원정 2 출발'))
    expect(told.wait(1500)).toBe(CARD_HOLD.card * 1000 - 1500)
    expect(told.wait(CARD_HOLD.card * 1000)).toBeLessThanOrEqual(0)
  })

  it('종류가 다르면 묶지 않고, 큰 카드·새 탭 카드는 묶지도 서두르지도 않는다', () => {
    const line = new GainsLine()
    line.push(gear('희귀 서리 장화'))
    line.push(gear('희귀 뼈 목걸이', '더 좋은 장비 · 가방'))
    line.push(gear('희귀 사슬 갑옷', '합치기'))
    line.push(big('묠니르 2단계'))
    line.push(big('궁니르 2단계'))
    expect(line.waiting).toHaveLength(5)
    const shown = drain(line)
    expect(shown.map((s) => s.title)).toEqual(['희귀 서리 장화', '희귀 뼈 목걸이', '희귀 사슬 갑옷', '묠니르 2단계', '궁니르 2단계'])
    // 장비 카드 셋은 밀렸으니 짧게, 큰 카드는 뒤에 기다리는 것이 있어도 4.5초를 다 채운다
    expect(shown.map((s) => s.at)).toEqual([0, GAINS_RUSH_MS, GAINS_RUSH_MS * 2, GAINS_RUSH_MS * 3, GAINS_RUSH_MS * 3 + CARD_HOLD.big * 1000])
  })

  it('묶인 카드의 글: 이름 자리에 「종류 + 수」, 종류 자리에는 가운뎃점 뒤의 말만, 줄은 셋까지(넘으면 둘과 「외 N」)', () => {
    const line = new GainsLine()
    for (let i = 1; i <= 6; i++) line.push(gear(`희귀 장비 ${i}`, '더 좋은 장비 · 가방'))
    const view = gainsView(line.waiting[0]!)
    expect(view.kind).toBe('가방')
    expect(view.title).toBe('더 좋은 장비 여섯')
    expect(view.lines).toEqual(['희귀 장비 1', '희귀 장비 2', '외 넷'])
    expect(gainsView({ ...gear('희귀 서리 장화'), bundle: ['희귀 서리 장화', '희귀 뼈 목걸이'] })).toEqual({ kind: '', title: '장비 둘', lines: ['희귀 서리 장화', '희귀 뼈 목걸이'] })
    expect(countWord(2)).toBe('둘')
    expect(countWord(12)).toBe('12개')
    // 하나뿐인 카드는 그대로
    expect(gainsView(gear('희귀 서리 장화'))).toEqual({ kind: '장비', title: '희귀 서리 장화', lines: ['이동 속도 +6%'] })
  })

  it('화면이 덮이면(정보 화면) 떠 있던 작은 카드는 본 것으로 치고, 줄에 선 카드는 닫은 뒤 묶인 한 장으로 뜬다', () => {
    const line = new GainsLine()
    line.push(gear('희귀 서리 장화', '더 좋은 장비 · 가방'))
    line.take(0)
    line.push(gear('희귀 뼈 목걸이', '합치기'))
    // 「더 좋은 장비」를 보고 0.5초 만에 정보 화면을 열었다
    line.cover(500)
    expect(line.showing(600)).toBeNull()
    expect(line.waiting.map((w) => w.title)).toEqual(['희귀 뼈 목걸이'])
    // 열어 둔 동안 온 카드(창 안에서 합친 것 등)도 같은 장에 묶여, 닫았을 때 줄줄이 뜨지 않는다
    line.push(gear('희귀 사슬 갑옷', '합치기'))
    line.push(gear('희귀 깃털 관', '합치기'))
    expect(drain(line, 9000)).toEqual([{ at: 9000, title: '합치기 셋' }])
  })

  it('제 시간을 못 채운 큰 카드는 닫은 뒤 다시 뜨고, 다 채운 카드는 다시 뜨지 않는다', () => {
    const line = new GainsLine()
    line.push(big('묠니르 2단계'))
    line.take(0)
    line.cover(800)
    expect(line.busy(900)).toBe(true)
    expect(drain(line, 9000)).toEqual([{ at: 9000, title: '묠니르 2단계' }])
    line.cover(9000 + CARD_HOLD.big * 1000)
    expect(line.waiting).toHaveLength(0)
    expect(line.busy(20000)).toBe(false)
  })

  it('새 탭 카드가 떠 있을 때 창을 열면 본 것으로 친다: 카드가 부른 대로 메뉴 단추를 눌렀는데 닫으면 같은 카드가 또 뜨지 않게', () => {
    const line = new GainsLine()
    line.push(tab('수련'))
    line.take(0)
    line.cover(1000)
    expect(line.waiting).toHaveLength(0)
    expect(line.showing(1100)).toBeNull()
    expect(line.busy(1100)).toBe(false)
    // 아직 뜨지 못하고 줄에 서 있던 새 탭 카드는 닫은 뒤에 뜬다
    line.push(big('묠니르 2단계'))
    line.take(2000)
    line.push(tab('신'))
    line.cover(2000 + CARD_HOLD.big * 1000)
    expect(drain(line, 20000)).toEqual([{ at: 20000, title: '신' }])
  })
})

describe('카드가 사라지는 움직임 (hud.css, E307 손 QA)', () => {
  /** 그 이름의 @keyframes에서 마지막(100%) 걸음의 몸 */
  const lastFrame = (name: string) => hudCss.match(new RegExp(`@keyframes ${name} \\{[^]*?\\n  100% \\{([^}]*)\\}`))?.[1] ?? ''

  it.each(['hud-gains', 'hud-gains-side', 'hud-gains-fly'])('%s: 끝 모습이 다 사라진 것이다 (forwards가 붙드는 모습이 화면에 남지 않는다)', (name) => {
    // 새 탭 카드는 opacity 0.2로 끝나, 31×9px로 줄어든 카드가 다음 카드가 뜰 때까지 메뉴 단추 위에 남았다
    expect(lastFrame(name)).toMatch(/opacity: 0;/)
  })

  it('움직임이 끝난 카드는 Hud가 걷는다: is-showing을 떼면 보이지 않는 상자로도 남지 않는다 (visibility: hidden)', () => {
    // 줄(li)의 움직임이 끝난 것은 카드의 것이 아니다: 카드 자신의 animationend에만 뗀다
    expect(hudSource).toMatch(/this\.gains\.addEventListener\('animationend', \(e\) => e\.target === this\.gains && this\.gains\.classList\.remove\('is-showing'\)\)/)
    const base = hudCss.match(/\n\.hud__gains \{[^}]*\}/)?.[0] ?? ''
    expect(base).toMatch(/opacity: 0;/)
    expect(base).toMatch(/visibility: hidden;/)
  })

  it('새 탭 카드는 메뉴 단추에 닿을 때까지는 보인다: 날아가는 동안 흐려지다가 닿은 뒤에 사라진다', () => {
    const fly = hudCss.match(/@keyframes hud-gains-fly \{[^]*?\n\}/)?.[0] ?? ''
    const spot = (pct: string) => fly.match(new RegExp(`\\n  ${pct}% \\{[^}]*transform: ([^;]*);`))?.[1]
    // 닿는 자리(97%)와 끝(100%)은 같은 자리이고, 닿을 때는 아직 흐리게 보인다
    expect(spot('97')).toBeDefined()
    expect(spot('97')).toBe(spot('100'))
    expect(fly).toMatch(/97% \{ opacity: 0\.2;/)
  })
})

describe('카드 줄 앞의 표시 (E307 손 QA)', () => {
  const item = (grade: GearItem['grade'], stats: GearItem['stats']): GearItem => ({ uid: `g:${grade}`, part: 'body', base: '누빈 웃옷', grade, tier: 1, stats, source: { id: 'stone', value: 1 } })

  it('표시 없이 온 줄은 얻은 것(▲)이고 글은 그대로다', () => {
    expect(gainsMark('이동 속도 +6%')).toEqual({ mark: 'up', text: '이동 속도 +6%' })
    expect(gainsMark('후긴과 무닌 수 1 → 2')).toEqual({ mark: 'up', text: '후긴과 무닌 수 1 → 2' })
  })

  it('견주는 줄은 표시를 줄 앞에 달고, 그리는 쪽은 그것을 떼어 줄 앞의 표시 하나로 보인다', () => {
    for (const mark of ['up', 'down', 'same'] as const) expect(gainsMark(markLine(mark, '받는 피해 −7%'))).toEqual({ mark, text: '받는 피해 −7%' })
  })

  it('「더 좋은 장비 · 가방」의 줄: 좋아진 수치는 ▲, 나빠진 수치는 ▼, 같은 수치는 ·, 없던 수치는 ▲와 「새 수치」', () => {
    const worn = item('good', [
      { kind: 'damageTaken', value: -0.05 },
      { kind: 'maxHp', value: 30 },
      { kind: 'regen', value: 0.5 },
    ])
    const found = item('rare', [
      { kind: 'damageTaken', value: -0.07 },
      { kind: 'maxHp', value: 20 },
      { kind: 'regen', value: 0.5 },
      { kind: 'moveSpeed', value: 0.06 },
    ])
    const lines = betterLines(found, worn).map(gainsMark)
    expect(lines).toEqual([
      // 받는 피해는 줄수록 좋다
      { mark: 'up', text: '받는 피해 −7%' },
      { mark: 'down', text: '최대 생명 +20' },
      { mark: 'same', text: '초당 생명 재생 +0.5' },
      { mark: 'up', text: '이동 속도 +6% 새 수치' },
    ])
    // 줄 끝에 표시를 또 달지 않는다 (전: 「▲ 받는 피해 −7% ▲」, 나빠진 수치는 「▲ … ▼」)
    for (const line of lines) expect(line.text).not.toMatch(/[▲▼]/)
  })
})

describe('작은 알림을 땅의 카드 위로 올리기 (E307 손 QA)', () => {
  // 393×852: 알림은 아래 묶음 위(728~745), 다가가면 뜨는 카드는 그 자리를 덮는다 (546~760)
  const toast = { top: 728, bottom: 745, left: 114, right: 279 }
  const card = { top: 546, bottom: 760, left: 60, right: 333 }
  const GAP = 6

  it('카드에 가리면 카드 위 끝 바로 위로 올린다, 가리지 않으면 그대로', () => {
    expect(toastLift(toast, card, GAP)).toBe(745 - (546 - GAP))
    expect(toastLift(toast, null, GAP)).toBe(0)
    expect(toastLift(toast, { ...card, top: 760, bottom: 800 }, GAP)).toBe(0)
    expect(toastLift(toast, { ...card, left: 300, right: 393 }, GAP)).toBe(0)
  })

  it('올릴 자리가 화면 밖이면 그대로 둔다', () => {
    expect(toastLift(toast, { ...card, top: 10 }, GAP)).toBe(0)
  })

  it('떠 있는 알림은 올라가기만 한다: 읽는 도중에 카드가 닫혀도 제자리로 뛰어내리지 않는다', () => {
    const lifted = toastLift(toast, card, GAP)
    // 카드가 닫혔다 (걷기 시작·몇 초 뒤): 올라간 자리에 그대로
    expect(toastLift(toast, null, GAP, lifted)).toBe(lifted)
    // 더 높은 카드가 뜨면 더 올라간다
    expect(toastLift(toast, { ...card, top: 500 }, GAP, lifted)).toBe(745 - (500 - GAP))
    // 낮은 카드로 바뀌어도 내려오지 않는다
    expect(toastLift(toast, { ...card, top: 600 }, GAP, lifted)).toBe(lifted)
  })

  it('새 알림은 다시 잰다: 카드가 없으면 제자리에서 뜬다', () => {
    expect(toastLift(toast, null, GAP, 0)).toBe(0)
  })
})

describe('작은 알림과 주운 것의 이름이 떠 있는 시간 (E307 손 QA)', () => {
  /** hud-toast 움직임에서 그 투명도인 걸음들 (%) */
  const steps = (opacity: string) => [...(hudCss.match(/@keyframes hud-toast \{[^]*?\n\}/)?.[0] ?? '').matchAll(/(\d+)% \{ opacity: ([\d.]+);/g)].filter((m) => m[2] === opacity).map((m) => Number(m[1]))

  it('작은 알림은 2.5초 넘게 떠 있고, 그 가운데 2초 넘게는 다 보인다 (전: 1.8초, 다 보이는 동안 1.1초)', () => {
    expect(TOAST_LIFE).toBeGreaterThan(2500)
    const solid = steps('1')
    expect(solid.length).toBe(2)
    expect(((solid[1]! - solid[0]!) / 100) * TOAST_LIFE).toBeGreaterThan(2000)
    // 처음과 끝은 다 사라진 모습이다
    expect(steps('0')).toEqual([0, 100])
  })

  it('hud.css의 움직임은 Hud가 넘기는 길이(--life)를 받고, 기본값은 TOAST_LIFE와 같다', () => {
    const life = hudCss.match(/\.hud__toast\.is-showing \{\s*animation: hud-toast var\(--life, ([\d.]+)s\)/)?.[1]
    expect(Number(life) * 1000).toBe(TOAST_LIFE)
  })

  it('뒤에 기다리는 알림이 있을 때 자리를 내주는 시간은 그대로 짧다 (줄이 밀리지 않게)', () => {
    expect(TOAST_HOLD).toBeLessThan(TOAST_LIFE / 2)
  })

  it('주운 것의 이름도 2.5초 넘게 떠 있다. 뜰 때는 1.5배에서 제 크기로 줄어든다', () => {
    expect(LABEL_LIFE).toBeGreaterThan(2.5)
    expect(popScale(0)).toBe(1.5)
    expect(popScale(0.5)).toBe(1.25)
    expect(popScale(1)).toBe(1)
    expect(popScale(8)).toBe(1)
  })
})

describe('작은 알림의 줄 (E307)', () => {
  /** 줄에서 꺼낼 수 있는 대로 꺼내며 시간을 흘린다: 뜬 때(ms)와 글 */
  function texts(line: ToastLine, from = 0): { at: number; text: string }[] {
    const shown: { at: number; text: string }[] = []
    let now = from
    for (let wait = line.wait(now); wait !== null; wait = line.wait(now)) {
      now += Math.max(0, wait)
      shown.push({ at: now, text: line.take(now) })
    }
    return shown
  }

  it('알림 하나는 바로 뜨고, 뒤에 온 알림은 앞 알림이 1.2초를 채운 뒤에 뜬다 (서로 덮지 않는다)', () => {
    const line = new ToastLine()
    line.push('gearBetter', '더 좋은 장비 · 좋음 사슬 갑옷', TOAST_BUNDLES.gearBetter)
    line.push('merged', '합치기 · 좋음 가죽 장화', TOAST_BUNDLES.merged)
    expect(texts(line)).toEqual([
      { at: 0, text: '더 좋은 장비 · 좋음 사슬 갑옷' },
      { at: TOAST_HOLD, text: '합치기 · 좋음 가죽 장화' },
    ])
    // 앞 알림이 이미 1.2초 넘게 떠 있었으면 새 알림은 바로 뜬다
    line.push('shrineFound', '성소를 찾았다')
    expect(line.wait(TOAST_HOLD * 2 + 1)).toBeLessThanOrEqual(0)
    expect(TOAST_HOLD).toBeLessThan(TOAST_LIFE)
  })

  it('같은 때 주운 장비 넷: 「낌」 셋은 한 줄로 묶이고 「더 좋은 장비」는 그 뒤에 뜬다 (전: 마지막 하나만 보였다)', () => {
    const line = new ToastLine()
    for (const name of ['보통 가죽 장갑', '보통 뼈 목걸이', '좋음 돌 반지']) line.push('gearWorn', `${name} · 낌`, TOAST_BUNDLES.gearWorn)
    line.push('gearBetter', '더 좋은 장비 · 좋음 사슬 갑옷', TOAST_BUNDLES.gearBetter)
    expect(texts(line)).toEqual([
      { at: 0, text: '장비 셋 · 낌' },
      { at: TOAST_HOLD, text: '더 좋은 장비 · 좋음 사슬 갑옷' },
    ])
  })

  it('떠 있는 알림과 같은 종류가 이어 오면 기다리는 동안 묶인다: 걸으며 하나씩 주울 때', () => {
    const line = new ToastLine()
    line.push('merged', '합치기 · 좋음 가죽 장화', TOAST_BUNDLES.merged)
    expect(line.take(0)).toBe('합치기 · 좋음 가죽 장화')
    line.push('merged', '합치기 · 좋음 사슬 갑옷', TOAST_BUNDLES.merged)
    line.push('merged', '합치기 · 좋음 돌 반지', TOAST_BUNDLES.merged)
    expect(texts(line, 300)).toEqual([{ at: TOAST_HOLD, text: '합치기 둘' }])
  })

  it('묶는 글이 없는 종류는 새 글이 기다리던 글을 바꾼다: 줄에는 종류마다 하나만 선다', () => {
    const line = new ToastLine()
    line.push('gearWorn', '보통 가죽 장갑 · 낌', TOAST_BUNDLES.gearWorn)
    line.push('materialPicked', '서리 결정 · 재료')
    line.push('materialPicked', '거인의 뼈 · 재료')
    line.push('bagFull', '가방이 가득 찼다')
    expect(line.waiting).toHaveLength(3)
    expect(texts(line).map((t) => t.text)).toEqual(['보통 가죽 장갑 · 낌', '거인의 뼈 · 재료', '가방이 가득 찼다'])
  })
})

describe('이어 주운 이름의 줄 (E307)', () => {
  const ROW = 18

  it('떠 있는 이름이 없거나 한 줄 넘게 떨어져 있으면 바닥 줄에 뜬다', () => {
    expect(stackLift([], ROW)).toBe(0)
    expect(stackLift([ROW], ROW)).toBe(0)
    expect(stackLift([40, 90], ROW)).toBe(0)
    expect(stackLift([-ROW], ROW)).toBe(0)
  })

  it('한자리에서 같은 때 주운 이름은 한 줄씩 위로 쌓인다', () => {
    const lifts: number[] = []
    for (let i = 0; i < 5; i++) lifts.push(stackLift(lifts, ROW))
    expect(lifts).toEqual([0, 18, 36, 54, 72])
  })

  it('앞 이름이 반 줄쯤 떠올랐을 때 주운 이름은 그 이름 바로 위 줄에 선다 (전: 0.5초 뒤에 주우면 앞 이름과 똑같은 자리에 겹쳤다)', () => {
    // 0.5초 전에 주운 이름이 17.5px 떠올라 있다
    expect(stackLift([17.5], ROW)).toBe(35.5)
    // 앞 이름 둘 사이에 끼지 않고 그 위로
    expect(stackLift([10, 28], ROW)).toBe(46)
    // 걸으며 주워 앞 이름이 화면에서 조금 아래에 있을 때도 한 줄을 띄운다
    expect(stackLift([-6], ROW)).toBe(12)
  })

  it('아래가 비면 다시 바닥 줄부터 쓴다: 이어 줍는 동안 줄이 끝없이 높아지지 않는다', () => {
    expect(stackLift([26, 44, 62], ROW)).toBe(0)
  })
})

describe('고르는 카드의 누름 규칙 (E307)', () => {
  it('뜬 직후의 누름은 고른 것이 아니다: 잠금이 풀린 뒤 카드 위에서 시작된 누름만 받는다', () => {
    const gate = new PickGate()
    gate.show()
    // 싸우며 이어 누르던 톡이 방금 뜬 카드에 떨어졌다
    gate.press()
    expect(gate.take()).toBe(false)
    gate.arm()
    gate.press()
    expect(gate.take()).toBe(true)
  })

  it('잠긴 동안 시작된 누름은 잠금이 풀린 뒤에 떼어도 버린다', () => {
    const gate = new PickGate()
    gate.show()
    gate.press()
    gate.arm()
    expect(gate.take()).toBe(false)
  })

  it('카드가 뜨기 전에 게임 화면에서 시작된 누름의 click은 버린다 (카드 위에서 시작되지 않았다)', () => {
    const gate = new PickGate()
    gate.show()
    gate.arm()
    expect(gate.take()).toBe(false)
  })

  it('누름 하나는 한 번만 쓴다, 카드가 다시 뜨면 다시 잠긴다', () => {
    const gate = new PickGate()
    gate.show()
    gate.arm()
    gate.press()
    expect(gate.take()).toBe(true)
    expect(gate.take()).toBe(false)
    gate.press()
    gate.show()
    expect(gate.take()).toBe(false)
    gate.press()
    expect(gate.take()).toBe(false)
  })

  it('누름 없이 온 click(키보드·화면 읽기 도구)은 잠금이 풀린 뒤에만 받는다', () => {
    const gate = new PickGate()
    gate.show()
    expect(gate.take(false, true)).toBe(false)
    gate.arm()
    expect(gate.take(false, true)).toBe(true)
  })

  it('코드가 낸 click(봇·점검 스크립트)은 잠금과 상관없이 받는다', () => {
    const gate = new PickGate()
    gate.show()
    expect(gate.take(true)).toBe(true)
  })

  it('다른 손가락이 닿아 있는 동안의 톡 대신 낸 click은 사람 손이다: 코드가 낸 것으로 치지 않고 잠금을 그대로 받는다 (E307 손 QA)', () => {
    // 브라우저가 낸 click, 손가락 톡 대신 낸 click, 코드가 낸 click
    expect(byCode(true, false)).toBe(false)
    expect(byCode(false, true)).toBe(false)
    expect(byCode(false, false)).toBe(true)
    // 엄지를 얹은 채 뜬 직후에 누른 「아직」: 잠긴 동안의 누름이라 버린다
    const gate = new PickGate()
    gate.show()
    gate.press()
    expect(gate.take(byCode(false, true))).toBe(false)
    // 잠금이 풀린 뒤 카드 위에서 누르면 고른 것이다
    gate.arm()
    gate.press()
    expect(gate.take(byCode(false, true))).toBe(true)
    expect(pickGateSource).toMatch(/gate\.take\(byCode\(e\.isTrusted, isFingerClick\(e\)\), e\.detail === 0\)/)
  })
})
