import { describe, expect, it } from 'vitest'

import { CHAPTERS } from '../src/data/chapters'
import { AFTER_HOLD, CARD_HOLD, MOMENTS, type MomentId, SLOW_MOTION, tierOf } from '../src/data/moments'
import { REGIONS } from '../src/data/regions'
import { SCENES, sceneId } from '../src/data/scenes'
import { Feel } from '../src/game/context'
import { EventBus, type GameEvents } from '../src/game/events'
import { type MomentShow, MomentSystem } from '../src/game/systems/Moments'

/** 순간 시스템에 필요한 것만 채운 게임: HUD·연출·장면은 부른 것을 적기만 한다 */
function setup(options: { scenes?: boolean; slow?: boolean; cardBusy?: () => boolean } = {}) {
  const bus = new EventBus<GameEvents>()
  const calls: string[] = []
  const feel = new Feel()
  let scene: string | null = null
  const ctx = {
    bus,
    feel,
    hero: { object: { position: { x: 0, y: 0, z: 0 } } },
    hud: {
      showToast: (text: string) => calls.push(`알림:${text}`),
      showGains: (_kind: string, title: string, _c: string, _i: string, _l: readonly string[], size: string) => calls.push(`${size === 'big' ? '큰 카드' : '카드'}:${title}`),
      flash: () => calls.push('번쩍'),
    },
    fx: { power: { column: () => calls.push('빛기둥') } },
  }
  bus.on('sound', ({ cue }) => calls.push(`소리:${cue}`))
  bus.on('music', ({ theme }) => calls.push(`곡:${theme ?? '땅'}`))
  const moments = new MomentSystem(ctx as never, {
    playScene: (id) => {
      if (options.scenes === false) return false
      scene = id
      calls.push(`장면:${id}`)
      return true
    },
    sceneActive: () => scene !== null,
    slowMotion: () => options.slow ?? true,
    ...(options.cardBusy ? { cardBusy: options.cardBusy } : {}),
  })
  const emit = (m: MomentShow) => bus.emit('moment', m)
  const card = (title: string) => ({ kind: '시험', title, color: '#fff', lines: ['한 줄'] })
  /** 실제 시간 seconds초를 프레임 0.1초씩 흘린다 (느린 동작도 함께 줄어든다) */
  const run = (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += 0.1) {
      feel.slowLeft = Math.max(0, feel.slowLeft - 0.1)
      moments.update(0.1)
    }
  }
  return { bus, calls, feel, moments, emit, card, run, endScene: () => (scene = null) }
}

