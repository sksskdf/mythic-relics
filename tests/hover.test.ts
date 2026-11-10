import { describe, expect, it } from 'vitest'

import { pointsAt } from '../src/input/Input'
import { foldCount, itemUnderPointer, NearCard, type NearKind } from '../src/relics/hover'
import hudCss from '../src/ui/hud.css?raw'

const relic = (id: string, x: number, baseY: number, topY: number) => ({ item: id, base: { x, y: baseY }, top: { x, y: topY } })

describe('땅 유물 설명 카드: 커서 아래의 유물', () => {
  const items = [relic('a', 100, 300, 220), relic('b', 400, 300, 220)]

  it('떠 있는 모델 위나 빛기둥 중간, 발밑 어디에 올려도 그 유물을 고른다', () => {
    expect(itemUnderPointer(items, { x: 100, y: 222 }, 28)).toBe('a')
    expect(itemUnderPointer(items, { x: 110, y: 260 }, 28)).toBe('a')
    expect(itemUnderPointer(items, { x: 95, y: 305 }, 28)).toBe('a')
  })

  it('모양에서 범위만큼 벗어나면 고르지 않는다', () => {
    expect(itemUnderPointer(items, { x: 100, y: 180 }, 28)).toBeNull()
    expect(itemUnderPointer(items, { x: 250, y: 260 }, 28)).toBeNull()
  })

  it('둘이 겹치면 더 가까운 쪽을 고른다', () => {
    const close = [relic('a', 100, 300, 220), relic('b', 120, 300, 220)]
    expect(itemUnderPointer(close, { x: 115, y: 250 }, 28)).toBe('b')
    expect(itemUnderPointer(close, { x: 104, y: 250 }, 28)).toBe('a')
  })

  it('모델이 화면에서 한 점으로 보일 때(발밑과 위가 같을 때)도 동작한다', () => {
    expect(itemUnderPointer([relic('a', 50, 50, 50)], { x: 60, y: 50 }, 28)).toBe('a')
  })
})

describe('커서가 게임 화면을 가리키는가 (E307)', () => {
  const canvas = {}
  const card = {}

  it('게임 화면에 닿은 사건이고 자리가 화면 안이면 가리킨다', () => {
    expect(pointsAt(canvas, canvas, 100, 200, 1280, 720)).toBe(true)
  })

  it('게임 화면을 덮은 DOM(고르는 카드·작은 지도) 위에서는 자리가 안이어도 가리키지 않는다', () => {
    expect(pointsAt(canvas, card, 100, 200, 1280, 720)).toBe(false)
    expect(pointsAt(canvas, null, 100, 200, 1280, 720)).toBe(false)
  })

  it('창 밖으로 나간 자리는 가리키지 않는다', () => {
    expect(pointsAt(canvas, canvas, -4, 200, 1280, 720)).toBe(false)
    expect(pointsAt(canvas, canvas, 100, 724, 1280, 720)).toBe(false)
  })
})

