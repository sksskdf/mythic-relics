import { Synth } from './sounds'

export type ThemeId = 'field' | 'legend'

/**
 * 임시 음악 (E5-03). 곡 파일 대신 박자마다 음을 만들어 낸다. 정식 곡(E9-08)이 오면 같은 자리에 파일을 튼다.
 * - 들판: 느린 가단조. 길게 깔리는 화음 위에 드문드문 오음 음계 선율
 * - 승급 전설: 빠른 라단조. 북과 되풀이하는 낮은 음, 뿔피리 선율
 */
interface Theme {
  /** 한 칸의 길이 (초) */
  step: number
  play(s: Synth, t: number, index: number): void
}

const THEMES: Record<ThemeId, () => Theme> = {
  field: () => {
    const roots = [110, 87.31, 130.81, 98]
    const scale = [440, 523.25, 587.33, 659.25, 783.99, 880]
    let note = 2
    return {
      step: 60 / 72,
      play(s, t, i) {
        // 두 마디(8박)마다 화음이 바뀐다
        if (i % 8 === 0) {
          const root = roots[Math.floor(i / 8) % roots.length]!
          for (const f of [root, root * 1.5, root * 2]) s.tone(t, { type: 'triangle', from: f, duration: this.step * 8.5, gain: 0.08, attack: 1.6 })
        }
        // 선율: 이웃한 음으로 걸어 다니고, 가끔 쉰다
        if (Math.random() < 0.42) {
          note = Math.max(0, Math.min(scale.length - 1, note + Math.floor(Math.random() * 3) - 1))
          const f = scale[note]!
          s.tone(t, { from: f, duration: this.step * 1.6, gain: 0.12, attack: 0.02 })
          s.tone(t + this.step / 2, { from: f / 2, duration: this.step * 1.2, gain: 0.04, attack: 0.02 })
        }
      },
    }
  },
  legend: () => {
    const bass = [73.42, 73.42, 87.31, 73.42, 65.41, 65.41, 55, 65.41]
    const horn = [293.66, 349.23, 440, 392, 349.23, 293.66, 261.63, 293.66]
    return {
      // 8분음표 한 칸, 빠르기 100
      step: 60 / 100 / 2,
      play(s, t, i) {
        if (i % 4 === 0) {
          s.tone(t, { from: 95, to: 40, duration: 0.22, gain: 0.5 })
          s.noise(t, { filter: 'lowpass', from: 300, duration: 0.1, gain: 0.25 })
        }
        if (i % 4 === 2) s.noise(t, { from: 220, q: 2, duration: 0.14, gain: 0.3 })
        s.noise(t, { filter: 'highpass', from: 7000, duration: 0.03, gain: i % 2 ? 0.04 : 0.07 })
        if (i % 2 === 0) s.tone(t, { type: 'triangle', from: bass[(i / 2) % bass.length]!, duration: this.step * 1.8, gain: 0.25 })
        // 뿔피리: 네 마디 중 뒤 두 마디에서
        if (i % 64 >= 32 && i % 4 === 0) {
          const f = horn[((i % 64) - 32) / 4]!
          s.tone(t, { type: 'triangle', from: f, duration: this.step * 3.6, gain: 0.14, attack: 0.06 })
          s.tone(t, { type: 'square', from: f, duration: this.step * 3.2, gain: 0.025, attack: 0.06 })
        }
      },
    }
  },
}

/** 미리 만들어 둘 시간 (초). 화면이 느려도 끊기지 않게 넉넉히 */
const LOOKAHEAD = 1.2
/** 곡을 바꿀 때 서로 겹쳐 바뀌는 시간 */
const CROSSFADE = 1.5

/** 지금 흐르는 곡 하나. 곡을 바꾸면 앞 곡은 줄어들며 사라진다 */
export class Music {
  private current: { id: ThemeId; theme: Theme; gain: GainNode; synth: Synth; next: number; index: number } | null = null

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
  ) {}

  get theme(): ThemeId | null {
    return this.current?.id ?? null
  }

  play(id: ThemeId | null): void {
    if (this.current?.id === id) return
    const now = this.ctx.currentTime
    if (this.current) {
      const old = this.current.gain
      old.gain.cancelScheduledValues(now)
      old.gain.setValueAtTime(old.gain.value, now)
      old.gain.linearRampToValueAtTime(0, now + CROSSFADE)
      setTimeout(() => old.disconnect(), (CROSSFADE + LOOKAHEAD + 1) * 1000)
      this.current = null
    }
    if (!id) return
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(1, now + CROSSFADE)
    gain.connect(this.out)
    this.current = { id, theme: THEMES[id](), gain, synth: new Synth(this.ctx, gain), next: now + 0.1, index: 0 }
  }

  /** 프레임마다: 앞으로 LOOKAHEAD초 안에 올 박자를 미리 만든다 */
  update(): void {
    const c = this.current
    if (!c) return
    const now = this.ctx.currentTime
    // 오래 멈췄다 돌아오면(창이 가려졌다 등) 밀린 박자를 한꺼번에 치지 않는다
    if (c.next < now - 0.5) c.next = now + 0.05
    while (c.next < now + LOOKAHEAD) {
      c.theme.play(c.synth, c.next, c.index)
      c.next += c.theme.step
      c.index += 1
    }
  }
}
