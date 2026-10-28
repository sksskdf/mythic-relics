import { Synth } from './sounds'

/** 곡: 지역(신화권)마다 하나와 승급 전설 (E9-09), 마지막 무대·보스·엔딩·성소의 고르기 (E23-04) */
export const THEME_IDS = ['village', 'norse', 'greek', 'china', 'japan', 'korea', 'legend', 'sky', 'boss', 'ending', 'shrine'] as const
export type ThemeId = (typeof THEME_IDS)[number]

/** 지역의 곡: 신화권이 없으면(마을) 마을 곡 */
export function themeForRealm(realm: string | null | undefined): ThemeId {
  return (THEME_IDS as readonly string[]).includes(realm ?? '') ? (realm as ThemeId) : 'village'
}

/**
 * 합성 곡 (E5-03 임시 곡 → E9-09 신화권별 방향). 곡 파일 대신 박자마다 음을 만들어 낸다. 정식 곡이 오면 같은 자리에 파일을 튼다.
 * 신화권마다 음계·악기 느낌·박이 다르다 (`ART.md` 8장):
 * - 마을: 장조 오음 음계, 3박의 느린 뜯는 소리. 모닥불 곁
 * - 북유럽: 느린 가단조. 길게 깔리는 화음 위에 드문드문 오음 음계 선율
 * - 그리스: 도리아 선법, 리라처럼 화음을 펼쳐 뜯는다
 * - 중국: 궁조 오음 음계, 음을 밀어 올리는 뜯는 소리와 목탁
 * - 일본: 미야코부시 음계, 드문 고토 소리와 길게 부는 피리
 * - 한국: 세마치 장단(3박이 셋)의 장구, 가야금처럼 꺾어 내리는 소리
 * - 승급 전설: 빠른 라단조. 북과 되풀이하는 낮은 음, 뿔피리 선율
 * - 갈라진 하늘(마지막 무대): 리디아 선법의 넓은 5도 화음, 높이 떠는 소리와 바람
 * - 보스: 마단조 빠르기 132. 박마다 큰북, 8분음표로 밀어붙이는 낮은 음, 트라이톤이 섞인 화음과 금관 찌르기
 * - 엔딩: 라장조 느린 화음(I-V-vi-IV)이 차오르고, 종소리 선율이 내려앉는다
 * - 성소의 고르기: 아주 느린 긴 화음과 드문 종소리. 시간이 멈춘 듯
 */
interface Theme {
  /** 한 칸의 길이 (초) */
  step: number
  play(s: Synth, t: number, index: number): void
}

/** A4(440Hz)에서 반음 k개 떨어진 음 */
const note = (k: number) => 440 * Math.pow(2, k / 12)

/** 뜯는 소리 하나: 짧게 울리고 한 옥타브 아래가 살짝 따라온다. bend는 시작 음 비율(1보다 작으면 밀어 올림, 크면 꺾어 내림) */
function pluck(s: Synth, t: number, f: number, length: number, gain: number, bend = 1): void {
  s.tone(t, { type: 'triangle', from: f * bend, to: f, duration: length, gain, attack: 0.005 })
  s.tone(t + 0.01, { from: f / 2, duration: length * 0.7, gain: gain * 0.3, attack: 0.005 })
}

/** 이웃한 음으로 걸어 다니는 선율 */
function walker(scale: readonly number[]): () => number {
  let i = Math.floor(scale.length / 2)
  return () => {
    i = Math.max(0, Math.min(scale.length - 1, i + Math.floor(Math.random() * 3) - 1))
    return scale[i]!
  }
}

/** 낮게 깔리는 화음 */
function pad(s: Synth, t: number, freqs: readonly number[], length: number, gain: number): void {
  for (const f of freqs) s.tone(t, { type: 'triangle', from: f, duration: length, gain, attack: Math.min(1.6, length / 4) })
}