describe('다가가면 뜨는 카드 (휴대폰, E307)', () => {
  const GEAR: NearKind = { near: 3, far: 4.5, hold: 3, rank: 0, drops: true }
  const TRACE: NearKind = { near: 7, far: 10, hold: 6, rank: 1, drops: false }
  /** 한 프레임: 땅에 있는 것들과 주인공과의 거리 (넷째 값은 이미 읽은 흔적인가) */
  const frame = (card: NearCard, items: readonly (readonly [string, number, NearKind, boolean?])[], moving: boolean, now: number, fighting = false) => {
    card.begin(now, moving, fighting)
    for (const [key, dist, kind, read] of items) card.see(key, dist, kind, read)
    return card.end()
  }

  it('멀리 있던 것에 걸어 들어서면 카드가 뜬다', () => {
    const card = new NearCard()
    expect(frame(card, [['axe', 8, GEAR]], true, 0)).toBeNull()
    expect(frame(card, [['axe', 3.4, GEAR]], true, 0.5)).toBeNull()
    expect(frame(card, [['axe', 2.9, GEAR]], true, 1)).toBe('axe')
  })

  it('걸어 들어온 걸음으로는 닫히지 않고, 멈췄다 다시 걷기 시작하면 닫힌다', () => {
    const card = new NearCard()
    frame(card, [['axe', 8, GEAR]], true, 0)
    expect(frame(card, [['axe', 2.9, GEAR]], true, 1)).toBe('axe')
    expect(frame(card, [['axe', 2.5, GEAR]], true, 1.2)).toBe('axe')
    expect(frame(card, [['axe', 2.5, GEAR]], false, 1.4)).toBe('axe')
    expect(frame(card, [['axe', 2.4, GEAR]], true, 1.6)).toBeNull()
  })

  it('서 있으면 hold초 뒤에 닫히고, 곁에 머무는 동안에는 다시 뜨지 않는다', () => {
    const card = new NearCard()
    frame(card, [['axe', 8, GEAR]], true, 0)
    expect(frame(card, [['axe', 2.9, GEAR]], true, 1)).toBe('axe')
    expect(frame(card, [['axe', 2.9, GEAR]], false, 3.9)).toBe('axe')
    expect(frame(card, [['axe', 2.9, GEAR]], false, 4.1)).toBeNull()
    // 곁을 서성여도 (near 밖 far 안을 드나들어도) 다시 뜨지 않는다
    expect(frame(card, [['axe', 4, GEAR]], true, 5)).toBeNull()
    expect(frame(card, [['axe', 2, GEAR]], true, 6)).toBeNull()
  })

  it('떠났다(far 밖) 돌아오면 다시 뜬다', () => {
    const card = new NearCard()
    frame(card, [['axe', 8, GEAR]], true, 0)
    frame(card, [['axe', 2.9, GEAR]], true, 1)
    frame(card, [['axe', 2.9, GEAR]], false, 5)
    expect(frame(card, [['axe', 5, GEAR]], true, 6)).toBeNull()
    expect(frame(card, [['axe', 2.8, GEAR]], true, 7)).toBe('axe')
  })

  it('카드가 뜬 채 떠나거나 주우면(땅에서 사라지면) 바로 닫힌다', () => {
    const card = new NearCard()
    frame(card, [['axe', 8, GEAR]], true, 0)
    expect(frame(card, [['axe', 2.9, GEAR]], true, 1)).toBe('axe')
    expect(frame(card, [], true, 1.2)).toBeNull()
    const other = new NearCard()
    frame(other, [['axe', 8, GEAR]], true, 0)
    frame(other, [['axe', 2.9, GEAR]], true, 1)
    expect(frame(other, [['axe', 4.6, GEAR]], true, 1.5)).toBeNull()
  })

  it('싸우다 곁에 떨어진 장비는 띄우지 않는다 (떠났다 돌아오면 띄운다)', () => {
    const card = new NearCard()
    frame(card, [], false, 0)
    expect(frame(card, [['drop', 1.8, GEAR]], false, 1)).toBeNull()
    expect(frame(card, [['drop', 1.2, GEAR]], true, 2)).toBeNull()
    // 먼 곳에 떨어진 것은 걸어가면 뜬다
    expect(frame(card, [['drop', 1.2, GEAR], ['far', 6, GEAR]], false, 3)).toBeNull()
    expect(frame(card, [['drop', 5, GEAR], ['far', 2.5, GEAR]], true, 4)).toBe('far')
  })

  it('신의 흔적은 처음 본 자리가 곁이어도 뜬다 (땅에 들어서자마자 곁에 있는 흔적)', () => {
    const card = new NearCard()
    expect(frame(card, [['thor', 6, TRACE]], false, 0)).toBe('thor')
  })

  it('한 번에 하나: 떠 있는 동안 들어선 장비는 건너뛰고, 신의 흔적은 바꿔 띄운다', () => {
    const card = new NearCard()
    frame(card, [['a', 8, GEAR], ['b', 9, GEAR], ['thor', 20, TRACE]], true, 0)
    expect(frame(card, [['a', 2.9, GEAR], ['b', 5, GEAR], ['thor', 12, TRACE]], true, 1)).toBe('a')
    expect(frame(card, [['a', 2, GEAR], ['b', 2.9, GEAR], ['thor', 9, TRACE]], true, 1.5)).toBe('a')
    expect(frame(card, [['a', 2, GEAR], ['b', 2, GEAR], ['thor', 6.9, TRACE]], true, 2)).toBe('thor')
    // 흔적 카드는 제 시간(6초)을 채운다. 건너뛴 장비는 흔적 카드가 닫힌 뒤에도 다시 뜨지 않는다
    expect(frame(card, [['a', 2, GEAR], ['b', 2, GEAR], ['thor', 5, TRACE]], true, 7.9)).toBe('thor')
    expect(frame(card, [['a', 2, GEAR], ['b', 2, GEAR], ['thor', 5, TRACE]], true, 8.1)).toBeNull()
  })

  it('싸움이 시작되면 닫고, 싸우는 동안 들어선 장비는 싸움이 끝나도 띄우지 않는다 (떠났다 돌아오면 띄운다)', () => {
    const card = new NearCard()
    frame(card, [['thor', 20, TRACE], ['axe', 9, GEAR]], true, 0)
    expect(frame(card, [['thor', 6.5, TRACE], ['axe', 9, GEAR]], true, 1)).toBe('thor')
    expect(frame(card, [['thor', 3, TRACE], ['axe', 9, GEAR]], false, 2, true)).toBeNull()
    expect(frame(card, [['thor', 3, TRACE], ['axe', 2.5, GEAR]], true, 3, true)).toBeNull()
    // 읽을 만큼(1초) 떠 있다 싸움에 닫힌 흔적 카드도 곁에 있는 동안에는 다시 뜨지 않는다
    expect(frame(card, [['thor', 3, TRACE], ['axe', 2.5, GEAR]], false, 4)).toBeNull()
    expect(frame(card, [['thor', 12, TRACE], ['axe', 6, GEAR]], true, 5)).toBeNull()
    expect(frame(card, [['thor', 12, TRACE], ['axe', 2.5, GEAR]], true, 6)).toBe('axe')
  })

  it('싸우며 들어선 신의 흔적은 곁에서 기다렸다 싸움이 끝나면 뜬다 (카드를 못 본 채 첫 신이 정해지지 않게)', () => {
    const card = new NearCard()
    frame(card, [['thor', 9.5, TRACE]], false, 0, true)
    expect(frame(card, [['thor', 6.5, TRACE]], true, 1, true)).toBeNull()
    expect(frame(card, [['thor', 5, TRACE]], false, 2, true)).toBeNull()
    expect(frame(card, [['thor', 5, TRACE]], false, 3)).toBe('thor')
    // 띄운 뒤에는 여느 카드처럼 hold초 뒤 닫히고 곁에서는 다시 뜨지 않는다
    expect(frame(card, [['thor', 5, TRACE]], false, 9.1)).toBeNull()
    expect(frame(card, [['thor', 5, TRACE]], false, 10)).toBeNull()
  })

  it('싸움이 끝난 지 반 초가 안 됐으면 (칼질 사이의 틈) 흔적 카드를 띄우지 않는다', () => {
    const card = new NearCard()
    frame(card, [['thor', 9.5, TRACE]], false, 0, true)
    expect(frame(card, [['thor', 6, TRACE]], false, 1, true)).toBeNull()
    expect(frame(card, [['thor', 6, TRACE]], false, 1.2)).toBeNull()
    expect(frame(card, [['thor', 6, TRACE]], false, 1.3, true)).toBeNull()
    expect(frame(card, [['thor', 6, TRACE]], false, 1.6)).toBeNull()
    expect(frame(card, [['thor', 6, TRACE]], true, 1.9)).toBe('thor')
  })

  it('뜨자마자 싸움에 닫힌 흔적 카드는 못 본 것이라 싸움이 끝나면 다시 뜬다', () => {
    const card = new NearCard()
    frame(card, [['thor', 12, TRACE]], true, 0)
    expect(frame(card, [['thor', 6.9, TRACE]], true, 1)).toBe('thor')
    expect(card.read).toBe(false)
    expect(frame(card, [['thor', 5, TRACE]], false, 1.4, true)).toBeNull()
    expect(frame(card, [['thor', 5, TRACE]], false, 4, true)).toBeNull()
    expect(frame(card, [['thor', 5, TRACE]], false, 5)).toBe('thor')
    // 이번에는 읽을 만큼(1초) 떠 있었다: 다시 싸움에 닫히면 곁에 있는 동안 다시 뜨지 않는다
    expect(frame(card, [['thor', 5, TRACE]], false, 6.1)).toBe('thor')
    expect(card.read).toBe(true)
    expect(frame(card, [['thor', 5, TRACE]], false, 6.5, true)).toBeNull()
    expect(frame(card, [['thor', 5, TRACE]], false, 8)).toBeNull()
  })

  it('이미 읽은 흔적은 달려 지나가면 다시 뜨지 않고, 곁에 가만히 서면 뜬다', () => {
    const card = new NearCard()
    // 처음 만난 흔적은 달려 들어서도 뜬다
    frame(card, [['thor', 12, TRACE]], true, 0)
    expect(frame(card, [['thor', 6.9, TRACE]], true, 0.5)).toBe('thor')
    expect(frame(card, [['thor', 11, TRACE, true]], true, 2)).toBeNull()
    // 읽은 뒤: 떠났다 돌아와 달려 지나가는 내내 뜨지 않는다
    for (const [dist, now] of [[6.9, 3], [4, 3.5], [2.2, 4], [4, 4.5], [6.9, 5], [9.5, 5.5], [11, 6]] as const) expect(frame(card, [['thor', dist, TRACE, true]], true, now), `${dist}m`).toBeNull()
    // 곁에 멈춰 반 초 서 있으면 뜨고, 다시 걸으면 닫히며, 곁에 있는 동안에는 또 서 있어도 뜨지 않는다
    expect(frame(card, [['thor', 6, TRACE, true]], true, 7)).toBeNull()
    expect(frame(card, [['thor', 5, TRACE, true]], false, 7.2)).toBeNull()
    expect(frame(card, [['thor', 5, TRACE, true]], false, 7.6)).toBe('thor')
    expect(frame(card, [['thor', 5, TRACE, true]], true, 8)).toBeNull()
    expect(frame(card, [['thor', 4, TRACE, true]], false, 9)).toBeNull()
    // 형편이 바뀌어 다시 읽을 카드가 되면 (read가 아님) 떠났다 돌아올 때 달려 들어서도 뜬다
    frame(card, [['thor', 11, TRACE]], true, 10)
    expect(frame(card, [['thor', 6.9, TRACE]], true, 11)).toBe('thor')
  })

  it('읽은 흔적 곁에 싸우려고 잠깐 멈춘 걸음에는 뜨지 않는다 (싸움이 끝나고 가만히 서 있으면 뜬다)', () => {
    const card = new NearCard()
    frame(card, [['thor', 12, TRACE, true]], true, 0)
    expect(frame(card, [['thor', 5, TRACE, true]], true, 1)).toBeNull()
    expect(frame(card, [['thor', 5, TRACE, true]], false, 1.2)).toBeNull()
    expect(frame(card, [['thor', 5, TRACE, true]], false, 1.4, true)).toBeNull()
    expect(frame(card, [['thor', 5, TRACE, true]], false, 4, true)).toBeNull()
    expect(frame(card, [['thor', 5, TRACE, true]], false, 4.3)).toBeNull()
    expect(frame(card, [['thor', 5, TRACE, true]], false, 4.6)).toBe('thor')
  })

  it('읽은 흔적 곁을 달릴 때도 떨어진 장비 카드는 뜨고, 그 뒤 흔적 곁에 서 있으면 흔적 카드로 바뀐다', () => {
    const card = new NearCard()
    frame(card, [['thor', 12, TRACE, true], ['axe', 9, GEAR]], true, 0)
    expect(frame(card, [['thor', 6, TRACE, true], ['axe', 2.8, GEAR]], true, 1)).toBe('axe')
    expect(frame(card, [['thor', 5, TRACE, true], ['axe', 2, GEAR]], false, 1.2)).toBe('axe')
    expect(frame(card, [['thor', 5, TRACE, true], ['axe', 2, GEAR]], false, 1.6)).toBe('thor')
  })

  it('다른 흔적 카드가 떠 있을 때 들어선 흔적은 그 카드가 닫힌 뒤에 뜬다', () => {
    const card = new NearCard()
    frame(card, [['thor', 12, TRACE], ['odin', 14, TRACE]], true, 0)
    expect(frame(card, [['thor', 6.5, TRACE], ['odin', 9, TRACE]], true, 1)).toBe('thor')
    expect(frame(card, [['thor', 5, TRACE], ['odin', 6.5, TRACE]], true, 2)).toBe('thor')
    expect(frame(card, [['thor', 5, TRACE], ['odin', 6.5, TRACE]], false, 7.1)).toBe('odin')
  })

  it('한 프레임에 둘이 함께 들어서면 가까운 쪽을 띄운다', () => {
    const card = new NearCard()
    frame(card, [['a', 8, GEAR], ['b', 8, GEAR]], true, 0)
    expect(frame(card, [['a', 2.8, GEAR], ['b', 2.2, GEAR]], true, 1)).toBe('b')
  })

  it('close(창·장면·고르는 카드가 열림)로 닫은 카드는 곁에 있는 동안 다시 뜨지 않는다', () => {
    const card = new NearCard()
    frame(card, [['thor', 20, TRACE]], true, 0)
    expect(frame(card, [['thor', 6, TRACE]], true, 1)).toBe('thor')
    card.close()
    expect(card.shown).toBeNull()
    expect(frame(card, [['thor', 5, TRACE]], false, 2)).toBeNull()
  })

  it('skip(고르는 카드에 가려 띄우지 못함): 신의 흔적은 곁에서 기다렸다 뜨고, 떨어진 장비는 건너뛴다', () => {
    const card = new NearCard()
    frame(card, [['thor', 20, TRACE], ['axe', 9, GEAR]], true, 0)
    expect(frame(card, [['thor', 20, TRACE], ['axe', 2.8, GEAR]], true, 1)).toBe('axe')
    card.skip()
    expect(frame(card, [['thor', 20, TRACE], ['axe', 2.5, GEAR]], false, 2)).toBeNull()
    expect(frame(card, [['thor', 6.5, TRACE], ['axe', 8, GEAR]], true, 3)).toBe('thor')
    card.skip()
    expect(card.shown).toBeNull()
    expect(frame(card, [['thor', 6, TRACE], ['axe', 8, GEAR]], true, 4)).toBe('thor')
  })
})