describe('순간의 크기 (E23-01)', () => {
  it('사건 → 등급 표가 TIMELINE.md 6장과 같다', () => {
    const tiers = (tier: number) => (Object.keys(MOMENTS) as MomentId[]).filter((id) => tierOf(id) === tier)
    // 1 작은 알림: 재료·흔한 장비 줍기
    expect(tiers(1)).toEqual(expect.arrayContaining(['gearPicked', 'materialPicked', 'bossMaterial', 'salvaged', 'insight']))
    // 2 카드: 장비를 칸에 낌·가방에 더 좋은 장비, 장치가 처음 열림
    expect(tiers(2)).toEqual(expect.arrayContaining(['gearWorn', 'gearBetter', 'convenience', 'realmOpened', 'mythOpened', 'tabOpened']))
    // 3 큰 카드: 신화 단계, 유물 벼리기
    expect(tiers(3)).toEqual(expect.arrayContaining(['mythLevel', 'forged']))
    // 4 장면: 첫 신화 고르기, 장 보스 처치, 장 넘어가기, 엔딩
    expect(tiers(4).sort()).toEqual(['chapterBoss', 'chapterChanged', 'ending', 'mythChosen'])
  })

  it('장 넘어가기와 장 보스(마지막 보스는 엔딩)의 장면이 모두 있다 (E23-02)', () => {
    for (const c of CHAPTERS.slice(1)) expect(SCENES[sceneId('chapter', c.id)], c.id).toBeDefined()
    const bosses = CHAPTERS.flatMap((c) => c.steps).filter((s) => s.kind === 'boss')
    for (const step of bosses.slice(0, -1)) expect(SCENES[sceneId('down', REGIONS[step.region]!.boss!.enemy ?? 'king')], step.region).toBeDefined()
    expect(SCENES.ending).toBeDefined()
  })

  it('작은 알림은 바로 화면 아래 한 줄, 카드는 다음 프레임에 작은 카드', () => {
    const { calls, emit, card, run } = setup()
    emit({ id: 'gearPicked', text: '낡은 장화 · 가방' })
    expect(calls).toEqual(['알림:낡은 장화 · 가방'])
    emit({ id: 'gearWorn', card: card('서리 장화') })
    run(0.1)
    expect(calls).toEqual(['알림:낡은 장화 · 가방', '카드:서리 장화'])
  })

  it('큰 카드는 그 색으로 번쩍·하늘 기둥·북소리와 가운데 큰 카드', () => {
    const { calls, emit, card, run } = setup()
    emit({ id: 'mythLevel', card: card('천둥군주') })
    run(0.1)
    expect(calls).toEqual(['번쩍', '빛기둥', '소리:drum', '큰 카드:천둥군주'])
  })

  it('장면은 느린 동작 뒤에 열리고, 얻은 것 카드는 장면이 끝난 뒤에 뜬다', () => {
    const { calls, feel, emit, card, run, endScene } = setup()
    emit({ id: 'chapterBoss', scene: 'downKing', slow: true, card: card('거인 왕') })
    run(0.1)
    expect(feel.timeScale).toBe(SLOW_MOTION.scale)
    expect(calls).toEqual([])
    run(SLOW_MOTION.seconds + 0.1)
    expect(calls).toEqual(['장면:downKing'])
    run(1)
    expect(calls).toEqual(['장면:downKing'])
    endScene()
    run(0.1)
    expect(calls).toEqual(['장면:downKing', '카드:거인 왕'])
  })

  it('온 차례대로: 보스가 쓰러진 프레임이면 보스 장면 → 장 넘어가기 장면(뒤에 장 제목 띠) → 신화 개방 카드', () => {
    const { calls, emit, card, run, endScene } = setup({ slow: false })
    // 게임에서 보내는 차례: 재료 알림, 장 보스(장 진행), 장 넘어가기(장 진행), 신화권 카드(신화 고르기)
    emit({ id: 'bossMaterial', text: '거인의 증표' })
    emit({ id: 'chapterBoss', scene: 'downKing' })
    emit({ id: 'chapterChanged', scene: 'chapterInterlude', after: () => calls.push('장 제목 띠') })
    emit({ id: 'realmOpened', card: card('북유럽 신화 3') })
    run(0.1)
    expect(calls).toEqual(['알림:거인의 증표', '장면:downKing'])
    endScene()
    run(0.1)
    expect(calls.at(-1)).toBe('장면:chapterInterlude')
    endScene()
    run(0.1)
    expect(calls.slice(2)).toEqual(['장면:chapterInterlude', '장 제목 띠', '카드:북유럽 신화 3'])
  })

  it('벼린 큰 카드가 먼저, 그 뒤에 열린 장의 장면 (카드가 보일 시간을 기다린다)', () => {
    const { calls, emit, card, run } = setup({ slow: false })
    emit({ id: 'forged', card: card('묠니르') })
    emit({ id: 'chapterChanged', scene: 'chapterGreek' })
    run(0.1)
    expect(calls).toEqual(['번쩍', '빛기둥', '소리:drum', '큰 카드:묠니르'])
    run(CARD_HOLD.big)
    expect(calls.at(-1)).toBe('장면:chapterGreek')
  })

  it('카드를 띄운 뒤 다음 장면은 카드가 자리를 지키는 동안 기다린다 (큰 카드 4.5초, 카드 3초)', () => {
    const { calls, emit, card, run } = setup({ slow: false })
    emit({ id: 'forged', card: card('묠니르') })
    run(0.1)
    emit({ id: 'chapterChanged', scene: 'chapterGreek' })
    run(CARD_HOLD.big - 0.3)
    expect(calls).not.toContain('장면:chapterGreek')
    run(0.5)
    expect(calls).toContain('장면:chapterGreek')
  })

  it('HUD 줄에 보일 카드가 남아 있으면 장면이 기다린다 (카드 둘이 연달아 올 때)', () => {
    let busy = true
    const { calls, emit, run } = setup({ slow: false, cardBusy: () => busy })
    emit({ id: 'chapterChanged', scene: 'chapterGreek' })
    run(CARD_HOLD.big + 1)
    expect(calls).toEqual([])
    busy = false
    run(0.1)
    expect(calls).toEqual(['장면:chapterGreek'])
  })

  it('감기(봇·점검) 중에는 HUD 카드의 실제 시계를 보지 않는다', () => {
    const { calls, emit, moments } = setup({ slow: false, cardBusy: () => true })
    emit({ id: 'chapterChanged', scene: 'chapterGreek' })
    moments.update(0.1, false)
    expect(calls).toEqual(['장면:chapterGreek'])
  })

  it('장면 뒤 장 제목 띠가 지나가는 동안 다음 장면은 기다린다', () => {
    const { calls, emit, run, endScene } = setup({ slow: false })
    emit({ id: 'chapterChanged', scene: 'chapterGreek', after: () => calls.push('장 제목 띠') })
    emit({ id: 'chapterBoss', scene: 'downChimera' })
    run(0.1)
    endScene()
    run(0.1)
    expect(calls).toEqual(['장면:chapterGreek', '장 제목 띠'])
    run(AFTER_HOLD - 0.3)
    expect(calls).not.toContain('장면:downChimera')
    run(0.5)
    expect(calls).toContain('장면:downChimera')
  })

  it('느린 동작은 앞의 카드를 기다리는 동안에도 쓰러진 순간에 건다', () => {
    const { calls, feel, emit, card, run } = setup()
    emit({ id: 'gearWorn', card: card('장화') })
    run(0.1)
    emit({ id: 'chapterBoss', scene: 'downKing', slow: true })
    expect(feel.timeScale).toBe(SLOW_MOTION.scale)
    run(CARD_HOLD.card + 0.2)
    expect(calls).toContain('장면:downKing')
  })

  it('장면을 띄우지 않으면(봇) 느린 동작 없이 카드와 할 일을 바로', () => {
    const { calls, feel, emit, card, run } = setup({ scenes: false, slow: false })
    emit({ id: 'ending', scene: 'ending', slow: true, music: 'ending', card: card('첫 엔딩'), after: () => calls.push('엔딩 뒤') })
    run(0.1)
    expect(feel.timeScale).toBe(1)
    expect(calls).toEqual(['곡:ending', '곡:땅', '큰 카드:첫 엔딩', '엔딩 뒤'])
  })

  it('엔딩 장면 동안은 엔딩 곡, 끝나면 땅의 곡으로', () => {
    const { calls, emit, run, endScene } = setup({ slow: false })
    emit({ id: 'ending', scene: 'ending', music: 'ending' })
    run(0.1)
    expect(calls).toEqual(['곡:ending', '장면:ending'])
    endScene()
    run(0.1)
    expect(calls).toEqual(['곡:ending', '장면:ending', '곡:땅'])
  })
})