const THEMES: Record<ThemeId, () => Theme> = {
  village: () => {
    // 사장조 오음 (솔 라 시 레 미), 3박
    const scale = [-2, 0, 2, 5, 7, 10, 12, 14].map(note)
    const chords = [[-26, -19, -14], [-21, -14, -9], [-19, -12, -7], [-26, -19, -14]].map((c) => c.map(note))
    const next = walker(scale)
    return {
      step: 60 / 84,
      play(s, t, i) {
        if (i % 6 === 0) pad(s, t, chords[Math.floor(i / 6) % chords.length]!, this.step * 6.5, 0.05)
        // 박마다 낮은 음을 뜯고, 2·3박에 화음 위 음
        const chord = chords[Math.floor(i / 6) % chords.length]!
        pluck(s, t, chord[i % 3 === 0 ? 0 : 2]! * 2, this.step * 1.4, i % 3 === 0 ? 0.07 : 0.04)
        if (i % 3 === 0 && Math.random() < 0.55) pluck(s, t + this.step * 0.02, next(), this.step * 2, 0.08)
      },
    }
  },
  norse: () => {
    const roots = [110, 87.31, 130.81, 98]
    const next = walker([440, 523.25, 587.33, 659.25, 783.99, 880])
    return {
      step: 60 / 72,
      play(s, t, i) {
        // 두 마디(8박)마다 화음이 바뀐다
        if (i % 8 === 0) {
          const root = roots[Math.floor(i / 8) % roots.length]!
          pad(s, t, [root, root * 1.5, root * 2], this.step * 8.5, 0.08)
        }
        // 선율: 이웃한 음으로 걸어 다니고, 가끔 쉰다
        if (Math.random() < 0.42) {
          const f = next()
          s.tone(t, { from: f, duration: this.step * 1.6, gain: 0.12, attack: 0.02 })
          s.tone(t + this.step / 2, { from: f / 2, duration: this.step * 1.2, gain: 0.04, attack: 0.02 })
        }
      },
    }
  },
  greek: () => {
    // 라 도리아 (라 시 도 레 미 파# 솔)
    const scale = [0, 2, 3, 5, 7, 9, 10, 12].map(note)
    const chords = [[-24, -17, -12, -9], [-26, -19, -14, -10], [-29, -22, -17, -14], [-24, -17, -12, -9]].map((c) => c.map(note))
    const next = walker(scale)
    return {
      // 8분음표 한 칸, 빠르기 80
      step: 60 / 80 / 2,
      play(s, t, i) {
        const chord = chords[Math.floor(i / 16) % chords.length]!
        if (i % 16 === 0) pad(s, t, chord.slice(0, 2), this.step * 16.5, 0.05)
        // 리라: 화음을 위아래로 펼쳐 뜯는다
        const up = [0, 1, 2, 3, 2, 1, 2, 3][i % 8]!
        pluck(s, t, chord[up]! * 2, this.step * 2.2, 0.05)
        if (i % 4 === 0 && Math.random() < 0.5) s.tone(t, { type: 'sine', from: next(), duration: this.step * 3.5, gain: 0.09, attack: 0.08 })
      },
    }
  },
  china: () => {
    // 사 궁조 오음 (솔 라 시 레 미)
    const scale = [-2, 0, 2, 5, 7, 10, 12, 14, 17].map(note)
    const next = walker(scale)
    return {
      step: 60 / 66,
      play(s, t, i) {
        if (i % 8 === 0) pad(s, t, [note(-26), note(-19)], this.step * 8.5, 0.06)
        // 목탁: 마디 첫 박
        if (i % 4 === 0) s.noise(t, { filter: 'bandpass', from: 1400, q: 6, duration: 0.06, gain: 0.12 })
        // 음을 밀어 올리며 뜯는다 (구정)
        if (Math.random() < 0.5) pluck(s, t, next(), this.step * 1.8, 0.09, 0.94)
        if (Math.random() < 0.2) pluck(s, t + this.step / 2, next(), this.step, 0.05)
      },
    }
  },
  japan: () => {
    // 레 미야코부시 (레 미♭ 솔 라 시♭)
    const scale = [-7, -6, -2, 0, 1, 5, 6, 10].map(note)
    const next = walker(scale)
    return {
      step: 60 / 60,
      play(s, t, i) {
        if (i % 8 === 0) pad(s, t, [note(-31), note(-24)], this.step * 8.5, 0.05)
        // 고토: 드물게, 두 음을 잇달아
        if (Math.random() < 0.35) {
          const f = next()
          pluck(s, t, f, this.step * 2.4, 0.09)
          if (Math.random() < 0.4) pluck(s, t + this.step / 3, f * 2, this.step * 1.6, 0.04)
        }
        // 피리: 네 마디에 한 번 길게
        if (i % 16 === 4) s.tone(t, { type: 'sine', from: next() * 2, duration: this.step * 3.5, gain: 0.06, attack: 0.5 })
      },
    }
  },
  korea: () => {
    // 레 평조 (레 미 솔 라 도)
    const scale = [-7, -5, -2, 0, 3, 5, 7, 10].map(note)
    const next = walker(scale)
    return {
      // 세마치: 한 박을 셋으로 나눈 칸, 빠르기 70
      step: 60 / 70 / 3,
      play(s, t, i) {
        const k = i % 9
        if (i % 36 === 0) pad(s, t, [note(-31), note(-24)], this.step * 36.5, 0.05)
        // 장구: 덩(낮게+높게) · 쿵 · 덕
        if (k === 0) {
          s.tone(t, { from: 90, to: 55, duration: 0.25, gain: 0.25 })
          s.noise(t, { filter: 'highpass', from: 3000, duration: 0.05, gain: 0.06 })
        }
        if (k === 3) s.tone(t, { from: 80, to: 50, duration: 0.2, gain: 0.14 })
        if (k === 6 || k === 8) s.noise(t, { filter: 'highpass', from: 2500, duration: 0.04, gain: k === 6 ? 0.07 : 0.04 })
        // 가야금: 꺾어 내리는 소리
        if ((k === 0 || k === 6) && Math.random() < 0.55) pluck(s, t, next(), this.step * 4, 0.08, 1.06)
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
  sky: () => {
    // 라 리디아 (라 시 도# 레# 미 파# 솔#)
    const scale = [0, 2, 4, 6, 7, 9, 11, 12, 14].map(note)
    const roots = [-24, -22, -19, -24].map(note)
    const next = walker(scale)
    return {
      step: 60 / 56,
      play(s, t, i) {
        if (i % 8 === 0) {
          const root = roots[Math.floor(i / 8) % roots.length]!
          pad(s, t, [root, root * 1.5, root * 2, root * 3], this.step * 8.5, 0.05)
          s.noise(t, { filter: 'bandpass', from: 300, to: 1800, q: 0.7, duration: this.step * 6, gain: 0.05, attack: this.step * 3 })
        }
        // 높이 떠는 소리: 두 음이 살짝 어긋나 맥놀이
        if (Math.random() < 0.45) {
          const f = next() * 2
          s.tone(t, { type: 'sine', from: f, duration: this.step * 2.5, gain: 0.05, attack: 0.3 })
          s.tone(t, { type: 'sine', from: f, duration: this.step * 2.5, gain: 0.04, attack: 0.3, detune: 9 })
        }
      },
    }
  },
  boss: () => {
    // 마단조, 8분음표 한 칸, 빠르기 132
    const bass = [-29, -29, -29, -27, -29, -29, -22, -23].map(note)
    const stabs = [[-17, -11, -5], [-18, -12, -6]].map((c) => c.map(note))
    return {
      step: 60 / 132 / 2,
      play(s, t, i) {
        if (i % 2 === 0) {
          s.tone(t, { from: 100, to: 42, duration: 0.18, gain: 0.55 })
          s.noise(t, { filter: 'lowpass', from: 260, duration: 0.08, gain: 0.25 })
        }
        if (i % 8 === 4) s.noise(t, { from: 1800, q: 1.2, duration: 0.12, gain: 0.25 })
        s.tone(t, { type: 'sawtooth', from: bass[i % bass.length]!, duration: this.step * 0.9, gain: 0.07 })
        if (i % 32 === 0) pad(s, t, [note(-29), note(-23), note(-17)], this.step * 16, 0.05)
        // 금관 찌르기: 네 마디 가운데 앞 두 마디 끝에
        if (i % 64 === 14 || i % 64 === 30) for (const f of stabs[(i % 64) === 14 ? 0 : 1]!) s.tone(t, { type: 'square', from: f, duration: this.step * 1.6, gain: 0.04, attack: 0.01 })
      },
    }
  },
  ending: () => {
    // 라장조 I-V-vi-IV, 빠르기 66
    const chords = [[-24, -20, -17], [-17, -13, -10], [-15, -12, -8], [-19, -15, -12]].map((c) => c.map(note))
    const bells = [12, 11, 9, 7, 4, 7, 9, 4].map(note)
    return {
      step: 60 / 66,
      play(s, t, i) {
        const chord = chords[Math.floor(i / 4) % chords.length]!
        if (i % 4 === 0) {
          pad(s, t, chord, this.step * 4.5, 0.06)
          s.tone(t, { type: 'triangle', from: chord[0]! / 2, duration: this.step * 4, gain: 0.08, attack: 0.2 })
        }
        // 화음을 위로 펼쳐 뜯고, 두 박마다 종소리가 한 음씩 내려앉는다
        pluck(s, t, chord[i % 3]! * 2, this.step * 1.5, 0.04)
        if (i % 2 === 0) s.tone(t + 0.02, { type: 'sine', from: bells[(i / 2) % bells.length]!, duration: this.step * 2.4, gain: 0.07, attack: 0.005 })
      },
    }
  },
  shrine: () => {
    const chords = [[-24, -17, -12, -5], [-26, -19, -14, -7]].map((c) => c.map(note))
    return {
      step: 60 / 50,
      play(s, t, i) {
        if (i % 6 === 0) pad(s, t, chords[Math.floor(i / 6) % chords.length]!, this.step * 6.5, 0.06)
        if (i % 3 === 1 && Math.random() < 0.6) s.tone(t, { type: 'sine', from: [note(7), note(12), note(14), note(19)][i % 4]!, duration: this.step * 3, gain: 0.05, attack: 0.005 })
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