describe('다가가면 뜨는 카드 간추리기 (휴대폰, E307)', () => {
  /** 단락 다섯(머리 48 · 자리 줄 24 · 단락 80 · 단락 60 · 이야기 45)짜리 카드: 아래 n개를 접었을 때의 높이 */
  const heights = [48, 24, 80, 60, 45]
  const heightWith = (folded: number) => heights.slice(0, heights.length - folded).reduce((sum, h) => sum + h, 0)

  it('띠에 다 들어가면 접지 않는다', () => {
    expect(foldCount(5, 2, 260, heightWith)).toBe(0)
  })

  it('들어갈 때까지만 아래쪽 단락부터 접는다', () => {
    expect(foldCount(5, 2, 240, heightWith)).toBe(1)
    expect(foldCount(5, 2, 200, heightWith)).toBe(2)
  })

  it('머리와 첫 단락까지는 띠가 모자라도 남긴다', () => {
    expect(foldCount(5, 2, 100, heightWith)).toBe(2)
    expect(foldCount(3, 2, 10, (folded) => heightWith(folded + 2))).toBe(0)
  })
})

describe('HUD의 쌓임과 누름 (E307, hud.css)', () => {
  /** 선택자 하나짜리 규칙의 몸 */
  const rule = (selector: string) => hudCss.match(new RegExp(`(?:^|\\n)${selector.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`))?.[1] ?? ''

  it('.hud는 제 쌓임 맥락을 만들지 않는다: 안의 정보 화면·고르는 카드가 말풍선·이름표·커서 카드·조이스틱과 한 줄에서 견줘진다', () => {
    const hud = rule('.hud')
    expect(hud).toContain('position: absolute')
    // 쌓임 맥락을 만드는 것들 (position: fixed도 만든다)
    for (const maker of ['z-index', 'transform', 'filter', 'opacity', 'isolation', 'contain', 'will-change', 'mix-blend-mode']) expect(hud, maker).not.toContain(`${maker}:`)
  })

  it('터치 화면에서는 엄지가 놓이는 아래 묶음과 원천 칩이 누름을 받지 않는다 (그 위에서도 조이스틱이 시작된다)', () => {
    const touch = hudCss.match(/\.is-touch button\.hud__slot,[^{]*\{([^}]*)\}/)
    expect(touch?.[0]).toContain('.is-touch .hud__life')
    expect(touch?.[0]).toContain('.is-touch .hud__ult')
    expect(touch?.[0]).toContain('.is-touch .hud__essence')
    expect(touch?.[1]).toContain('pointer-events: none')
    // 초상은 터치에서도 눌린다 (정보 화면을 여는 길)
    expect(touch?.[0]).not.toContain('hud__portrait')
    expect(rule('.hud__portrait')).toContain('pointer-events: auto')
  })
})
