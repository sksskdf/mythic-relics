/**
 * 효과음 목록 (E5-02). 녹음한 소리 대신 코드로 합성한다: 사용 허락 걱정이 없고, 모델처럼 코드로 다듬을 수 있다.
 * 소리 하나 = 길이 + 합성법. 합성은 발진기(음)와 잡음(타격·바람)을 거르고 감싸는 것뿐이다.
 * 정식 소리(E9-08 외주)가 오면 같은 이름에 녹음 파일을 붙이면 된다.
 */
export type SoundCue =
  | 'step'
  | 'swing'
  | 'hit'
  | 'hitStrong'
  | 'thunder'
  | 'blade'
  | 'kill'
  | 'shatter'
  | 'hammerThrow'
  | 'quake'
  | 'ingotThrow'
  | 'decoy'
  | 'flameSweep'
  | 'pierce'
  | 'clone'
  | 'ultimate'
  | 'legion'
  | 'bladeDance'
  | 'telegraph'
  | 'impact'
  | 'hurt'
  | 'death'
  | 'revive'
  | 'relic'
  | 'equip'
  | 'manifest'
  | 'promote'
  | 'rebirth'
  | 'drum'
  | 'ui'
  | 'uiOpen'
  | 'uiClose'

/** 소리 하나의 길이·크기·합성법 */
export interface SoundRecipe {
  /** 길이 (초). 동시 재생 제한에 쓴다 */
  duration: number
  /** 기본 크기 0~1 */
  volume: number
  play(s: Synth, t: number): void
}

/** 합성 도구: 음 하나, 잡음 한 번 */
export class Synth {
  private static noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>()

  constructor(
    readonly ctx: BaseAudioContext,
    readonly out: AudioNode,
  ) {}

  private noiseBuffer(): AudioBuffer {
    let buffer = Synth.noiseCache.get(this.ctx)
    if (!buffer) {
      buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      Synth.noiseCache.set(this.ctx, buffer)
    }
    return buffer
  }

  /** 빠르게 올라갔다가 duration 동안 줄어드는 크기 */
  private envelope(t: number, peak: number, attack: number, duration: number): GainNode {
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(peak, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.01, duration))
    return g
  }

  /** 음 하나: from에서 to(Hz)로 미끄러진다 */
  tone(t: number, o: { type?: OscillatorType; from: number; to?: number; duration: number; gain: number; attack?: number; detune?: number }): void {
    const osc = this.ctx.createOscillator()
    osc.type = o.type ?? 'sine'
    osc.frequency.setValueAtTime(o.from, t)
    if (o.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + o.duration)
    if (o.detune) osc.detune.setValueAtTime(o.detune, t)
    const env = this.envelope(t, o.gain, o.attack ?? 0.005, o.duration)
    osc.connect(env).connect(this.out)
    osc.start(t)
    osc.stop(t + o.duration + 0.05)
  }

  /** 잡음 한 번: 거름(filter)의 중심이 from에서 to(Hz)로 움직인다 */
  noise(t: number, o: { filter?: BiquadFilterType; from: number; to?: number; q?: number; duration: number; gain: number; attack?: number }): void {
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer()
    src.playbackRate.value = 0.8 + Math.random() * 0.4
    const filter = this.ctx.createBiquadFilter()
    filter.type = o.filter ?? 'bandpass'
    filter.frequency.setValueAtTime(o.from, t)
    if (o.to !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + o.duration)
    filter.Q.value = o.q ?? 1
    const env = this.envelope(t, o.gain, o.attack ?? 0.003, o.duration)
    src.connect(filter).connect(env).connect(this.out)
    src.start(t, Math.random() * 0.5)
    src.stop(t + o.duration + 0.05)
  }

  /** 여러 음을 차례로 (step초 간격) */
  arpeggio(t: number, notes: readonly number[], step: number, o: { type?: OscillatorType; duration: number; gain: number }): void {
    notes.forEach((f, i) => this.tone(t + i * step, { ...o, from: f }))
  }
}

/** 조금씩 다르게: 같은 소리가 반복돼도 기계적으로 들리지 않게 */
const vary = (f: number, amount = 0.06) => f * (1 + (Math.random() * 2 - 1) * amount)

export const SOUNDS: Record<SoundCue, SoundRecipe> = {
  // 눈 밟는 소리: 짧고 낮게 바스락
  step: {
    duration: 0.08,
    volume: 0.22,
    play: (s, t) => s.noise(t, { from: vary(900, 0.2), to: 400, q: 0.8, duration: 0.07, gain: 1 }),
  },
  swing: {
    duration: 0.14,
    volume: 0.25,
    play: (s, t) => s.noise(t, { from: vary(700), to: 2400, q: 1.6, duration: 0.13, gain: 1, attack: 0.03 }),
  },
  // 타격 1단계: 둔탁한 퍽
  hit: {
    duration: 0.12,
    volume: 0.5,
    play: (s, t) => {
      s.tone(t, { from: vary(150), to: 60, duration: 0.09, gain: 0.9 })
      s.noise(t, { filter: 'lowpass', from: 2200, to: 500, duration: 0.06, gain: 0.7 })
    },
  },
  // 타격 2단계: 막타, 더 무겁고 깨지는 소리
  hitStrong: {
    duration: 0.22,
    volume: 0.65,
    play: (s, t) => {
      s.tone(t, { from: vary(120), to: 38, duration: 0.18, gain: 1 })
      s.noise(t, { filter: 'lowpass', from: 3600, to: 300, duration: 0.16, gain: 0.9 })
      s.noise(t + 0.01, { filter: 'highpass', from: 3000, duration: 0.05, gain: 0.4 })
    },
  },
  // 타격 3단계: 번개, 날카롭게 갈라지고 낮게 울린다
  thunder: {
    duration: 0.45,
    volume: 0.45,
    play: (s, t) => {
      s.noise(t, { filter: 'highpass', from: 2500, to: 900, duration: 0.12, gain: 1 })
      s.noise(t + 0.02, { filter: 'lowpass', from: 400, to: 80, duration: 0.42, gain: 0.8, attack: 0.02 })
    },
  },
  blade: {
    duration: 0.1,
    volume: 0.28,
    play: (s, t) => {
      s.noise(t, { filter: 'highpass', from: vary(3500, 0.15), to: 6000, duration: 0.08, gain: 1, attack: 0.01 })
      s.tone(t, { type: 'triangle', from: vary(1800, 0.1), to: 2400, duration: 0.06, gain: 0.25 })
    },
  },
  kill: {
    duration: 0.25,
    volume: 0.4,
    play: (s, t) => {
      s.noise(t, { filter: 'lowpass', from: 1800, to: 200, duration: 0.22, gain: 1 })
      s.tone(t, { type: 'triangle', from: vary(220), to: 70, duration: 0.2, gain: 0.5 })
    },
  },
  // 거인 왕이 무너진다
  shatter: {
    duration: 1.2,
    volume: 0.7,
    play: (s, t) => {
      s.noise(t, { filter: 'lowpass', from: 900, to: 60, duration: 1.1, gain: 1, attack: 0.02 })
      s.tone(t, { from: 70, to: 30, duration: 1, gain: 0.8 })
      for (let i = 0; i < 4; i++) s.noise(t + 0.1 + i * 0.12, { from: vary(1400, 0.3), q: 3, duration: 0.08, gain: 0.5 })
    },
  },
  // 스킬 4종
  hammerThrow: {
    duration: 0.5,
    volume: 0.4,
    play: (s, t) => {
      s.noise(t, { from: 500, to: 1800, q: 2, duration: 0.25, gain: 1, attack: 0.05 })
      s.noise(t + 0.25, { from: 1800, to: 500, q: 2, duration: 0.25, gain: 0.8 })
      s.tone(t, { type: 'triangle', from: 1200, to: 1500, duration: 0.15, gain: 0.15 })
    },
  },
  quake: {
    duration: 0.8,
    volume: 0.6,
    play: (s, t) => {
      s.tone(t, { from: 70, to: 32, duration: 0.7, gain: 1 })
      s.noise(t, { filter: 'lowpass', from: 600, to: 60, duration: 0.75, gain: 0.9, attack: 0.02 })
    },
  },
  ingotThrow: {
    duration: 0.5,
    volume: 0.35,
    play: (s, t) => {
      s.tone(t, { type: 'square', from: vary(880, 0.03), duration: 0.35, gain: 0.25 })
      s.tone(t, { from: vary(1320, 0.03), duration: 0.45, gain: 0.4 })
      s.noise(t, { filter: 'highpass', from: 4000, duration: 0.03, gain: 0.5 })
    },
  },
  decoy: {
    duration: 0.6,
    volume: 0.35,
    play: (s, t) => {
      s.tone(t, { type: 'sawtooth', from: 660, to: 220, duration: 0.5, gain: 0.25, attack: 0.05 })
      s.tone(t, { type: 'sawtooth', from: 668, to: 223, duration: 0.5, gain: 0.25, attack: 0.05 })
      s.noise(t, { from: 3000, to: 800, q: 4, duration: 0.5, gain: 0.3, attack: 0.1 })
    },
  },
  // 레바테인: 불꽃이 확 번지며 쓸고 지나간다
  flameSweep: {
    duration: 0.45,
    volume: 0.45,
    play: (s, t) => {
      s.noise(t, { from: 400, to: 2600, q: 0.8, duration: 0.35, gain: 1, attack: 0.04 })
      s.noise(t + 0.05, { filter: 'lowpass', from: 900, to: 200, duration: 0.4, gain: 0.6 })
    },
  },
  // 겨우살이: 가늘게 휙 날아간다
  pierce: {
    duration: 0.4,
    volume: 0.35,
    play: (s, t) => {
      s.noise(t, { filter: 'highpass', from: 2500, to: 5000, duration: 0.3, gain: 0.8, attack: 0.02 })
      s.tone(t, { from: 1400, to: 700, duration: 0.3, gain: 0.25 })
    },
  },
  // 그림자 분신의 일격: 짧고 흐릿하게
  clone: {
    duration: 0.12,
    volume: 0.22,
    play: (s, t) => {
      s.noise(t, { from: vary(1600, 0.2), to: 600, q: 2, duration: 0.1, gain: 1, attack: 0.01 })
      s.tone(t, { type: 'triangle', from: vary(520, 0.1), to: 260, duration: 0.08, gain: 0.3 })
    },
  },
  ultimate: {
    duration: 1.4,
    volume: 0.7,
    play: (s, t) => {
      s.tone(t, { type: 'sawtooth', from: 110, to: 440, duration: 0.5, gain: 0.3, attack: 0.2 })
      s.noise(t + 0.45, { filter: 'highpass', from: 2000, to: 600, duration: 0.2, gain: 1 })
      s.noise(t + 0.45, { filter: 'lowpass', from: 500, to: 50, duration: 0.9, gain: 0.9 })
    },
  },
  // 환영 군단 (로키 궁극기): 일그러진 웃음 같은 오르내림과 흩어지는 소리
  legion: {
    duration: 1.2,
    volume: 0.55,
    play: (s, t) => {
      for (let i = 0; i < 3; i++) s.tone(t + i * 0.08, { type: 'sawtooth', from: 330 + i * 110, to: 165, duration: 0.6, gain: 0.15, attack: 0.05 })
      s.noise(t, { from: 3000, to: 500, q: 3, duration: 1, gain: 0.5, attack: 0.2 })
    },
  },
  // 육비난무 (아수라왕 궁극기): 쇠가 겹겹이 울린다
  bladeDance: {
    duration: 1,
    volume: 0.55,
    play: (s, t) => {
      for (let i = 0; i < 6; i++) s.noise(t + i * 0.07, { filter: 'highpass', from: 3000 + i * 300, duration: 0.08, gain: 0.8 })
      s.tone(t, { type: 'triangle', from: 1760, duration: 0.8, gain: 0.2 })
      s.tone(t, { from: 90, to: 45, duration: 0.6, gain: 0.6 })
    },
  },
  // 공격 예고: 낮은 뿔피리 두 음. 무엇이 오는지 귀로도 알게
  telegraph: {
    duration: 0.45,
    volume: 0.26,
    play: (s, t) => {
      s.tone(t, { type: 'triangle', from: 196, duration: 0.2, gain: 0.8, attack: 0.03 })
      s.tone(t + 0.18, { type: 'triangle', from: 165, duration: 0.25, gain: 0.8, attack: 0.03 })
    },
  },
  impact: {
    duration: 0.5,
    volume: 0.55,
    play: (s, t) => {
      s.tone(t, { from: 90, to: 35, duration: 0.4, gain: 1 })
      s.noise(t, { filter: 'lowpass', from: 1200, to: 100, duration: 0.4, gain: 0.8 })
    },
  },
  hurt: {
    duration: 0.2,
    volume: 0.45,
    play: (s, t) => {
      s.tone(t, { type: 'square', from: 220, to: 110, duration: 0.14, gain: 0.35 })
      s.noise(t, { filter: 'lowpass', from: 1500, to: 300, duration: 0.12, gain: 0.8 })
    },
  },
  death: {
    duration: 1.1,
    volume: 0.5,
    play: (s, t) => {
      s.tone(t, { type: 'triangle', from: 330, to: 55, duration: 1, gain: 0.8 })
      s.tone(t, { type: 'triangle', from: 335, to: 56, duration: 1, gain: 0.5 })
    },
  },
  revive: {
    duration: 0.8,
    volume: 0.4,
    play: (s, t) => s.arpeggio(t, [262, 330, 392, 523], 0.1, { type: 'triangle', duration: 0.4, gain: 0.6 }),
  },
  // 유물 줍기: 밝게 세 음
  relic: {
    duration: 0.7,
    volume: 0.45,
    play: (s, t) => s.arpeggio(t, [784, 988, 1319], 0.07, { duration: 0.45, gain: 0.7 }),
  },
  equip: {
    duration: 0.3,
    volume: 0.35,
    play: (s, t) => {
      s.noise(t, { filter: 'highpass', from: 3000, duration: 0.04, gain: 0.6 })
      s.tone(t, { type: 'triangle', from: 660, duration: 0.25, gain: 0.5 })
    },
  },
  // 발현: 화음이 차오르고 반짝인다
  manifest: {
    duration: 2,
    volume: 0.6,
    play: (s, t) => {
      for (const f of [220, 277, 330, 440]) s.tone(t, { type: 'triangle', from: f, duration: 1.8, gain: 0.35, attack: 0.4 })
      s.arpeggio(t + 0.3, [880, 1109, 1319, 1760], 0.09, { duration: 0.6, gain: 0.35 })
      s.noise(t + 0.3, { filter: 'lowpass', from: 300, to: 60, duration: 0.8, gain: 0.6 })
    },
  },
  // 승급: 오르는 팡파르
  promote: {
    duration: 1.8,
    volume: 0.6,
    play: (s, t) => {
      s.arpeggio(t, [392, 523, 659, 784], 0.13, { type: 'square', duration: 0.35, gain: 0.25 })
      for (const f of [523, 659, 784, 1047]) s.tone(t + 0.55, { type: 'triangle', from: f, duration: 1.2, gain: 0.3, attack: 0.05 })
    },
  },
  rebirth: {
    duration: 2.2,
    volume: 0.55,
    play: (s, t) => {
      s.noise(t, { from: 200, to: 3000, q: 2, duration: 1.2, gain: 0.8, attack: 1 })
      for (const f of [147, 220, 294]) s.tone(t + 1, { type: 'triangle', from: f, duration: 1.2, gain: 0.4, attack: 0.05 })
    },
  },
  // 큰 카드 (E23-03): 큰북 세 번, 둥·둥·둥— 마지막이 가장 크고 길다
  drum: {
    duration: 1.4,
    volume: 0.7,
    play: (s, t) => {
      ;[0, 0.24, 0.52].forEach((at, i) => {
        const last = i === 2
        s.tone(t + at, { from: last ? 110 : 96, to: 42, duration: last ? 0.8 : 0.32, gain: last ? 0.9 : 0.6 })
        s.noise(t + at, { filter: 'lowpass', from: 420, to: 120, duration: last ? 0.4 : 0.14, gain: last ? 0.45 : 0.3 })
      })
      s.noise(t + 0.52, { filter: 'highpass', from: 5000, duration: 0.6, gain: 0.08, attack: 0.05 })
    },
  },
  ui: {
    duration: 0.06,
    volume: 0.22,
    play: (s, t) => s.tone(t, { type: 'square', from: 1200, to: 900, duration: 0.04, gain: 0.5 }),
  },
  uiOpen: {
    duration: 0.15,
    volume: 0.25,
    play: (s, t) => s.arpeggio(t, [660, 990], 0.05, { type: 'triangle', duration: 0.1, gain: 0.6 }),
  },
  uiClose: {
    duration: 0.15,
    volume: 0.25,
    play: (s, t) => s.arpeggio(t, [990, 660], 0.05, { type: 'triangle', duration: 0.1, gain: 0.6 }),
  },
}

/** UI 소리: 주인공과의 거리를 보지 않는다 */
export const UI_SOUNDS: ReadonlySet<SoundCue> = new Set(['ui', 'uiOpen', 'uiClose', 'relic', 'equip', 'manifest', 'promote', 'rebirth', 'drum', 'revive', 'death'])

export const SOUND_CUES = Object.keys(SOUNDS) as SoundCue[]
